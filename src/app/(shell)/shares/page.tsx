'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Trash2,
  Copy,
  ExternalLink,
  Loader2,
  FileText,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';

interface ShareFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function remainingLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '已过期';
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} 天后过期`;
  if (hours >= 1) return `${hours} 小时后过期`;
  return `${Math.max(1, Math.floor(ms / 60000))} 分钟后过期`;
}

export default function SharesPage() {
  const router = useRouter();
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [expiry, setExpiry] = useState(7);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.listShares();
      setFiles(res.files);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function upload() {
    if (!selected) return;
    setUploading(true);
    setError('');
    try {
      // Read file as base64.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selected);
      });
      const base64 = dataUrl.split(',')[1] || dataUrl;
      const res = await api.uploadShare({
        fileName: selected.name,
        mimeType: selected.type || 'application/octet-stream',
        content: base64,
        expiresInDays: expiry,
      });
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function copyLink(id: string) {
    try {
      const res = await api.getShareLink(id);
      await navigator.clipboard.writeText(res.url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function openLink(id: string) {
    try {
      const res = await api.getShareLink(id);
      window.open(res.url, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    await api.deleteShare(id);
    setFiles((f) => f.filter((x) => x.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-bold">文件分享</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        上传文件到 Cloudflare R2，生成带有效期的下载链接。下载直接走 R2，不占用 Vercel 流量。
      </p>

      {error && <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Upload form */}
      <div className="mt-6 rounded-lg border bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">上传文件</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm hover:bg-secondary/50">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{selected ? selected.name : '选择文件 (最大 50MB)'}</span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => setSelected(e.target.files?.[0] ?? null)}
            />
          </label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(Number(e.target.value))}
            className="rounded-md border bg-background px-3 py-2.5 text-sm outline-none"
            title="有效期"
          >
            <option value={1}>1 天</option>
            <option value={7}>7 天</option>
            <option value={14}>14 天</option>
            <option value={30}>30 天</option>
          </select>
          <button
            onClick={upload}
            disabled={!selected || uploading}
            className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? '上传中...' : '上传'}
          </button>
        </div>
      </div>

      {/* List */}
      <h2 className="mt-8 mb-3 text-base font-semibold">我的分享</h2>
      {loading ? (
        <p className="text-muted-foreground">加载中...</p>
      ) : files.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          还没有分享的文件。上传一个文件开始。
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{f.fileName}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatBytes(f.sizeBytes)} · {remainingLabel(f.expiresAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => copyLink(f.id)}
                  className="rounded p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="复制下载链接"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openLink(f.id)}
                  className="rounded p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="打开链接"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(f.id)}
                  className="rounded p-2 text-destructive hover:bg-destructive/10"
                  title="删除分享"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {copiedId && <p className="mt-3 text-xs text-green-500">链接已复制到剪贴板</p>}
    </div>
  );
}
