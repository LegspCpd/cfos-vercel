# Cloudflare OS — Vercel 版

> ⚠️ **二次开发 (Derivative work)**: 本项目基于 [Cloudflare OS](https://github.com/cloudflare/cloudflare-os) 二次开发，遵循 [Apache License 2.0](LICENSE)。

一个为 Vercel（Next.js 14 + Postgres）重新构建的全栈版 Cloudflare OS，移除了对 Cloudflare Durable Objects、Dynamic Workers 和 Workers RPC 的依赖。

这是原项目的**二次开发（derivative）**，基于标准的 `next` 运行时构建。它保留并恢复了原产品的能力，同时把架构改造成经典 serverless 部署形态。版权与修改说明见 [NOTICE](NOTICE)。

- 英文版：[English README](README.md)

## ✨ 功能特性

### 核心
- **认证登录** — 注册/登录采用 scrypt 密码哈希（Node 内置 `crypto.scrypt`）+ JWT 会话；支持 **GitHub / Google / Microsoft OAuth**、邮箱验证码注册、邮箱+密码登录
- **Cloudflare Access SSO** — 通过 `CF_ACCESS_TEAM` / `CF_ACCESS_AUD` 可选的整站门禁（见 [配置文档](docs/CLOUDFLARE_ACCESS_SETUP.md)）
- **OAuth 新用户引导** — 通过第三方登录创建的账号，在进入应用前必须完善资料（用户名 + 密码 + 人机验证，可选绑定邮箱）
- **邮箱管理** — 绑定邮箱，或通过两步所有权验证（旧邮箱验证码 → 新邮箱验证码）+ 人机验证来更换邮箱
- **账号注销** — 自助注销：邮箱验证码或 OAuth 重新认证 + 人机验证，之后有 4–7 天冷静期才彻底删除（邮箱/用户名会被释放、可重新注册）；冷静期内可取消
- **工单系统** — 用户提交反馈 / 申诉 / 邮箱变更申请（带人机验证 + IP 记录）；管理员收到邮件通知，附一键处理链接

### 应用外壳
- 侧边栏导航：首页 · 工作区 · 蓝图 · 输出 · 探索 · 管理 · 工单 · 操作日志
- **首页** Hero：聊天输入框 + 任务建议卡片
- **双语文档站**：`/docs`（简体中文）和 `/en/docs`（英文），侧边栏一键切换
- **命令面板（⌘K）** — 搜索/跳转工作区、新建文档
- **主题** — 亮色 / 暗色 / 跟随系统

### 工作区与 AI 智能体
- 多文件 **Monaco 编辑器**（文件树 + iframe 预览 + 聊天面板，会话自动持久化）
- **文件历史 / 版本回滚** — 每次改动都会快照，可恢复
- **多人实时协作**（Liveblocks）— 协作者同时打开同一工作区时，编辑内容实时同步到每个人的编辑器，工具栏显示在线人数；未配置时优雅降级为离线编辑
- **一键静态发布** — 工作区工具栏的 **发布** 按钮把全部文件内联成单个自包含 HTML，生成不可猜测的公开链接（`/p/<token>`），无需外部部署；重新发布链接不变，取消发布立即 404
- **AI 智能体** — 用自然语言构建/修改应用；智能体直接写代码文件（支持 markdown 输出和自动运行）
- **多轮工具循环** — 智能体可在对话中调用外部工具（GitHub/GitLab 列表/读取/建 issue），受每连接 **只读 / 读写** 能力门控（写工具需显式授权）；工具调用会在聊天中展示
- **多 AI 提供商** — 从管理面板动态添加多个大模型（DeepSeek / OpenAI / 本地等）

### 输出格式（蓝图）
- **输出格式** — 部署提供的标准 "New …" 菜单（内置 Document / Presentation / Spreadsheet），每个格式带种子文件和 agent 提示
- **从格式开始** — 首页一键创建；编辑器工具栏随时切换工作区格式（保留已有文件）
- **模板市场** — 把任意工作区提交为模板；管理员在 Admin → 格式 审核，批准后对所有用户开放
- **管理员策展** — 启用/禁用格式、编辑呈现（单复数名词/图标）和 agent 提示、审核待提交
- **输出按类型分组** — 输出页按格式家族分组（Docs / Decks / Sheets / Apps）
- **蓝图归档携带格式** — `.gadget.json` 导出/导入保留工作区的格式关联

### 内容与分享
- **输出** — 所有工作区应用的汇总列表（网格/列表视图 + 搜索）
- **蓝图** — 应用列表 + 导出/导入 `.gadget.json` 压缩包 + 公开分享链接（无需登录即可查看）
- **探索** — 发现和试用创意
- **收藏** — 收藏工作区并按收藏筛选
- **工作区协作者** — 按用户名邀请用户，**只读 / 可编辑**两种角色；只读协作者得到锁定的编辑器与禁用的 agent；所有者在工作区工具栏管理团队
- **文件级分享** — 只分享工作区内的单个文件，不开放整个工作区（生效权限 = 工作区角色与文件角色的最大值）
- **公共上下文库** — 把上下文文档设为公开 → 进入管理员审核队列（管理 → 格式）→ 通过后出现在公共库，所有用户的 agent 自动参考
- **通知** — 站内铃铛（每 30 秒轮询）推送协作者变动、文档审核结果、工单回复；「设置 → 通知偏好」可选择哪些事件额外发邮件（Resend）

### 管理与治理
- **个人资料** — 昵称、头像、密码
- **用户组与权限** — 用户组完全决定用户能做什么（工作区/AI、文件分享、文档库、连接、管理员权限、用户管理）
- **用户管理** `/admin/users` — 创建/删除用户、改密码/邮箱、移动用户组
- **AI 用量配额** — 按**单个用户**和**整个分组**设置 **AI 每日调用上限**（用户配额优先于分组）；超限返回 429，次日 0 点重置
- **操作日志** `/admin/audit` — 登录（带 IP）、智能体运行、AI 调用（带 token 用量）的审计轨迹；右上角可把当前筛选结果**导出 CSV / JSON**（带 BOM）
- **定时任务** — 管理员用 **cron 表达式** 定义任务（对指定工作区运行 AI 指令，或 HTTP 回调），Vercel Cron 每天触发一次扫描（`/api/cron/daily`，受 `CRON_SECRET` 保护）；扫描会执行**上次运行以来所有到期任务**，所以免费版每天一次也能触发每小时任务，每次执行留日志
- **工单管理** `/admin/tickets` — 查看和处理用户工单
- **分析** `/analytics` — 个人统计（工作区、文件、今日登录 IP、AI token 用量）；管理员额外看到整站每日汇总与登录 IP 分布
- **站点定制** — 品牌 favicon/logo、可选整站背景图（环境变量配置）、人机验证（Turnstile + reCAPTCHA）、注册开关

### 远程连接（SSH）
- **SSH 主机管理** — 添加/删除/测试服务器，支持密码或私钥认证；凭据**AES-256-GCM 加密**存储（绝不落明文）
- **实时监控** — 探测主机，展示主机名、系统、核心数、运行时长、负载、内存和磁盘用量
- **命令终端** — 运行一条命令并通过 SSE 实时流式输出；瞬时失败自动重连（最多 5 次），放弃时给出清晰的超时提示
- **持久会话** — 从终端头部打开会话后，**工作目录与 `export` 的环境变量跨命令保持**（每条命令自动 `cd` + 恢复环境）；会话默认 30 分钟无操作过期（`SSH_SESSION_TTL_MINUTES` 可调）
- 主机输入支持 `host:port`、纯域名和 IPv6（`[::1]:22`）

### 持久化
- **Postgres**（Prisma），用 Vercel Postgres 或 Neon 免费版，替代原 Durable Object + SQLite
- **可选多数据库** — 把冷数据（审计日志、邮箱验证码）分流到最多 4 个 Neon 副库（`MULTI_DB_ENABLED`），保持主库轻量；读取跨库合并，冷写入失败时安全回退到主库

### 已移除（不在本次重写中）
- 每个小工具的沙箱进程（Dynamic Workers）→ 改为浏览器 iframe 静态预览
- Gatekeeper 外部 OAuth 集成（GitHub/Google/Slack，需要外部服务配置）。注意：GitHub/GitLab **OAuth 仍可用**，用于登录与 Pages 仓库部署。

> **实时多用户协作已通过 Liveblocks 回归**（见「工作区与 AI 智能体」）——原 Yjs 协作未移植，但同样的实时编辑 + 在线状态体验由 Liveblocks 集成提供。

## 🧰 技术栈

- **Next.js 14**（App Router，全栈，Route Handlers 作为后端）
- **React 18 + Tailwind CSS + lucide-react**
- **Prisma + Postgres**（Vercel Postgres 或 Neon 免费版）
- **Monaco Editor** 代码编辑
- **@liveblocks/client** 实时协作
- **OpenAI SDK**（兼容任何 OpenAI 接口，含 DeepSeek 和本地 ollama）

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env：DATABASE_URL、AUTH_SECRET、OPENAI_API_KEY

# 3. 初始化数据库
pnpm db:push

# 4. 启动开发服务器
pnpm dev
# 访问 http://localhost:3000
```

### 部署到 Vercel

1. **数据库** — 在 [Neon](https://neon.tech) 或 Vercel 创建免费的 Postgres 实例，记下 `DATABASE_URL`。
2. **导入** — 把仓库推到 GitHub，然后在 Vercel 导入（**Add New → Project**）。
3. **环境变量** — 添加你需要的变量（见下方表格）。
4. **构建命令** — 在 Settings → General 里设置为：

   ```
   pnpm install && pnpm db:push && pnpm build
   ```

5. **部署**，等 1–3 分钟。

> 更详细的逐步部署教程（含每一步命令在哪填、填什么）见 [部署教程](/docs/deploy)。

### 环境变量

| 变量 | 说明 | 是否必填 |
|---|---|---|
| `DATABASE_URL` | Neon/Postgres 连接串 | ✅ |
| `AUTH_SECRET` | 会话签名密钥（`openssl rand -base64 32`） | ✅ |
| `PUBLIC_SITE_URL` | 公开访问地址，如 `https://os.example.com` | ✅ |
| `ADMIN_USERNAME` | 管理员用户名，逗号分隔 | 推荐 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `DEFAULT_MODEL` | 大模型（或从管理面板添加提供商） | 推荐 |
| `LIVEBLOCKS_SECRET_KEY` | Liveblocks Secret key，开启实时协作 | 可选 |
| `CRON_SECRET` | 保护 `/api/cron/*`（定时任务、清理、备份） | 可选 |

完整可选变量（OAuth、邮箱、人机验证、品牌、评论等）见 **[简体中文配置文档](/docs/env)** / **[English configuration docs](/en/docs/env)**。

## 🔐 OAuth 回调地址

请按下述精确配置回调地址（把 `os.example.com` 换成你的域名）：

| 服务 | 生产（Vercel） | 本地 |
|---|---|---|
| **GitHub** | `https://os.example.com/api/auth/github/callback` | `http://localhost:3000/api/auth/github/callback` |
| **Google** | `https://os.example.com/api/auth/google/callback` | `http://localhost:3000/api/auth/google/callback` |
| **Microsoft** | `https://os.example.com/api/auth/microsoft/callback` | `http://localhost:3000/api/auth/microsoft/callback` |

> `PUBLIC_SITE_URL` 必须与回调中使用的域名一致。

## 🧭 文档

- [简体中文文档](/docs) — 从部署到每个功能的完整指南
- [English docs](/en/docs) — full English guide
- [Cloudflare Access 配置](docs/CLOUDFLARE_ACCESS_SETUP.md)
- 重点页面：[部署](/docs/deploy) · [环境变量](/docs/env) · [一键静态发布](/docs/publish) · [实时协作](/docs/realtime) · [分享与协作](/docs/sharing) · [KV 缓存](/docs/kv)

## 🏗 架构

| 原 Cloudflare OS | 本重写版 |
|---|---|
| Durable Object + SQLite | Postgres（Prisma） |
| Dynamic Worker 沙箱 | 浏览器 iframe + CSP |
| Cap'n Web RPC over WebSocket | REST API（Next.js Route Handlers） |
| Workers AI / 多提供商 | OpenAI 兼容 SDK |
| KV / R2 | Postgres 列 |

## 🔒 安全

- 密码服务端用 scrypt 哈希（`crypto.scrypt`，Node 内置，无需原生编译）。
- 会话是 JWT（HS256），用 `AUTH_SECRET` 签名，7 天过期。
- 预览 iframe 通过 CSP 沙箱隔离。
- `/api/preview/:id` 需要短时有效的 HMAC 签名 URL（10 分钟有效），由服务端在授权调用方（工作区所有者，或有效的公开蓝图分享）后签发。仅凭工作区 id 访问会返回 `403`，避免通过猜测 id 泄露私有工作区源码。

## 🤝 贡献

欢迎贡献。请：

1. Fork 仓库并创建功能分支。
2. 推送前运行 `pnpm lint` / `pnpm types:check`（或 `npx tsc --noEmit`）。
3. 如适用，保持 `workshop-backend` / `workshop-shared` 的 diff 小而精、注释到位。

## 📄 许可证

本项目是 [Cloudflare OS](https://github.com/cloudflare/cloudflare-os) 的重写版，原项目遵循 [Apache License 2.0](https://github.com/cloudflare/cloudflare-os/blob/master/LICENSE)。本项目采用相同许可证。
