// Documentation navigation config: order + display titles.
export interface DocNavItem {
  slug: string; // filename without .md
  title: string;
  icon?: string;
}

export const DOC_NAV: DocNavItem[] = [
  { slug: 'index', title: '首页', icon: '🏠' },
  { slug: 'deploy', title: '部署教程', icon: '🚀' },
  { slug: 'env', title: '环境变量', icon: '⚙️' },
  { slug: 'github-login', title: 'GitHub 登录', icon: '🔑' },
  { slug: 'r2', title: '文件分享 R2', icon: '📁' },
  { slug: 'cf-access', title: 'Cloudflare Access', icon: '🛡️' },
  { slug: 'usage', title: '使用说明', icon: '💡' },
  { slug: 'faq', title: '常见问题', icon: '❓' },
];

// Default nav order (used by generateStaticParams).
export const DOC_SLUGS = DOC_NAV.map((n) => n.slug);
