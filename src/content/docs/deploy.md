# 部署教程

> 从零开始，把 Cloudflare OS 部署到 Vercel 并绑定域名。

## 准备工作

| 需要 | 说明 | 是否免费 |
|---|---|---|
| GitHub 账号 | 托管代码、Vercel 授权 | 免费 |
| Neon 账号 | 免费 Postgres | 免费 |
| Vercel 账号 | 部署平台 | 免费 |
| Cloudflare 账号（可选） | R2、CF Access | 免费 |
| AI 的 API Key（可选） | DeepSeek / OpenAI | 付费 |

## 第一步：创建数据库（Neon）

1. 打开 **https://neon.tech**，注册登录
2. 点 **"Create a project"**
3. 项目名随便填（如 `cfos`），区域选 **Singapore**
4. 创建后复制 **连接串（DATABASE_URL）**：

```
postgresql://neondb_owner:密码@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

> **注意**：连接串含密码，**不要泄露**。泄露了可在 Neon 控制台重置。

## 第二步：部署到 Vercel

### 推送代码到 GitHub

代码先在本地 `git init`，然后 `gh repo create` 推到 GitHub。

### Vercel 导入

1. 打开 **https://vercel.com**，GitHub 登录
2. **Add New → Project** → 选你的仓库 → **Import**
3. Vercel 自动识别为 **Next.js**

### 重要配置

| 配置项 | 填什么 |
|---|---|
| Framework | Next.js（自动） |
| **Build Command** | `pnpm install && pnpm db:push && pnpm build` |
| Output Directory | 留空 |

> **Build Command 必须改成上面的**，否则数据库表不创建，登录会 500。

### 环境变量

| Key | 值 |
|---|---|
| `DATABASE_URL` | Neon 连接串 |
| `AUTH_SECRET` | 随机字符串 |
| `ADMIN_USERNAME` | 管理员用户名 |

**生成 `AUTH_SECRET`**：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 绑定域名（推荐）

1. Vercel → Settings → Domains → 添加 `os.legspcpd.top`
2. 得到 CNAME 记录：`os → cname.vercel-dns.com`
3. 去域名 DNS 服务商加这条记录
4. 等生效

### 部署

点 **Deploy**，等 1-3 分钟。

## 第三步：配置管理员

- 第一个注册的用户自动成为管理员
- 或用环境变量 `ADMIN_USERNAME=用户名`（可多个，逗号分隔）
- 管理员进 `/admin` 管理一切

## 第四步：配置 AI

**方式 A（环境变量）**：

| Key | 值 |
|---|---|
| `OPENAI_API_KEY` | `sk-...` |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1`（DeepSeek） |
| `DEFAULT_MODEL` | `deepseek-chat` |

**方式 B（后台）**：管理员登录 → `/admin` → AI Providers → 添加。

> **注意**：`OPENAI_BASE_URL` 必须配，否则默认连 OpenAI，你的 `sk-` key 会 401。
