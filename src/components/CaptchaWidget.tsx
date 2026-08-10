'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/client/i18n';

interface CaptchaConfig {
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string;
}

interface CaptchaWidgetProps {
  config: CaptchaConfig;
  onVerify: (provider: 'turnstile' | 'recaptcha', token: string) => void;
}

// Load a script once and resolve a promise when it's ready.
const scriptCache = new Map<string, Promise<boolean>>();
function loadScript(src: string): Promise<boolean> {
  if (scriptCache.has(src)) return scriptCache.get(src)!;
  const p = new Promise<boolean>((resolve) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve(true);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  scriptCache.set(src, p);
  return p;
}

// Pick which provider to show. When both are enabled, randomize so users see a mix.
function pickProvider(config: CaptchaConfig): 'turnstile' | 'recaptcha' | null {
  const opts: ('turnstile' | 'recaptcha')[] = [];
  if (config.turnstileEnabled && config.turnstileSiteKey) opts.push('turnstile');
  if (config.recaptchaEnabled && config.recaptchaSiteKey) opts.push('recaptcha');
  if (opts.length === 0) return null;
  return opts[Math.floor(Math.random() * opts.length)];
}

export default function CaptchaWidget({ config, onVerify }: CaptchaWidgetProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<'turnstile' | 'recaptcha' | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    // Persist the chosen provider across renders, pick once on mount.
    if (provider) return;
    const chosen = pickProvider(config);
    if (!chosen) {
      setLoading(false);
      return;
    }
    setProvider(chosen);
  }, [config, provider]);

  useEffect(() => {
    if (!provider || !containerRef.current) return;

    let cancelled = false;
    (async () => {
      if (provider === 'turnstile') {
        const ok = await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js');
        if (!ok || cancelled) return;
        // @ts-expect-error turnstile is loaded globally by the script
        const ts = window.turnstile;
        if (!ts) return;
        ts.render(containerRef.current, {
          sitekey: config.turnstileSiteKey,
          theme: 'light',
          callback: (token: string) => {
            resolvedRef.current = true;
            onVerify('turnstile', token);
          },
          'expired-callback': () => {
            resolvedRef.current = false;
          },
        });
      } else if (provider === 'recaptcha') {
        const ok = await loadScript(`https://www.google.com/recaptcha/api.js?render=explicit`);
        if (!ok || cancelled) return;
        // @ts-expect-error grecaptcha is loaded globally by the script
        const gr = window.grecaptcha;
        if (!gr) return;
        // Wait until grecaptcha.ready fires.
        const ready = () =>
          new Promise<void>((resolve) => {
            if (gr.ready) {
              gr.ready(resolve);
            } else {
              resolve();
            }
          });
        await ready();
        if (cancelled) return;
        widgetIdRef.current = gr.render(containerRef.current, {
          sitekey: config.recaptchaSiteKey,
          theme: 'light',
          size: 'normal',
          callback: (token: string) => {
            resolvedRef.current = true;
            onVerify('recaptcha', token);
          },
          'expired-callback': () => {
            resolvedRef.current = false;
          },
        });
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  if (!provider) return null;

  return (
    <div className="flex items-center justify-center py-2">
      <div ref={containerRef} className="min-h-[60px] min-w-[240px]" />
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('captcha.loading')}
        </div>
      )}
    </div>
  );
}
