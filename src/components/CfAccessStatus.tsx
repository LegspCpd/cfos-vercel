'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface Status {
  enabled: boolean;
  team: string | null;
  audConfigured: boolean;
  audMasked: string | null;
}

export default function CfAccessStatus() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .cfAccessStatus()
      .then(setStatus)
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-base font-semibold">Cloudflare Access</h2>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : !status ? (
        <p className="text-sm text-muted-foreground">{t('cf.statusUnavailable')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-md border p-4">
            {status.enabled ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-500/15 text-green-600">
                <ShieldCheck className="h-5 w-5" />
              </span>
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <ShieldOff className="h-5 w-5" />
              </span>
            )}
            <div className="flex-1">
              <p className="font-medium">
                {status.enabled ? t('site.enabled') : t('site.disabled')}
              </p>
              <p className="text-sm text-muted-foreground">
                {status.enabled ? t('cf.jwtDesc') : t('cf.disabledHint')}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">Team</span>
              <span className="font-mono">{status.team ?? '—'}</span>
            </div>
            <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">AUD Tag</span>
              <span className="font-mono">
                {status.audConfigured ? status.audMasked : t('cf.notConfigured')}
              </span>
            </div>
          </div>

          {!status.enabled && (
            <p className="text-xs text-muted-foreground">{t('cf.howToEnable')}</p>
          )}
        </div>
      )}
    </section>
  );
}
