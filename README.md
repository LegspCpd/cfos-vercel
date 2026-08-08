# Cloudflare OS — Vercel Edition

对 Cloudflare OS 的**全栈重写**，适配 Vercel（Next.js 14 + Postgres），去掉了对 Cloudflare Durable Objects / Dynamic Workers / Workers RPC 的依赖。

**注意**：这是一个全新实现，不依赖原仓库的 `cloudflare:` 运行时。它保留的核心能力：

- 用户注册/登录（argon2id 密码哈希 + JWT 会话）
- Workspace（工作区）：多文件 + Monaco 代码编辑器
- AI Agent：用自然语言构建/修改应用，agent 直接写代码文件
- iframe 预览：把 agent 生成的 HTML/CSS/JS 应用实时渲染出来
- Postgres 持久化（替代原版的 DO SQLite）

**已砍掉**（因不使用 Cloudflare 运行时/免费层限制）：
- 实时多人协同（Yjs）
- 每 gadget 独立沙箱进程（Dynamic Workers）→ 改为浏览器 iframe 静态预览
- Gatekeeper 外部 OAuth 集成（GitHub/Google/Slack 等）
- 企业 Admin 面板、Cloudflare Access SSO

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

1. **数据库**：在 [Neon](https://neon.tech) 或 Vercel 建一个免费 Postgres，拿到 `DATABASE_URL`。
2. **推送代码**到 GitHub 仓库，在 [Vercel](https://vercel.com) 导入。
3. 在 Vercel 项目 Settings → Environment Variables 配置：
   - `DATABASE_URL`
   - `AUTH_SECRET`（用 `openssl rand -base64 32` 生成）
   - `OPENAI_API_KEY`（可加 `OPENAI_BASE_URL` 指向兼容端点、`DEFAULT_MODEL`）
4. **Build Command**：`pnpm install && pnpm db:push && pnpm build`（或用 Build Step 跑 Prisma migration）。
5. Deploy。

## 支持的 LLM

通过 OpenAI 兼容接口接入。设置 `OPENAI_API_KEY` 即可用 `gpt-4o-mini` 等；要换其他厂商：

```env
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.deepseek.com/v1   # 例：DeepSeek
DEFAULT_MODEL=deepseek-chat
```

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
