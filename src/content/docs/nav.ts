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
  type LucideIcon,
} from 'lucide-react';

export interface DocNavItem {
  slug: string; // filename without .md
  title: string;
  icon: LucideIcon;
}

export const DOC_NAV: DocNavItem[] = [
  { slug: 'index', title: '首页', icon: Home },
  { slug: 'deploy', title: '部署教程', icon: Rocket },
  { slug: 'env', title: '环境变量', icon: Settings },
  { slug: 'github-login', title: '登录配置', icon: KeyRound },
  { slug: 'r2', title: '文件分享 R2', icon: FolderOpen },
  { slug: 'cf-access', title: 'Cloudflare Access', icon: Shield },
  { slug: 'usage', title: '使用说明', icon: Lightbulb },
  { slug: 'faq', title: '常见问题', icon: CircleHelp },
];

// Default nav order (used by generateStaticParams).
export const DOC_SLUGS = DOC_NAV.map((n) => n.slug);
