'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '@/lib/client/api';

interface Status {
  enabled: boolean;
  team: string | null;
  audConfigured: boolean;
  audMasked: string | null;
}

export default function CfAccessStatus() {
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
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
        </div>
      ) : !status ? (
        <p className="text-sm text-muted-foreground">无法获取状态。</p>
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
                {status.enabled ? '已启用' : '未启用'}
              </p>
              <p className="text-sm text-muted-foreground">
                {status.enabled
                  ? '所有敏感 API 都会校验 Cloudflare Access JWT。'
                  : '配置 CF_ACCESS_TEAM 后启用完整版 Cloudflare Access 门禁。'}
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
                {status.audConfigured ? status.audMasked : '未配置'}
              </span>
            </div>
          </div>

          {!status.enabled && (
            <p className="text-xs text-muted-foreground">
              启用方式：在 Vercel 环境变量设置 <code className="rounded bg-muted px-1">CF_ACCESS_TEAM</code>
              （团队名，如 <code className="rounded bg-muted px-1">lapdsss</code>），并确保域名走 Cloudflare 代理。
              可选增强项 <code className="rounded bg-muted px-1">CF_ACCESS_AUD</code> 可跳过。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
