import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/client/i18n';

export const metadata: Metadata = {
  title: 'Cloudflare OS',
  description: 'AI productivity workspace rebuilt on Next.js + Postgres',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className="dark">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
