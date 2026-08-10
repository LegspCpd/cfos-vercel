import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/client/i18n';
import { getSetting, SETTING_SITE_FAVICON, SETTING_SITE_NAME } from '@/lib/settings';

const DEFAULT_ICON = 'https://hub.legspcpd.top/file/1786217341335_logo.jpg';

// Dynamic metadata: read the admin-configured favicon + site name from the DB.
export async function generateMetadata(): Promise<Metadata> {
  const [favicon, siteName] = await Promise.all([
    getSetting(SETTING_SITE_FAVICON).catch(() => ''),
    getSetting(SETTING_SITE_NAME).catch(() => ''),
  ]);
  const icon = favicon || DEFAULT_ICON;
  return {
    title: {
      default: siteName || 'Cloudflare OS',
      template: `%s · ${siteName || 'Cloudflare OS'}`,
    },
    description: 'AI productivity workspace rebuilt on Next.js + Postgres',
    icons: {
      icon,
      shortcut: icon,
      apple: icon,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className="dark">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
