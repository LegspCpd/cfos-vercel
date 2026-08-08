'use client';

import { RefreshCw, ExternalLink } from 'lucide-react';

interface PreviewProps {
  workspaceId: string;
  nonce: number; // bump to force iframe reload
}

export default function Preview({ workspaceId, nonce }: PreviewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</span>
        <div className="flex items-center gap-1">
          <a
            href={`/api/preview/${workspaceId}`}
            target="_blank"
            rel="noreferrer"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('cfos-refresh-preview'))}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Refresh preview"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <iframe
        key={nonce}
        src={`/api/preview/${workspaceId}`}
        className="h-full w-full flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="App preview"
      />
    </div>
  );
}
