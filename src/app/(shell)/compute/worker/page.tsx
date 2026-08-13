'use client';

import { WorkersPanel } from '@/components/compute/WorkersPanel';

// Thin route wrapper — the real component lives in src/components/compute/WorkersPanel.tsx so it
// can be reused by both this standalone page and the combined worker-and-pages tabs page.
export default function WorkerPage() {
  return <WorkersPanel />;
}
