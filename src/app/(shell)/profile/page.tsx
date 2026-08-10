'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Upload, Check, Link2, Mail, RefreshCw, X, HelpCircle } from 'lucide-react';
import { GithubIcon, GoogleIcon, MicrosoftIcon } from '@/components/BrandIcons';
import CaptchaWidget from '@/components/CaptchaWidget';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface MeInfo {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  avatarUrl: string;
  email: string;
  googleConnected: boolean;
  githubConnected: boolean;
  githubUsername: string | null;
  microsoftConnected: boolean;
  deleteRequestedAt: string | null;
  deleteAt: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [me, setMe] = useState<MeInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Bind-email flow (only shown when the account has no email yet)
  const [bindEmail, setBindEmail] = useState('');
  const [bindCode, setBindCode] = useState('');
  const [bindPw, setBindPw] = useState('');
  const [bindSending, setBindSending] = useState(false);
  const [bindCountdown, setBindCountdown] = useState(0);
  const [binding, setBinding] = useState(false);

  // Change-email flow (shown when the account already has an email)
  const [chgOpen, setChgOpen] = useState(false);
  const [oldEmail, setOldEmail] = useState('');
  const [oldCode, setOldCode] = useState('');
  const [oldSending, setOldSending] = useState(false);
  const [oldCountdown, setOldCountdown] = useState(0);
  const [newEmail, setNewEmail] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newSending, setNewSending] = useState(false);
  const [newCountdown, setNewCountdown] = useState(0);
  const [chgSaving, setChgSaving] = useState(false);

  // Appeal / ticket dialog
  const [appealOpen, setAppealOpen] = useState(false);
  const [site, setSite] = useState<{ turnstileEnabled: boolean; turnstileSiteKey: string; recaptchaEnabled: boolean; recaptchaSiteKey: string } | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [ticketType, setTicketType] = useState('appeal');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketContent, setTicketContent] = useState('');
  const [ticketCaptcha, setTicketCaptcha] = useState<{ provider: 'turnstile' | 'recaptcha'; token: string } | null>(null);
  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketMsg, setTicketMsg] = useState('');
  const [ticketError, setTicketError] = useState('');

  // Delete-account flow (注销账号)
  const [delOpen, setDelOpen] = useState(false);
  const [delEmail, setDelEmail] = useState('');
  const [delCode, setDelCode] = useState('');
  const [delSending, setDelSending] = useState(false);
  const [delCountdown, setDelCountdown] = useState(0);
  const [delCaptcha, setDelCaptcha] = useState<{ provider: 'turnstile' | 'recaptcha'; token: string } | null>(null);
  const [delSaving, setDelSaving] = useState(false);
  const [delMsg, setDelMsg] = useState('');
  const [delError, setDelError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // No-email account deletion: OAuth re-auth + captcha.
  const [delOauthOpen, setDelOauthOpen] = useState(false);
  const [delOauthCaptcha, setDelOauthCaptcha] = useState<{ provider: 'turnstile' | 'recaptcha'; token: string } | null>(
    null,
  );
  const [delOauthSaving, setDelOauthSaving] = useState(false);
  const [delOauthError, setDelOauthError] = useState('');
  const [delOauthMsg, setDelOauthMsg] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((m) => {
        setMe(m);
        setDisplayName(m.displayName);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));

    // Show a success banner when returning from a Google link.
    const params = new URL(window.location.href).searchParams;
    if (params.get('googleLinked')) {
      setMessage(t('pr.googleLinked'));
      window.history.replaceState({}, '', '/profile');
    }
  }, [router, t]);

  async function saveName() {
    setError('');
    setMessage('');
    setSavingName(true);
    try {
      const res = await api.updateProfile({ displayName });
      setDisplayName(res.user.displayName);
      setMessage(t('pr.displayUpdated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    setError('');
    setMessage('');
    if (newPassword.length < 6) {
      setError(t('auth.pwTooShort'));
      return;
    }
    setSavingPw(true);
    try {
      await api.updateProfile({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setMessage(t('pr.pwUpdated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingPw(false);
    }
  }

  async function handleAvatar(file: File) {
    setError('');
    setMessage('');
    if (!file.type.startsWith('image/')) {
      setError(t('pr.avatarTypeError') || '请选择图片文件');
      return;
    }
    setUploading(true);
    try {
      const res = await api.uploadAvatar(file);
      setMe((m) => (m ? { ...m, avatarUrl: res.url } : m));
      setMessage(t('pr.avatarUpdated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function connectGithub() {
    window.location.href = `/api/github/connect?token=${encodeURIComponent(getToken() || '')}`;
  }

  function connectGoogle() {
    window.location.href = `/api/auth/google/connect?token=${encodeURIComponent(getToken() || '')}`;
  }

  function connectMicrosoft() {
    window.location.href = `/api/auth/microsoft/connect?token=${encodeURIComponent(getToken() || '')}`;
  }

  function connectGitlab() {
    window.location.href = `/api/gitlab/connect?token=${encodeURIComponent(getToken() || '')}`;
  }

  // Countdown for the "resend code" button.
  useEffect(() => {
    if (bindCountdown <= 0) return;
    const id = setInterval(() => setBindCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [bindCountdown]);

  async function sendBindCode() {
    setError('');
    setMessage('');
    if (!bindEmail.trim() || !/\S+@\S+\.\S+/.test(bindEmail)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    setBindSending(true);
    try {
      await api.sendVerificationCode(bindEmail);
      setBindCountdown(60);
      setMessage(t('auth.codeSentToEmail'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBindSending(false);
    }
  }

  async function bindEmailAccount() {
    setError('');
    setMessage('');
    if (!bindEmail.trim() || !bindCode.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }
    if (bindPw.length < 6) {
      setError(t('auth.pwTooShort'));
      return;
    }
    setBinding(true);
    try {
      await api.updateProfile({
        email: bindEmail,
        verificationCode: bindCode,
        newPassword: bindPw,
      });
      setMe((m) => (m ? { ...m, email: bindEmail, githubConnected: m.githubConnected } : m));
      setMessage(t('pr.emailBound'));
      setBindEmail('');
      setBindCode('');
      setBindPw('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBinding(false);
    }
  }

  // Change-email countdowns.
  useEffect(() => {
    if (oldCountdown <= 0) return;
    const id = setInterval(() => setOldCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [oldCountdown]);
  useEffect(() => {
    if (newCountdown <= 0) return;
    const id = setInterval(() => setNewCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [newCountdown]);

  async function sendOldCode() {
    setError('');
    setMessage('');
    if (!oldEmail.trim() || !/\S+@\S+\.\S+/.test(oldEmail)) {
      setError(t('chg.invalidOldEmail'));
      return;
    }
    setOldSending(true);
    try {
      await api.sendChangeEmailCode(oldEmail);
      setOldCountdown(60);
      setMessage(t('chg.sentToOld'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOldSending(false);
    }
  }

  async function sendNewCode() {
    setError('');
    setMessage('');
    if (!newEmail.trim() || !/\S+@\S+\.\S+/.test(newEmail)) {
      setError(t('chg.invalidNewEmail'));
      return;
    }
    setNewSending(true);
    try {
      await api.sendVerificationCode(newEmail);
      setNewCountdown(60);
      setMessage(t('chg.sentToNew'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNewSending(false);
    }
  }

  async function changeEmail() {
    setError('');
    setMessage('');
    if (!oldEmail || !oldCode) {
      setError(t('chg.verifyOldFirst'));
      return;
    }
    if (!newEmail || !newCode) {
      setError(t('chg.verifyNewFirst'));
      return;
    }
    setChgSaving(true);
    try {
      const res = await api.changeEmail({
        oldEmail: oldEmail.trim(),
        oldCode: oldCode.trim(),
        newEmail: newEmail.trim(),
        newCode: newCode.trim(),
      });
      setMe((m) => (m ? { ...m, email: res.email } : m));
      setMessage(t('chg.success'));
      setChgOpen(false);
      setOldEmail('');
      setOldCode('');
      setNewEmail('');
      setNewCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChgSaving(false);
    }
  }

  function openAppeal() {
    setError('');
    setMessage('');
    setTicketError('');
    setTicketMsg('');
    setTicketType('appeal');
    setTicketTitle('');
    setTicketContent('');
    setTicketCaptcha(null);
    setAppealOpen(true);
    if (!site) api.getPublicSite().then(setSite).catch(() => {});
    api.getPublicContact().then((c) => setAdminEmail(c.adminEmail || '')).catch(() => {});
  }

  async function submitTicket() {
    setTicketError('');
    setTicketMsg('');
    if (!ticketTitle.trim()) {
      setTicketError(t('ticket.titleRequired'));
      return;
    }
    if (!ticketContent.trim()) {
      setTicketError(t('ticket.contentRequired'));
      return;
    }
    const captchaEnabled = site && (site.turnstileEnabled || site.recaptchaEnabled);
    if (captchaEnabled && !ticketCaptcha) {
      setTicketError(t('ticket.captchaRequired'));
      return;
    }
    setTicketSaving(true);
    try {
      await api.submitTicket({
        type: ticketType,
        title: ticketTitle.trim(),
        content: ticketContent.trim(),
        captchaProvider: ticketCaptcha?.provider,
        captchaToken: ticketCaptcha?.token,
      });
      setTicketMsg(t('ticket.submitted'));
      setTicketTitle('');
      setTicketContent('');
      setTicketCaptcha(null);
    } catch (e) {
      setTicketError((e as Error).message);
    } finally {
      setTicketSaving(false);
    }
  }

  // Delete-account countdown.
  useEffect(() => {
    if (delCountdown <= 0) return;
    const id = setInterval(() => setDelCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [delCountdown]);

  // When OAuth delete-confirmation redirects back with ?deleteOauth=1, show the captcha
  // step. Clean the query param so a refresh doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('deleteOauth') === '1' && me && !me.email) {
      openOauthDeleteConfirm();
      window.history.replaceState({}, '', '/profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, me]);

  function openDelete() {
    setError('');
    setMessage('');
    // No email bound → the user must re-authenticate via one of their OAuth providers.
    if (!me || !me.email) {
      if (!me) return;
      const token = encodeURIComponent(getToken() || '');
      // Use the first connected OAuth provider to confirm identity.
      const provider = me.microsoftConnected
        ? 'auth/microsoft'
        : me.googleConnected
          ? 'auth/google'
          : me.githubConnected
            ? 'github'
            : null;
      if (!provider) {
        setMessage(t('del.noLoginMethod'));
        return;
      }
      // Redirect to the provider's OAuth connect flow with purpose=delete; the callback
      // verifies identity and returns to /profile?deleteOauth=1.
      window.location.href = `/api/${provider}/connect?purpose=delete&token=${token}`;
      return;
    }
    setDelError('');
    setDelMsg('');
    setDelEmail(me?.email || '');
    setDelCode('');
    setDelCaptcha(null);
    setDelOpen(true);
    if (!site) api.getPublicSite().then(setSite).catch(() => {});
  }

  // After OAuth delete-confirmation redirects back with ?deleteOauth=1, open the captcha
  // step to actually schedule the deletion.
  function openOauthDeleteConfirm() {
    setDelOauthOpen(true);
    setDelOauthError('');
    setDelOauthMsg('');
    setDelOauthCaptcha(null);
    if (!site) api.getPublicSite().then(setSite).catch(() => {});
  }

  async function confirmOauthDelete() {
    setDelOauthError('');
    setDelOauthMsg('');
    const captchaEnabled = site && (site.turnstileEnabled || site.recaptchaEnabled);
    if (captchaEnabled && !delOauthCaptcha) {
      setDelOauthError(t('ticket.captchaRequired'));
      return;
    }
    setDelOauthSaving(true);
    try {
      const res = await api.requestDeleteAccountOauth({
        captchaProvider: delOauthCaptcha?.provider,
        captchaToken: delOauthCaptcha?.token,
      });
      setMe((m) => (m ? { ...m, deleteRequestedAt: new Date().toISOString(), deleteAt: res.deleteAt } : m));
      setMessage(t('del.scheduled'));
      setDelOauthOpen(false);
    } catch (e) {
      setDelOauthError((e as Error).message);
    } finally {
      setDelOauthSaving(false);
    }
  }

  async function sendDelCode() {
    setDelError('');
    setDelMsg('');
    if (!delEmail.trim() || !/\S+@\S+\.\S+/.test(delEmail)) {
      setDelError(t('auth.invalidEmail'));
      return;
    }
    setDelSending(true);
    try {
      await api.sendDeleteAccountCode(delEmail.trim());
      setDelCountdown(60);
      setDelMsg(t('del.sent'));
    } catch (e) {
      setDelError((e as Error).message);
    } finally {
      setDelSending(false);
    }
  }

  async function confirmDelete() {
    setDelError('');
    setDelMsg('');
    if (!delEmail.trim() || !delCode.trim()) {
      setDelError(t('del.sendFirst'));
      return;
    }
    const captchaEnabled = site && (site.turnstileEnabled || site.recaptchaEnabled);
    if (captchaEnabled && !delCaptcha) {
      setDelError(t('ticket.captchaRequired'));
      return;
    }
    setDelSaving(true);
    try {
      const res = await api.requestDeleteAccount({
        email: delEmail.trim(),
        code: delCode.trim(),
        captchaProvider: delCaptcha?.provider,
        captchaToken: delCaptcha?.token,
      });
      setMe((m) => (m ? { ...m, deleteRequestedAt: new Date().toISOString(), deleteAt: res.deleteAt } : m));
      setDelMsg(t('del.scheduled'));
      setDelOpen(false);
    } catch (e) {
      setDelError((e as Error).message);
    } finally {
      setDelSaving(false);
    }
  }

  async function cancelDelete() {
    setError('');
    setMessage('');
    setDeleting(true);
    try {
      await api.cancelDeleteAccount();
      setMe((m) => (m ? { ...m, deleteRequestedAt: null, deleteAt: null } : m));
      setMessage(t('del.cancelled'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('pr.title')}</h1>

      {message && <div className="mb-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">{message}</div>}
      {error && <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Avatar + profile */}
      <section className="mb-6 rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-4">
          {me?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="avatar" className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/20" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
              {me?.displayName?.[0]?.toUpperCase() || me?.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold">{me?.displayName}</h2>
            <p className="text-sm text-muted-foreground">@{me?.username}</p>
            <p className="mt-1 text-xs">
              <span className="font-medium">{t('pr.role')}:</span>{' '}
              <span className={me?.isAdmin ? 'text-primary' : 'text-muted-foreground'}>
                {me?.isAdmin ? t('pr.roleAdmin') : t('pr.roleUser')}
              </span>
            </p>
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium">{t('pr.avatar')}</label>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/50">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? t('pr.uploadingAvatar') : t('pr.uploadAvatar')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAvatar(f);
              e.target.value = '';
            }}
          />
        </label>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">{t('pr.displayName')}</label>
          <div className="flex gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={saveName}
              disabled={savingName}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {savingName ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </section>

      {/* Connections */}
      <section className="mb-6 rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-base font-semibold">{t('pr.connections')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t('pr.connectionsHint') || '连接后可一键用 GitHub / Google 登录返回此账号。'}
        </p>

        {/* GitHub */}
        <div className="mb-3 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <GithubIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-xs text-muted-foreground">
                {me?.githubConnected
                  ? `${t('pr.githubConnected')}${me.githubUsername || ''}`
                  : t('pr.notConnected')}
              </p>
            </div>
          </div>
          {me?.githubConnected ? (
            <span className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" /> {t('pr.connected') || '已连接'}
            </span>
          ) : (
            <button
              onClick={connectGithub}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              <Link2 className="h-3.5 w-3.5" /> {t('pr.connectGithub')}
            </button>
          )}
        </div>

        {/* Google */}
        <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <GoogleIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted-foreground">
                {me?.googleConnected ? t('pr.googleConnected') : t('pr.notConnected')}
              </p>
            </div>
          </div>
          {me?.googleConnected ? (
            <span className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" /> {t('pr.connected') || '已连接'}
            </span>
          ) : (
            <button
              onClick={connectGoogle}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              <Link2 className="h-3.5 w-3.5" /> {t('pr.connectGoogle')}
            </button>
          )}
        </div>

        {/* Microsoft */}
        <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <MicrosoftIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Microsoft</p>
              <p className="text-xs text-muted-foreground">
                {me?.microsoftConnected ? t('pr.microsoftConnected') : t('pr.notConnected')}
              </p>
            </div>
          </div>
          {me?.microsoftConnected ? (
            <span className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" /> {t('pr.connected') || '已连接'}
            </span>
          ) : (
            <button
              onClick={connectMicrosoft}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              <Link2 className="h-3.5 w-3.5" /> {t('pr.connectMicrosoft')}
            </button>
          )}
        </div>
      </section>

      {/* Email (change email if bound; bind first if not) */}
      <section className="mb-6 rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-base font-semibold">{t('pr.email')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('pr.emailHint')}</p>

        {me?.email ? (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t('pr.boundEmail')}:</span>
              <span>{me.email}</span>
            </div>

            {/* Change-email flow: verify old → enter new → verify new → save */}
            {!chgOpen ? (
              <button
                onClick={() => setChgOpen(true)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {t('chg.changeEmail')}
              </button>
            ) : (
              <div className="space-y-3">
                {/* Step 1: verify current email */}
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-2 text-xs font-medium text-primary">{t('chg.step1')}</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={oldEmail}
                      onChange={(e) => setOldEmail(e.target.value)}
                      placeholder={me.email}
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={sendOldCode}
                      disabled={oldSending || oldCountdown > 0}
                      className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50"
                    >
                      {oldSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : oldCountdown > 0 ? `${oldCountdown}s` : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" /> {t('auth.sendCode')}
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    value={oldCode}
                    onChange={(e) => setOldCode(e.target.value)}
                    inputMode="numeric"
                    placeholder={t('chg.oldCodePlaceholder')}
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Step 2: enter + verify new email */}
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-2 text-xs font-medium text-primary">{t('chg.step2')}</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={t('chg.newEmailPlaceholder')}
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={sendNewCode}
                      disabled={newSending || newCountdown > 0}
                      className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50"
                    >
                      {newSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : newCountdown > 0 ? `${newCountdown}s` : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" /> {t('auth.sendCode')}
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    inputMode="numeric"
                    placeholder={t('chg.newCodePlaceholder')}
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={changeEmail}
                    disabled={chgSaving}
                    className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {chgSaving ? t('submitting') : t('chg.confirmChange')}
                  </button>
                  <button
                    onClick={() => setChgOpen(false)}
                    className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* No email yet — first-time binding (OAuth user skipped it during onboarding) */
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="email"
                value={bindEmail}
                onChange={(e) => setBindEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={sendBindCode}
                disabled={bindSending || bindCountdown > 0}
                className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50"
              >
                {bindSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : bindCountdown > 0 ? `${bindCountdown}s` : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" /> {t('auth.sendCode')}
                  </>
                )}
              </button>
            </div>
            <input
              value={bindCode}
              onChange={(e) => setBindCode(e.target.value)}
              inputMode="numeric"
              placeholder={t('auth.codePlaceholder')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              value={bindPw}
              onChange={(e) => setBindPw(e.target.value)}
              placeholder={t('auth.pwPlaceholder')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={bindEmailAccount}
              disabled={binding}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {binding ? t('pr.binding') : t('pr.bind')}
            </button>
          </div>
        )}

        {/* Appeal / submit a ticket */}
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-sm text-muted-foreground">{t('ticket.appealHint')}</p>
          <button
            onClick={openAppeal}
            className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {t('ticket.appeal')}
          </button>
        </div>
      </section>

      {/* Password */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">{t('pr.changePw')}</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('pr.currentPw')}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('pr.newPw')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={savePassword}
            disabled={savingPw}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {savingPw ? t('pr.updating') : t('pr.updatePw')}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('pr.tip')}
        </p>
      </section>

      {/* Delete account */}
      <section className="mt-6 rounded-lg border border-destructive/30 bg-card p-6">
        <h2 className="mb-1 text-base font-semibold text-destructive">{t('del.title')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {me?.deleteAt
            ? t('del.scheduledAt')
                .replace('{date}', new Date(me.deleteAt).toLocaleDateString())
                .replace('{time}', new Date(me.deleteAt).toLocaleTimeString())
            : me?.email
              ? t('del.explainWithEmail')
              : t('del.explainNoEmail')}
        </p>

        {me?.deleteAt ? (
          <button
            onClick={cancelDelete}
            disabled={deleting}
            className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {deleting ? t('processing') : t('del.cancelDelete')}
          </button>
        ) : (
          <button
            onClick={openDelete}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90"
          >
            {t('del.deleteAccount')}
          </button>
        )}
      </section>

      {/* Delete-account confirmation dialog */}
      {delOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
          onClick={() => setDelOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold text-destructive">{t('del.confirm')}</span>
              <button
                onClick={() => setDelOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t('del.warnPermanent')}
              </div>

              {delMsg && <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">{delMsg}</div>}
              {delError && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{delError}</div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">{t('pr.boundEmail')}</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={delEmail}
                    onChange={(e) => setDelEmail(e.target.value)}
                    placeholder={me?.email || t('del.emailPlaceholder')}
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={sendDelCode}
                    disabled={delSending || delCountdown > 0}
                    className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50"
                  >
                    {delSending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : delCountdown > 0 ? (
                      `${delCountdown}s`
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" /> {t('auth.sendCode')}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">{t('auth.verificationCode')}</label>
                <input
                  value={delCode}
                  onChange={(e) => setDelCode(e.target.value)}
                  inputMode="numeric"
                  placeholder={t('auth.codePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {site && (site.turnstileEnabled || site.recaptchaEnabled) && (
                <CaptchaWidget
                  config={{
                    turnstileEnabled: site.turnstileEnabled,
                    turnstileSiteKey: site.turnstileSiteKey,
                    recaptchaEnabled: site.recaptchaEnabled,
                    recaptchaSiteKey: site.recaptchaSiteKey,
                  }}
                  onVerify={(provider, token) => setDelCaptcha({ provider, token })}
                />
              )}

              <button
                onClick={confirmDelete}
                disabled={delSaving}
                className="w-full rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {delSaving ? t('submitting') : t('del.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-account confirm via OAuth (no-email accounts) */}
      {delOauthOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
          onClick={() => setDelOauthOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold text-destructive">{t('del.confirm')}</span>
              <button
                onClick={() => setDelOauthOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t('del.oauthVerified')}
              </div>

              {delOauthMsg && (
                <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">{delOauthMsg}</div>
              )}
              {delOauthError && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{delOauthError}</div>
              )}

              {site && (site.turnstileEnabled || site.recaptchaEnabled) && (
                <CaptchaWidget
                  config={{
                    turnstileEnabled: site.turnstileEnabled,
                    turnstileSiteKey: site.turnstileSiteKey,
                    recaptchaEnabled: site.recaptchaEnabled,
                    recaptchaSiteKey: site.recaptchaSiteKey,
                  }}
                  onVerify={(provider, token) => setDelOauthCaptcha({ provider, token })}
                />
              )}

              <button
                onClick={confirmOauthDelete}
                disabled={delOauthSaving}
                className="w-full rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {delOauthSaving ? t('submitting') : t('del.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appeal / submit-ticket dialog */}
      {appealOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
          onClick={() => setAppealOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">{t('ticket.title')}</span>
              <button
                onClick={() => setAppealOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
              {/* Admin contact email */}
              {adminEmail && (
                <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2 text-sm">
                  <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {t('ticket.contactAdmin')} <span className="font-medium">{adminEmail}</span>
                  </span>
                </div>
              )}

              {ticketMsg && (
                <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">{ticketMsg}</div>
              )}
              {ticketError && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{ticketError}</div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">{t('ticket.type')}</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['appeal', t('ticket.typeAppeal')],
                      ['feedback', t('ticket.typeFeedback')],
                      ['emailChange', t('ticket.typeEmailChange')],
                      ['other', t('ticket.typeOther')],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setTicketType(val)}
                      className={`rounded-md px-3 py-1.5 text-sm ${
                        ticketType === val ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">{t('ticket.titleLabel')}</label>
                <input
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  placeholder={t('ticket.titlePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">{t('ticket.contentLabel')}</label>
                <textarea
                  value={ticketContent}
                  onChange={(e) => setTicketContent(e.target.value)}
                  rows={4}
                  placeholder={t('ticket.contentPlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {site && (site.turnstileEnabled || site.recaptchaEnabled) && (
                <CaptchaWidget
                  config={{
                    turnstileEnabled: site.turnstileEnabled,
                    turnstileSiteKey: site.turnstileSiteKey,
                    recaptchaEnabled: site.recaptchaEnabled,
                    recaptchaSiteKey: site.recaptchaSiteKey,
                  }}
                  onVerify={(provider, token) => setTicketCaptcha({ provider, token })}
                />
              )}

              <button
                onClick={submitTicket}
                disabled={ticketSaving}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {ticketSaving ? t('submitting') : t('ticket.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
