'use client';

import { WorkerPagesList } from '@/components/compute/WorkerPagesList';

// The "Worker 和 Pages" product page: Workers and Pages are ONE entry with a single merged
// list (no tabs) — every project shows in one place, with a search box that filters by
// project name. Clicking a row opens the matching detail page.
export default function WorkerAndPagesPage() {
  return <WorkerPagesList />;
}
