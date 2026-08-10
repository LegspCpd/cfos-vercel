# Cloudflare OS — Vercel Edition

对 Cloudflare OS 的**全栈重写**，适配 Vercel（Next.js 14 + Postgres），去掉了对 Cloudflare Durable Objects / Dynamic Workers / Workers RPC 的依赖。

**注意**：这是一个全新实现，不依赖原仓库的 `cloudflare:` 运行时。它保留并尽量还原了原版功能：

**核心能力：**
- 用户注册/登录（argon2id 密码哈希 + JWT 会话 + GitHub / Google / Microsoft OAuth + 邮箱验证码注册 + 邮箱+密码登录）
- **绑定邮箱**：任意注册方式的用户可在个人设置绑定邮箱并设置密码，之后可用"邮箱 + 密码"直接登录
- **OAuth 首次登录强制完善资料**：通过 GitHub / Google / Microsoft 首次登录的用户，先设置用户名 + 密码 + 人机验证（可选绑定邮箱）才能进入主界面
- **更改邮箱**：个人设置可验证原邮箱 → 验证新邮箱 → 更改绑定邮箱，带人机验证与申诉入口
- **申诉 / 工单系统**：个人设置"点我申诉"，提交反馈/申诉/改邮箱工单（过人机验证），自动邮件通知管理员并带处理链接
- **注销账号**：个人设置可申请注销，验证邮箱 + 人机验证后进入 4–7 天冷静期，到期自动删除（释放邮箱/用户名，可重新注册），冷静期内可取消
- **AppShell 侧边栏布局**：Home / Workspaces / Blueprints / Outputs / Explore / Admin / 工单 / 操作日志 导航
- **Home 首页**：hero + 聊天输入 + 任务建议卡（点卡片自动建 workspace 并让 agent 构建）
- **双语文档站**：`/docs`（简体中文）+ `/en/docs`（English），侧边栏可一键切换；英文文档在根目录 `docs/en/` 便于翻译
- **命令面板 ⌘K**：搜索/跳转 workspace、新建文档
- **主题切换**：light / dark / system 三态
- **Workspace 编辑器**：多文件 + Monaco 代码编辑器 + 文件树 + iframe 预览 + 聊天面板（对话自动持久化）
- **文件历史/版本回滚**：每次修改自动记录，可一键恢复
- **AI Agent**：自然语言构建/修改应用，agent 直接写代码文件（支持 markdown 输出、自动运行）
- **多 AI Provider**：后台动态添加多个 LLM（DeepSeek/OpenAI/本地等）
- **Outputs**：聚合所有 workspace 应用，网格/列表视图 + 搜索
- **Blueprints**：你的应用列表 + 导出/导入 `.gadget.json` + 公开蓝图分享链接（他人免登录查看）
- **Explore**：发现 + 尝试构建的想法
- **收藏工作区**：星标收藏 + 按收藏筛选
- **Profile 设置**：改显示名、改密码
- **邮箱验证码注册**：注册时填邮箱 + 收验证码（Resend 发信），可选用户名
- **人机验证**：Cloudflare Turnstile + Google reCAPTCHA，管理后台开关，默认关；新用户注册强制通过
- **自定义品牌**：管理后台可配置 favicon / logo
- **用户分组与权限**：分组决定功能权限（工作区/AI、文件分享、上下文、外部连接、管理后台、用户管理），管理类功能仅管理组可见
- **用户管理 /admin/users**：新建/删除用户、改密码/邮箱、移动分组
- **操作日志 /admin/audit**：登录（含 IP）、Agent 运行、AI 调用（含 token 用量）审计日志
- **工单管理 /admin/tickets**：查看和处理用户提交的反馈/申诉/改邮箱工单
- **分析页 /analytics**：所有用户可见的个人统计（工作区/文件/今日登录 IP/今日 AI token）；管理员额外看到全站今日登录 IP 分布与 token 用量
- **自定义背景**：配置环境变量后可全站显示背景图，每次刷新重新请求
- **管理后台 /admin**：注册开关、AI Providers、操作日志入口、人机验证、品牌图标
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
| `ALLOW_SIGNUPS` | 是否允许注册，`enabled` / `disabled`（环境变量优先于管理面板开关） | 可选 |
| `NEXT_PUBLIC_COMMENTS_ENABLED` | 右下角公开评论/聊天（Waline），`true` 开启，默认关闭 | 可选 |
| `HOME_URL` | 文档"返回主页"跳转地址（服务端），默认 `https://os.legspcpd.top` | 可选 |
| `NEXT_PUBLIC_HOME_URL` | 同上，供文档前端客户端链接使用（与 `HOME_URL` 保持一致） | 可选 |
| `GITHUB_CLIENT_ID` | GitHub OAuth App 的 Client ID | 用 GitHub 登录则必填 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App 的 Client Secret | 用 GitHub 登录则必填 |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | 用 Google 登录则必填 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | 用 Google 登录则必填 |
| `MICROSOFT_CLIENT_ID` | Microsoft (Entra ID) OAuth Client ID | 用 Microsoft 登录则必填 |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth Client Secret | 用 Microsoft 登录则必填 |
| `MICROSOFT_TENANT_ID` | Microsoft 租户 ID，默认 `common`（多租户） | 可选 |
| `GITLAB_CLIENT_ID` | GitLab OAuth Client ID（外部连接） | 用 GitLab 连接则必填 |
| `GITLAB_CLIENT_SECRET` | GitLab OAuth Client Secret | 用 GitLab 连接则必填 |
| `GITLAB_BASE_URL` | GitLab 实例地址，默认 `https://gitlab.com`（自托管填你的域名） | 可选 |
| `RESEND_API_KEY` | 邮箱验证码发信（Resend） | 启用邮箱注册验证则必填 |
| `RESEND_FROM_EMAIL` | 发件人邮箱，默认 `no-reply@legspcpd.top` | 可选 |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile（配置后管理面板锁定） | 用 Turnstile 则填 |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA（配置后管理面板锁定） | 用 reCAPTCHA 则填 |
| `IMGHOST_BASE_URL` | 头像图床，默认 `https://hub.legspcpd.top` | 用图床则填 |
| `IMGHOST_TOKEN` | 头像图床 API token（如 `imgbed_xxx`） | 用图床则必填 |
| `IMGHOST_FOLDER` | 上传文件夹，默认 `photos/avatars` | 可选 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `DEFAULT_MODEL` | LLM（也可部署后在管理后台配多个 provider） | 推荐 |
| `NEXT_PUBLIC_BEIJIN` | 全站背景图 URL（Vercel 环境变量，客户端可读）；每次刷新都会重新请求该地址并作为背景。也可用 `BEIJIN`（服务端名，客户端需用 `NEXT_PUBLIC_` 前缀），推荐直接用 `NEXT_PUBLIC_BEIJIN` | 可选 |

### 4. Build Command

在 **Settings → General → Build & Development Settings** 把 Build Command 改成：

```
pnpm install && pnpm db:push && pnpm build
```

### 5. Deploy

点 **Deploy**，等 1-3 分钟即可访问。

---

## GitHub 登录配置（详细）

### 回调地址（Callback / Redirect URI）速查

在 GitHub / Google 控制台配置 OAuth 应用时，**回调地址必须与下面完全一致**（把 `os.legspcpd.top` 换成你自己的域名）。

| 服务 | 生产环境（Vercel） | 本地开发 |
|---|---|---|
| **GitHub** | `https://os.legspcpd.top/api/auth/github/callback` | `http://localhost:3000/api/auth/github/callback` |
| **Google** | `https://os.legspcpd.top/api/auth/google/callback` | `http://localhost:3000/api/auth/google/callback` |

> `PUBLIC_SITE_URL` 环境变量必须与回调里的域名一致（如 `https://os.legspcpd.top`）。

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

## Google 登录配置（可选）

代码已内置 Google OAuth。只需在 **Google Cloud Console** 创建一个 OAuth Client，然后填两个环境变量即可：

1. 打开 **https://console.cloud.google.com** → 选择或新建项目
2. 左侧 **APIs & Services → OAuth consent screen** → 填应用名称并保存
3. **Credentials → Create Credentials → OAuth client ID** → 类型选 **Web application**
   - **Authorized redirect URIs**：`https://os.legspcpd.top/api/auth/google/callback`（**必须精确到这个路径**）
   - （本地测试：`http://localhost:3000/api/auth/google/callback`）
4. 复制 **Client ID** 和 **Client Secret**，填到 Vercel 环境变量：

```
GOOGLE_CLIENT_ID=你的Client ID
GOOGLE_CLIENT_SECRET=你的Client Secret
PUBLIC_SITE_URL=https://os.legspcpd.top
```

**Redeploy** 后，登录页会出现"使用 Google 登录"按钮。

> Google 登录用邮箱前缀作为用户名；若该用户名已存在（比如之前用密码/GitHub注册过），会自动关联到现有账号，不会重复创建。

## Microsoft 登录配置（可选）

用 **Microsoft Entra ID（Azure AD）** 账号登录：

1. 打开 **https://portal.azure.com** → **App registrations** → **New registration**
   - Name：`Cloudflare OS`
   - **Redirect URI**：平台选 **Web**，URI 填 `https://os.legspcpd.top/api/auth/microsoft/callback`（本地：`http://localhost:3000/api/auth/microsoft/callback`）
2. 注册后，复制 **Application (client) ID** → 即 `MICROSOFT_CLIENT_ID`
3. 左侧 **Certificates & secrets** → **New client secret** → 复制值 → 即 `MICROSOFT_CLIENT_SECRET`
4. 填到 Vercel 环境变量：

```
MICROSOFT_CLIENT_ID=你的Client ID
MICROSOFT_CLIENT_SECRET=你的Client Secret
MICROSOFT_TENANT_ID=common      # common = 任何 Entra ID 租户 + 个人 Microsoft 帐户（推荐）
```

**Redeploy** 后，登录页出现"使用 Microsoft 登录"按钮。

> 回调地址需与控制台注册完全一致，否则报 `redirect_uri_mismatch`。个人 Microsoft 账号（Outlook/消费者）用 `common` 租户。

## GitLab 外部连接（可选）

在 **外部连接** 页连接 GitLab，agent 可代表你访问 GitLab 项目。

1. 打开 **https://gitlab.com/-/profile/applications**（自托管 GitLab：`https://你的域名/-/profile/applications`）
2. **Name**：`Cloudflare OS`；**Redirect URI** 填 `https://os.legspcpd.top/api/gitlab/callback`
3. **Scopes** 勾选：`read_api`、`read_user`
4. 创建后复制 **Application ID** 和 **Secret**，填到 Vercel 环境变量：

```
GITLAB_CLIENT_ID=你的Application ID
GITLAB_CLIENT_SECRET=你的Secret
GITLAB_BASE_URL=https://gitlab.com     # 自托管填你的 GitLab 域名
```

**Redeploy** 后，外部连接页即可连接 GitLab。

## 邮箱验证码注册（可选）

注册时用户可以填邮箱并获取验证码。用 **Resend** 发信。

1. 去 [Resend](https://resend.com) 注册并创建一个 API Key
2. 在 Resend 验证你的发件域名（`legspcpd.top`），或用默认的 `onboarding@resend.dev` 测试
3. 在 Vercel 环境变量填：

```
RESEND_API_KEY=re_xxxxxx
RESEND_FROM_EMAIL=no-reply@legspcpd.top   # 可选，需在 Resend 已验证该域名
```

Redeploy 后，注册页出现"邮箱 + 验证码"输入框。验证码 6 位、10 分钟有效，存为哈希。

> 若未配置 `RESEND_API_KEY`，邮箱验证功能会提示"邮件服务未配置"，不强制使用。

### 排查：发送验证码返回 500

如果点"发送验证码"报错，**最常见原因 = 发件域名未在 Resend 验证**：

1. 登录 https://resend.com → 左侧 **Domains**
2. 看你的发件域名（如 `legspcpd.top`）是否已添加并**验证通过**（绿色勾）
3. 没验证就：**Add Domain** → 按提示把 **SPF / DKIM** DNS 记录加到你的域名解析 → 等待验证通过（通常几分钟）
4. 验证通过后，`no-reply@legspcpd.top` 才能作为发件人

**临时快速测试**：把 `RESEND_FROM_EMAIL` 改成 Resend 的免费测试发件人 `onboarding@resend.dev`（无需验证域名），Redeploy 后再试。如果能收到邮件，就说明是域名验证问题，把 `legspcpd.top` 验证好再改回即可。

> 若仍报错，前端会显示 Resend 返回的具体错误（如 "Invalid `from` email"），照提示处理即可。

## 注册开关

**默认关闭注册**（防止恶意注册）。新用户注册时会检查开关，关闭则提示"Public signups are currently disabled"。

两种开启方式（**环境变量优先**）：
- **环境变量**：`ALLOW_SIGNUPS=enabled` 强制开启，`disabled` 强制关闭
- **管理后台**：`/admin` → 站点设置 → **注册开关** 勾选（仅当环境变量未设置 `ALLOW_SIGNUPS` 时生效）

## 用户分组与权限

系统用**用户分组**控制每个用户能用的功能。**分组完全决定权限**——用户移入哪个分组，就获得该分组的全部功能权限。

### 功能权限项（新建分组时勾选）
| 权限 | 作用 |
|---|---|
| `workspace.create` | 工作区 & AI agent（创建/编辑/删除工作区） |
| `file.share` | 文件分享 / 蓝图（R2 分享、导出导入） |
| `context.manage` | 上下文文档库（上传/编辑参考文档） |
| `connections.manage` | 外部连接（GitHub/Google/GitLab） |
| `admin.access` | **管理后台访问**（管理类） |
| `admin.users` | **用户管理**（管理类，需同时有 admin.access） |

### 管理类功能
`admin.access` 和 `admin.users` 属于**管理类**权限——只有被分到"超级管理员"或勾了这些权限的分组的用户，才能看到**管理后台**和**用户管理**入口。普通用户看不到。

### 内置分组
- **超级管理员**（`__super_admin__`）：拥有全部权限（含管理后台、用户管理）
- **普通用户**（`__default__`）：只有 `workspace.create`（工作区 & AI）

> 第一个注册的用户自动进入"超级管理员"分组；`ADMIN_USERNAME` 里指定的用户名也会进超级管理员分组。

### 在哪里管理
- **用户管理** `/admin/users`：新建/删除用户、修改密码/邮箱、把用户移动到某个分组
- 只有具备 `admin.users` 权限的用户能看到这个入口

### 示例
- 建一个"运营"分组，只勾选"文件分享/蓝图"→ 把用户 A 移入 → A 只能分享文件，看不到管理后台和用户管理
- 建一个"管理员"分组，勾选"管理后台访问"+"用户管理"→ 该组用户可管理后台和用户

## 公开评论 / 聊天（可选，默认关闭）

右下角有一个浮动聊天按钮，点开是一个**公开评论区**（Waline），所有登录用户可见、可发言，实时更新。

> **默认关闭**（该功能还在 beta 测试，可能不稳定）。需要时在 Vercel 环境变量开启：
> ```
> NEXT_PUBLIC_COMMENTS_ENABLED=true
> ```
> 设为 `true` 后 **Redeploy**，右下角会出现聊天按钮。不设置或设为其他值则保持关闭（按钮不显示）。
>
> 评论服务地址：`https://chat.api.legspcpd.top`（Waline 服务端，需已部署）。

## 头像图床（可选）

用户可在个人设置上传头像。上传会代理到你的图床（默认 **Linya ImgHub**，`hub.legspcpd.top`），token 存环境变量（不暴露给前端）。

```
IMGHOST_BASE_URL=https://hub.legspcpd.top
IMGHOST_TOKEN=imgbed_xxx            # 你的图床 API token
IMGHOST_FOLDER=photos/avatars       # 可选，上传文件夹
```

> 若未配置 `IMGHOST_TOKEN`，头像上传会提示"图床未配置"。

## 人机验证（Cloudflare Turnstile + Google reCAPTCHA，可选）

**默认关闭。** 新用户注册时必须通过人机验证（防机器人灌注册）。

**两种配置方式（环境变量优先级更高）：**

**方式一：环境变量（推荐，安全，管理面板无法修改）**
在 Vercel 环境变量填：
```
TURNSTILE_SITE_KEY=xxx
TURNSTILE_SECRET_KEY=xxx        # Cloudflare Turnstile
RECAPTCHA_SITE_KEY=xxx
RECAPTCHA_SECRET_KEY=xxx        # Google reCAPTCHA
```
> 某个提供者一旦配置了环境变量，管理面板中该提供者会被**锁定为不可修改**（防止密钥被泄露或篡改）。

**方式二：管理后台配置（补充）**
在管理后台 `/admin` → 站点设置 → **人机验证** 填写密钥（仅当该提供者未配置环境变量时可编辑）。

**规则：**
- 填了哪个就启用哪个
- **两个都填则随机加载其中一个**
- 若一个用环境变量、另一个用管理面板配置，两者独立生效；环境变量配的那个在面板中锁定

**触发时机（配了人机验证后才生效）：**
- **注册页**：打开 `/signup` 就显示人机验证，无需点注册
- **OAuth 登录**（GitHub / Google）：登录成功后先进入 `/verify` 中间页，完成人机验证才进入主界面（防批量 OAuth 账号刷资源）
- **普通密码登录**：不要求人机验证

获取密钥：
- Turnstile：https://dash.cloudflare.com → Turnstile → Add site
- reCAPTCHA：https://www.google.com/recaptcha/admin → 创建 v2 复选框

## 自定义品牌图标（可选）

管理后台 `/admin` → 站点设置 → **品牌与图标**：

- **Favicon URL**：浏览器标签页图标（可填 .ico / .svg / .png）
- **Logo URL**：登录/注册页和侧边栏的 Logo

填了即生效（Redeploy 后 favicon 在标签页生效，Logo 实时生效）。

## 自定义网站背景（可选）

默认没有任何背景。在 Vercel 环境变量添加一个**背景图片 URL** 即可全站显示：

```
NEXT_PUBLIC_BEIJIN=https://你的图床或CDN地址/背景图.jpg
```

- 变量名必须是 `NEXT_PUBLIC_BEIJIN`（带 `NEXT_PUBLIC_` 前缀，客户端组件才能读取）。也可同时设置 `BEIJIN`，但客户端读取以 `NEXT_PUBLIC_` 为准。
- 值填一张图片的 URL（`BEIJIN` 意为"背景"，可填任何远程图片地址）。
- 每次**刷新页面都会重新请求**该 URL（自动追加时间戳防缓存），因此背景图可动态变化。
- 应用到**所有界面**（登录、工作区、文档等），作为整页背景。

> 未配置时无背景，保持纯色。若想换图，改环境变量 Redeploy 即可。

## OAuth 首次登录强制完善资料

通过 **GitHub / Google / Microsoft** 首次登录创建的新账号，会先进入 `/profile/complete` 完善资料：

1. **设置用户名**（必填，预填第三方用户名，可修改）
2. **设置密码**（必填，之后可用"邮箱+密码"登录）
3. **人机验证**（配置了 Turnstile/reCAPTCHA 时强制）
4. **绑定邮箱**（可选，绑了才能用"更改邮箱"和"注销账号"）

未完善的账号无法进入主界面（服务端 + 客户端双重拦截），完善后自动进入工作区。**已有账号不受影响**（`profileComplete=true`）。

## 更改邮箱与申诉

在**个人设置 → 邮箱**板块：

- 账号已有邮箱时，点 **"更改邮箱"**，按两步验证完成更改：
  1. 输入原邮箱 → 发验证码到原邮箱 → 填验证码（验证所有权）
  2. 输入新邮箱 → 发验证码 → 填验证码
  3. 加上人机验证 → 提交后更改成功
- 底部有 **"点我申诉"** 按钮，弹窗显示管理员邮箱 + 提交工单表单（反馈 / 申诉 / 更改邮箱 / 其他），需过人机验证。

## 申诉 / 工单系统

- 用户在**个人设置**或遇到问题时提交**工单**（`反馈` / `申诉` / `更改邮箱` / `其他`），提交需**过人机验证**，系统记录**提交人和 IP**。
- 提交后自动发**邮件给所有管理员**，邮件内含工单内容 + 提交人 + IP，并有一个 **"点击前往处理"** 按钮，点击直接打开管理后台的工单面板并定位到该工单。
- 管理员在左侧菜单 **"工单"**（`/admin/tickets`，需 `tickets.manage` 权限）查看所有工单，可按状态筛选、查看详情、**修改状态**（待处理/处理中/已关闭）并**回复**用户。

## 注销账号

在**个人设置 → 注销账号**：

- **有绑定邮箱**：填绑定邮箱 → 发验证码 → 填验证码 + **人机验证** → 提交
- **没有绑定邮箱**（纯 OAuth 账号）：点击注销 → 跳转你已绑定的**第三方登录**（微软 / 谷歌 / GitHub）再验证一次身份 → 返回后完成**人机验证** → 提交
- 提交后账号进入 **4–7 天冷静期**（默认 5 天），期间可随时**取消注销**
- 冷静期结束后，系统自动**永久删除**账号及所有数据（工作区、聊天、分享、收藏、工单、OAuth 连接等），**邮箱和用户名释放，可重新注册**

> 无邮箱账号的 OAuth 身份验证在回调里校验"该第三方身份必须属于当前账号"（`microsoftId`/`googleId`/`githubId` 匹配），确认状态 10 分钟内有效，之后需重新认证。

> 删除采用**惰性删除**：账号到期后，下次登录或访问时触发真正删除（无需 cron）。冷静期可在 `src/lib/account-deletion.ts` 的 `DELETE_COOLDOWN_MS` 调整（默认 5 天）。

## 操作日志（审计日志）

左侧菜单 **"操作日志"**（`/admin/audit`，需 `admin.access` 权限），集中展示所有日志：

- **登录**：每次登录记录时间、用户、**IP 地址**（含失败尝试）
- **Agent 运行**：工作区上的 Agent 操作
- **AI 调用**：每次 AI 调用，并记录 **token 用量**

> 原位于管理后台的审计日志已移到独立页 `/admin/audit`，管理后台改为入口链接。管理员如需更细的登录 IP / token 分析，可看 `/analytics` 页（管理员额外显示全站今日概览）。

## 分析页（/analytics）

**所有登录用户**可见，展示：
- 个人统计卡片：工作区数、文件数、**今日登录次数**、**今日 AI 调用次数**、**今日 Token 用量**
- **今日登录记录**：你今天登录用的 IP 地址 + 时间

**管理员**额外看到**全站今日概览**：
- 今日登录总次数、活跃用户数、AI 调用数、Token 总量
- **今日登录 IP 分布**（Top 10，条形图展示）

> 数据来源：`/api/analytics`。登录 IP 在登录时写入审计日志；AI token 用量在 agent 每次调用 LLM 时记录。

## Cloudflare Access（完整版 SSO 门禁）

> 📖 **完整配置教程见 [`docs/CLOUDFLARE_ACCESS_SETUP.md`](docs/CLOUDFLARE_ACCESS_SETUP.md)**（含截图级分步操作、排查、回滚）。

Cloudflare Access 在你的站点前面加一道 SSO 认证。用户必须先通过你配置的 IdP（GitHub/Google/邮箱等）登录，才能访问。后端 API 会校验 Cloudflare 注入的 JWT。

> 前提：**你的域名必须走 Cloudflare 代理（orange cloud）**。如果域名在 CF 里是灰云（仅 DNS），CF 不会注入 JWT，Access 不生效。

### 第 1 步：确认域名走 CF 代理

1. 登录 **Cloudflare 控制台** → 选择你的域名 `legspcpd.top`
2. 左侧 **DNS → Records**，找到 `os` 这条记录
3. 确保 **Proxy status** 是 **Proxied（橙云）**，不是 DNS only（灰云）
4. 如果不是，点它切换为 Proxied，等 1-2 分钟生效

### 第 2 步：在 Cloudflare 创建 Access 应用

1. 打开 **https://one.dash.cloudflare.com** → 左侧 **Networks → Access → Applications**（或 **Access → Applications**）
2. 点 **Add an application** → 选 **Self-hosted**
3. 填写：
   - **Application domain**：`os.legspcpd.top`（你的实际域名，自定义域名才能被 Access 保护）
   - 其他保持默认，点 **Next**
4. 在身份提供程序步骤勾选 **GitHub**（或你用的 IdP），点 **Next**
5. 在 **Policy** 步骤：
   - 给策略起名（如 `allow-all`）
   - 点 **Add** → 选 **Everyone**（允许所有人，但要登录）→ 或选择特定邮箱/组
   - 点 **Next** → 点 **Add application**

### 第 3 步：配置 Vercel 环境变量

在 Vercel 项目 Settings → Environment Variables 添加（**只配第一个必填即可**）：

| Key | 值 |
|---|---|
| `CF_ACCESS_TEAM` | 你的 **Zero Trust 团队名**（必填）。看 Access 域名：如果你 Access 的地址是 `https://lapdsss.cloudflareaccess.com`，团队名就是 `lapdsss` |
| `CF_ACCESS_AUD` | AUD Tag（**可选**，新版面板不好找，可跳过。不填时后端只校验签名 + issuer，已足够安全） |

### 第 4 步：重新部署

Redeploy 后生效。现在：
- 访问 `https://os.legspcpd.top` → 未登录会被 CF 重定向到登录页 → 通过后进入你的应用
- 敏感 API（agent 运行、文件分享上传、GitHub 工具）会额外校验 CF JWT

### 管理后台查看状态

登录管理员账号 → `/admin` → **Cloudflare Access** 区块，可看到是否启用、Team、AUD 配置情况。

### 常见问题

| 现象 | 原因 |
|---|---|
| 访问不跳登录，直接进 | 域名没走 CF 代理（橙云），或 `CF_ACCESS_TEAM` 没配 |
| 502 / 502 Bad Gateway | 域名走了 CF 代理但没配 Access 应用，或 Vercel 源站异常 |
| 进入后 API 报 401 | 敏感 API 校验 CF JWT 失败（多为 AUD 配错或 JWT 过期） |

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
