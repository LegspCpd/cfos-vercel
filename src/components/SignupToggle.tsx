'use client';

import { useEffect, useState } from 'react';
import { UserPlus, Loader2, Check, X } from 'lucide-react';
import { api } from '@/lib/client/api';

// Standalone, prominent "allow user registration" switch for the admin dashboard.
// Kept separate from the site-settings form so admins can toggle it at a glance.
export default function SignupToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getSiteSettings()
      .then((res) => setEnabled(res.settings.signupsEnabled))
      .catch((e) => setError((e as Error).message));
  }, []);

  async function toggle() {
    if (enabled === null || saving) return;
    const next = !enabled;
    setSaving(true);
    setError('');
    try {
      await api.updateSiteSettings({ signupsEnabled: next });
      setEnabled(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium">是否允许用户注册</p>
            <p className="text-xs text-muted-foreground">加载中...</p>
          </div>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-md ${enabled ? 'bg-green-500/10 text-green-600' : 'bg-secondary text-muted-foreground'}`}>
          {enabled ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </span>
        <div>
          <p className="text-sm font-medium">是否允许用户注册</p>
          <p className={`text-xs ${enabled ? 'text-green-600' : 'text-destructive'}`}>
            {enabled ? '当前允许注册（新用户可注册）' : '当前关闭注册（新用户无法注册）'}
          </p>
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        aria-label="Toggle registration"
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${enabled ? 'bg-primary' : 'bg-muted'} disabled:opacity-60`}
      >
        {saving && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </span>
        )}
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-7' : 'left-1'}`}
        />
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
