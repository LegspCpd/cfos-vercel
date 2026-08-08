'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'zh' | 'en';

const LANG_KEY = 'cfos_lang';

const zh: Record<string, string> = {
  // Common
  'app.name': 'Cloudflare OS',
  'app.tagline': 'AI 生产力工作区',
  loading: '加载中...',
  save: '保存',
  saving: '保存中...',
  cancel: '取消',
  delete: '删除',
  edit: '编辑',
  search: '搜索',
  back: '返回',

  // Auth
  'auth.signin': '登录',
  'auth.signinTitle': '登录到你的工作区',
  'auth.signinBtn': '登录',
  'auth.signingIn': '登录中...',
  'auth.username': '用户名',
  'auth.password': '密码',
  'auth.noAccount': '还没有账号？',
  'auth.createOne': '注册一个',
  'auth.github': '使用 GitHub 登录',
  'auth.signup': '注册',
  'auth.signupTitle': '创建账号',
  'auth.signupSub': '你的专属 AI 工作区',
  'auth.displayName': '显示名称',
  'auth.creating': '创建中...',
  'auth.hasAccount': '已经有账号了？',
  'auth.pwTooShort': '密码至少 6 位',

  // Nav
  'nav.home': '首页',
  'nav.workspaces': '工作区',
  'nav.shares': '文件分享',
  'nav.connections': '外部连接',
  'nav.context': '文档库',
  'nav.docs': '部署文档',
  'nav.blueprints': '蓝图',
  'nav.outputs': '输出',
  'nav.explore': '探索',
  'nav.admin': '管理',
  'nav.search': '搜索...',
  'nav.settings': '设置',
  'nav.signout': '退出登录',

  // Home
  'home.title': '你想构建什么？',
  'home.sub': '描述一个应用，agent 会帮你写出来',
  'home.placeholder': '例如：做一个计算器应用...',

  // Workspaces
  'ws.title': '工作区',
  'ws.new': '新建',
  'ws.namePlaceholder': '工作区名称',
  'ws.empty': '还没有工作区。创建一个或让 agent 帮你构建。',
  'ws.files': '个文件',
  'ws.explorer': '资源管理器',
  'ws.addFile': '新建文件',
  'ws.setEntry': '设为入口',
  'ws.deleteFile': '删除文件',
  'ws.agent': 'Agent',
  'ws.agentHint': '让 agent 构建或修改你的应用，它会直接写代码文件。',
  'ws.agentThinking': 'Agent 正在思考...',
  'ws.agentPlaceholder': '告诉 agent 要构建什么...',
  'ws.preview': '预览',
  'ws.run': '运行',
  'ws.saved': '所有更改已保存',
  'ws.unsaved': '有未保存的更改',
  'ws.allChangesSaved': '所有更改已保存',
  'ws.noFileSelected': '选择一个文件或新建一个。',
  'ws.filesUpdated': '文件已更新，请查看编辑器和预览。',

  // Outputs
  'out.title': '输出',
  'out.sub': '你用 agent 构建的所有应用。',
  'out.search': '搜索输出...',
  'out.empty': '还没有输出。用 agent 构建一个应用。',
  'out.noMatch': '没有匹配的输出。',
  'out.updated': '更新于',
  'out.open': '打开',

  // Blueprints
  'bp.title': '蓝图',
  'bp.sub': '你的应用作为可复用模板。分享给他人。',
  'bp.empty': '还没有蓝图。构建一个应用后它就会出现在这里。',
  'bp.copyLink': '复制链接',
  'bp.copied': '已复制！',
  'bp.note': '注意：分享链接目前会直接打开工作区。',

  // Explore
  'ex.title': '探索',
  'ex.sub': '发现可用 agent 构建的应用和想法。',
  'ex.try': '尝试构建',
  'ex.your': '你的作品',
  'ex.empty': '还没有作品。从上面的想法开始，或描述你自己的。',

  // Profile
  'pr.title': '设置',
  'pr.profile': '个人资料',
  'pr.displayName': '显示名称',
  'pr.changePw': '修改密码',
  'pr.currentPw': '当前密码',
  'pr.newPw': '新密码',
  'pr.updatePw': '更新密码',
  'pr.updating': '更新中...',
  'pr.updated': '已更新。',
  'pr.displayUpdated': '显示名称已更新。',
  'pr.pwUpdated': '密码已更新。',
  'pr.tip': '提示：初始设置后建议修改密码。',
  'pr.usernameLabel': '用户名',

  // Admin
  'ad.title': '管理',
  'ad.settings': '设置',
  'ad.registration': '公开注册',
  'ad.regDesc': '开启后任何人都能注册账号；关闭时只有管理员能登录。',
  'ad.regOn': '🟢 开放注册',
  'ad.regOff': '🔴 注册已关闭',
  'ad.users': '用户',
  'ad.role': '角色',
  'ad.joined': '加入时间',
  'ad.admin': '管理员',
  'ad.user': '用户',
  'ad.aiProviders': 'AI 提供方',
  'ad.aiDesc': '添加一个或多个 LLM 提供方（OpenAI、DeepSeek、本地等）。agent 默认使用第一个启用的。',
  'ad.addProvider': '添加提供方',
  'ad.adding': '添加中...',
  'ad.noProviders': '还没有提供方。添加一个，或设置 OPENAI_API_KEY。',
  'ad.active': '启用',
  'ad.off': '停用',
  'ad.allRequired': '所有字段都是必填的。',

  // Errors
  'err.notAdmin': '你没有管理员权限。',
};

const en: Record<string, string> = {
  'app.name': 'Cloudflare OS',
  'app.tagline': 'AI Productivity Workspace',
  loading: 'Loading...',
  save: 'Save',
  saving: 'Saving...',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  search: 'Search',
  back: 'Back',
  'auth.signin': 'Sign in',
  'auth.signinTitle': 'Sign in to your workspace',
  'auth.signinBtn': 'Sign in',
  'auth.signingIn': 'Signing in...',
  'auth.username': 'Username',
  'auth.password': 'Password',
  'auth.noAccount': "No account?",
  'auth.createOne': 'Create one',
  'auth.github': 'Continue with GitHub',
  'auth.signup': 'Sign up',
  'auth.signupTitle': 'Create account',
  'auth.signupSub': 'Your own AI workspace',
  'auth.displayName': 'Display name',
  'auth.creating': 'Creating...',
  'auth.hasAccount': 'Already have an account?',
  'auth.pwTooShort': 'Password must be at least 6 characters.',
  'nav.home': 'Home',
  'nav.workspaces': 'Workspaces',
  'nav.shares': 'File Shares',
  'nav.connections': 'Connections',
  'nav.context': 'Docs',
  'nav.docs': 'Deploy Guide',
  'nav.blueprints': 'Blueprints',
  'nav.outputs': 'Outputs',
  'nav.explore': 'Explore',
  'nav.admin': 'Admin',
  'nav.search': 'Search...',
  'nav.settings': 'Settings',
  'nav.signout': 'Sign out',
  'home.title': 'What do you want to build?',
  'home.sub': 'Describe an app and the agent will write it for you.',
  'home.placeholder': 'e.g. Build a calculator app...',
  'ws.title': 'Workspaces',
  'ws.new': 'New',
  'ws.namePlaceholder': 'Workspace name',
  'ws.empty': 'No workspaces yet. Create one or ask the agent to build something.',
  'ws.files': 'files',
  'ws.explorer': 'Explorer',
  'ws.addFile': 'Add file',
  'ws.setEntry': 'Set as entry',
  'ws.deleteFile': 'Delete file',
  'ws.agent': 'Agent',
  'ws.agentHint': 'Ask the agent to build or modify your app. It will write code to the workspace files.',
  'ws.agentThinking': 'Agent is thinking...',
  'ws.agentPlaceholder': 'Tell the agent what to build...',
  'ws.preview': 'Preview',
  'ws.run': 'Run',
  'ws.saved': 'All changes saved',
  'ws.unsaved': 'Unsaved changes',
  'ws.allChangesSaved': 'All changes saved',
  'ws.noFileSelected': 'Select a file or add a new one.',
  'ws.filesUpdated': 'Files were updated — check the editor and preview.',
  'out.title': 'Outputs',
  'out.sub': "All the apps you've built with the agent.",
  'out.search': 'Search outputs...',
  'out.empty': 'No outputs yet. Build an app with the agent.',
  'out.noMatch': 'No outputs match your search.',
  'out.updated': 'updated',
  'out.open': 'Open',
  'bp.title': 'Blueprints',
  'bp.sub': 'Your apps as reusable templates. Share them with others.',
  'bp.empty': 'No blueprints yet. Build an app and it will appear here.',
  'bp.copyLink': 'Copy link',
  'bp.copied': 'Copied!',
  'bp.note': 'Note: share links currently open the workspace directly.',
  'ex.title': 'Explore',
  'ex.sub': 'Discover apps and ideas you can build with the agent.',
  'ex.try': 'Try building',
  'ex.your': 'Your creations',
  'ex.empty': 'No creations yet. Start with an idea above or describe your own.',
  'pr.title': 'Settings',
  'pr.profile': 'Profile',
  'pr.displayName': 'Display name',
  'pr.changePw': 'Change password',
  'pr.currentPw': 'Current password',
  'pr.newPw': 'New password',
  'pr.updatePw': 'Update password',
  'pr.updating': 'Updating...',
  'pr.updated': 'Updated.',
  'pr.displayUpdated': 'Display name updated.',
  'pr.pwUpdated': 'Password updated.',
  'pr.tip': 'Tip: it is recommended to change your password after the initial setup.',
  'pr.usernameLabel': 'Username',
  'ad.title': 'Admin',
  'ad.settings': 'Settings',
  'ad.registration': 'Public registration',
  'ad.regDesc': 'When enabled, anyone can create an account. When disabled, only the admin can log in.',
  'ad.regOn': '🟢 Open registration',
  'ad.regOff': '🔴 Registration closed',
  'ad.users': 'Users',
  'ad.role': 'Role',
  'ad.joined': 'Joined',
  'ad.admin': 'Admin',
  'ad.user': 'User',
  'ad.aiProviders': 'AI Providers',
  'ad.aiDesc': 'Add one or more LLM providers (OpenAI, DeepSeek, local, etc.). The agent uses the first enabled one by default.',
  'ad.addProvider': 'Add provider',
  'ad.adding': 'Adding...',
  'ad.noProviders': 'No providers yet. Add one above, or set OPENAI_API_KEY.',
  'ad.active': 'active',
  'ad.off': 'off',
  'ad.allRequired': 'All fields are required.',
  'err.notAdmin': "You don't have admin access.",
};

const dicts: Record<Lang, Record<string, string>> = { zh, en };

interface I18nContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'zh',
  setLang: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('zh');

  useEffect(() => {
    const stored = window.localStorage.getItem(LANG_KEY) as Lang | null;
    if (stored === 'zh' || stored === 'en') setLang(stored);
  }, []);

  const t = (key: string) => dicts[lang][key] ?? dicts.en[key] ?? key;

  const setAndStore = (l: Lang) => {
    setLang(l);
    window.localStorage.setItem(LANG_KEY, l);
  };

  return (
    <I18nContext.Provider value={{ lang, setLang: setAndStore, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
