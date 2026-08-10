# 登录配置（GitHub + Google）

> 支持用 GitHub 或 Google 账号一键登录，配置好后只需在 Vercel 环境变量填上密钥并 Redeploy 即可生效，无需改代码。

## 回调地址（Callback / Redirect URI）速查

在 GitHub / Google 控制台配置 OAuth 应用时，**回调地址必须与下面完全一致**（否则报 `redirect_uri_mismatch`）。把 `os.legspcpd.top` 换成你自己的域名即可。

| 服务 | 生产环境（Vercel） | 本地开发 |
|---|---|---|
| **GitHub** | `https://os.legspcpd.top/api/auth/github/callback` | `http://localhost:3000/api/auth/github/callback` |
| **Google** | `https://os.legspcpd.top/api/auth/google/callback` | `http://localhost:3000/api/auth/google/callback` |
| **Microsoft** | `https://os.legspcpd.top/api/auth/microsoft/callback` | `http://localhost:3000/api/auth/microsoft/callback` |

对应的环境变量：`PUBLIC_SITE_URL` 必须与回调里的域名一致（如 `https://os.legspcpd.top`）。

## GitHub 登录

## 创建 OAuth App

1. 打开 **https://github.com/settings/developers**
2. 点 **"New OAuth App"**
3. 填写：
   - **Application name**：`Cloudflare OS`
   - **Homepage URL**：`https://os.legspcpd.top`
   - **Authorization callback URL**：`https://os.legspcpd.top/api/auth/github/callback`
4. 点 **Register application**

## 拿到凭证

- **Client ID**：应用详情页直接复制
- **Client Secret**：点 **"Generate a new client secret"** → 生成后**立即复制**（只显示一次）

## 配置到 Vercel

添加环境变量：

```
GITHUB_CLIENT_ID=你的Client ID
GITHUB_CLIENT_SECRET=你的Client Secret
PUBLIC_SITE_URL=https://os.legspcpd.top
```

**Redeploy** 后生效。现在登录页有"使用 GitHub 登录"按钮。

## 本地测试

本地开发要把回调指向 localhost：

- GitHub OAuth 回调填 `http://localhost:3000/api/auth/github/callback`
- `.env` 里 `PUBLIC_SITE_URL=http://localhost:3000`

## 连接 GitHub（外部连接）

部署后，登录 → 侧边栏 **外部连接** → 连接 GitHub。连接后 agent 可以读取你的仓库和文件。

## Google 登录

在 **Google Cloud Console** 创建一个 OAuth 2.0 Client ID：

1. 打开 **https://console.cloud.google.com** → 选择或新建一个项目
2. 左侧 **APIs & Services → OAuth consent screen** → 填应用名称等，保存
3. **Credentials → Create Credentials → OAuth client ID**
   - Application type：**Web application**
   - **Authorized redirect URIs**：`https://os.legspcpd.top/api/auth/google/callback`（本地测试用 `http://localhost:3000/api/auth/google/callback`）
4. 创建后复制 **Client ID** 和 **Client Secret**

配置到 Vercel 环境变量：

```
GOOGLE_CLIENT_ID=你的Client ID
GOOGLE_CLIENT_SECRET=你的Client Secret
PUBLIC_SITE_URL=https://os.legspcpd.top
```

**Redeploy** 后生效，登录页出现"使用 Google 登录"按钮。

> 说明：Google 登录会用邮箱前缀作为用户名。如果该用户名已存在（例如之前用密码注册过），会自动把 Google 账号关联到现有账号，不会重复创建。

## Microsoft 登录

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

## 常见问题

| 现象 | 原因与解决 |
|---|---|
| Google 报 `redirect_uri_mismatch` | **Google Cloud Console → Credentials → 你的 OAuth Client → Authorized redirect URIs** 里没有 `https://os.legspcpd.top/api/auth/google/callback`。把它**精确添加**（一个地址一行，末尾不要多余斜杠），保存后再试。 |
| GitHub 报 `redirect_uri_mismatch` | GitHub OAuth App 的 **Authorization callback URL** 与 `https://os.legspcpd.top/api/auth/github/callback` 不一致 |
| 登录失败 | `GITHUB_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET` 填错或漏配，或改了环境变量后没 Redeploy |
