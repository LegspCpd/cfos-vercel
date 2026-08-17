import { describe, it, expect } from 'vitest';
import { validateFetchUrl } from '@/lib/ssrf';

describe('validateFetchUrl', () => {
  it('accepts public https URLs', () => {
    expect(validateFetchUrl('https://example.com/hook')).toBeNull();
    expect(validateFetchUrl('https://api.github.com/repos/x/y')).toBeNull();
  });

  it('rejects non-http(s) protocols', () => {
    expect(validateFetchUrl('file:///etc/passwd')).toMatch(/Only http/);
    expect(validateFetchUrl('javascript:alert(1)')).toMatch(/Only http/);
    expect(validateFetchUrl('ftp://example.com')).toMatch(/Only http/);
  });

  it('rejects localhost and .localhost', () => {
    expect(validateFetchUrl('http://localhost:3000/x')).toMatch(/Localhost/);
    expect(validateFetchUrl('http://foo.localhost/x')).toMatch(/Localhost/);
  });

  it('rejects internal hostnames', () => {
    expect(validateFetchUrl('http://db.internal/x')).toMatch(/Internal/);
    expect(validateFetchUrl('http://router.local/x')).toMatch(/Internal/);
  });

  it('rejects private IPv4 ranges', () => {
    expect(validateFetchUrl('http://10.0.0.1/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://127.0.0.1/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://169.254.169.254/latest/meta-data')).toMatch(/Private/);
    expect(validateFetchUrl('http://172.16.0.1/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://192.168.1.1/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://100.64.0.1/x')).toMatch(/Private/);
  });

  it('rejects private IPv6 ranges', () => {
    expect(validateFetchUrl('http://[::1]/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://[fc00::1]/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://[fe80::1]/x')).toMatch(/Private/);
  });

  it('rejects IPv4-mapped IPv6 addresses that embed private IPv4s', () => {
    // ::ffff:a.b.c.d — the classic metadata-service bypass
    expect(validateFetchUrl('http://[::ffff:169.254.169.254]/latest/meta-data')).toMatch(/Private/);
    expect(validateFetchUrl('http://[::ffff:10.0.0.1]/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://[::ffff:127.0.0.1]/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://[::ffff:192.168.1.1]/x')).toMatch(/Private/);
    // hex-encoded IPv4 (::ffff:7f00:1 == 127.0.0.1)
    expect(validateFetchUrl('http://[::ffff:7f00:1]/x')).toMatch(/Private/);
    // fully expanded form
    expect(validateFetchUrl('http://[0:0:0:0:0:ffff:169.254.169.254]/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://[0:0:0:0:0:ffff:7f00:1]/x')).toMatch(/Private/);
    // IPv4-compatible (::a.b.c.d)
    expect(validateFetchUrl('http://[::10.0.0.1]/x')).toMatch(/Private/);
    expect(validateFetchUrl('http://[::7f00:1]/x')).toMatch(/Private/);
  });

  it('accepts IPv4-mapped IPv6 addresses that embed public IPv4s', () => {
    expect(validateFetchUrl('http://[::ffff:8.8.8.8]/x')).toBeNull();
    expect(validateFetchUrl('http://[::ffff:1.1.1.1]/x')).toBeNull();
  });

  it('accepts public IP literals', () => {
    expect(validateFetchUrl('http://8.8.8.8/x')).toBeNull();
    expect(validateFetchUrl('http://1.1.1.1/x')).toBeNull();
  });

  it('rejects malformed URLs', () => {
    expect(validateFetchUrl('not a url')).toMatch(/Invalid URL/);
  });
});