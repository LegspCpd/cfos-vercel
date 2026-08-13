'use client';

import { PagesPanel } from '@/components/compute/PagesPanel';

// Thin route wrapper — the real component lives in src/components/compute/PagesPanel.tsx so it
// can be reused by both this standalone page and the combined worker-and-pages tabs page.
export default function PagesPage() {
  return <PagesPanel />;
}
