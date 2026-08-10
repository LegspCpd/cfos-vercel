'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserRound, KeyRound, Mail, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken, setToken } from '@/lib/client/auth';
import CaptchaWidget from '@/components/CaptchaWidget';

interface PublicSite {
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string;
}

// First-login onboarding for accounts created via a third-party (OAuth) login.
// The user must pick a username, set a password, and pass human verification.
export default function CompleteProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<{ username: string; displayName: string; email: string } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Optional email binding (enables the later "change email" flow).
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSending, setCodeSending] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [site, setSite] = useState<PublicSite | null>(null);
  const [captcha, setCaptcha] = useState<{ provider: 'turnstile' | 'recaptcha'; token: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const captchaEnabled = site && (site.turnstileEnabled || site.recaptchaEnabled);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((m) => {
        if (m.profileComplete) {
          // Already complete — nothing to do here.
          router.replace('/');
          return;
        }
        setMe({ username: m.username, displayName: m.displayName, email: m.email });
        setUsername(m.username);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
    api.getPublicSite().then(setSite).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Countdown for the "send code" button.
  useEffect(() => {
    if (codeCountdown <= 0) return;
    const id = setInterval(() => setCodeCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [codeCountdown]);

  async function sendCode() {
    setError('');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setCodeSending(true);
    try {
      await api.sendVerificationCode(email);
      setCodeCountdown(60);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCodeSending(false);
    }
  }

  async function submit() {
    setError('');
    if (username.trim().length < 3) {
      setError('用户名至少 3 个字符');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (email.trim() && !code.trim()) {
      setError('绑定邮箱需输入验证码');
      return;
    }
    if (captchaEnabled && !captcha) {
      setError('请完成人机验证');
      return;
    }
    setSaving(true);
    try {
      const res = await api.completeProfile({
        username: username.trim(),
        newPassword: password,
        email: email.trim() || undefined,
        verificationCode: code.trim() || undefined,
        captchaProvider: captcha?.provider,
        captchaToken: captcha?.token,
      });
      // Re-issue a fresh session token reflecting the new username, then finish.
      const login = await api.login(res.user.username, password);
      setToken(login.token);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-green-500" />
          <h1 className="text-xl font-bold">资料已完善</h1>
          <p className="mt-2 text-sm text-muted-foreground">你的账号已设置完成，即将进入工作区...</p>
          <button
            onClick={() => router.push('/')}
            className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            进入工作区
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UserRound className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold">完善你的资料</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            欢迎 {me?.displayName}！首次登录请设置用户名和密码，以保障账号安全。
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6">
          {error && <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="mb-1 block text-sm font-medium">用户名</label>
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="输入你的用户名"
                  className="w-full bg-transparent py-2 text-sm outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1 block text-sm font-medium">设置密码</label>
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full bg-transparent py-2 text-sm outline-none"
                />
              </div>
            </div>

            {/* Optional email binding */}
            <div>
              <label className="mb-1 block text-sm font-medium">绑定邮箱（可选）</label>
              <div className="flex gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="用于找回密码与更改邮箱"
                    className="w-full bg-transparent py-2 text-sm outline-none"
                  />
                </div>
                <button
                  onClick={sendCode}
                  disabled={codeSending || codeCountdown > 0}
                  className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {codeSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : codeCountdown > 0 ? (
                    `${codeCountdown}s`
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" /> 发送验证码
                    </>
                  )}
                </button>
              </div>
              {email.trim() && codeCountdown === 0 && !codeSending && (
                <div className="mt-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    placeholder="输入邮箱验证码"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>

            {/* Human verification */}
            {captchaEnabled && (
              <CaptchaWidget
                config={{
                  turnstileEnabled: site!.turnstileEnabled,
                  turnstileSiteKey: site!.turnstileSiteKey,
                  recaptchaEnabled: site!.recaptchaEnabled,
                  recaptchaSiteKey: site!.recaptchaSiteKey,
                }}
                onVerify={(provider, token) => setCaptcha({ provider, token })}
              />
            )}

            <button
              onClick={submit}
              disabled={saving}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? '保存中...' : '完成设置'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
