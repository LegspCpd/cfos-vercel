'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/client/auth';
import WorkerDetailPanel from '@/components/compute/WorkerDetailPanel';

// The Worker detail page (inside the (shell) layout — sidebar visible). Shows the worker's
// overview (URL / status / custom domains) plus tabs for versions / bindings (beta) /
// observability / deploy logs. The top-right "编辑代码" button enters the fullscreen IDE.
export default function WorkerDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setAuthed(true);
  }, [router]);

  if (!authed) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <WorkerDetailPanel workerId={params.id} />;
}