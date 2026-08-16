import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client so the pure helpers can be tested without a database.
vi.mock('@/lib/db', () => ({
  prisma: {
    outputFormat: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import {
  OUTPUT_ICONS,
  isOutputIcon,
  parseTemplateVariants,
  serializeTemplateVariants,
  toFormatRecord,
  GENERIC_OUTPUT,
  DEFAULT_ENTRY_FILE,
  seedFilesForFormat,
  listFormats,
  getFormat,
  resolveWorkspaceOutput,
  type OutputFormatRecord,
} from '@/lib/formats';
import { prisma } from '@/lib/db';

const row = {
  id: 'format.document',
  title: 'Document',
  description: 'Write documents',
  outputId: 'document',
  noun: 'Doc',
  plural: 'Docs',
  icon: 'fileText',
  agentHint: 'prefer for documents',
  enabled: true,
  isBundled: true,
  status: 'bundled',
  authorId: null,
  templateFiles: JSON.stringify([
    {
      name: 'Article',
      files: [{ path: 'index.html', content: '<h1>Hi</h1>', isEntry: true }],
    },
  ]),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('formats: icon vocabulary', () => {
  it('accepts every key in OUTPUT_ICONS', () => {
    for (const icon of OUTPUT_ICONS) {
      expect(isOutputIcon(icon)).toBe(true);
    }
  });

  it('rejects unknown icons', () => {
    expect(isOutputIcon('skull')).toBe(false);
    expect(isOutputIcon('')).toBe(false);
    expect(isOutputIcon(42)).toBe(false);
    expect(isOutputIcon(undefined)).toBe(false);
  });
});

describe('formats: template variants', () => {
  it('parses valid variants', () => {
    const variants = parseTemplateVariants(
      JSON.stringify([
        { name: 'A', files: [{ path: 'index.html', content: 'x', isEntry: true }] },
        { name: 'B', description: 'b', files: [{ path: 'a.css', content: 'y' }] },
      ]),
    );
    expect(variants).toHaveLength(2);
    expect(variants[0].name).toBe('A');
    expect(variants[0].files[0].isEntry).toBe(true);
    expect(variants[1].description).toBe('b');
  });

  it('tolerates garbage and empty input', () => {
    expect(parseTemplateVariants('')).toEqual([]);
    expect(parseTemplateVariants('not json')).toEqual([]);
    expect(parseTemplateVariants('{"a":1}')).toEqual([]);
    expect(parseTemplateVariants('[{"name":"x"}]')).toEqual([]); // no files → dropped
  });

  it('round-trips through serialize', () => {
    const variants = [{ name: 'A', files: [{ path: 'i.html', content: 'c' }] }];
    const parsed = parseTemplateVariants(serializeTemplateVariants(variants));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('A');
    expect(parsed[0].files[0]).toEqual({ path: 'i.html', content: 'c', isEntry: false });
  });
});

describe('formats: record mapping', () => {
  it('maps a DB row to a record', () => {
    const rec = toFormatRecord(row);
    expect(rec.id).toBe('format.document');
    expect(rec.output).toEqual({ id: 'document', noun: 'Doc', plural: 'Docs', icon: 'fileText' });
    expect(rec.variants).toHaveLength(1);
    expect(rec.enabled).toBe(true);
  });

  it('falls back to the generic icon for unknown icons', () => {
    const rec = toFormatRecord({ ...row, icon: 'mystery' });
    expect(rec.output.icon).toBe(GENERIC_OUTPUT.icon);
  });
});

describe('formats: seed files', () => {
  it('returns the first variant files', () => {
    const rec = toFormatRecord(row);
    const files = seedFilesForFormat(rec);
    expect(files).toEqual([{ path: 'index.html', content: '<h1>Hi</h1>', isEntry: true }]);
  });

  it('falls back to the default entry when a format has no variants', () => {
    const rec: OutputFormatRecord = {
      ...toFormatRecord(row),
      variants: [],
    };
    const files = seedFilesForFormat(rec);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('index.html');
    expect(files[0].content).toBe(DEFAULT_ENTRY_FILE);
  });
});

describe('formats: queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listFormats only returns enabled, bundled/approved formats', async () => {
    vi.mocked(prisma.outputFormat.findMany).mockResolvedValue([row as never]);
    const formats = await listFormats();
    expect(formats).toHaveLength(1);
    expect(prisma.outputFormat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enabled: true, status: { in: ['bundled', 'approved'] } },
      }),
    );
  });

  it('getFormat returns null for a missing format', async () => {
    vi.mocked(prisma.outputFormat.findUnique).mockResolvedValue(null);
    expect(await getFormat('nope')).toBeNull();
  });

  it('resolveWorkspaceOutput falls back to generic', async () => {
    vi.mocked(prisma.outputFormat.findUnique).mockResolvedValue(null);
    expect(await resolveWorkspaceOutput(null)).toEqual(GENERIC_OUTPUT);
    expect(await resolveWorkspaceOutput('missing')).toEqual(GENERIC_OUTPUT);
  });
});