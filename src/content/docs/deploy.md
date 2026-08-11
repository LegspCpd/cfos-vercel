# 部署教程

> 从零开始，把 Cloudflare OS 部署上线。下面每一步都写了**命令在哪敲、填什么、填成什么样**，照着做就能跑起来。
>
> 完整的环境变量清单见 [环境变量速查表](/docs/env)；数据库备份建议见 [数据库备份](/docs/backup)。

## 0. 你需要准备什么

| 需要 | 说明 | 免费 |
|---|---|---|
| **GitHub 账号** | 托管代码、Vercel 授权导入 | ✅ |
| **Neon 账号** | 免费 Postgres 数据库 | ✅ |
| **Vercel 账号** | 部署平台（用 GitHub 登录） | ✅ |
| **一个域名**（可选） | 绑定到部署，建议用 | 需购买 |
| **AI API Key**（可选） | DeepSeek / OpenAI 等，做 AI 功能 | ❌ 付费 |

> **最小可用只需要 3 样**：GitHub + Neon + Vercel，都能免费。配好 `DATABASE_URL` 和 `AUTH_SECRET` 就能登录，只是没有 AI 和文件分享。

---

## 第一步：创建数据库（Neon）

数据库的 `DATABASE_URL` 是**必填项**，没有它应用跑不起来。

1. 打开 **https://neon.tech**，注册并登录
2. 点 **Create a project**（创建项目）
3. 项目名随便填（如 `cfos`），区域建议选 **Singapore**（离国内近，延迟低）
4. 创建后，Neon 会给一条**连接串**，类似：
   ```
   postgresql://neondb_owner:你的密码@ep-xxxx-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
5. 点连接串旁的 **复制按钮**，把它**保存到记事本**——后面配环境变量要用

> ⚠️ **这条连接串含数据库密码，千万不要发到网上 / 提交到 git**。泄露了就去 Neon 控制台 **Reset password** 重置。
>
> 💡 **别忘了备份**：数据库是应用唯一的持久化存储。上线前建议用 Neon 的**分支（Branch）/ 时间点恢复（PITR）**做备份，见 [数据库备份](/docs/backup)。

---

## 第二步：把代码推送到 GitHub

Vercel 需要从 GitHub 导入仓库，所以先把代码推到 GitHub。

**在本地终端里依次执行**（`Git Bash` / `PowerShell` 都行，命令一样）：

```bash
# 1. 进入项目目录
cd 你的项目路径

# 2. 初始化 git 仓库（如果还没 .git）
git init
git add .
git commit -m "init"

# 3. 创建一个远程 GitHub 仓库并关联
#    如果没有安装 gh 命令行，就去 github.com 手动建一个空仓库，然后：
#    git remote add origin https://github.com/你的用户名/你的仓库名.git
gh repo create 你的仓库名 --public --source=. --push
```

> 仓库公开/私有都行。**私有**更安全（避免连接串泄露），但注意 `.env` 和 `.env.local` 已被 `.gitignore` 忽略，不会上传。

---

## 第三步：在 Vercel 导入并部署

### 3.1 导入项目

1. 打开 **https://vercel.com**，用 GitHub 登录
2. 点 **Add New → Project**
3. 在列表里找到你的仓库，点 **Import**
4. Vercel 会自动识别为 **Next.js**（Framework 显示 Next.js 就是对的）

### 3.2 设置 Build Command（关键！）

**这是最容易漏的一步。** 在 Import 页面往下找 **Build and Output Settings**，把 **Build Command** 填成：

```
pnpm install && pnpm db:push && pnpm build
```

> ⚠️ **必须填这个**。`db:push` 会**自动创建数据库表**。如果漏填，Vercel 默认只跑 `next build`，表不会被创建，**登录会报 500**。

### 3.3 配置环境变量

还是在 Import 页面，找到 **Environment Variables** 区域，逐个添加：

| Key | 填什么（示例） | 必填 |
|---|---|---|
| `DATABASE_URL` | 第一步复制的 Neon 连接串 | ✅ |
| `AUTH_SECRET` | 用下面命令生成的随机串 | ✅ |
| `PUBLIC_SITE_URL` | `https://你的域名`（或 Vercel 给你的域名） | 登录时 |
| `ADMIN_USERNAME` | 你的用户名，如 `admin` | 推荐 |
| `OPENAI_API_KEY` | DeepSeek 的 `sk-...` | AI 功能 |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1` | AI 功能 |
| `DEFAULT_MODEL` | `deepseek-chat` | AI 功能 |

**生成 `AUTH_SECRET`**（在本地终端敲）：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

把输出的一长串（约 44 字符）填到 `AUTH_SECRET` 里。

> 想本地先跑起来，这些环境变量要先写进本地 `.env` 文件，见文末「本地开发」。
>
> **其他可选变量**（GitHub/Google OAuth 登录、R2 文件分享、邮箱验证码、Cloudflare Access、人机验证等）见 [环境变量速查表](/docs/env)。**不配也能用**，只是对应功能关闭。

### 3.4 点击 Deploy

点 **Deploy** 按钮，等 1–3 分钟。首次会安装依赖（`ssh2`、`sharp` 等需要编译，稍慢）。

**部署完成后：**
- Vercel 会给一个域名，形如 `https://你的项目名.vercel.app`
- 如果配了 `PUBLIC_SITE_URL`，先用这个 Vercel 域名访问确认能登录

---

## 第四步：绑定自己的域名（推荐）

1. Vercel 项目 → **Settings → Domains** → 输入你的域名（如 `os.example.com`）→ **Add**
2. 页面会显示一条 **CNAME 记录**，形如：
   ```
   os.example.com  →  cname.vercel-dns.com
   ```
3. 去你的域名 DNS 服务商（阿里云/腾讯云/Cloudflare 等），**添加一条 CNAME**：主机名填 `os`，值填 `cname.vercel-dns.com`
4. 等 DNS 生效（几分钟到几小时），Vercel 会自动签发 HTTPS 证书

> 配好域名后，记得把环境变量 `PUBLIC_SITE_URL` 改成 `https://os.example.com` 并 **Redeploy**。

---

## 第五步：登录并配置管理员

1. 打开你的站点，**注册一个账号**
2. **第一个注册的用户自动成为管理员**（如果你没配 `ADMIN_USERNAME`）
3. 进 `/admin` 管理一切：
   - **AI Providers**：添加多个 LLM（DeepSeek / OpenAI / 本地）
   - **用户管理**、**站点设置**、**审计日志** 等

---

## 常见问题排查

| 现象 | 原因 | 解决 |
|---|---|---|
| **登录 / 注册报 500** | 数据库表没建 | 确认 Build Command 含 `pnpm db:push`，Redeploy |
| **`DATABASE_URL` 报错** | 连接串填错或泄露 | 重新复制 Neon 连接串，更新环境变量 |
| **AI 不回复** | 没配 `OPENAI_API_KEY` / `OPENAI_BASE_URL` | 配 `OPENAI_BASE_URL=https://api.deepseek.com/v1`，否则 key 会 401 |
| **构建失败 `db:push` 数据丢失警告** | 新增唯一约束的保守提示 | 已内置 `--accept-data-loss`，正常；不影响已有数据 |
| **构建失败 `Module parse failed ... .node`** | ssh2 原生依赖 | 已在 `next.config.mjs` 外部化，正常应通过 |
| **改了环境变量没生效** | Vercel 需要重新部署 | 保存后点 **Redeploy** |

---

## 本地开发（可选）

想在本地跑起来调试：

```bash
# 1. 装依赖
pnpm install

# 2. 复制环境变量模板并编辑
cp .env.example .env
# 用编辑器打开 .env，填上 DATABASE_URL / AUTH_SECRET 等

# 3. 创建数据库表
pnpm db:push

# 4. 启动开发服务器
pnpm dev
# 浏览器打开 http://localhost:3000
```

> 本地用 `http://localhost:3000`，GitHub OAuth 回调要配成 `http://localhost:3000/api/auth/github/callback`（见 README 的 OAuth 表）。

---

## 部署流程图

```
GitHub 仓库 ──Import──▶ Vercel 项目
                          ├─ Build Command: pnpm install && pnpm db:push && pnpm build
                          ├─ Env: DATABASE_URL / AUTH_SECRET / ...
                          └─ Deploy ──▶ 线上站点（.vercel.app 或你的域名）
```
