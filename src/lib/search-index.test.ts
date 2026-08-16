import { describe, expect, it } from 'vitest';
import { normalizeQuery, scoreEntry, searchIndex, SEARCH_INDEX } from './search-index';

describe('normalizeQuery', () => {
  it('lowercases and strips whitespace/punctuation', () => {
    expect(normalizeQuery('  Worker 和 Pages ')).toBe('worker和pages');
    expect(normalizeQuery('GitHub / GitLab')).toBe('githubgitlab');
    expect(normalizeQuery('部署-教程')).toBe('部署教程');
  });
});

describe('scoreEntry', () => {
  const entry = SEARCH_INDEX.find((e) => e.href === '/compute/worker-and-pages')!;

  it('matches exact label (via displayLabel)', () => {
    expect(scoreEntry(entry, 'worker和pages', 'Worker 和 Pages')).toBeGreaterThan(0);
  });

  it('matches display label prefix', () => {
    expect(scoreEntry(entry, 'worker', 'Worker 和 Pages')).toBeGreaterThan(0);
  });

  it('matches keyword aliases (partial)', () => {
    // "部署" is a keyword of the worker-and-pages entry.
    expect(scoreEntry(entry, '部署')).toBeGreaterThan(0);
    // "cloud" is a prefix of "cloudflare".
    expect(scoreEntry(entry, 'cloud')).toBeGreaterThan(0);
  });

  it('returns 0 for unrelated queries', () => {
    expect(scoreEntry(entry, 'zzzz')).toBe(0);
  });
});

describe('searchIndex', () => {
  it('finds a page by partial feature name', () => {
    const hits = searchIndex('worker');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].entry.href).toBe('/compute/worker-and-pages');
  });

  it('finds docs by alias', () => {
    const hits = searchIndex('kv');
    expect(hits.some((h) => h.entry.href === '/docs/kv')).toBe(true);
  });

  it('finds pages by Chinese alias', () => {
    const hits = searchIndex('部署');
    expect(hits.some((h) => h.entry.href === '/docs/deploy' || h.entry.href === '/compute/worker-and-pages')).toBe(true);
  });

  it('finds connections by provider name', () => {
    const hits = searchIndex('github');
    expect(hits.some((h) => h.entry.href === '/connections')).toBe(true);
  });

  it('returns empty for empty query', () => {
    expect(searchIndex('')).toEqual([]);
    expect(searchIndex('   ')).toEqual([]);
  });

  it('caps results at limit', () => {
    const hits = searchIndex('a', 3);
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('sorts by score descending', () => {
    const hits = searchIndex('worker');
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });
});