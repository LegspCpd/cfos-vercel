import type { Metadata, Viewport } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/client/i18n';
import PwaRegister from '@/components/PwaRegister';
import SiteBackground from '@/components/SiteBackground';
import { getSetting, SETTING_SITE_FAVICON, SETTING_SITE_NAME } from '@/lib/settings';
import { siteBaseUrl } from '@/lib/site';

// Default icon = the project logo (public/app-icon.png, copied from the repo-root logo).
const DEFAULT_ICON = '/app-icon.png';

// Dynamic metadata: read the admin-configured favicon + site name from the DB.
// SITE_IMG_URL env var provides a site-wide default image (favicon) when no DB value is set.
export async function generateMetadata(): Promise<Metadata> {
  const [favicon, siteName] = await Promise.all([
    getSetting(SETTING_SITE_FAVICON).catch(() => ''),
    getSetting(SETTING_SITE_NAME).catch(() => ''),
  ]);
  // Favicon priority: admin-set favicon (DB) -> build-generated site-icon.png (from
  // SITE_IMG_URL, converted to PNG at build time by scripts/fetch-favicon.mjs) -> default.
  const icon =
    favicon ||
    (process.env.SITE_IMG_URL ? '/site-icon.png' : '') ||
    DEFAULT_ICON;
  return {
    // metadataBase makes relative URLs in metadata (and sitemap/robots) absolute.
    metadataBase: new URL(siteBaseUrl()),
    title: {
      default: siteName || 'Cloudflare OS',
      template: `%s · ${siteName || 'Cloudflare OS'}`,
    },
    description: 'AI productivity workspace rebuilt on Next.js + Postgres',
    manifest: '/manifest.webmanifest',
    icons: {
      icon,
      shortcut: icon,
      apple: process.env.SITE_IMG_URL ? '/apple-touch-icon.png' : '/icon-192.png',
    },
    appleWebApp: {
      capable: true,
      title: siteName || 'Cloudflare OS',
      statusBarStyle: 'black-translucent',
    },
    formatDetection: { telephone: false },
    // Bing-supported robots directives: allow indexing + large image previews.
    robots: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        {/* appleWebApp.capable emits the (deprecated) apple-mobile-web-app-capable meta; the
            standard mobile-web-app-capable silences the browser warning and keeps PWA install
            behavior consistent across Chrome/Android too. */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Apply the persisted theme before paint so every page (including /docs, which is
            outside the app shell) matches the theme the user chose on the home page — no
            flash of the wrong theme when navigating between the app and the docs. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=localStorage.getItem('cfos_theme');var dark=(v==='dark'||((!v||v==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
        <PwaRegister />
        <SiteBackground />
      </body>
    </html>
  );
}
