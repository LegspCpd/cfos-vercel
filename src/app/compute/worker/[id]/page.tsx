'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/client/auth';
import WorkerIde from '@/components/compute/WorkerIde';

// The fullscreen VS Code-style Worker IDE. Lives OUTSIDE the (shell) layout so the app
// sidebar is hidden — the IDE is a focused, distraction-free editing surface (like
// Cloudflare's Workers editor). Auth is checked client-side (the (shell) server gate
// doesn't apply here); the IDE's data calls are all ownership-checked server-side.
export default function WorkerIdePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <WorkerIde workerId={params.id} />;
}