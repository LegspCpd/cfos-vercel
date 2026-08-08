'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Github, Link2, Unlink, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';

export default function ConnectionsPage() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const res = await api.githubStatus();
      setConnected(res.connected);
      setGithubLogin(res.githubLogin);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    // Handle OAuth callback ?connected=1 or ?error=
    const params = new URL(window.location.href).searchParams;
    if (params.get('connected')) setMessage('✅ GitHub 连接成功！agent 现在可以访问你的 GitHub 了。');
    if (params.get('error')) setMessage(`⚠️ 连接失败：${params.get('error')}`);
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState({}, '', '/connections');
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function connect() {
    setBusy(true);
    window.location.href = `/api/github/connect?token=${encodeURIComponent(getToken() || '')}`;
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.githubDisconnect();
      setConnected(false);
      setGithubLogin(null);
      setMessage('已断开 GitHub 连接。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold">外部连接</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        连接外部服务后，agent 可以代表你调用它们的 API。
      </p>

      {message && (
        <div className="mt-4 rounded-md bg-card px-4 py-3 text-sm text-muted-foreground">{message}</div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
        </div>
      ) : (
        <div className="mt-6 rounded-lg border bg-card p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Github className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">GitHub</p>
                {connected && (
                  <span className="flex items-center gap-1 rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> 已连接
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {connected
                  ? `已连接到 @${githubLogin}。agent 可以读取你的仓库和文件。`
                  : '连接后 agent 可以列出你的仓库、读取文件内容。'}
              </p>
            </div>
          </div>
          <div className="mt-4 border-t pt-4">
            {connected ? (
              <button
                onClick={disconnect}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Unlink className="h-4 w-4" /> 断开连接
              </button>
            ) : (
              <button
                onClick={connect}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Link2 className="h-4 w-4" /> 连接 GitHub
              </button>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        当前支持：GitHub。更多外部服务（Google、Slack 等）后续可添加。
      </p>
    </div>
  );
}
