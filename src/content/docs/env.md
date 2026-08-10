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
| `RESEND_API_KEY` | 邮箱验证码 | Resend API Key，如 `re_xxxxxx` |
| `RESEND_FROM_EMAIL` | 邮箱验证码 | 发件人，默认 `no-reply@legspcpd.top` |
| `R2_ACCOUNT_ID` | 文件分享 | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | 文件分享 | Cloudflare R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | 文件分享 | Cloudflare R2 Secret Key |
| `R2_BUCKET` | 文件分享 | Cloudflare R2 存储桶名 |
| `CF_ACCESS_TEAM` | CF Access | Cloudflare 团队名（必填） |
| `CF_ACCESS_AUD` | CF Access | Cloudflare AUD Tag（可选，可跳过） |
| `CRON_SECRET` | 可选 | 清理 cron 的访问密钥 |

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
- `RESEND_FROM_EMAIL`（可选，默认 `no-reply@legspcpd.top`，需在 Resend 已验证该域名）

> 人机验证（Turnstile / reCAPTCHA）和自定义图标（favicon/logo）的密钥 **不走环境变量**，在管理后台 `/admin` → 站点设置 里配置（存数据库）。

### 文件分享（R2）
- `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`

### Cloudflare Access
- `CF_ACCESS_TEAM`（必填）、`CF_ACCESS_AUD`（可选）

## 修改环境变量后

保存后需要 **Redeploy** 才会生效。
