'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  // When this value changes, the widget tears down the current challenge and
  // renders a fresh one. Useful to auto-refresh after a failed submit or after
  // the user edits a field (e.g. username) that invalidates the old token.
  resetSignal?: number;
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const RECAPTCHA_SCRIPT = 'https://www.google.com/recaptcha/api.js?render=explicit';

type Provider = 'turnstile' | 'recaptcha';

// Load a script once, resolve with how long it took to load (ms).
const scriptCache = new Map<string, Promise<number>>();
function loadScript(src: string): Promise<number> {
  const cached = scriptCache.get(src);
  if (cached) return cached;
  const p = new Promise<number>((resolve) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve(0);
      return;
    }
    const start = performance.now();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.addEventListener('load', () => resolve(performance.now() - start), { once: true });
    s.addEventListener('error', () => resolve(Infinity), { once: true });
    document.head.appendChild(s);
  });
  scriptCache.set(src, p);
  return p;
}

// Measure how fast each provider's script loads from the user's network, so we
// can prefer whichever is reachable with the lowest latency. If measurement is
// unavailable/too slow, fall back to random so both providers still see traffic.
async function pickProviderByLatency(config: CaptchaConfig): Promise<Provider | null> {
  const candidates: { name: Provider; script: string }[] = [];
  if (config.turnstileEnabled && config.turnstileSiteKey)
    candidates.push({ name: 'turnstile', script: TURNSTILE_SCRIPT });
  if (config.recaptchaEnabled && config.recaptchaSiteKey)
    candidates.push({ name: 'recaptcha', script: RECAPTCHA_SCRIPT });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].name;

  // Race the two loads against each other (and a cap) to avoid hanging.
  const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(Infinity), 6000));
  const [t, r] = await Promise.all([
    Promise.race([loadScript(TURNSTILE_SCRIPT), timeout]),
    Promise.race([loadScript(RECAPTCHA_SCRIPT), timeout]),
  ]);
  if (t < r) return 'turnstile';
  if (r < t) return 'recaptcha';
  // Equal/unknown latency (or measurement failed) -> randomize.
  return candidates[Math.floor(Math.random() * candidates.length)].name;
}

export default function CaptchaWidget({ config, onVerify, resetSignal = 0 }: CaptchaWidgetProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Internal counter drives re-renders on expiry without needing the parent.
  const [tick, setTick] = useState(0);
  // Combined trigger: external resetSignal + internal tick both bump the key.
  const trigger = resetSignal * 100000 + tick;

  const refresh = useCallback(() => {
    setTick((v) => v + 1);
  }, []);

  // (Re)select the provider whenever the trigger changes. This is what makes
  // auto-refresh possible: bumping the trigger forces a brand-new challenge.
  useEffect(() => {
    let cancelled = false;
    setProvider(null);
    setLoading(true);
    pickProviderByLatency(config).then((p) => {
      if (!cancelled) {
        setProvider(p);
        if (!p) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, trigger]);

  useEffect(() => {
    if (!provider || !containerRef.current) return;

    let cancelled = false;
    (async () => {
      if (provider === 'turnstile') {
        const ok = await loadScript(TURNSTILE_SCRIPT);
        if (!isFinite(ok) || cancelled) return;
        // @ts-expect-error turnstile is loaded globally by the script
        const ts = window.turnstile;
        if (!ts) return;
        ts.render(containerRef.current, {
          sitekey: config.turnstileSiteKey,
          theme: 'light',
          callback: (token: string) => {
            onVerify('turnstile', token);
          },
          'expired-callback': () => refresh(),
          'error-callback': () => refresh(),
        });
      } else if (provider === 'recaptcha') {
        const ok = await loadScript(RECAPTCHA_SCRIPT);
        if (!isFinite(ok) || cancelled) return;
        // @ts-expect-error grecaptcha is loaded globally by the script
        const gr = window.grecaptcha;
        if (!gr) return;
        const ready = () =>
          new Promise<void>((resolve) => {
            if (gr.ready) gr.ready(resolve);
            else resolve();
          });
        await ready();
        if (cancelled) return;
        widgetIdRef.current = gr.render(containerRef.current, {
          sitekey: config.recaptchaSiteKey,
          theme: 'light',
          size: 'normal',
          callback: (token: string) => {
            onVerify('recaptcha', token);
          },
          'expired-callback': () => refresh(),
        });
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, trigger]);

  // The container must be empty when we render a fresh widget; clearing ref is enough
  // because turnstile/recaptcha re-render into a fresh element each time React remounts it.
  useEffect(() => {
    if (!provider) {
      widgetIdRef.current = null;
      return;
    }
  }, [provider]);

  if (!provider) {
    // While picking (or when no provider configured) show a lightweight placeholder.
    if (loading) {
      return (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('captcha.loading')}
        </div>
      );
    }
    return null;
  }

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
