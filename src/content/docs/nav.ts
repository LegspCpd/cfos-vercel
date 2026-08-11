// Documentation navigation config: order + display titles.
import {
  Home,
  Rocket,
  Settings,
  KeyRound,
  FolderOpen,
  Shield,
  Lightbulb,
  CircleHelp,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export interface DocNavItem {
  slug: string; // filename without .md
  title: string;
  icon: LucideIcon;
}

// Simplified Chinese nav.
export const DOC_NAV: DocNavItem[] = [
  { slug: 'index', title: '首页', icon: Home },
  { slug: 'deploy', title: '部署教程', icon: Rocket },
  { slug: 'env', title: '环境变量', icon: Settings },
  { slug: 'github-login', title: '登录配置', icon: KeyRound },
  { slug: 'r2', title: '文件分享 R2', icon: FolderOpen },
  { slug: 'cf-access', title: 'Cloudflare Access', icon: Shield },
  { slug: 'backup', title: '数据库备份', icon: ShieldCheck },
  { slug: 'cloudflare-deploy', title: '工作区部署', icon: Rocket },
  { slug: 'usage', title: '使用说明', icon: Lightbulb },
  { slug: 'faq', title: '常见问题', icon: CircleHelp },
];

// English nav (rendered under /en/docs). English docs live in docs/en/.
export const DOC_NAV_EN: DocNavItem[] = [
  { slug: 'index', title: 'Home', icon: Home },
  { slug: 'deploy', title: 'Deploy', icon: Rocket },
  { slug: 'env', title: 'Environment Variables', icon: Settings },
  { slug: 'github-login', title: 'Sign-in Setup', icon: KeyRound },
  { slug: 'r2', title: 'File Sharing (R2)', icon: FolderOpen },
  { slug: 'cf-access', title: 'Cloudflare Access', icon: Shield },
  { slug: 'backup', title: 'Database Backup', icon: ShieldCheck },
  { slug: 'cloudflare-deploy', title: 'Workspace Deploy', icon: Rocket },
  { slug: 'usage', title: 'Usage', icon: Lightbulb },
  { slug: 'faq', title: 'FAQ', icon: CircleHelp },
];

// Default nav order (used by generateStaticParams).
export const DOC_SLUGS = DOC_NAV.map((n) => n.slug);
export const DOC_SLUGS_EN = DOC_NAV_EN.map((n) => n.slug);
