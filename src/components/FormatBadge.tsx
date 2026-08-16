'use client';

import {
  FileText,
  LayoutGrid,
  Presentation,
  AppWindow,
  GitFork,
  Kanban,
  BarChart3,
  Table,
  Notebook,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

// The glyph for each key in the OUTPUT_ICONS vocabulary. Mirrors the original OS's
// FORMAT_ICONS mapping — only the key crosses the wire; the glyphs live here.
export const FORMAT_ICONS: Record<string, LucideIcon> = {
  fileText: FileText,
  gridNine: LayoutGrid,
  presentation: Presentation,
  appWindow: AppWindow,
  flowArrow: GitFork,
  kanban: Kanban,
  chartBar: BarChart3,
  table: Table,
  notebook: Notebook,
  listChecks: ListChecks,
};

// The fallback glyph for an unknown icon (a deployment can serve a format newer than
// this bundle knows).
export const GENERIC_ICON: LucideIcon = AppWindow;

// Resolve the icon component for an output icon key, falling back to the generic app.
export function formatIcon(icon: string | undefined): LucideIcon {
  if (icon && FORMAT_ICONS[icon]) return FORMAT_ICONS[icon];
  return GENERIC_ICON;
}

// A small badge showing a format's icon + noun, used on workspace cards and the editor.
export function FormatBadge({
  icon,
  noun,
  className = '',
}: {
  icon?: string;
  noun?: string;
  className?: string;
}) {
  const Icon = formatIcon(icon);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ${className}`}
    >
      <Icon className="h-3 w-3" />
      {noun || 'App'}
    </span>
  );
}