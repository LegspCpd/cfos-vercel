'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface SiteSettings {
  signupsEnabled: boolean;
  siteName: string;
  siteTagline: string;
  bannerText: string;
  bannerEnabled: boolean;
  bannerColor: string;
  footerText: string;
  defaultModel: string;
  agentInstructions: string;
  siteFavicon: string;
  siteLogo: string;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  recaptchaSiteKey: string;
  recaptchaSecretKey: string;
  turnstileEnvManaged: boolean;
  recaptchaEnvManaged: boolean;
}

const BANNER_COLORS = ['blue', 'amber', 'red', 'green'];

export default function SiteSettingsPanel() {
  const { t } = useI18n();
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getSiteSettings()
      .then((res) => setForm(res.settings))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api.updateSiteSettings({ ...form });
      setMessage(t('site.saved'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">{t('site.settings')}</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      </section>
    );
  }

  if (!form) return null;

  const inputCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-base font-semibold">{t('site.settings')}</h2>

      {message && <div className="mb-3 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">{message}</div>}
      {error && <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="space-y-4">
        {/* Basic info */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('site.siteName')}</label>
            <input className={inputCls} value={form.siteName} onChange={(e) => update('siteName', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('site.siteTagline')}</label>
            <input className={inputCls} value={form.siteTagline} onChange={(e) => update('siteTagline', e.target.value)} />
          </div>
        </div>

        {/* Banner */}
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('site.banner')}</p>
              <p className="text-sm text-muted-foreground">{t('site.bannerHint')}</p>
            </div>
            <button
              onClick={() => update('bannerEnabled', !form.bannerEnabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${form.bannerEnabled ? 'bg-primary' : 'bg-secondary'}`}
              aria-label="Toggle banner"
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${form.bannerEnabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          {form.bannerEnabled && (
            <div className="mt-3 space-y-2">
              <input
                className={inputCls}
                placeholder={t('site.bannerText')}
                value={form.bannerText}
                onChange={(e) => update('bannerText', e.target.value)}
              />
              <div className="flex gap-2">
                {BANNER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => update('bannerColor', c)}
                    className={`h-6 w-6 rounded-full border ${form.bannerColor === c ? 'ring-2 ring-primary' : ''}`}
                    style={{ backgroundColor: c === 'blue' ? '#3b82f6' : c === 'amber' ? '#f59e0b' : c === 'red' ? '#ef4444' : '#22c55e' }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div>
          <label className="mb-1 block text-sm font-medium">{t('site.footer')}</label>
          <input className={inputCls} placeholder={t('site.footerPlaceholder')} value={form.footerText} onChange={(e) => update('footerText', e.target.value)} />
        </div>

        {/* Branding / custom icons */}
        <div className="rounded-md border p-4">
          <p className="font-medium">{t('site.branding')}</p>
          <p className="mb-3 text-sm text-muted-foreground">{t('site.brandingHint')}</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Favicon URL</label>
              <input
                className={inputCls}
                placeholder={t('site.faviconPlaceholder')}
                value={form.siteFavicon}
                onChange={(e) => update('siteFavicon', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Logo URL</label>
              <input
                className={inputCls}
                placeholder="https://.../logo.png"
                value={form.siteLogo}
                onChange={(e) => update('siteLogo', e.target.value)}
              />
            </div>
            {form.siteFavicon && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t('site.faviconPreview')}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.siteFavicon} alt="favicon" className="h-6 w-6 rounded object-cover" />
              </div>
            )}
          </div>
        </div>

        {/* Agent */}
        <div>
          <label className="mb-1 block text-sm font-medium">{t('site.defaultModel')}</label>
          <input className={inputCls} placeholder="deepseek-chat" value={form.defaultModel} onChange={(e) => update('defaultModel', e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('site.agentInstructions')}</label>
          <textarea
            className={`${inputCls} min-h-[80px]`}
            placeholder={t('site.agentInstructionsPlaceholder')}
            value={form.agentInstructions}
            onChange={(e) => update('agentInstructions', e.target.value)}
          />
        </div>

        {/* Human verification (CAPTCHA) */}
        <div className="rounded-md border p-4">
          <p className="font-medium">{t('site.captcha')}</p>
          <p className="mb-3 text-sm text-muted-foreground">{t('site.captchaHint')}</p>

          {/* Turnstile */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Cloudflare Turnstile</p>
              <div className="flex items-center gap-2">
                {form.turnstileEnvManaged && (
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">{t('site.envManaged')}</span>
                )}
                <span className={`rounded px-2 py-0.5 text-xs ${form.turnstileSiteKey && form.turnstileSecretKey ? 'bg-green-500/10 text-green-600' : 'bg-secondary text-muted-foreground'}`}>
                  {form.turnstileSiteKey && form.turnstileSecretKey ? t('site.enabled') : t('site.disabled')}
                </span>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              <input
                className={inputCls}
                placeholder="Turnstile Site Key"
                value={form.turnstileSiteKey}
                disabled={form.turnstileEnvManaged}
                onChange={(e) => update('turnstileSiteKey', e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Turnstile Secret Key"
                type="password"
                value={form.turnstileSecretKey}
                disabled={form.turnstileEnvManaged}
                onChange={(e) => update('turnstileSecretKey', e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('site.envHint')} <code className="rounded bg-secondary px-1">TURNSTILE_SITE_KEY</code> / <code className="rounded bg-secondary px-1">TURNSTILE_SECRET_KEY</code>
            </p>
          </div>

          {/* reCAPTCHA */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Google reCAPTCHA</p>
              <div className="flex items-center gap-2">
                {form.recaptchaEnvManaged && (
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">{t('site.envManaged')}</span>
                )}
                <span className={`rounded px-2 py-0.5 text-xs ${form.recaptchaSiteKey && form.recaptchaSecretKey ? 'bg-green-500/10 text-green-600' : 'bg-secondary text-muted-foreground'}`}>
                  {form.recaptchaSiteKey && form.recaptchaSecretKey ? t('site.enabled') : t('site.disabled')}
                </span>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              <input
                className={inputCls}
                placeholder="reCAPTCHA Site Key"
                value={form.recaptchaSiteKey}
                disabled={form.recaptchaEnvManaged}
                onChange={(e) => update('recaptchaSiteKey', e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="reCAPTCHA Secret Key"
                type="password"
                value={form.recaptchaSecretKey}
                disabled={form.recaptchaEnvManaged}
                onChange={(e) => update('recaptchaSecretKey', e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('site.envHint')} <code className="rounded bg-secondary px-1">RECAPTCHA_SITE_KEY</code> / <code className="rounded bg-secondary px-1">RECAPTCHA_SECRET_KEY</code>
            </p>
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? t('saving') : t('site.save')}
        </button>
      </div>
    </section>
  );
}
