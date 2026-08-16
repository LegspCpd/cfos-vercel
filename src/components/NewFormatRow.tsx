'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { formatIcon } from '@/components/FormatBadge';
import { useI18n } from '@/lib/client/i18n';

interface FormatOffer {
  id: string;
  title: string;
  description: string;
  output: { id: string; noun: string; plural: string; icon: string };
  agentHint: string;
  variants: { name: string; description?: string }[];
}

// "Start with a format": one click per standard output the deployment offers.
// Renders nothing when the deployment promotes none (the default before seeding).
export default function NewFormatRow({ label }: { label?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [formats, setFormats] = useState<FormatOffer[]>([]);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    api
      .listFormats()
      .then((res) => setFormats(res.formats))
      .catch(() => {});
  }, []);

  if (formats.length === 0) return null;

  async function create(format: FormatOffer) {
    if (creating) return;
    setCreating(format.id);
    try {
      const res = await api.createWorkspaceFromFormat(
        t('ws.untitled') + ' ' + format.output.noun,
        format.id,
      );
      router.push(`/workspace/${res.workspace.id}`);
    } catch {
      setCreating(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label ?? t('home.startWith')}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {formats.map((format) => {
          const Icon = formatIcon(format.output.icon);
          return (
            <button
              key={format.id}
              type="button"
              disabled={creating !== null}
              onClick={() => create(format)}
              title={format.description || undefined}
              className="press flex cursor-pointer items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-[13px] text-foreground transition-colors hover:bg-secondary disabled:cursor-default disabled:opacity-60"
            >
              {creating === format.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Icon className="h-4 w-4 text-muted-foreground" />
              )}
              {creating === format.id ? t('creating') : `New ${format.output.noun}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}