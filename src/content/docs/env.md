# 环境变量速查表

> 所有环境变量都配置在 Vercel 项目 **Settings → Environment Variables**。

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres 连接串（Neon） |
| `AUTH_SECRET` | ✅ | 会话签名密钥 |
| `ADMIN_USERNAME` | 推荐 | 管理员用户名，多个用逗号分隔 |
| `PUBLIC_SITE_URL` | 登录时 | 你的公网地址 |
| `OPENAI_API_KEY` | AI 功能 | LLM API Key |
| `OPENAI_BASE_URL` | 非 OpenAI | LLM 端点，如 DeepSeek |
| `DEFAULT_MODEL` | 可选 | 默认模型 |
| `GITHUB_CLIENT_ID` | GitHub 登录 | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub 登录 | GitHub OAuth Client Secret |
| `GOOGLE_CLIENT_ID` | Google 登录 | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google 登录 | Google OAuth Client Secret |
| `MICROSOFT_CLIENT_ID` | Microsoft 登录 | Microsoft Entra ID Client ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft 登录 | Microsoft OAuth Client Secret |
| `MICROSOFT_TENANT_ID` | Microsoft 登录 | 租户 ID，默认 `common`（多租户） |
| `GITLAB_CLIENT_ID` | GitLab 外部连接 | GitLab OAuth Application ID |
| `GITLAB_CLIENT_SECRET` | GitLab 外部连接 | GitLab OAuth Secret |
| `GITLAB_BASE_URL` | GitLab 外部连接 | 实例地址，默认 `https://gitlab.com` |
| `RESEND_API_KEY` | 邮箱验证码 | Resend API Key，如 `re_xxxxxx` |
| `RESEND_FROM_EMAIL` | 邮箱验证码 | 发件人，默认 `no-reply@your-domain.com` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | 人机验证 | Cloudflare Turnstile（配置后管理面板锁定） |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | 人机验证 | Google reCAPTCHA（配置后管理面板锁定） |
| `IMGHOST_BASE_URL` | 头像图床 | 默认 `https://hub.your-domain.com` |
| `IMGHOST_TOKEN` | 头像图床 | 图床 API token，如 `imgbed_xxx` |
| `IMGHOST_FOLDER` | 头像图床 | 上传文件夹，默认 `photos/avatars` |
| `ALLOW_SIGNUPS` | 注册开关 | `enabled` 允许注册 / `disabled` 禁止（环境变量优先于管理面板开关） |
| `NEXT_PUBLIC_COMMENTS_ENABLED` | 公开评论/聊天 | `true` 开启右下角 Waline 评论区，默认关闭 |
| `NEXT_PUBLIC_BEIJIN` | 全站背景图 | 背景图 URL，每次刷新重新请求；客户端读取需 `NEXT_PUBLIC_` 前缀 |
| `SITE_IMG_URL` | 网站图标/Logo | 自定义 favicon/Logo 的图片 URL；构建时自动下载并转成 PNG 作为网站图标（原图是 JPG 也能转）；`SITE_IMG_URL` 用于服务端 favicon，客户端 Logo 需用 `NEXT_PUBLIC_SITE_IMG_URL`（推荐两者配同一个值） |
| `NEXT_PUBLIC_COMMENTS_SERVER_URL` | 评论服务 | Waline 评论服务器地址（启用评论时用） |
| `NEXT_PUBLIC_WALINE_CSS` / `NEXT_PUBLIC_WALINE_JS` | 评论资源 | Waline 前端资源 CDN 地址（默认 unpkg 官方源） |
| `VERIFY_CODE_TTL_MINUTES` | 验证码有效期 | 邮箱验证码有效分钟数，默认 10 |
| `R2_ACCOUNT_ID` | 文件分享 | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | 文件分享 | Cloudflare R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | 文件分享 | Cloudflare R2 Secret Key |
| `R2_BUCKET` | 文件分享 | Cloudflare R2 存储桶名 |
| `CF_ACCESS_TEAM` | CF Access | Cloudflare 团队名（必填） |
| `CF_ACCESS_AUD` | CF Access | Cloudflare AUD Tag（可选，可跳过） |
| `CRON_SECRET` | 可选 | 清理 cron 的访问密钥 |
| `DATABASE_URL_2` | 多库（可选） | 第二个 Neon 数据库连接串，用于存冷数据（审计日志/邮箱验证码） |
| `MULTI_DB_ENABLED` | 多库（可选） | `true` 开启多数据库，默认关闭（必须同时配 `DATABASE_URL_2`） |
| `MULTI_DB_COLD_TABLES` | 多库（可选） | 哪些冷数据表放副库，逗号分隔，默认 `audit,verification`（`audit`=审计日志、`verification`=邮箱验证码） |

## 多数据库（可选，默认关闭）

当单个 Neon 数据库快被占满时，可以把**低优先级的冷数据**（审计日志、邮箱验证码）挪到**第二个 Neon 数据库**，主库只留重要数据，降低主库占用。

**启用（必须同时满足）：**
1. 创建第二个 Neon 数据库，把连接串填入 `DATABASE_URL_2`
2. 设置 `MULTI_DB_ENABLED=true`
3. （可选）`MULTI_DB_COLD_TABLES` 控制哪些表进副库，默认 `audit,verification`

**如何生效（自动）：**
- 开启后，新的审计日志和邮箱验证码**直接写入副库**
- 主库里已存在的旧冷数据，由**定时清理 cron**（`/api/cron/cleanup`）自动分批搬到副库（每次 500 条，从最老开始；插入成功后才删除源记录，中途失败不会丢数据）
- 主库旧数据搬空后，主库会显著变小

**注意：**
- 未配置 `DATABASE_URL_2` 或未设 `MULTI_DB_ENABLED=true` 时，所有数据照常存主库，行为与之前完全一致
- 副库只在**运行时**被迁移任务和冷数据写入访问；**构建时不做任何数据搬移**
- 只在 `audit`（审计日志）和 `verification`（邮箱验证码）之间选择，因为它们**没有外键关联**，可以安全隔离；有外键的重要表（工作区、文件、聊天、用户）**不会**被挪动
- 首次部署需要在 Vercel 的构建命令里已包含 `prisma generate --schema=prisma/schema-secondary.prisma`（本项目已配置）

## 生成 AUTH_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

把输出粘贴到 `AUTH_SECRET`。

## 按功能分组

### 必须
- `DATABASE_URL`、`AUTH_SECRET`

### AI
- `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`DEFAULT_MODEL`

### 登录（OAuth）
- `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`PUBLIC_SITE_URL`（GitHub 登录）
- `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`（Google 登录）

### 邮箱验证码（Resend）
- `RESEND_API_KEY`（必填才启用邮箱注册验证）
- `RESEND_FROM_EMAIL`（可选，默认 `no-reply@your-domain.com`，需在 Resend 已验证该域名）

> 人机验证（Turnstile / reCAPTCHA）**支持环境变量配置**（推荐，管理面板会锁定）：
> - `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`、`RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY`
> - 也可在管理后台 `/admin` → 站点设置 配置（仅当该提供者未配置环境变量时可编辑）
> - 环境变量优先级高于管理后台配置。
>
> 自定义图标（favicon/logo）在管理后台 `/admin` → 站点设置 配置（存数据库，不走环境变量）。

### 文件分享（R2）
- `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`

### Cloudflare Access
- `CF_ACCESS_TEAM`（必填）、`CF_ACCESS_AUD`（可选）

## 修改环境变量后

保存后需要 **Redeploy** 才会生效。
