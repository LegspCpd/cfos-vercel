import { describe, expect, it } from 'vitest';
import { normalizeDocQuery, scoreDocEntry, searchDocIndex, DOC_INDEX_ZH, DOC_INDEX_EN } from './doc-search';

describe('normalizeDocQuery', () => {
  it('lowercases and strips whitespace/punctuation', () => {
    expect(normalizeDocQuery('  KV 缓存 ')).toBe('kv缓存');
    expect(normalizeDocQuery('GitHub / GitLab')).toBe('githubgitlab');
  });
});

describe('language isolation', () => {
  it('zh index only contains zh docs (hrefs under /docs/)', () => {
    expect(DOC_INDEX_ZH.length).toBeGreaterThan(0);
    for (const e of DOC_INDEX_ZH) {
      expect(e.href.startsWith('/docs/')).toBe(true);
      expect(e.href.startsWith('/en/')).toBe(false);
    }
  });

  it('en index only contains en docs (hrefs under /en/docs/)', () => {
    expect(DOC_INDEX_EN.length).toBeGreaterThan(0);
    for (const e of DOC_INDEX_EN) {
      expect(e.href.startsWith('/en/docs/')).toBe(true);
    }
  });

  it('searching zh index never returns en hrefs', () => {
    const hits = searchDocIndex(DOC_INDEX_ZH, 'deploy');
    for (const { entry } of hits) {
      expect(entry.href.startsWith('/en/')).toBe(false);
    }
  });

  it('searching en index never returns zh hrefs', () => {
    const hits = searchDocIndex(DOC_INDEX_EN, '部署');
    for (const { entry } of hits) {
      expect(entry.href.startsWith('/en/')).toBe(true);
    }
  });
});

describe('scoreDocEntry', () => {
  const entry = DOC_INDEX_ZH.find((e) => e.slug === 'kv')!;

  it('matches title exactly', () => {
    expect(scoreDocEntry(entry, 'kv缓存加速')).toBeGreaterThan(0);
  });

  it('matches title prefix', () => {
    expect(scoreDocEntry(entry, 'kv')).toBeGreaterThan(0);
  });

  it('matches keyword (heading) content', () => {
    expect(scoreDocEntry(entry, '缓存')).toBeGreaterThan(0);
  });

  it('returns 0 for unrelated', () => {
    expect(scoreDocEntry(entry, 'zzzzzz')).toBe(0);
  });
});

describe('searchDocIndex', () => {
  it('finds docs by partial title', () => {
    const hits = searchDocIndex(DOC_INDEX_ZH, '部署');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.entry.slug === 'deploy' || h.entry.slug === 'cloudflare-deploy')).toBe(true);
  });

  it('finds en docs by English keyword', () => {
    const hits = searchDocIndex(DOC_INDEX_EN, 'realtime');
    expect(hits.some((h) => h.entry.slug === 'realtime')).toBe(true);
  });

  it('sorts by score descending', () => {
    const hits = searchDocIndex(DOC_INDEX_ZH, '部署');
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('returns empty for empty query', () => {
    expect(searchDocIndex(DOC_INDEX_ZH, '')).toEqual([]);
    expect(searchDocIndex(DOC_INDEX_ZH, '   ')).toEqual([]);
  });

  it('caps results at limit', () => {
    const hits = searchDocIndex(DOC_INDEX_ZH, 'a', 3);
    expect(hits.length).toBeLessThanOrEqual(3);
  });
});