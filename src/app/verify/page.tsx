'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/client/api';
import { setToken } from '@/lib/client/auth';
import CaptchaWidget from '@/components/CaptchaWidget';

interface PublicSite {
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string;
}

// OAuth sign-in landing page: requires a human-verification challenge BEFORE the session
// is activated. This blocks bulk-automated accounts (e.g. many Google/GitHub accounts)
// from consuming resources. If no CAPTCHA is configured, the user is passed straight through.
export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在加载...
          </div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [site, setSite] = useState<PublicSite | null>(null);
  const [error, setError] = useState('');
  const [captcha, setCaptcha] = useState<{ provider: 'turnstile' | 'recaptcha'; token: string } | null>(null);

  const captchaEnabled = site && (site.turnstileEnabled || site.recaptchaEnabled);

  // Load site config to decide whether a challenge is needed.
  useEffect(() => {
    api.getPublicSite().then(setSite).catch(() => {});
  }, []);

  function finish() {
    if (!token) {
      setError('Invalid verification link.');
      return;
    }
    setToken(token);
    window.history.replaceState({}, '', '/');
    router.push('/');
  }

  // If no CAPTCHA is configured, skip straight to the app.
  useEffect(() => {
    if (!site) return;
    if (!captchaEnabled) {
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  // On successful human verification, activate the session.
  useEffect(() => {
    if (captcha) {
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captcha]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Invalid verification link.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold">完成安全验证</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            为了保障服务稳定，请在进入前完成一次人机验证。
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6">
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}

          {captchaEnabled ? (
            <CaptchaWidget
              config={{
                turnstileEnabled: site!.turnstileEnabled,
                turnstileSiteKey: site!.turnstileSiteKey,
                recaptchaEnabled: site!.recaptchaEnabled,
                recaptchaSiteKey: site!.recaptchaSiteKey,
              }}
              onVerify={(provider, token) => setCaptcha({ provider, token })}
            />
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在进入...
            </div>
          )}

          <p className="mt-4 text-center text-xs text-muted-foreground">
            验证通过后将自动进入工作区。
          </p>
        </div>
      </div>
    </main>
  );
}
