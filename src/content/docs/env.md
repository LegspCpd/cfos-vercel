# 环境变量配置指南

本文档列出应用运行所需的全部环境变量，以及各自的用途、必填性和默认值。

## 配置位置

环境变量统一在 **Vercel 项目 → Settings → Environment Variables** 中配置；本地开发时写入根目录的 `.env` 文件（参考 `.env.example`）。

修改环境变量后需重新部署（**Redeploy**）方可生效。

## 变量清单

### 必填变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Postgres（Neon / Vercel Postgres）连接串。 |
| `AUTH_SECRET` | 会话签名的密钥。生成方式见下文「生成 AUTH_SECRET」。 |

### 推荐变量

| 变量 | 说明 |
|---|---|
| `ADMIN_USERNAME` | 管理员用户名，多个用英文逗号分隔。未设置时，第一个注册用户自动成为管理员。 |
| `PUBLIC_SITE_URL` | 应用的公网访问地址（用于登录、OAuth 回调等），如 `https://os.example.com`。 |
| `OPENAI_API_KEY` | 大语言模型 API 密钥（DeepSeek、OpenAI 等）。 |
| `OPENAI_BASE_URL` | LLM API 端点；使用非 OpenAI 默认地址时必填，如 `https://api.deepseek.com/v1`。 |
| `DEFAULT_MODEL` | 默认使用的模型名称，如 `deepseek-chat`。 |

> 大模型提供商也可在管理后台 `/admin` 动态添加；以上环境变量用于配置默认提供商。

### 第三方登录（OAuth）

| 变量 | 说明 |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID。 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret。 |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID。 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret。 |
| `MICROSOFT_CLIENT_ID` | Microsoft Entra ID Client ID。 |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth Client Secret。 |
| `MICROSOFT_TENANT_ID` | 租户 ID，默认 `common`（多租户）。 |
| `GITLAB_CLIENT_ID` | GitLab OAuth Application ID（用于外部连接功能）。 |
| `GITLAB_CLIENT_SECRET` | GitLab OAuth Secret。 |
| `GITLAB_BASE_URL` | GitLab 实例地址，默认 `https://gitlab.com`。 |

回调地址的精确配置见主 README 中的「OAuth 回调地址」章节。

### 邮箱验证码（Resend）

| 变量 | 说明 |
|---|---|
| `RESEND_API_KEY` | Resend API 密钥（`re_xxxxxx`）。配置后启用邮箱验证码注册。 |
| `RESEND_FROM_EMAIL` | 发件人地址，默认 `no-reply@your-domain.com`，需为 Resend 中已验证的域名。 |

### 人机验证（Turnstile / reCAPTCHA）

| 变量 | 说明 |
|---|---|
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile 站点与密钥。 |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA 站点与密钥。 |

配置任一提供者后，管理后台该提供者的设置将被锁定；环境变量的优先级高于管理后台配置。

### 文件分享（Cloudflare R2）

| 变量 | 说明 |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare 账号 ID。 |
| `R2_ACCESS_KEY_ID` | R2 Access Key。 |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Key。 |
| `R2_BUCKET` | R2 存储桶名称。 |

### Cloudflare Access（整站门禁）

| 变量 | 说明 |
|---|---|
| `CF_ACCESS_TEAM` | Cloudflare 团队名，必填。 |
| `CF_ACCESS_AUD` | Cloudflare AUD Tag，可选。 |

### 站点外观与评论

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_BEIJIN` | 全站背景图 URL；每次刷新重新请求。客户端读取需 `NEXT_PUBLIC_` 前缀。 |
| `SITE_IMG_URL` | 服务端 favicon/Logo 图片 URL。构建时自动下载并转为 PNG 用作网站图标（原图为 JPG 亦可）。 |
| `NEXT_PUBLIC_SITE_IMG_URL` | 客户端 Logo 图片 URL，建议与 `SITE_IMG_URL` 配置相同值。 |
| `NEXT_PUBLIC_COMMENTS_ENABLED` | 是否启用右下角 Waline 评论区，取值 `true` / `false`，默认关闭。 |
| `NEXT_PUBLIC_COMMENTS_SERVER_URL` | Waline 评论服务器地址（启用评论时使用）。 |
| `NEXT_PUBLIC_WALINE_CSS` / `NEXT_PUBLIC_WALINE_JS` | Waline 前端资源 CDN 地址，默认 unpkg 官方源。 |

### 部署服务（Cloudflare Pages + 短链，可选）

> **完整开启 Pages 部署功能，最少只需配 `PAGES_KEY` 和 `PAGES_ACCOUNT_ID` 两个变量**。其余为可选增强。

**A. 核心（部署到 Cloudflare Pages 必需）**

| 变量 | 说明 |
|---|---|
| `PAGES_KEY` | Cloudflare API Token，需具备 **Cloudflare Pages 编辑/部署**权限。获取：Cloudflare 控制台 → 我的个人资料 → API 令牌 → 创建令牌 → 选择「编辑 Cloudflare Workers」或自建，权限勾选 **Pages** 的 Edit/Deploy，区域勾选你的账户。 |
| `PAGES_ACCOUNT_ID` | Cloudflare 账户 ID（控制台首页右下角显示的那串 32 位十六进制，如 `475226a96a69...`）。 |

配置后即可启用 **Pages 菜单 → 新建项目 → 工作区部署 / ZIP 上传 / 文件夹上传**。

**B. 短链（可选）**

| 变量 | 说明 |
|---|---|
| `S_LINK` | 短链服务（sink.cool / s.legspcpd.top）的站点 Token（`NUXT_SITE_TOKEN`）。配置后部署完成自动生成短链。 |
| `S_LINK_BASE` | 短链系统基址，默认 `https://sink.cool`。 |

**C. Git 仓库部署（可选）**

| 变量 | 说明 |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID（见「第三方登录（OAuth）」）。配置后启用「从 GitHub 仓库部署」。 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret。 |
| `GITLAB_CLIENT_ID` | GitLab OAuth Application ID（见「第三方登录（OAuth）」）。配置后启用「从 GitLab 仓库部署」。 |
| `GITLAB_CLIENT_SECRET` | GitLab OAuth Secret。 |
| `GITLAB_BASE_URL` | GitLab 实例地址，默认 `https://gitlab.com`。 |

> 仓库部署会复用「外部连接」页你已授权的账号；未授权时部署界面会提示先连接。

**D. 右侧信息面板（可选）**

| 变量 | 说明 |
|---|---|
| `PAGES_BILLING_SHOW` | Pages 页右侧「账单」面板是否显示，`true` 显示。默认隐藏；设置后管理面板对应开关被锁定。 |
| `PAGES_ACCOUNT_SHOW` | Pages 页右侧「Account Details」面板是否显示，`true` 显示。默认隐藏；设置后管理面板对应开关被锁定。 |
| `PAGES_SUBDOMAIN` | 账户子域，仅用于「Account Details」展示，默认 `pages.dev`。 |

> 这三个面板开关也可在管理后台（`/admin` → 设置 → Pages 仪表盘面板）开启；但**环境变量优先级更高**，一旦设置了环境变量，管理面板对应开关即被锁定。

### 其他

| 变量 | 说明 |
|---|---|
| `ALLOW_SIGNUPS` | 注册开关，取值 `enabled` / `disabled`；环境变量优先级高于管理后台开关。 |
| `IMGHOST_BASE_URL` | 头像图床地址，默认 `https://hub.your-domain.com`。 |
| `IMGHOST_TOKEN` | 图床 API token（如 `imgbed_xxx`）。 |
| `IMGHOST_FOLDER` | 上传文件夹，默认 `photos/avatars`。 |
| `VERIFY_CODE_TTL_MINUTES` | 邮箱验证码有效分钟数，默认 `10`。 |
| `CRON_SECRET` | 定时清理任务（cron）的访问密钥。 |

### 多库 KV 响应缓存（可选）

用于加速 Pages 部署相关接口（项目列表、Git 仓库枚举等），让重复访问"秒开"。**默认一个 KV 库即可用**，最多可配 5 个（第 2 个起加数字后缀 `_2`…`_5`；写入全量、读取按序回退）。未配置时自动回退到进程内内存缓存，不影响功能。详细使用教程见 [KV 缓存使用指南](/docs/kv)。

**默认单库（配这 3 个就能用）**

| 变量 | 说明 |
|---|---|
| `KV_ACCOUNT_ID` | Cloudflare 账户 ID（通常与 `PAGES_ACCOUNT_ID` 相同）。 |
| `KV_API_TOKEN` | Cloudflare API Token，需有该 namespace 的 **Workers KV → Edit** 权限（若 `PAGES_KEY` 已含 KV:Edit 可直接复用）。 |
| `KV_NAMESPACE_ID` | KV 命名空间 ID。在 Cloudflare 控制台 → Workers & Pages → KV → 创建命名空间，把生成的 Namespace ID 填进来即可。 |

**可选的更多库（最多再加 4 个，共 5 个）**

第 1 个库用基础名；之后的每个库在三个变量后加**数字后缀**（`_2` … `_5`），纯序号、不带地区：

| 变量 | 说明 |
|---|---|
| `KV_ACCOUNT_ID_N` / `KV_API_TOKEN_N` / `KV_NAMESPACE_ID_N` | 第 N 个库（N = 2..5），例如第 2 个库为 `KV_NAMESPACE_ID_2`。 |

示例——两个库：
```
KV_ACCOUNT_ID=...
KV_API_TOKEN=...
KV_NAMESPACE_ID=...
KV_ACCOUNT_ID_2=...
KV_API_TOKEN_2=...
KV_NAMESPACE_ID_2=...
```

**共享调优（一套，作用于所有库）**

| 变量 | 说明 |
|---|---|
| `KV_PREFIX` | 缓存键前缀（隔离多实例），默认 `cfos`。 |
| `KV_DEFAULT_TTL` | 默认缓存秒数，默认 `60`。 |
| `KV_PAGES_PROJECTS_TTL` | Pages 项目列表缓存秒数，默认 `15`。 |
| `KV_GIT_REPOS_TTL` | Git 仓库列表缓存秒数（按用户），默认 `60`。 |
| `KV_PAGES_STATS_TTL` | Pages 用量面板缓存秒数，默认 `8`。 |
| `KV_ME_TTL` | `/api/me`（当前用户资料）缓存秒数，默认 `5`。 |
| `KV_ANALYTICS_TTL` | `/api/analytics`（按用户；IP 始终实时）缓存秒数，默认 `30`。 |
| `KV_SITE_TTL` | 公共 `/api/site` 站点设置缓存秒数，默认 `30`。 |
| `KV_SSH_HOSTS_TTL` | SSH 主机列表缓存秒数（按用户），默认 `10`。 |

### 多数据库（可选）

| 变量 | 说明 |
|---|---|
| `DATABASE_URL_2` ~ `DATABASE_URL_5` | 第 2 至第 5 个 Neon 数据库连接串，用于存储冷数据（审计日志、邮箱验证码）。 |
| `MULTI_DB_ENABLED` | 是否启用多数据库，取值 `true` / `false`，默认关闭。启用时需同时配置至少一个 `DATABASE_URL_2`..`DATABASE_URL_5`。 |
| `MULTI_DB_COLD_TABLES` | 冷数据表路由规则，格式 `表名@副库索引`，如 `audit@0,verification@0`；默认 `audit,verification`（均写入第一个副库）。 |

多数据库的启用步骤与行为约定见下文「多数据库」。

## 生成 AUTH_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

将命令输出粘贴到 `AUTH_SECRET`。

## 多数据库

当单个 Neon 数据库的存储接近上限时，可将**低优先级冷数据**（审计日志、邮箱验证码）路由到独立的 Neon 数据库（最多 4 个副库加 1 个主库，共 5 个），使主库仅保留重要数据。

### 启用步骤

1. 创建副库，将连接串填入 `DATABASE_URL_2`；如需多个副库，可继续配置 `DATABASE_URL_3` 至 `DATABASE_URL_5`。
2. 设置 `MULTI_DB_ENABLED=true`。
3. （可选）通过 `MULTI_DB_COLD_TABLES` 指定各冷数据表的副库路由；默认 `audit` 与 `verification` 均写入第一个副库。

### 行为约定

- 启用后，**新写入**的审计日志与邮箱验证码直接写入指定副库，主库不再增长。
- **读取采用主库与副库合并查询**：管理面板、分析页与验证码校验会同时查询主库和所有副库并合并结果，主库旧数据与副库新数据均可见。
- 主库已有数据不会被自动迁移或删除；本功能仅阻止主库继续增长，不负责历史数据清理。
- 副库连接或初始化失败时，冷数据写入**自动回退到主库**，注册、改邮箱、审计等主流程不受影响。
- 合并读取对每个副库单独容错：某副库查询失败仅跳过该副库，不阻断整体结果。
- 未配置副库或未启用 `MULTI_DB_ENABLED` 时，所有数据照常写入主库，行为与关闭多库时一致。

### 硬性限制

- 项目最多支持 5 个 Neon 数据库（1 个主库 + 4 个副库）。
- 构建时会校验配置：若配置了第 6 个及以上连接串（如 `DATABASE_URL_6`），构建将失败，以提示超出上限。
- 可路由至副库的仅限无外键关联的 `audit`（审计日志）与 `verification`（邮箱验证码）两张表；包含外键的重要表（用户、工作区、文件、聊天）不会被迁移。
- 若副库与主库位于不同的 Neon 实例，需为副库执行一次 `pnpm db:push:secondary` 以创建 `schema-secondary.prisma` 中的两张表。
