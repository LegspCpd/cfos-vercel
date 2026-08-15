'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Cpu, Loader2 } from 'lucide-react';
import { getToken } from '@/lib/client/auth';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/client/i18n';
import ProvidersManager from '@/components/ProvidersManager';

// /providers — the AI model provider management page. Only admins can access it (the
// ProvidersManager component calls admin-only APIs). Non-admins see a permission notice.
// This mirrors the original CF OS providers panel where deployment admins add OpenAI/Anthropic
// API keys that the agent uses.
export default function ProvidersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${getToken()}` } });
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(Boolean(data.user?.isAdmin));
        }
      } catch {
        /* ignore */
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{t('providers.adminOnly')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Cpu className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">{t('providers.title')}</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">{t('providers.subtitle')}</p>
      <ProvidersManager />
    </div>
  );
}
