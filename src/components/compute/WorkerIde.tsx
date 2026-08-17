'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Rocket,
  Loader2,
  ExternalLink,
  Eye,
  FileCode2,
  Terminal,
  Radio,
  History,
  Pause,
  Play,
  RefreshCw,
  Check,
  Copy,
  X,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';
import WorkerCodeEditor from '@/components/compute/WorkerCodeEditor';

// The fullscreen VS Code-style Worker IDE:
//   ┌────────────────────────────────────────────────────────────┐
//   │ ← back | worker-name        [deploy] [visit]               │
//   ├──────────────────────────────┬─────────────────────────────┤
//   │                              │  preview (live URL iframe / │
//   │   Monaco code editor         │  code view)                 │
//   │   (full height)              ├─────────────────────────────┤
//   │                              │  logs (deploy / live tail / │
//   │                              │  history)                   │
//   └──────────────────────────────┴─────────────────────────────┘
// Deploy = save + go live. After a deploy the preview auto-refreshes and the deploy log
// is appended. The live tail connects to Cloudflare's Tail WebSocket (server-side token).
export default function WorkerIde({ workerId }: { workerId: string }) {
  const router = useRouter();
  const { t } = useI18n();

  // Worker data.
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [workerName, setWorkerName] = useState('');
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [dirty, setDirty] = useState(false);

  // Deploy state.
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Preview pane. Default to the code view: workers.dev sets `X-Frame-Options: sameorigin`,
  // so the live iframe is blank for most Workers — the code view always works.
  const [previewTab, setPreviewTab] = useState<'live' | 'code'>('code');
  const [previewKey, setPreviewKey] = useState(0); // bump to force iframe reload

  // Logs pane.
  const [logTab, setLogTab] = useState<'deploy' | 'tail' | 'history'>('deploy');
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [historyLog, setHistoryLog] = useState<string[]>([]);
  const [tailLines, setTailLines] = useState<string[]>([]);
  const [tailState, setTailState] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [tailPaused, setTailPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  const logBoxRef = useRef<HTMLDivElement>(null);
  const tailWsRef = useRef<WebSocket | null>(null);

  // Load the worker (DB record + live code from Cloudflare).
  const load = useCallback(async () => {
    try {
      const [detail, codeRes] = await Promise.all([
        api.getWorker(workerId),
        api.getWorkerCode(workerId),
      ]);
      setWorkerName(detail.worker.workerName);
      setUrl(detail.worker.url);
      setCode(codeRes.code);
      setDeployLog((detail.worker.log || '').split('\n').filter(Boolean));
      setHistoryLog((detail.worker.log || '').split('\n').filter(Boolean));
      setDirty(false);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  // Auto-scroll the log box unless the user paused it (scrolled up).
  useEffect(() => {
    const el = logBoxRef.current;
    if (!el || tailPaused) return;
    el.scrollTop = el.scrollHeight;
  }, [deployLog, tailLines, historyLog, tailPaused]);

  // Clean up the tail WebSocket on unmount.
  useEffect(() => {
    return () => {
      tailWsRef.current?.close();
    };
  }, []);

  // Connect to the realtime Tail WebSocket (server-side token; the browser only gets the URL).
  const connectTail = useCallback(async () => {
    tailWsRef.current?.close();
    setTailState('connecting');
    setTailLines([]);
    try {
      const r = await api.createWorkerTail(workerId);
      // Only connect to wss:// endpoints (Cloudflare Tail URLs). Never follow a non-wss
      // URL even if the API misbehaves.
      if (!r.url.startsWith('wss://')) {
        setTailState('disconnected');
        return;
      }
      // Cloudflare's Tail backend requires the `trace-v1` subprotocol
      // (Sec-WebSocket-Protocol: trace-v1) — without it the handshake is rejected (406).
      const ws = new WebSocket(r.url, 'trace-v1');
      tailWsRef.current = ws;
      ws.addEventListener('open', () => {
        setTailState('connected');
        // The Tail backend expects a filter message on open (like wrangler sends).
        try {
          ws.send(JSON.stringify({ filters: [] }));
        } catch {
          /* ignore */
        }
      });
      ws.addEventListener('message', (ev) => {
        // Tail messages are Cloudflare `TailEventMessage` JSON:
        //   { outcome, scriptName, logs: [{ message: unknown[], level, timestamp }],
        //     exceptions: [{ name, message, timestamp, stack }], eventTimestamp, event }
        // Render console logs and exceptions best-effort.
        try {
          const data = JSON.parse(ev.data as string);
          if (Array.isArray(data?.logs)) {
            for (const log of data.logs) {
              const msg = Array.isArray(log?.message)
                ? log.message.map((m: unknown) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ')
                : String(log?.message ?? '');
              if (msg) appendTailLine(`[${log?.level ?? 'log'}] ${msg}`);
            }
          }
          if (Array.isArray(data?.exceptions) && data.exceptions.length > 0) {
            for (const ex of data.exceptions) {
              appendTailLine(`[exception] ${ex?.name ?? ''}: ${String(ex?.message ?? '')}`);
            }
          }
          if (data?.outcome && !Array.isArray(data?.logs) && !Array.isArray(data?.exceptions)) {
            appendTailLine(`[${data.outcome}] ${data?.scriptName ?? ''} ${data?.eventTimestamp ? new Date(data.eventTimestamp).toLocaleTimeString() : ''}`);
          }
        } catch {
          appendTailLine(String(ev.data ?? ''));
        }
      });
      ws.addEventListener('close', () => setTailState('disconnected'));
      ws.addEventListener('error', () => {
        ws.close();
        setTailState('disconnected');
      });
    } catch {
      setTailState('disconnected');
    }
  }, [workerId]);

  function appendTailLine(line: string) {
    setTailLines((prev) => {
      const next = [...prev, line];
      // Cap the buffer so a long tail session can't grow unbounded.
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }

  // Deploy = save + go live. Direct deploy (no confirm), then refresh the preview.
  async function runDeploy() {
    if (deploying) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setDeployMsg({ text: t('wk.codeRequired') || 'Worker code is required', type: 'err' });
      return;
    }
    setDeploying(true);
    setDeployMsg(null);
    setLogTab('deploy');
    setDeployLog((l) => [...l, `$ deploy worker:${workerName}`]);
    try {
      const r = await api.deployWorker({ workerName, code: trimmed });
      if (r.error) {
        setDeployLog((l) => [...l, `[worker] failed: ${r.error}`]);
        setDeployMsg({ text: r.error, type: 'err' });
      } else {
        setDeployLog((l) => [...l, `[worker] deployed ${r.workerName} → ${r.url}`]);
        setDeployMsg({ text: t('wk.ide.deployed') || 'Deployed', type: 'ok' });
        setDirty(false);
        // Auto-refresh the preview iframe.
        setPreviewKey((k) => k + 1);
        // Refresh the history log from the DB.
        void load();
      }
    } catch (e) {
      setDeployLog((l) => [...l, `[worker] failed: ${(e as Error).message}`]);
      setDeployMsg({ text: (e as Error).message, type: 'err' });
    } finally {
      setDeploying(false);
    }
  }

  function copyUrl() {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-muted-foreground">{t('wk.ide.notFound') || 'Worker not found or deleted'}</p>
        <button
          onClick={() => router.push('/compute/worker-and-pages')}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t('wk.ide.back') || 'Back'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
        <button
          onClick={() => router.push(`/compute/worker/${workerId}/detail`)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
          title={t('wk.ide.back') || 'Back to details'}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{t('wk.ide.back') || 'Back'}</span>
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-semibold">{workerName}</div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={clsx('h-1.5 w-1.5 rounded-full', dirty ? 'bg-amber-500' : 'bg-green-500')} />
            {dirty ? t('wk.ide.unsaved') || 'Unsaved changes' : t('wk.ide.deployed') || 'Deployed'}
          </div>
        </div>
        <div className="flex-1" />
        {deployMsg && (
          <span className={clsx('hidden text-xs md:inline', deployMsg.type === 'ok' ? 'text-green-600' : 'text-red-500')}>
            {deployMsg.text}
          </span>
        )}
        <button
          onClick={copyUrl}
          className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
          title={t('wk.ide.copy') || 'Copy'}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden max-w-40 truncate sm:inline">{url}</span>
        </button>
        <button
          onClick={() => window.open(url, '_blank')}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('wk.ide.visit') || 'Visit'}
        </button>
        <button
          onClick={runDeploy}
          disabled={deploying}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          {deploying ? t('wk.ide.deploying') || 'Deploying…' : t('wk.ide.deploy') || 'Deploy'}
        </button>
      </div>

      {/* Main split: code (left) | preview + logs (right) */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Monaco code editor (full height) */}
        <div className="flex min-w-0 flex-1 flex-col border-r">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-secondary/30 px-3 text-xs text-muted-foreground">
            <FileCode2 className="h-3.5 w-3.5" />
            <span className="font-mono">index.js</span>
            <span className="ml-auto flex items-center gap-1">
              <span className={clsx('h-1.5 w-1.5 rounded-full', dirty ? 'bg-amber-500' : 'bg-green-500')} />
              {dirty ? t('wk.ide.unsaved') || 'Unsaved' : t('wk.ide.deployed') || 'Deployed'}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <WorkerCodeEditor value={code} onChange={(v) => { setCode(v); setDirty(true); }} height="100%" />
          </div>
        </div>

        {/* Right: preview (top) + logs (bottom) */}
        <div className="flex w-[46%] min-w-0 flex-col border-l">
          {/* Preview pane */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-secondary/30 px-2">
              <button
                onClick={() => setPreviewTab('live')}
                className={clsx(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs',
                  previewTab === 'live' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                {t('wk.ide.previewLive') || 'Live preview'}
              </button>
              <button
                onClick={() => setPreviewTab('code')}
                className={clsx(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs',
                  previewTab === 'code' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                {t('wk.ide.previewCode') || 'Code view'}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setPreviewKey((k) => k + 1)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                title={t('wk.ide.reconnect') || 'Refresh'}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 bg-white">
              {previewTab === 'live' ? (
                <>
                  <iframe
                    key={previewKey}
                    src={url}
                    title="worker-preview"
                    className="h-full w-full border-0"
                    // Sandboxed: scripts allowed (the worker needs them), but no same-origin
                    // access (the worker origin differs from ours anyway) and no top-navigation.
                    sandbox="allow-scripts allow-forms allow-popups"
                    referrerPolicy="no-referrer"
                  />
                  {/* workers.dev sends `X-Frame-Options: sameorigin`, so the frame is blank for
                      most Workers. Show a hint instead of a confusing empty pane. */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
                    <span className="mt-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] text-amber-800 shadow-sm">
                      {t('wk.ide.previewBlocked') || 'If blank: this site blocks embedding — open it in a new tab'}
                    </span>
                  </div>
                </>
              ) : (
                <pre className="h-full overflow-auto bg-background p-3 font-mono text-xs text-foreground">
                  {code || '// empty'}
                </pre>
              )}
            </div>
          </div>

          {/* Logs pane */}
          <div className="flex h-[38%] min-h-0 flex-col border-t">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-secondary/30 px-2">
              <button
                onClick={() => setLogTab('deploy')}
                className={clsx(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs',
                  logTab === 'deploy' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <Terminal className="h-3.5 w-3.5" />
                {t('wk.ide.logsDeploy') || 'Deploy logs'}
              </button>
              <button
                onClick={() => { setLogTab('tail'); if (tailState === 'idle' || tailState === 'disconnected') connectTail(); }}
                className={clsx(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs',
                  logTab === 'tail' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <Radio className={clsx('h-3.5 w-3.5', tailState === 'connected' && 'animate-pulse text-green-500')} />
                {t('wk.ide.logsTail') || 'Live logs'}
              </button>
              <button
                onClick={() => setLogTab('history')}
                className={clsx(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs',
                  logTab === 'history' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <History className="h-3.5 w-3.5" />
                {t('wk.ide.logsHistory') || 'History'}
              </button>
              <div className="flex-1" />
              {logTab === 'tail' && tailState === 'connected' && (
                <button
                  onClick={() => setTailPaused((v) => !v)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary"
                  title={tailPaused ? t('wk.ide.tailResume') || 'Resume' : t('wk.ide.tailPaused') || 'Pause'}
                >
                  {tailPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  {tailPaused && <span className="hidden sm:inline">{t('wk.ide.tailResume') || 'Resume'}</span>}
                </button>
              )}
              {logTab === 'tail' && (tailState === 'disconnected' || tailState === 'idle') && (
                <button
                  onClick={connectTail}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t('wk.ide.reconnect') || 'Reconnect'}
                </button>
              )}
              <button
                onClick={() => {
                  if (logTab === 'deploy') setDeployLog([]);
                  else if (logTab === 'tail') setTailLines([]);
                  else setHistoryLog([]);
                }}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                title={t('wk.ide.clear') || 'Clear'}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div ref={logBoxRef} className="min-h-0 flex-1 overflow-y-auto bg-black p-3 font-mono text-xs text-green-400">
              {logTab === 'deploy' && (
                deployLog.length === 0 ? (
                  <div className="text-green-600/60">{t('wk.ide.logsEmpty') || 'No logs yet.'}</div>
                ) : (
                  deployLog.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                  ))
                )
              )}
              {logTab === 'tail' && (
                tailState === 'connecting' ? (
                  <div className="text-green-600/60">{t('wk.ide.tailConnecting') || 'Connecting…'}</div>
                ) : tailState === 'disconnected' ? (
                  <div className="text-green-600/60">{t('wk.ide.tailEmpty') || 'Not connected.'}</div>
                ) : tailLines.length === 0 ? (
                  <div className="text-green-600/60">{t('wk.ide.tailConnected') || 'Connected — waiting for events…'}</div>
                ) : (
                  tailLines.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                  ))
                )
              )}
              {logTab === 'history' && (
                historyLog.length === 0 ? (
                  <div className="text-green-600/60">{t('wk.ide.logsEmpty') || 'No logs yet.'}</div>
                ) : (
                  historyLog.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}