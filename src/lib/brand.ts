// Central brand logo URL. Configurable via the SITE_IMG_URL env var (site-wide image).
// NOTE: client components can only read env vars prefixed with NEXT_PUBLIC_, so for the
// logo to be overridable on the client, configure NEXT_PUBLIC_SITE_IMG_URL (recommended),
// or fall back to the site logo set in the admin panel (Site Settings -> Branding & icons).
// Default falls back to the local app icon (built from SITE_IMG_URL at build time, or the
// static logo when unset) so it never depends on an external host.
export const LOGO_URL =
  process.env.NEXT_PUBLIC_SITE_IMG_URL || process.env.SITE_IMG_URL || '/app-icon.png';
