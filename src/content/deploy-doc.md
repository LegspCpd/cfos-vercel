# Cloudflare OS 部署与使用指南

> 这是一份**面向小白的完整指南**。照着做，你就能把 Cloudflare OS（Vercel 版）部署到公网，并配置好所有可选功能。

---

## 目录

1. [这是什么](#这是什么)
2. [技术栈与架构](#技术栈与架构)
3. [准备工作](#准备工作)
4. [第一步：创建数据库](#第一步创建数据库)
5. [第二步：部署到 Vercel](#第二步部署到-vercel)
6. [第三步：配置管理员](#第三步配置管理员)
7. [第四步：配置 AI（DeepSeek 等）](#第四步配置-aideepseek-等)
8. [第五步：GitHub 登录（可选）](#第五步github-登录可选)
9. [第六步：文件分享 + R2（可选）](#第六步文件分享--r2可选)
10. [第七步：Cloudflare Access（可选）](#第七步cloudflare-access可选)
11. [使用说明](#使用说明)
12. [常见问题与排错](#常见问题与排错)
13. [环境变量速查表](#环境变量速查表)

---

## 这是什么

Cloudflare OS 是一个 **AI 编程工作区**：用自然语言让 AI agent 帮你构建网页应用，实时预览，还能分享文件、连接外部服务。

本版本是**重构到 Vercel 的版本**，使用 Next.js + Postgres，不需要 Cloudflare 付费计划，可以免费自托管。

### 功能一览

- 🖥️ 用户注册/登录（密码 + GitHub 登录）
- 📝 多文件代码编辑器（Monaco，和 VS Code 同款）
- 🤖 AI Agent：用自然语言构建/修改应用
- 👁️ 实时预览（iframe）
- 📁 文件分享（Cloudflare R2，带有效期）
- 🔗 外部连接（GitHub）
- 📚 上下文文档库（agent 参考）
- 🛡️ 管理后台（用户/设置/AI/审计）
- 📊 操作审计日志
- 🔐 Cloudflare Access SSO 门禁

---

## 技术栈与架构

| 层 | 技术 |
|---|---|
| 前端 | React + Next.js 14（App Router）+ Tailwind |
| 后端 | Next.js API Routes（Serverless） |
| 数据库 | Postgres（Neon 免费版） |
| 存储（分享） | Cloudflare R2（S3 兼容） |
| 认证 | 密码（scrypt）+ JWT + GitHub OAuth |
| AI | OpenAI 兼容接口（支持 DeepSeek/OpenAI/本地等） |

---

## 准备工作

你需要准备以下东西：

| 需要 | 说明 | 是否免费 |
|---|---|---|
| 一个 GitHub 账号 | 用于托管代码、Vercel 授权 | ✅ |
| Neon 账号 | 免费的 Postgres 数据库 | ✅ |
| Vercel 账号 | 部署平台 | ✅ |
| （可选）Cloudflare 账号 | 用于 R2 存储、Cloudflare Access | ✅ |
| （可选）AI 的 API Key | DeepSeek / OpenAI 等 | 💰 少量 |

---

## 第一步：创建数据库

我们用 **Neon**（免费 Postgres）：

1. 打开 **https://neon.tech**，用邮箱或 GitHub 注册登录
2. 点 **"Create a project"**
3. **Project name**：随便填，如 `cfos`
4. **Region**：选离你近的（如 Singapore / Singapore）
5. 点 **Create Project**
6. 创建完成后，页面会给你一个**连接串（Connection string）**，长这样：

   ```
   postgresql://neondb_owner:你的密码@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

7. **复制保存**这个连接串，它就是 `DATABASE_URL`。

> 🔑 这个连接串包含数据库密码，**不要泄露给别人**。如果泄露了，可以在 Neon 控制台重置密码。

---

## 第二步：部署到 Vercel

### 2.1 把代码推送到 GitHub

代码需要先在一个 GitHub 仓库里。如果你还没有：

1. 在本地把项目代码 push 到 GitHub（用 `git init` + `gh repo create`）
2. 或者从模板仓库 fork

### 2.2 在 Vercel 导入

1. 打开 **https://vercel.com**，用 GitHub 登录
2. 点右上角 **"Add New" → "Project"**
3. 找到你的仓库，点 **Import**
4. Vercel 会自动识别为 **Next.js** 项目

### 2.3 关键配置（重点！）

在导入的配置页面，**一定要改这 3 个**：

| 配置项 | 填什么 |
|---|---|
| **Framework** | Next.js（自动识别） |
| **Build Command** | `pnpm install && pnpm db:push && pnpm build` |
| **Output Directory** | 留空（Next.js 会自动处理） |

> ⚠️ **Build Command 一定要改成上面那个**，否则数据库表不会自动创建，登录会报 500。

### 2.4 配置环境变量

在导入页面底部（或 Settings → Environment Variables）添加：

| Key | 值 |
|---|---|
| `DATABASE_URL` | 第一步 Neon 的连接串 |
| `AUTH_SECRET` | 随机长字符串（见下方生成方法） |
| `ADMIN_USERNAME` | 管理员用户名（可多个，用逗号分隔，如 `admin`） |

**生成 `AUTH_SECRET`**：在电脑终端（PowerShell/CMD）运行：

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

把输出的那串复制粘贴到 `AUTH_SECRET`。

### 2.5 绑定域名（推荐）

1. Vercel 项目 → **Settings → Domains**
2. 输入你的域名 `os.your-domain.com` → 点 **Add**
3. Vercel 会给一条 DNS 记录，类似：
   ```
   CNAME  os  →  cname.vercel-dns.com
   ```
4. 去你的域名 DNS 服务商加这条 CNAME 记录
5. 等生效（几分钟到几小时），域名就能访问了

### 2.6 部署

点 **Deploy**，等 1-3 分钟。完成后会给你一个 `xxx.vercel.app` 地址，你的域名也能访问。

---

## 第三步：配置管理员

系统默认**第一个注册的用户自动成为管理员**。推荐这样设置：

**方法 A（推荐）：用 `ADMIN_USERNAME` 指定**
- 在 Vercel 环境变量设 `ADMIN_USERNAME=你的用户名`（可多个，逗号分隔）
- 该用户名注册后自动成为管理员

**方法 B：让第一个注册的成为管理员**
- 部署后，先访问 `/signup` 注册**第一个账号** → 它自动是管理员

**管理员能做什么**：进 `/admin` 管理用户、站点设置、AI 提供方、查看审计日志等。

---

## 第四步：配置 AI（DeepSeek 等）

### 方式 A：环境变量（简单）

在 Vercel 环境变量添加：

| Key | 值 |
|---|---|
| `OPENAI_API_KEY` | 你的 DeepSeek API Key（`sk-...`） |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1`（DeepSeek） |
| `DEFAULT_MODEL` | `deepseek-chat` |

> ⚠️ **`OPENAI_BASE_URL` 必须配**，否则默认连 OpenAI 官方，你的 `sk-` key 会报 401。

### 方式 B：管理后台添加（推荐，可多个）

部署后，用管理员登录 → `/admin` → **AI Providers** → 添加多个 provider（名称/Base URL/API Key/模型），随时切换。

**DeepSeek 配置示例：**
```
名称: DeepSeek
Base URL: https://api.deepseek.com/v1
API Key: sk-你的key
模型: deepseek-chat
```

---

## 第五步：GitHub 登录（可选）

### 5.1 创建 GitHub OAuth App

1. 打开 **https://github.com/settings/developers**
2. 点 **"New OAuth App"**
3. 填写：
   - **Application name**：`Cloudflare OS`
   - **Homepage URL**：`https://os.your-domain.com`（你的域名）
   - **Authorization callback URL**：`https://os.your-domain.com/api/auth/github/callback`
4. 点 **Register application**

### 5.2 拿到 Client ID 和 Secret

- **Client ID**：在应用详情页直接复制
- **Client secret**：点 **"Generate a new client secret"** → 生成后**立即复制**（只显示一次）

### 5.3 配置到 Vercel

添加环境变量：
```
GITHUB_CLIENT_ID=你的Client ID
GITHUB_CLIENT_SECRET=你的Client Secret
PUBLIC_SITE_URL=https://os.your-domain.com
```

Redeploy 后生效。现在登录页有"使用 GitHub 登录"按钮。

---

## 第六步：文件分享 + R2（可选）

文件分享上传到 **Cloudflare R2**，下载走 R2 直链，**不消耗 Vercel 流量**。

### 6.1 创建 R2 存储桶

1. 登录 **Cloudflare 控制台** → 左侧 **R2**
2. 点 **Create bucket** → 起名（如 `cfos-files`）→ 创建
3. 记下**桶名**

### 6.2 创建 R2 API 令牌

1. 在 R2 页面右上角点 **"Manage R2 API Tokens"**
2. 点 **Create API token**
3. 权限选 **Object Read & Write**
4. 创建后拿到：
   - **Access Key ID**
   - **Secret Access Key**（只显示一次，立即复制）

### 6.3 找 Account ID

1. Cloudflare 控制台右上角或右侧栏能看到 **Account ID**
2. 复制它

### 6.4 配置到 Vercel

添加环境变量：
```
R2_ACCOUNT_ID=你的Account ID
R2_ACCESS_KEY_ID=你的Access Key ID
R2_SECRET_ACCESS_KEY=你的Secret Access Key
R2_BUCKET=你的桶名
```

Redeploy 后生效。侧边栏"文件分享"就能用了。

---

## 第七步：Cloudflare Access（可选）

> 📖 **详细教程见 [Cloudflare Access 配置](https://os.your-domain.com/docs/cf-access)**（如已部署本文档站）。

简短版：

1. 域名 `os.your-domain.com` 在 Cloudflare DNS 里设为 **Proxied（橙云）**
2. 打开 **https://one.dash.cloudflare.com** → 左侧 **Networks → Access → Applications**（或 **Access → Applications**）→ 新建 **Self-hosted** 应用，域名填 `os.your-domain.com`
3. 向导里勾选身份提供程序（如 GitHub），再配置登录策略（Everyone / 指定邮箱）
4. 找到你的 **team name**（Access 域名 `xxx.cloudflareaccess.com` 的前段，如 `lapdsss`）——**这是必填项**
5. Vercel 环境变量加（**只配这一个即可**）：
   ```
   CF_ACCESS_TEAM=lapdsss
   ```
   （可选增强项 `CF_ACCESS_AUD` 是 AUD Tag，新版面板不好找，**可跳过不填**，不影响使用）
6. Redeploy

启用后，访问站点先要 CF 登录，敏感 API 也会校验 JWT。

---

## 使用说明

### 首次登录

1. 访问你的域名
2. 点 **"使用 GitHub 登录"** 或注册账号
3. 第一个账号是管理员（或 `ADMIN_USERNAME` 指定的）

### 构建第一个应用

1. 首页输入框输入："帮我做一个计算器"
2. 回车，自动创建 workspace 并让 agent 构建
3. 在编辑器里查看代码，右侧实时预览
4. 继续和 agent 对话修改

### 管理后台

用管理员登录后，左侧点 **Admin**：
- 📊 看统计数据
- ⚙️ 改站点名称/标语/公告横幅
- 👥 管理用户
- 🧠 配置 AI Provider
- 📋 看审计日志

---

## 常见问题与排错

| 问题 | 原因 | 解决 |
|---|---|---|
| 登录报 **500** | Build Command 没改 / 数据库表没建 | 确认 Build Command 是 `pnpm install && pnpm db:push && pnpm build` |
| 登录提示"无效用户名或密码" | 密码格式不匹配（旧 argon2 / 新 scrypt） | 用 GitHub 登录，或重置密码 |
| agent 报"未配置 AI" | 没配 provider | 后台添加 AI Provider 或配 `OPENAI_API_KEY` |
| 文件分享报"R2 未配置" | 没配 R2 变量 | 见第六步 |
| GitHub 登录报 `redirect_uri_mismatch` | 回调地址不一致 | 检查 `PUBLIC_SITE_URL` 和 GitHub 回调是否一致 |
| 域名打不开 | DNS 没生效 | 检查 CNAME 记录，等生效 |
| CF Access 相关 | — | 见第七步 / 详细文档 |

---

## 环境变量速查表

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres 连接串 |
| `AUTH_SECRET` | ✅ | 会话签名密钥 |
| `ADMIN_USERNAME` | 推荐 | 管理员用户名（逗号分隔） |
| `PUBLIC_SITE_URL` | GitHub 登录时 | 你的公网地址 |
| `OPENAI_API_KEY` | AI 功能 | LLM API Key |
| `OPENAI_BASE_URL` | 非 OpenAI | LLM 端点，如 DeepSeek |
| `DEFAULT_MODEL` | 可选 | 默认模型 |
| `GITHUB_CLIENT_ID` | GitHub 登录 | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | GitHub 登录 | GitHub OAuth |
| `R2_ACCOUNT_ID` | 文件分享 | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | 文件分享 | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | 文件分享 | Cloudflare R2 |
| `R2_BUCKET` | 文件分享 | Cloudflare R2 |
| `CF_ACCESS_TEAM` | CF Access | Cloudflare 团队名（必填） |
| `CF_ACCESS_AUD` | CF Access | Cloudflare AUD Tag（可选） |
| `CRON_SECRET` | 可选 | 清理 cron 保护 |
