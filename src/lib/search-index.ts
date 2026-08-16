// Full-site search index for the command palette (⌘K) search.
//
// The palette should find a feature by typing *part* of its name or a common alias —
// e.g. "worker" matches "Worker 和 Pages", "部署" matches "Pages 部署", "git" matches
// "外部连接" (GitHub/GitLab). Each entry carries:
//   - href: where the feature lives
//   - label: the display name (localized at render time via i18n key when available)
//   - keywords: searchable terms (zh + en + aliases + related concepts)
//   - group: which section the result belongs to (页面 / 文档 / 操作)
//
// This is a static index (no DB round-trip) so the palette stays instant. User-owned
// data (workspaces, docs) is matched separately by the /api/search endpoint.

export interface SearchEntry {
  href: string;
  labelKey?: string; // i18n key for the display label (falls back to `label`)
  label?: string; // literal label when no i18n key
  keywords: string[];
  group: 'page' | 'doc' | 'action';
  icon?: string; // lucide icon name hint (unused by the palette, kept for future UIs)
}

// Normalize a query for matching: lowercase, strip whitespace/punctuation.
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[·•,，。.、/\\\-_'"`~!@#$%^&*()+=<>?{}[\]|:;]/g, '');
}

// Score an entry against a normalized query. Returns a match score (>0 = match) or 0.
// Exact label match > prefix match > substring match > keyword match. Higher = better.
// `displayLabel` is the localized display text (e.g. "Worker 和 Pages"); when omitted,
// falls back to the entry's literal `label` (labelKey is a key, not display text).
export function scoreEntry(entry: SearchEntry, q: string, displayLabel?: string): number {
  if (!q) return 0;
  const labelText = normalizeQuery(displayLabel ?? entry.label ?? '');
  const nq = normalizeQuery(q);
  // Exact / prefix / substring on the display label.
  if (labelText === nq) return 100;
  if (labelText.startsWith(nq)) return 80;
  if (labelText.includes(nq)) return 60;
  // Keyword hits (aliases, related concepts).
  let best = 0;
  for (const kw of entry.keywords) {
    const k = normalizeQuery(kw);
    if (k === nq) return 90;
    if (k.startsWith(nq)) best = Math.max(best, 70);
    else if (k.includes(nq)) best = Math.max(best, 50);
  }
  return best;
}

// The full-site feature index. Keep keywords broad: zh + en + aliases + related terms.
export const SEARCH_INDEX: SearchEntry[] = [
  // ---- Top-level pages ----
  { href: '/', labelKey: 'nav.home', keywords: ['首页', 'home', '工作区', 'workspace', 'gadget', '应用', 'app', '新建'], group: 'page' },
  { href: '/workspaces', labelKey: 'nav.workspaces', keywords: ['工作区', 'workspaces', 'workspace', '列表', 'list', 'gadget', '应用'], group: 'page' },
  { href: '/shares', labelKey: 'nav.shares', keywords: ['文件分享', '分享', 'shares', 'share', 'file', 'r2', '上传', 'upload', '下载', 'download'], group: 'page' },
  { href: '/connections', labelKey: 'nav.connections', keywords: ['外部连接', '连接', 'connections', 'github', 'gitlab', 'google', 'oauth', '集成', 'integration', 'gatekeeper'], group: 'page' },
  { href: '/providers', labelKey: 'nav.providers', keywords: ['ai', '模型', 'providers', 'llm', 'openai', 'deepseek', 'anthropic', 'claude', 'api key', '密钥'], group: 'page' },
  { href: '/remote', labelKey: 'nav.remote', keywords: ['远程', 'remote', 'ssh', '服务器', 'server', '主机', 'host', '终端', 'terminal'], group: 'page' },
  { href: '/context', labelKey: 'nav.context', keywords: ['文档库', '上下文', 'context', '文档', 'docs', '知识库', 'knowledge', '参考资料'], group: 'page' },
  { href: '/docs', labelKey: 'nav.docs', keywords: ['部署文档', '文档', 'docs', '部署', 'deploy', '教程', 'guide', '帮助', 'help'], group: 'page' },
  { href: '/outputs', labelKey: 'nav.outputs', keywords: ['输出', 'outputs', '产出', '格式', 'format', '报告', 'report', '文档', 'document'], group: 'page' },
  { href: '/blueprints', labelKey: 'nav.blueprints', keywords: ['蓝图', 'blueprints', '模板', 'template', '导入', 'import', '导出', 'export', '市场', 'market'], group: 'page' },
  { href: '/explore', labelKey: 'nav.explore', keywords: ['探索', 'explore', '发现', 'discover', '模板', 'template', '蓝图', 'blueprint'], group: 'page' },
  { href: '/analytics', labelKey: 'nav.analytics', keywords: ['分析', 'analytics', '统计', 'stats', '数据', 'data', '图表', 'chart'], group: 'page' },
  { href: '/activity', labelKey: 'nav.activity', keywords: ['活动', 'activity', '日志', 'log', '审计', 'audit', '历史', 'history'], group: 'page' },
  { href: '/admin', labelKey: 'nav.admin', keywords: ['管理', 'admin', '后台', '设置', 'settings', '站点', 'site'], group: 'page' },
  { href: '/admin/users', labelKey: 'nav.users', keywords: ['用户', 'users', '用户管理', '分组', 'group', '权限', 'permission'], group: 'page' },
  { href: '/admin/tickets', labelKey: 'nav.tickets', keywords: ['工单', 'tickets', '反馈', 'feedback', '申诉', 'appeal', '支持', 'support'], group: 'page' },
  { href: '/admin/audit', labelKey: 'nav.audit', keywords: ['操作日志', 'audit', '日志', 'log', '审计'], group: 'page' },

  // ---- Compute (Worker / Pages) ----
  { href: '/compute/worker-and-pages', labelKey: 'nav.workersAndPages', keywords: ['worker', 'workers', 'pages', '计算', 'compute', '部署', 'deploy', '云函数', 'cloudflare', '脚本', 'script', '静态', 'static', '网站', 'site'], group: 'page' },

  // ---- Docs (deployment guide) ----
  { href: '/docs/deploy', labelKey: 'doc.deploy', label: '部署教程', keywords: ['部署', 'deploy', '教程', 'guide', 'vercel', '开始', 'start'], group: 'doc' },
  { href: '/docs/env', labelKey: 'doc.env', label: '环境变量', keywords: ['环境变量', 'env', 'environment', '配置', 'config', 'secret', '密钥'], group: 'doc' },
  { href: '/docs/github-login', labelKey: 'doc.githubLogin', label: '登录与 OAuth', keywords: ['登录', 'login', 'oauth', 'github', 'google', 'microsoft', '认证', 'auth'], group: 'doc' },
  { href: '/docs/r2', labelKey: 'doc.r2', label: '文件分享 R2', keywords: ['r2', '文件', 'file', '分享', 'share', '存储', 'storage', 'bucket'], group: 'doc' },
  { href: '/docs/kv', labelKey: 'doc.kv', label: 'KV 缓存加速', keywords: ['kv', '缓存', 'cache', '加速', 'speed', 'cloudflare'], group: 'doc' },
  { href: '/docs/cf-access', labelKey: 'doc.cfAccess', label: 'Cloudflare Access', keywords: ['access', 'cloudflare', 'sso', '零信任', 'zero trust', '网关', 'gateway'], group: 'doc' },
  { href: '/docs/backup', labelKey: 'doc.backup', label: '数据库备份', keywords: ['备份', 'backup', '数据库', 'database', 'd1', 'neon', '恢复', 'restore'], group: 'doc' },
  { href: '/docs/cloudflare-deploy', labelKey: 'doc.cfDeploy', label: 'Pages 部署', keywords: ['pages', '部署', 'deploy', 'cloudflare', '静态', 'static'], group: 'doc' },
  { href: '/docs/publish', labelKey: 'doc.publish', label: '一键静态发布', keywords: ['发布', 'publish', '静态', 'static', '部署', 'deploy'], group: 'doc' },
  { href: '/docs/realtime', labelKey: 'doc.realtime', label: '实时协作', keywords: ['实时', 'realtime', '协作', 'collaboration', 'liveblocks', '多人', 'multiplayer'], group: 'doc' },
  { href: '/docs/formats', labelKey: 'doc.formats', label: '输出格式', keywords: ['格式', 'format', '输出', 'output', '蓝图', 'blueprint'], group: 'doc' },
  { href: '/docs/sharing', labelKey: 'doc.sharing', label: '分享与协作', keywords: ['分享', 'share', '协作', 'collaboration', '权限', 'permission'], group: 'doc' },
  { href: '/docs/usage', labelKey: 'doc.usage', label: '使用说明', keywords: ['使用', 'usage', '说明', '指南', 'guide', '帮助', 'help'], group: 'doc' },
  { href: '/docs/faq', labelKey: 'doc.faq', label: '常见问题', keywords: ['常见问题', 'faq', '问题', 'question', '帮助', 'help'], group: 'doc' },
];

// Search the static index. Returns entries sorted by score (best first), capped at `limit`.
export function searchIndex(q: string, limit = 8): { entry: SearchEntry; score: number }[] {
  const nq = normalizeQuery(q);
  if (!nq) return [];
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of SEARCH_INDEX) {
    const score = scoreEntry(entry, nq);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}