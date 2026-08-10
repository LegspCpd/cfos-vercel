'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { api } from '@/lib/client/api';

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
}

const BANNER_COLORS = ['blue', 'amber', 'red', 'green'];

export default function SiteSettingsPanel() {
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
      setMessage('设置已保存');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">站点设置</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
        </div>
      </section>
    );
  }

  if (!form) return null;

  const inputCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-base font-semibold">站点设置</h2>

      {message && <div className="mb-3 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">{message}</div>}
      {error && <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="space-y-4">
        {/* Basic info */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">站点名称</label>
            <input className={inputCls} value={form.siteName} onChange={(e) => update('siteName', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">站点标语</label>
            <input className={inputCls} value={form.siteTagline} onChange={(e) => update('siteTagline', e.target.value)} />
          </div>
        </div>

        {/* Banner */}
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">公告横幅</p>
              <p className="text-sm text-muted-foreground">显示在页面顶部。</p>
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
                placeholder="横幅文字"
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
          <label className="mb-1 block text-sm font-medium">页脚文字</label>
          <input className={inputCls} placeholder="如：© 2026 我的产品" value={form.footerText} onChange={(e) => update('footerText', e.target.value)} />
        </div>

        {/* Branding / custom icons */}
        <div className="rounded-md border p-4">
          <p className="font-medium">品牌与图标</p>
          <p className="mb-3 text-sm text-muted-foreground">自定义网站图标（favicon）和 Logo，用于浏览器标签页与登录/注册页。</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Favicon URL</label>
              <input
                className={inputCls}
                placeholder="https://.../favicon.ico 或 .svg 链接"
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
                <span>Favicon 预览：</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.siteFavicon} alt="favicon" className="h-6 w-6 rounded object-cover" />
              </div>
            )}
          </div>
        </div>

        {/* Agent */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">默认模型</label>
            <input className={inputCls} placeholder="如 deepseek-chat" value={form.defaultModel} onChange={(e) => update('defaultModel', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">注册开关</label>
            <button
              onClick={() => update('signupsEnabled', !form.signupsEnabled)}
              className={`relative mt-1 h-6 w-11 rounded-full transition ${form.signupsEnabled ? 'bg-primary' : 'bg-secondary'}`}
              aria-label="Toggle signups"
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${form.signupsEnabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Agent 附加指令</label>
          <textarea
            className={`${inputCls} min-h-[80px]`}
            placeholder="附加到每次 agent 提示词的指令..."
            value={form.agentInstructions}
            onChange={(e) => update('agentInstructions', e.target.value)}
          />
        </div>

        {/* Human verification (CAPTCHA) */}
        <div className="rounded-md border p-4">
          <p className="font-medium">人机验证</p>
          <p className="mb-3 text-sm text-muted-foreground">
            新用户注册时强制通过人机验证。默认关闭；填了任一提供者的 Site Key 和 Secret 即开启。两个都填则随机加载其中一个。
          </p>

          {/* Turnstile */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Cloudflare Turnstile</p>
              <span className={`rounded px-2 py-0.5 text-xs ${form.turnstileSiteKey && form.turnstileSecretKey ? 'bg-green-500/10 text-green-600' : 'bg-secondary text-muted-foreground'}`}>
                {form.turnstileSiteKey && form.turnstileSecretKey ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              <input
                className={inputCls}
                placeholder="Turnstile Site Key"
                value={form.turnstileSiteKey}
                onChange={(e) => update('turnstileSiteKey', e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Turnstile Secret Key"
                type="password"
                value={form.turnstileSecretKey}
                onChange={(e) => update('turnstileSecretKey', e.target.value)}
              />
            </div>
          </div>

          {/* reCAPTCHA */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Google reCAPTCHA</p>
              <span className={`rounded px-2 py-0.5 text-xs ${form.recaptchaSiteKey && form.recaptchaSecretKey ? 'bg-green-500/10 text-green-600' : 'bg-secondary text-muted-foreground'}`}>
                {form.recaptchaSiteKey && form.recaptchaSecretKey ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              <input
                className={inputCls}
                placeholder="reCAPTCHA Site Key"
                value={form.recaptchaSiteKey}
                onChange={(e) => update('recaptchaSiteKey', e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="reCAPTCHA Secret Key"
                type="password"
                value={form.recaptchaSecretKey}
                onChange={(e) => update('recaptchaSecretKey', e.target.value)}
              />
            </div>
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </section>
  );
}
