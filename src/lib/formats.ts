import { prisma } from './db';

// ---------------------------------------------------------------------------
// Output formats ("blueprints" in Cloudflare OS terms): named templates a workspace
// can be created from. This module owns the icon vocabulary, the bundled default
// formats, and the helpers every surface (API routes, agent, seed) shares.
//
// Mirrors the original OS's format-blueprints concept:
//   - OUTPUT_ICONS is a closed vocabulary so a free-form icon name can't break the UI.
//   - Bundled formats ship with the deployment (isBundled) and are seeded idempotently.
//   - Admins curate which formats are offered and how they're presented.
// ---------------------------------------------------------------------------

// The closed set of icons a format may declare. The frontend maps each key to a glyph.
export const OUTPUT_ICONS = [
  'fileText',
  'gridNine',
  'presentation',
  'appWindow',
  'flowArrow',
  'kanban',
  'chartBar',
  'table',
  'notebook',
  'listChecks',
] as const;

export type OutputIcon = (typeof OUTPUT_ICONS)[number];

export function isOutputIcon(value: unknown): value is OutputIcon {
  return typeof value === 'string' && (OUTPUT_ICONS as readonly string[]).includes(value);
}

// The presentation of a format: what it's called and how it's drawn.
export interface FormatOutput {
  id: string; // grouping key on the Outputs page, e.g. "document"
  noun: string; // singular, e.g. "Doc"
  plural: string; // plural, e.g. "Docs"
  icon: OutputIcon;
}

// One template variant of a format: a named set of seed files.
export interface FormatTemplateVariant {
  name: string;
  description?: string;
  files: { path: string; content: string; isEntry?: boolean }[];
}

// A format as stored in the DB, with template variants parsed.
export interface OutputFormatRecord {
  id: string;
  title: string;
  description: string;
  output: FormatOutput;
  agentHint: string;
  enabled: boolean;
  isBundled: boolean;
  status: string;
  authorId: string | null;
  variants: FormatTemplateVariant[];
  createdAt: Date;
  updatedAt: Date;
}

// The fallback presentation for a workspace with no declared format.
export const GENERIC_OUTPUT: FormatOutput = {
  id: 'app',
  noun: 'App',
  plural: 'Apps',
  icon: 'appWindow',
};

// Parse the templateFiles JSON column, tolerating legacy/empty values.
export function parseTemplateVariants(raw: string): FormatTemplateVariant[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is FormatTemplateVariant => v && typeof v === 'object' && Array.isArray(v.files))
      .map((v) => ({
        name: String(v.name ?? 'Default'),
        description: v.description ? String(v.description) : undefined,
        files: v.files
          .filter((f: unknown): f is { path: string; content: string } =>
            !!f && typeof f === 'object' && typeof (f as { path?: unknown }).path === 'string',
          )
          .map((f) => ({
            path: String(f.path),
            content: String(f.content ?? ''),
            isEntry: Boolean((f as { isEntry?: unknown }).isEntry),
          })),
      }));
  } catch {
    return [];
  }
}

// Serialize template variants to the JSON column.
export function serializeTemplateVariants(variants: FormatTemplateVariant[]): string {
  return JSON.stringify(variants);
}

// Map a DB row to the record shape the rest of the app uses.
export function toFormatRecord(row: {
  id: string;
  title: string;
  description: string;
  outputId: string;
  noun: string;
  plural: string;
  icon: string;
  agentHint: string;
  enabled: boolean;
  isBundled: boolean;
  status: string;
  authorId: string | null;
  templateFiles: string;
  createdAt: Date;
  updatedAt: Date;
}): OutputFormatRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    output: {
      id: row.outputId,
      noun: row.noun,
      plural: row.plural,
      icon: isOutputIcon(row.icon) ? row.icon : GENERIC_OUTPUT.icon,
    },
    agentHint: row.agentHint,
    enabled: row.enabled,
    isBundled: row.isBundled,
    status: row.status,
    authorId: row.authorId,
    variants: parseTemplateVariants(row.templateFiles),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// The default seed files for a workspace created from scratch (no format).
export const DEFAULT_ENTRY_FILE =
  '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>My App</title>\n</head>\n<body>\n  <h1>Hello from Cloudflare OS (Vercel edition)</h1>\n  <p>Edit this workspace and ask the agent to build something.</p>\n</body>\n</html>\n';

// The bundled formats that ship with the deployment. Each carries one or more template
// variants so a fresh deployment can write a doc or build a deck out of the box.
export const BUNDLED_FORMATS: {
  id: string;
  title: string;
  description: string;
  output: FormatOutput;
  agentHint: string;
  variants: FormatTemplateVariant[];
}[] = [
  {
    id: 'format.document',
    title: 'Document',
    description: 'Write, format, and edit rich text documents interactively or with natural language.',
    output: { id: 'document', noun: 'Doc', plural: 'Docs', icon: 'fileText' },
    agentHint: 'prefer for documents, reports, memos, and articles',
    variants: [
      {
        name: 'Article',
        description: 'A clean article layout with typography and a hero.',
        files: [
          {
            path: 'index.html',
            isEntry: true,
            content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My Document</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="doc">
    <header class="hero">
      <p class="kicker">Cloudflare OS</p>
      <h1>My Document</h1>
      <p class="sub">A clean starting point for writing.</p>
    </header>
    <article>
      <h2>Getting started</h2>
      <p>Replace this text with your own. Ask the agent to help you write, format, and edit.</p>
      <blockquote>“The best way to predict the future is to invent it.”</blockquote>
      <h2>Structure</h2>
      <ul>
        <li>Headings organize your thoughts.</li>
        <li>Lists make steps scannable.</li>
        <li>Quotes add emphasis.</li>
      </ul>
    </article>
  </main>
</body>
</html>
`,
          },
          {
            path: 'style.css',
            content: `:root {
  --ink: #1a1a2e;
  --accent: #f6821f;
  --paper: #fdfcf9;
  --muted: #6b7280;
}
* { box-sizing: border-box; margin: 0; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  background: var(--paper);
  color: var(--ink);
  line-height: 1.7;
}
.doc { max-width: 720px; margin: 0 auto; padding: 48px 24px 96px; }
.hero { text-align: center; margin-bottom: 48px; }
.kicker {
  text-transform: uppercase; letter-spacing: 0.12em;
  font-size: 12px; color: var(--accent); font-family: system-ui, sans-serif;
}
h1 { font-size: 44px; line-height: 1.15; margin: 8px 0 12px; }
.sub { color: var(--muted); font-size: 18px; }
h2 { font-size: 26px; margin: 40px 0 12px; }
p { margin: 12px 0; }
blockquote {
  border-left: 3px solid var(--accent);
  padding-left: 16px; color: var(--muted);
  font-style: italic; margin: 24px 0;
}
ul { padding-left: 20px; }
li { margin: 6px 0; }
`,
          },
        ],
      },
      {
        name: 'Report',
        description: 'A structured report with sections and a summary box.',
        files: [
          {
            path: 'index.html',
            isEntry: true,
            content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Report</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="report">
    <header>
      <h1>Quarterly Report</h1>
      <p class="meta">Prepared by Cloudflare OS · 2026</p>
    </header>
    <section class="summary">
      <h2>Executive Summary</h2>
      <p>Key findings and recommendations go here.</p>
    </section>
    <section>
      <h2>1. Overview</h2>
      <p>Describe the scope and context of this report.</p>
    </section>
    <section>
      <h2>2. Findings</h2>
      <p>Present the data and analysis.</p>
    </section>
    <section>
      <h2>3. Recommendations</h2>
      <ol>
        <li>First action item.</li>
        <li>Second action item.</li>
      </ol>
    </section>
  </main>
</body>
</html>
`,
          },
          {
            path: 'style.css',
            content: `* { box-sizing: border-box; margin: 0; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f4f5f7; color: #172b4d; line-height: 1.6;
}
.report { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
header { border-bottom: 3px solid #0052cc; padding-bottom: 16px; margin-bottom: 32px; }
h1 { font-size: 32px; }
.meta { color: #6b778c; font-size: 14px; margin-top: 4px; }
section { margin-bottom: 32px; }
h2 { font-size: 20px; margin-bottom: 8px; color: #0052cc; }
.summary {
  background: #eef4ff; border: 1px solid #c1d4f5;
  border-radius: 8px; padding: 16px 20px;
}
ol { padding-left: 20px; }
`,
          },
        ],
      },
    ],
  },
  {
    id: 'format.presentation',
    title: 'Presentation',
    description: 'Build slide decks with a clean layout, editable in the browser.',
    output: { id: 'presentation', noun: 'Deck', plural: 'Decks', icon: 'presentation' },
    agentHint: 'prefer for slide decks, pitches, and presentations',
    variants: [
      {
        name: 'Pitch Deck',
        description: 'A 5-slide pitch deck with title, problem, solution, and closing.',
        files: [
          {
            path: 'index.html',
            isEntry: true,
            content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pitch Deck</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="deck">
    <section class="slide title">
      <p class="kicker">Cloudflare OS</p>
      <h1>Your Big Idea</h1>
      <p class="sub">A one-line description of what you're building.</p>
    </section>
    <section class="slide">
      <h2>The Problem</h2>
      <p>Describe the pain point your audience feels.</p>
    </section>
    <section class="slide">
      <h2>The Solution</h2>
      <p>Explain how your product solves it.</p>
    </section>
    <section class="slide">
      <h2>Why Now</h2>
      <p>Market timing, momentum, and traction.</p>
    </section>
    <section class="slide closing">
      <h2>Let's Talk</h2>
      <p>Contact details and next steps.</p>
    </section>
  </main>
  <nav class="controls">
    <button id="prev" aria-label="Previous slide">←</button>
    <span id="count">1 / 5</span>
    <button id="next" aria-label="Next slide">→</button>
  </nav>
  <script src="app.js"></script>
</body>
</html>
`,
          },
          {
            path: 'style.css',
            content: `* { box-sizing: border-box; margin: 0; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f172a; color: #e2e8f0;
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; overflow: hidden;
}
.deck { width: 100%; max-width: 900px; }
.slide {
  display: none; padding: 48px; min-height: 480px;
  flex-direction: column; justify-content: center;
}
.slide.active { display: flex; animation: fade 0.3s ease; }
@keyframes fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; } }
.kicker {
  text-transform: uppercase; letter-spacing: 0.14em;
  font-size: 13px; color: #f6821f; margin-bottom: 16px;
}
h1 { font-size: 56px; line-height: 1.1; }
h2 { font-size: 40px; margin-bottom: 16px; color: #f6821f; }
p { font-size: 20px; color: #94a3b8; max-width: 640px; }
.sub { margin-top: 16px; }
.closing h2 { color: #e2e8f0; }
.controls {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 12px;
  background: #1e293b; border-radius: 999px; padding: 8px 16px;
}
.controls button {
  background: none; border: none; color: #e2e8f0;
  font-size: 18px; cursor: pointer; padding: 4px 8px;
}
.controls span { font-size: 13px; color: #94a3b8; }
`,
          },
          {
            path: 'app.js',
            content: `const slides = Array.from(document.querySelectorAll('.slide'));
let current = 0;
function show(i) {
  current = (i + slides.length) % slides.length;
  slides.forEach((s, idx) => s.classList.toggle('active', idx === current));
  document.getElementById('count').textContent = (current + 1) + ' / ' + slides.length;
}
document.getElementById('next').addEventListener('click', () => show(current + 1));
document.getElementById('prev').addEventListener('click', () => show(current - 1));
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') show(current + 1);
  if (e.key === 'ArrowLeft') show(current - 1);
});
show(0);
`,
          },
        ],
      },
    ],
  },
  {
    id: 'format.spreadsheet',
    title: 'Spreadsheet',
    description: 'Organize data in a table with editable cells and simple calculations.',
    output: { id: 'spreadsheet', noun: 'Sheet', plural: 'Sheets', icon: 'table' },
    agentHint: 'prefer for tables, budgets, trackers, and data organization',
    variants: [
      {
        name: 'Budget Tracker',
        description: 'A monthly budget table with a running total.',
        files: [
          {
            path: 'index.html',
            isEntry: true,
            content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Budget Tracker</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="sheet">
    <header>
      <h1>Monthly Budget</h1>
      <p class="sub">Click a cell to edit. Totals update automatically.</p>
    </header>
    <table id="budget">
      <thead>
        <tr>
          <th>Category</th>
          <th>Planned</th>
          <th>Actual</th>
          <th>Difference</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Rent</td><td>1200</td><td>1200</td><td></td></tr>
        <tr><td>Groceries</td><td>400</td><td>350</td><td></td></tr>
        <tr><td>Transport</td><td>150</td><td>180</td><td></td></tr>
        <tr><td>Entertainment</td><td>100</td><td>60</td><td></td></tr>
      </tbody>
      <tfoot>
        <tr><td>Total</td><td id="plannedTotal"></td><td id="actualTotal"></td><td id="diffTotal"></td></tr>
      </tfoot>
    </table>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
          },
          {
            path: 'style.css',
            content: `* { box-sizing: border-box; margin: 0; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f8fafc; color: #0f172a; padding: 48px 24px;
}
.sheet { max-width: 720px; margin: 0 auto; }
h1 { font-size: 28px; }
.sub { color: #64748b; margin: 4px 0 24px; font-size: 14px; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; }
th { background: #f1f5f9; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
td[contenteditable="true"] { cursor: text; }
td[contenteditable="true"]:focus { outline: 2px solid #f6821f; background: #fff7ed; }
tfoot td { font-weight: 600; background: #f8fafc; }
`,
          },
          {
            path: 'app.js',
            content: `const tbody = document.querySelector('#budget tbody');
const rows = Array.from(tbody.querySelectorAll('tr'));
const plannedTotal = document.getElementById('plannedTotal');
const actualTotal = document.getElementById('actualTotal');
const diffTotal = document.getElementById('diffTotal');
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

function recalc() {
  let planned = 0, actual = 0;
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    const p = parseFloat(cells[1].textContent) || 0;
    const a = parseFloat(cells[2].textContent) || 0;
    planned += p; actual += a;
    cells[3].textContent = money(a - p);
  });
  plannedTotal.textContent = money(planned);
  actualTotal.textContent = money(actual);
  diffTotal.textContent = money(actual - planned);
}

rows.forEach((row) => {
  const cells = row.querySelectorAll('td');
  cells[1].setAttribute('contenteditable', 'true');
  cells[2].setAttribute('contenteditable', 'true');
  cells[1].addEventListener('input', recalc);
  cells[2].addEventListener('input', recalc);
});
recalc();
`,
          },
        ],
      },
    ],
  },
];

// The default seed files for a workspace created from a format: the first variant's files.
export function seedFilesForFormat(format: OutputFormatRecord): { path: string; content: string; isEntry: boolean }[] {
  const variant = format.variants[0];
  if (!variant || variant.files.length === 0) {
    return [{ path: 'index.html', content: DEFAULT_ENTRY_FILE, isEntry: true }];
  }
  return variant.files.map((f) => ({ path: f.path, content: f.content, isEntry: f.isEntry ?? false }));
}

// List the enabled formats offered to users and the agent, in menu order.
export async function listFormats(): Promise<OutputFormatRecord[]> {
  const rows = await prisma.outputFormat.findMany({
    where: { enabled: true, status: { in: ['bundled', 'approved'] } },
    orderBy: [{ isBundled: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map(toFormatRecord);
}

// Get one format by id (regardless of enabled state), or null.
export async function getFormat(id: string): Promise<OutputFormatRecord | null> {
  const row = await prisma.outputFormat.findUnique({ where: { id } });
  return row ? toFormatRecord(row) : null;
}

// Resolve the presentation for a workspace's formatId, falling back to the generic app.
export async function resolveWorkspaceOutput(formatId: string | null | undefined): Promise<FormatOutput> {
  if (!formatId) return GENERIC_OUTPUT;
  const format = await getFormat(formatId);
  return format ? format.output : GENERIC_OUTPUT;
}