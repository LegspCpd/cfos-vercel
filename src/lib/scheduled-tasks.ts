// Scheduled tasks: workspace-attached cron jobs that run the agent or fire a webhook.
//
// Execution model: the /api/cron/tasks endpoint (Vercel cron, hourly) scans for enabled
// tasks whose schedule matches the current minute, runs them, and records lastRunAt.
// A task is "due" when its cron expression matches the current time AND it hasn't run
// within the current minute (lastRunAt < the start of this minute).
//
// The cron parser is a tiny 5-field matcher (minute hour day-of-month month day-of-week)
// with `*`, `*/n`, `a-b`, and `a,b,c` support — enough for the common cases without
// pulling in a heavy dependency.

export interface TaskSchedule {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

function parseField(field: string, min: number, max: number): number[] {
  const out: number[] = [];
  const push = (n: number) => {
    if (!out.includes(n)) out.push(n);
  };
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) push(i);
    } else if (/^\*\/\d+$/.test(part)) {
      const s = Number(part.slice(2)) || 1;
      for (let i = min; i <= max; i += s) push(i);
    } else if (/^\d+-\d+\/\d+$/.test(part)) {
      const [range, step] = part.split('/');
      const [a, b] = range.split('-').map(Number);
      const s = Number(step) || 1;
      for (let i = a; i <= b; i += s) push(i);
    } else if (/^\d+-\d+$/.test(part)) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) push(i);
    } else if (/^\d+\/\d+$/.test(part)) {
      const [base, step] = part.split('/');
      const lo = Number(base);
      const s = Number(step) || 1;
      for (let i = lo; i <= max; i += s) push(i);
    } else {
      const n = Number(part);
      if (Number.isFinite(n) && n >= min && n <= max) push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

// Parse a 5-field cron expression. Returns null when invalid.
export function parseCron(expr: string): TaskSchedule | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    return {
      minute: parseField(parts[0], 0, 59),
      hour: parseField(parts[1], 0, 23),
      dayOfMonth: parseField(parts[2], 1, 31),
      month: parseField(parts[3], 1, 12),
      dayOfWeek: parseField(parts[4], 0, 6),
    };
  } catch {
    return null;
  }
}

// Does the schedule match the given date? Standard cron semantics: when both day-of-month
// and day-of-week are restricted they are OR'd; when one is `*` only the other applies.
export function cronMatches(schedule: TaskSchedule, date: Date): boolean {
  if (!schedule.minute.includes(date.getMinutes())) return false;
  if (!schedule.hour.includes(date.getHours())) return false;
  if (!schedule.month.includes(date.getMonth() + 1)) return false;
  const domAll = schedule.dayOfMonth.length === 31;
  const dowAll = schedule.dayOfWeek.length === 7;
  if (domAll && dowAll) return true;
  if (domAll) return schedule.dayOfWeek.includes(date.getDay());
  if (dowAll) return schedule.dayOfMonth.includes(date.getDate());
  return schedule.dayOfMonth.includes(date.getDate()) || schedule.dayOfWeek.includes(date.getDay());
}

// Human-readable description of a cron expression (for the UI).
export function describeCron(expr: string): string {
  return expr.trim();
}