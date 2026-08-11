import type { MetadataRoute } from 'next';
import { getSetting, SETTING_SITE_NAME } from '@/lib/settings';

// Web App Manifest — makes the site installable as a PWA (name, icons, standalone,
// theme color, shortcuts). Next.js serves this at /manifest.webmanifest.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const siteName = (await getSetting(SETTING_SITE_NAME).catch(() => '')) || 'Cloudflare OS';

  return {
    name: siteName,
    short_name: siteName,
    description: 'AI productivity workspace — build web apps with natural language.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'any',
    icons: [
      // All icons are generated at build time from SITE_IMG_URL and converted to PNG
      // (see scripts/fetch-favicon.mjs), so PWA/Android/Chrome use the site's own
      // image rather than a stale static logo.
      { src: '/app-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      { name: '新建工作区', url: '/', description: '打开首页创建新工作区' },
      { name: '使用分析', url: '/analytics', description: '查看个人使用统计' },
    ],
  };
}
