'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, RefreshCw, Loader2 } from 'lucide-react';
import { GithubIcon, GoogleIcon, MicrosoftIcon } from '@/components/BrandIcons';
import { api } from '@/lib/client/api';
import { setToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';
import CaptchaWidget from '@/components/CaptchaWidget';

interface PublicSite {
  siteName: string;
  siteLogo: string;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string;
}

export default function SignupPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [site, setSite] = useState<PublicSite | null>(null);
  const [captcha, setCaptcha] = useState<{
    provider: 'turnstile' | 'recaptcha';
    token: string;
  } | null>(null);
  // Bumping this forces CaptchaWidget to render a fresh challenge. We bump it
  // whenever a submit fails, so the (possibly expired) token is auto-refreshed
  // instead of forcing the user to manually reload the widget.
  const [captchaReset, setCaptchaReset] = useState(0);
  // Only show sign-up providers whose OAuth env vars are configured (no dead buttons).
  const [available, setAvailable] = useState({ github: true, google: true, microsoft: true });

  useEffect(() => {
    api.getPublicSite().then(setSite).catch(() => {});
    api.connectionsAvailable().then(setAvailable).catch(() => {});
  }, []);

  // Handle OAuth cancel/return: ?error= on this page (e.g. code 1001).
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const oauthError = params.get('error');
    if (oauthError) {
      const raw = decodeURIComponent(oauthError);
      const stripped = raw.replace(/^1001:\s*/, '').replace(/^1001$/, t('auth.cancelError'));
      const cancelled =
        stripped === t('auth.cancelError') || stripped === 'access_denied' || /登录已取消|access_denied/i.test(raw);
      setError(cancelled ? t('auth.retryCancel') : stripped);
      window.history.replaceState({}, '', '/signup');
    }
  }, []);

  // Countdown timer for the "resend code" button.
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  async function sendCode() {
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError(t('auth.invalidEmail') || '请输入有效的邮箱地址');
      return;
    }
    setSendingCode(true);
    setError('');
    try {
      await api.sendVerificationCode(email);
      setCodeSent(true);
      setCountdown(60);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSendingCode(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !code.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.pwTooShort'));
      return;
    }

    // If the admin enabled human verification, a token is mandatory.
    const captchaEnabled = site && (site.turnstileEnabled || site.recaptchaEnabled);
    if (captchaEnabled && !captcha) {
      setError(t('auth.captchaRequired') || '请完成人机验证');
      return;
    }

    setLoading(true);
    try {
      const res = await api.signup({
        email,
        verificationCode: code,
        username: username.trim() || undefined,
        displayName: displayName.trim() || undefined,
        password,
        captchaProvider: captcha?.provider,
        captchaToken: captcha?.token,
      });
      setToken(res.token);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
      // Invalidate the old challenge so the user gets a fresh captcha to solve
      // (the previous token may have expired while they edited the form).
      setCaptcha(null);
      setCaptchaReset((c) => c + 1);
    } finally {
      setLoading(false);
    }
  }

  function githubLogin() {
    window.location.href = '/api/auth/github?from=signup';
  }

  function googleLogin() {
    window.location.href = '/api/auth/google?from=signup';
  }

  function microsoftLogin() {
    window.location.href = '/api/auth/microsoft?from=signup';
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {site?.siteLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.siteLogo} alt="logo" className="mx-auto mb-3 h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 text-3xl font-bold text-primary">
              {site?.siteName?.[0] || 'C'}
            </div>
          )}
          <h1 className="text-2xl font-bold">{t('auth.signupTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('auth.signupSub')}</p>
        </div>

        {/* OAuth sign-up — only providers configured in the environment are shown */}
        {available.github && (
          <button
            onClick={githubLogin}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            <GithubIcon className="h-4 w-4" />
            {t('auth.github')}
          </button>
        )}
        {available.google && (
          <button
            onClick={googleLogin}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            <GoogleIcon className="h-4 w-4" />
            {t('auth.google')}
          </button>
        )}
        {available.microsoft && (
          <button
            onClick={microsoftLogin}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            <MicrosoftIcon className="h-4 w-4" />
            {t('auth.microsoft')}
          </button>
        )}
        {(available.github || available.google || available.microsoft) && (
          <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            OR
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-6 shadow">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}

          {/* Email + code */}
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.email')}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder={t('auth.emailPlaceholder')}
                  className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                onClick={sendCode}
                disabled={sendingCode || countdown > 0}
                className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50"
              >
                {sendingCode ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : countdown > 0 ? (
                  t('auth.resendIn').replace('{s}', String(countdown))
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('auth.sendCode')}
                  </>
                )}
              </button>
            </div>
            {codeSent && <p className="mt-1 text-xs text-green-500">{t('auth.sent')}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.verificationCode')}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder={t('auth.codePlaceholder')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Optional username (defaults to email prefix) */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t('auth.username')} <span className="text-muted-foreground">({t('auth.optional')})</span>
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.displayName')}</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alice"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Human verification */}
          {site && (site.turnstileEnabled || site.recaptchaEnabled) && (
            <CaptchaWidget
              config={{
                turnstileEnabled: site.turnstileEnabled,
                turnstileSiteKey: site.turnstileSiteKey,
                recaptchaEnabled: site.recaptchaEnabled,
                recaptchaSiteKey: site.recaptchaSiteKey,
              }}
              onVerify={(provider, token) => setCaptcha({ provider, token })}
              resetSignal={captchaReset}
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t('auth.creating') : t('auth.signup')}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t('auth.hasAccount')}{' '}
          <Link href="/login" className="text-primary hover:underline">
            {t('auth.signin')}
          </Link>
        </p>
      </div>
    </main>
  );
}
