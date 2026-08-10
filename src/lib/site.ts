// Central helpers for resolving the public site base URL.
//
// PUBLIC_SITE_URL is used to build OAuth redirect URIs and frontend redirect targets.
// A trailing slash on PUBLIC_SITE_URL would otherwise produce a double-slash path
// (e.g. https://os.legspcpd.top//api/auth/google/callback), which Google/GitHub
// treat as a DIFFERENT redirect URI from the registered one — causing
// `redirect_uri_mismatch`. This normalizes it so redirect URIs are always clean.

/** The public base URL with any trailing slash removed, e.g. "https://os.legspcpd.top". */
export function siteBaseUrl(): string {
  const base =
    process.env.PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

/** Append a path to the base URL, guaranteeing exactly one slash between them. */
export function siteUrl(path: string): string {
  return `${siteBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}
