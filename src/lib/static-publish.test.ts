import { describe, it, expect } from 'vitest';
import { buildStaticSite, mimeForPath } from '@/lib/static-publish';

describe('static-publish', () => {
  describe('mimeForPath', () => {
    it('maps common extensions', () => {
      expect(mimeForPath('index.html')).toBe('text/html');
      expect(mimeForPath('style.css')).toBe('text/css');
      expect(mimeForPath('app.js')).toBe('application/javascript');
      expect(mimeForPath('data.json')).toBe('application/json');
      expect(mimeForPath('logo.svg')).toBe('image/svg+xml');
      expect(mimeForPath('photo.png')).toBe('image/png');
    });

    it('falls back to octet-stream', () => {
      expect(mimeForPath('file.xyz')).toBe('application/octet-stream');
      expect(mimeForPath('noext')).toBe('application/octet-stream');
    });
  });

  describe('buildStaticSite', () => {
    it('embeds CSS and JS inline', () => {
      const html = buildStaticSite('My App', [
        { path: 'style.css', content: 'body { color: red; }' },
        { path: 'app.js', content: 'console.log("hi");' },
      ]);
      expect(html).toContain('<title>My App</title>');
      expect(html).toContain('<style>');
      expect(html).toContain('body { color: red; }');
      expect(html).toContain('<script>');
      expect(html).toContain('console.log("hi");');
    });

    it('uses index.html as the body when present', () => {
      const html = buildStaticSite('Site', [
        { path: 'index.html', content: '<h1>Hello</h1>' },
        { path: 'app.js', content: 'x();' },
      ]);
      expect(html).toContain('<h1>Hello</h1>');
      expect(html).toContain('x();');
    });

    it('strips external asset refs from index.html since assets are inlined', () => {
      const html = buildStaticSite('Site', [
        {
          path: 'index.html',
          content:
            '<link rel="stylesheet" href="style.css"><script src="app.js"></script><h1>Hi</h1>',
        },
        { path: 'style.css', content: 'body{}' },
        { path: 'app.js', content: 'x();' },
      ]);
      expect(html).not.toContain('href="style.css"');
      expect(html).not.toContain('src="app.js"');
      expect(html).toContain('<h1>Hi</h1>');
      expect(html).toContain('body{}');
      expect(html).toContain('x();');
    });

    it('escapes closing script tags to avoid breaking the bundle', () => {
      const html = buildStaticSite('Site', [
        { path: 'app.js', content: 'const s = "</script>";' },
      ]);
      // The user's literal `</script>` must be escaped so it can't close the bundle's script tag.
      expect(html).not.toContain('const s = "</script>";');
      expect(html).toContain('const s = "<\\/script>";');
    });

    it('lists non-bundled files', () => {
      const html = buildStaticSite('Site', [
        { path: 'notes.md', content: '# hi' },
      ]);
      expect(html).toContain('notes.md');
    });

    it('escapes the title', () => {
      const html = buildStaticSite('<script>alert(1)</script>', []);
      expect(html).not.toContain('<script>alert(1)</script>');
    });
  });
});