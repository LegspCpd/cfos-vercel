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
- **AI 智能体** — 用自然语言构建/修改应用；智能体直接写代码文件（支持 markdown 输出和自动运行）
- **多 AI 提供商** — 从管理面板动态添加多个大模型（DeepSeek / OpenAI / 本地等）

### 内容与分享
- **输出** — 所有工作区应用的汇总列表（网格/列表视图 + 搜索）
- **蓝图** — 应用列表 + 导出/导入 `.gadget.json` 压缩包 + 公开分享链接（无需登录即可查看）
- **探索** — 发现和试用创意
- **收藏** — 收藏工作区并按收藏筛选

### 管理与治理
- **个人资料** — 昵称、头像、密码
- **用户组与权限** — 用户组完全决定用户能做什么（工作区/AI、文件分享、文档库、连接、管理员权限、用户管理）
- **用户管理** `/admin/users` — 创建/删除用户、改密码/邮箱、移动用户组
- **操作日志** `/admin/audit` — 登录（带 IP）、智能体运行、AI 调用（带 token 用量）的审计轨迹
- **工单管理** `/admin/tickets` — 查看和处理用户工单
- **分析** `/analytics` — 个人统计（工作区、文件、今日登录 IP、AI token 用量）；管理员额外看到整站每日汇总与登录 IP 分布
- **站点定制** — 品牌 favicon/logo、可选整站背景图（环境变量配置）、人机验证（Turnstile + reCAPTCHA）、注册开关

### 远程连接（SSH）
- **SSH 主机管理** — 添加/删除/测试服务器，支持密码或私钥认证；凭据**AES-256-GCM 加密**存储（绝不落明文）
- **实时监控** — 探测主机，展示主机名、系统、核心数、运行时长、负载、内存和磁盘用量
- **命令终端** — 运行一条命令并通过 SSE 实时流式输出；瞬时失败自动重连（最多 5 次），放弃时给出清晰的超时提示
- 主机输入支持 `host:port`、纯域名和 IPv6（`[::1]:22`）

### 持久化
- **Postgres**（Prisma），用 Vercel Postgres 或 Neon 免费版，替代原 Durable Object + SQLite
- **可选多数据库** — 把冷数据（审计日志、邮箱验证码）分流到最多 4 个 Neon 副库（`MULTI_DB_ENABLED`），保持主库轻量；读取跨库合并，冷写入失败时安全回退到主库

### 已移除（不在本次重写中）
- 实时多用户协作（Yjs）
- 每个小工具的沙箱进程（Dynamic Workers）→ 改为浏览器 iframe 静态预览
- Gatekeeper 外部 OAuth 集成（GitHub/Google/Slack，需要外部服务配置）
- Context & Skills（原项目里是"即将上线"占位）

## 🧰 技术栈

- **Next.js 14**（App Router，全栈，Route Handlers 作为后端）
- **React 18 + Tailwind CSS + lucide-react**
- **Prisma + Postgres**（Vercel Postgres 或 Neon 免费版）
- **Monaco Editor** 代码编辑
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

- [简体中文文档](/docs)
- [English docs](/en/docs)
- [Cloudflare Access 配置](docs/CLOUDFLARE_ACCESS_SETUP.md)

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
