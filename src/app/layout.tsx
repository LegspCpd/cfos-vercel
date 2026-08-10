import type { Metadata, Viewport } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/client/i18n';
import PwaRegister from '@/components/PwaRegister';
import SiteBackground from '@/components/SiteBackground';
import { getSetting, SETTING_SITE_FAVICON, SETTING_SITE_NAME } from '@/lib/settings';

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
    <html lang="zh" className="dark">
      <body>
        <I18nProvider>{children}</I18nProvider>
        <PwaRegister />
        <SiteBackground />
      </body>
    </html>
  );
}
