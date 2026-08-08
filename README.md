# Cloudflare OS — Vercel Edition

对 Cloudflare OS 的**全栈重写**，适配 Vercel（Next.js 14 + Postgres），去掉了对 Cloudflare Durable Objects / Dynamic Workers / Workers RPC 的依赖。

**注意**：这是一个全新实现，不依赖原仓库的 `cloudflare:` 运行时。它保留并尽量还原了原版功能：

**核心能力：**
- 用户注册/登录（argon2id 密码哈希 + JWT 会话）
- **AppShell 侧边栏布局**：Home / Workspaces / Blueprints / Outputs / Explore / Admin 导航
- **Home 首页**：hero + 聊天输入 + 任务建议卡（点卡片自动建 workspace 并让 agent 构建）
- **命令面板 ⌘K**：搜索/跳转 workspace、新建文档
- **主题切换**：light / dark / system 三态
- **Workspace 编辑器**：多文件 + Monaco 代码编辑器 + 文件树 + iframe 预览 + 聊天面板
- **AI Agent**：自然语言构建/修改应用，agent 直接写代码文件（支持 markdown 输出、自动运行）
- **多 AI Provider**：后台动态添加多个 LLM（DeepSeek/OpenAI/本地等）
- **Outputs**：聚合所有 workspace 应用，网格/列表视图 + 搜索
- **Blueprints**：你的应用列表 + 复制分享链接
- **Explore**：发现 + 尝试构建的想法
- **Profile 设置**：改显示名、改密码
- **管理后台 /admin**：注册开关、用户列表、AI Providers 管理
- Postgres 持久化（替代原版的 DO SQLite）

**已砍掉**（因不使用 Cloudflare 运行时/免费层限制，或原版本为占位）：
- 实时多人协同（Yjs）—— 你已同意砍掉
- 每 gadget 独立沙箱进程（Dynamic Workers）→ 改为浏览器 iframe 静态预览
- Gatekeeper 外部 OAuth 集成（GitHub/Google/Slack 等，需外部服务配置）
- Context & Skills（原版即为 ComingSoon 占位）
- Cloudflare Access SSO

## 技术栈

- **Next.js 14**（App Router，全栈，API Routes 做后端）
- **React 18 + Tailwind CSS + lucide-react**
- **Prisma + Postgres**（Vercel Postgres 或 Neon 免费层）
- **Monaco Editor**（代码编辑）
- **OpenAI SDK**（兼容任意 OpenAI 端点，含 DeepSeek / 本地 ollama）

## 本地运行

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env：DATABASE_URL、AUTH_SECRET、OPENAI_API_KEY

# 3. 初始化数据库
pnpm db:push

# 4. 启动
pnpm dev
# 访问 http://localhost:3000
```

## 部署到 Vercel

### 0. 绑定你的域名（可选但推荐）

在 Vercel 项目 **Settings → Domains** 里添加你的域名（如 `os.legspcpd.top`）。Vercel 会引导你到 DNS 服务商加一条 CNAME 记录指向 `cname.vercel-dns.com`。绑定后 `PUBLIC_SITE_URL` 用它。

### 1. 建数据库

在 [Neon](https://neon.tech) 或 Vercel 建一个免费 Postgres，拿到 `DATABASE_URL`。

### 2. 推送代码 & 导入

- 把 `rewrite-nextjs/` 推到 GitHub 私有仓库。
- 在 [Vercel](https://vercel.com) → **Add New → Project** → 导入该仓库。

### 3. 配置环境变量

Vercel 项目 **Settings → Environment Variables** 添加（全部）：

| Key | 说明 | 必填 |
|---|---|---|
| `DATABASE_URL` | Neon 连接串 | ✅ |
| `AUTH_SECRET` | 会话签名密钥，用 `openssl rand -base64 32` 生成 | ✅ |
| `PUBLIC_SITE_URL` | 你的公开地址，如 `https://os.legspcpd.top` | ✅（GitHub 登录必需） |
| `ADMIN_USERNAME` | 管理员用户名，多个用逗号分隔，如 `legspcpd,admin` | 推荐 |
| `GITHUB_CLIENT_ID` | GitHub OAuth App 的 Client ID | 用 GitHub 登录则必填 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App 的 Client Secret | 用 GitHub 登录则必填 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `DEFAULT_MODEL` | LLM（也可部署后在管理后台配多个 provider） | 推荐 |

### 4. Build Command

在 **Settings → General → Build & Development Settings** 把 Build Command 改成：

```
pnpm install && pnpm db:push && pnpm build
```

### 5. Deploy

点 **Deploy**，等 1-3 分钟即可访问。

---

## GitHub 登录配置（详细）

### 在 GitHub 创建 OAuth App

1. 打开 **https://github.com/settings/developers** → 点 **"New OAuth App"**。
2. 填写：
   - **Application name**：随便，如 `Cloudflare OS`
   - **Homepage URL**：`https://os.legspcpd.top`（你的公开地址）
   - **Authorization callback URL**：`https://os.legspcpd.top/api/auth/github/callback`（**必须精确到这个路径**）
3. 点 **Register application**。
4. 创建后进入应用详情页，能看到：
   - **Client ID**（一串随机字符）
   - 点 **"Generate a new client secret"** → 生成后**立即复制保存**（只显示一次）。
5. 把 `Client ID` 和 `Client Secret` 填到 Vercel 环境变量的 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`。

> ⚠️ 回调地址必须和这里的**完全一致**（含 `https://` 和 `/api/auth/github/callback`），否则 GitHub 会报 `redirect_uri_mismatch`。

### 本地测试 GitHub 登录

本地开发要用 `http://localhost:3000` 作为回调：
- GitHub OAuth App 的 callback 填 `http://localhost:3000/api/auth/github/callback`
- `.env` 里 `PUBLIC_SITE_URL=http://localhost:3000`
- 然后 `pnpm dev` 测试

（上线时改成生产域名即可；如需同时支持本地+生产，可在 GitHub 创建一个"测试"OAuth App 用于本地。）

### 登录后首次使用

- 用 GitHub 登录后，系统会用你的 GitHub 用户名（小写）创建账号。
- 第一个登录的账号自动成为管理员，或把用户名加进 `ADMIN_USERNAME`。
- 登录后自动跳回首页。

## 支持的 LLM（含 DeepSeek）

通过 OpenAI 兼容接口接入。**可以完全使用 DeepSeek**（便宜，适合 agent 频繁调用）：

```env
# DeepSeek 配置（在 https://platform.deepseek.com 注册充值拿 key）
OPENAI_API_KEY=sk-你的deepseek密钥
OPENAI_BASE_URL=https://api.deepseek.com/v1
DEFAULT_MODEL=deepseek-chat
```

> ⚠️ **`OPENAI_BASE_URL` 必须配**成 `https://api.deepseek.com/v1`，否则 SDK 会连 OpenAI 官方服务器，你的 `sk-` key 会报 401。

其他兼容厂商同理（如本地 ollama：`OPENAI_BASE_URL=http://localhost:11434/v1`）。

### 多 AI Provider（推荐，不用改环境变量）

部署后，管理员可在 **`/admin` → AI Providers** 页面**动态添加多个 LLM provider**（每个含名称、Base URL、API Key、模型），例如同时配 DeepSeek、OpenAI、本地模型，可随时增删/启停。agent 默认使用第一个启用的 provider。API Key 存数据库，列表页只显示掩码。

## 管理员与注册开关

- **第一个注册的用户自动成为管理员**（bootstrap admin）。
- 也可以用环境变量 `ADMIN_USERNAME=xxx` 指定某个用户为管理员。
- 管理后台在 `/admin`（只有管理员能访问），可：
  - **开关公开注册**（默认**关闭**）
  - 查看用户列表（用户名、角色、workspace 数、注册时间）
- 注册开关关闭时，非管理员的新用户注册会被拒绝（返回 403）。

### 首次使用流程
1. 部署后，先访问 `/signup` 注册**第一个账号** → 它自动成为管理员。
2. 进入 `/admin`，把"Public registration"开关打开（若要让别人注册）。
3. 之后普通用户就能注册了。

> 安全默认：注册开关默认关闭。即使你忘了关，陌生人也无法注册。

## 架构说明

| 原 Cloudflare OS | 本重写版 |
|---|---|
| Durable Object + SQLite | Postgres（Prisma） |
| Dynamic Worker 沙箱 | 浏览器 iframe + CSP |
| Cap'n Web RPC over WebSocket | REST API（Next.js Route Handlers） |
| Workers AI / 多 provider | OpenAI 兼容 SDK |
| KV / R2 | Postgres 字段 |

## 安全说明

- 密码用 argon2id 服务端哈希存储。
- 会话用 JWT（HS256），`AUTH_SECRET` 签名，7 天过期。
- 预览 iframe 通过 CSP 限制，避免 gadget 影响主应用。
- `/api/preview/:id` 当前**未做鉴权**（单用户/本地场景）。若多租户部署，请改为带签名的预览 URL（见该路由内注释）。
