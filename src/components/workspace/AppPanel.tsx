'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/client/i18n';
import type { WorkspaceFile } from '@/lib/client/api';

interface Props {
  previewUrl: string;
  files: WorkspaceFile[];
}

// The "App" tab — renders the workspace's entry file in a sandboxed iframe so the user sees a
// live preview of their gadget. The iframe is reloaded when files change (debounced) so edits in
// the Code tab show up here without a full page refresh.
export default function AppPanel({ previewUrl, files }: Props) {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounced reload: when the file set changes (e.g. after an agent run or a manual save),
  // bump the reload key so the iframe re-fetches the preview. 400ms avoids thrashing on rapid
  // keystroke saves.
  useEffect(() => {
    const tmr = setTimeout(() => {
      setReloadKey((k) => k + 1);
      setLoading(true);
    }, 400);
    return () => clearTimeout(tmr);
  }, [files]);

  function openInNewTab() {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }

  if (!previewUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('ws.noPreview')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-end gap-1 border-b bg-card px-2 py-1.5">
        <button
          onClick={() => {
            setReloadKey((k) => k + 1);
            setLoading(true);
          }}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={t('ws.reload')}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={openInNewTab}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={t('ws.openExternal')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* iframe */}
      <div className="relative min-h-0 flex-1 bg-white">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={reloadKey}
          src={previewUrl}
          title="preview"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          className="h-full w-full border-0"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
}
