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

## GitHub 登录（详细手把手教程）

### 第 1 步：创建 OAuth App
1. 打开 **https://github.com/settings/developers**
2. 点 **"New OAuth App"（新 OAuth 应用）**
3. 填写：
   - **Application name（应用名称）**：`Cloudflare OS`
   - **Homepage URL（主页 URL）**：`https://os.legspcpd.top`
   - **Authorization callback URL（授权回调 URL）**：`https://os.legspcpd.top/api/auth/github/callback`
     > **必须精确到 `/api/auth/github/callback`**，不能只填域名，否则报 `redirect_uri_mismatch`
4. 点 **Register application（注册应用）**

### 第 2 步：拿到凭证
- **Client ID**：应用详情页直接复制 → `GITHUB_CLIENT_ID`
- **Client Secret**：点 **"Generate a new client secret"（生成新客户端密钥）** → 生成后**立即复制**（只显示一次）→ `GITHUB_CLIENT_SECRET`

### 第 3 步：配置到 Vercel

```
GITHUB_CLIENT_ID=你的Client ID
GITHUB_CLIENT_SECRET=你的Client Secret
PUBLIC_SITE_URL=https://os.legspcpd.top
```

**Redeploy** 后生效。现在登录页有"使用 GitHub 登录"按钮。

### 本地测试
本地开发要把回调指向 localhost：
- GitHub OAuth 回调填 `http://localhost:3000/api/auth/github/callback`
- `.env` 里 `PUBLIC_SITE_URL=http://localhost:3000`

### 连接 GitHub（外部连接）
部署后，登录 → 侧边栏 **外部连接** → 连接 GitHub。连接后 agent 可以读取你的仓库和文件。

### GitHub 报错排查

| 报错 | 原因 | 解决 |
|---|---|---|
| `redirect_uri_mismatch` | 回调 URL 不对 | GitHub OAuth App 的 **Authorization callback URL** 精确改为 `https://os.legspcpd.top/api/auth/github/callback` |
| `bad_verification_code` | 回调 URL 前后不一致 | 检查授权时用的回调 URL 与代码里的完全一致 |
| 登录页没按钮 | 环境变量没配/没 Redeploy | 检查 `GITHUB_CLIENT_ID` 并 Redeploy |

## Google 登录（详细手把手教程）

在 **Google Cloud Console** 创建 OAuth 2.0 Client ID：

### 第 1 步：创建/选择项目
1. 打开 **https://console.cloud.google.com**，用 Google 账号登录
2. 顶部有项目下拉框，点它 → **New Project（新建项目）** 建一个（如 `cfos`），或选已有项目

### 第 2 步：配置 OAuth 同意屏幕（OAuth consent screen）
1. 左侧菜单 **APIs & Services（API 和服务）→ OAuth consent screen（OAuth 同意屏幕）**
2. **User Type** 选 **External（外部）** → **CREATE（创建）**
3. 填写：
   - **App name（应用名称）**：`Cloudflare OS`
   - **User support email**：你的邮箱
   - 下方 **Developer contact information** 也填你的邮箱
4. 一路 **Save and Continue**，跳过可选的 Scopes 和 Test users，直到完成

### 第 3 步：创建 OAuth Client ID
1. 左侧 **APIs & Services → Credentials（凭据）**
2. 点 **+ CREATE CREDENTIALS（创建凭据）→ OAuth client ID（OAuth 客户端 ID）**
3. **Application type（应用类型）**：选 **Web application**
4. **Name**：随便填（如 `web`）
5. **Authorized redirect URIs（已获授权的重定向 URI）**：点 **+ ADD URI**，填：
   ```
   https://os.legspcpd.top/api/auth/google/callback
   ```
   （本地测试再填一条 `http://localhost:3000/api/auth/google/callback`）
6. 点 **CREATE（创建）**

### 第 4 步：复制凭证
创建后弹出弹窗，显示：
- **Client ID** —— 复制 → `GOOGLE_CLIENT_ID`
- **Client Secret** —— 复制 → `GOOGLE_CLIENT_SECRET`

> 关闭弹窗后就看不到了，务必**立刻复制**。

### 第 5 步：配置到 Vercel 环境变量

```
GOOGLE_CLIENT_ID=你的Client ID
GOOGLE_CLIENT_SECRET=你的Client Secret
PUBLIC_SITE_URL=https://os.legspcpd.top
```

**Redeploy** 后生效，登录页出现"使用 Google 登录"按钮。

> 说明：Google 登录会用邮箱前缀作为用户名。如果该用户名已存在（例如之前用密码注册过），会自动把 Google 账号关联到现有账号，不会重复创建。

### Google 报错排查

| 报错 | 原因 | 解决 |
|---|---|---|
| `redirect_uri_mismatch` | 回调地址不在授权列表 | Credentials → 你的 Client → **Authorized redirect URIs** 精确添加 `https://os.legspcpd.top/api/auth/google/callback` |
| `invalid_client` | Client ID/Secret 错 | 检查 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| `access_denied`（页面报） | OAuth 同意屏幕未发布为生产 | OAuth consent screen → 点 **Publish app（发布应用）** |
| 登录页没按钮 | 环境变量没配/没 Redeploy | 检查并 Redeploy |

## Microsoft 登录（详细手把手教程）

用 **Microsoft Entra ID（Azure AD）** 账号登录。下面是完整步骤，照着做就行。

### 第 1 步：注册应用

1. 浏览器打开 **https://portal.azure.com**，用你的 Microsoft 账号登录（建议用管理员账号）
2. 顶部搜索框输入 **"App registrations"**，点进 **App registrations（应用注册）**
3. 点页面顶部的 **"+ New registration（新注册）"**
4. 填写：
   - **Name（名称）**：填 `Cloudflare OS`（随便，自己认得就行）
   - **Supported account types（支持的账户类型）**：**必须选第三项**
     ```
     Accounts in any organizational directory (Any Azure AD directory - Multitenant)
     and personal Microsoft accounts (e.g. Skype, Xbox)
     ```
     > 只有选这一项，才能支持**任何公司租户 + 个人 Microsoft 账号（Outlook/消费者）**登录。选错会导致别人登录时报错。
   - **Redirect URI（重定向 URI）**：
     - 下拉选 **Web**
     - 后面填 `https://os.legspcpd.top/api/auth/microsoft/callback`
     - （本地测试再点 **"Add a URI"** 加一条 `http://localhost:3000/api/auth/microsoft/callback`）
5. 点 **Register（注册）**

> **回调地址必须精确到 `/api/auth/microsoft/callback`**，不能只填 `https://os.legspcpd.top`，否则报 `redirect_uri_mismatch`。

### 第 2 步：复制 Client ID

注册成功后自动跳到应用概览页（Overview）：
- **Application (client) ID（应用程序(客户端) ID）** —— 复制这一长串 UUID
- 它就是要填的 **`MICROSOFT_CLIENT_ID`**

> 还可以复制 **Directory (tenant) ID（目录(租户) ID）**。但如果你想让**任何租户 + 个人账户**都能登录，就不用填这个，统一填 `common` 即可。

### 第 3 步：创建 Client Secret

1. 左侧菜单点 **Certificates & secrets（证书和机密）**（或 **Client credentials**）
2. 在 **Client secrets（客户端机密）** 选项卡，点 **"+ New client secret（新客户端机密）"**
3. 填：
   - **Description（说明）**：`cfos`（随便）
   - **Expires（过期）**：选 `24 months` 或 `12 months`
     > **注意**：secret 有有效期！过期后登录会失效，需要重新创建并更新环境变量。
4. 点 **Add（添加）**
5. 表格里会出现一行，**点"值"旁边的复制按钮复制 Value（值）** —— 这就是 **`MICROSOFT_CLIENT_SECRET`**
   > **重要**：Value 只在创建后显示一次，关掉就看不到了，务必**立刻复制**。

### 第 4 步：填到 Vercel 环境变量

Vercel → 你的项目 → **Settings → Environment Variables**，添加：

| Key | Value |
|---|---|
| `MICROSOFT_CLIENT_ID` | 第 2 步复制的 Client ID |
| `MICROSOFT_CLIENT_SECRET` | 第 3 步复制的 secret Value |
| `MICROSOFT_TENANT_ID` | `common`（= 任何租户 + 个人账户，推荐） |

然后到 **Deployments** 页点 **Redeploy**（重新部署）。

### 第 5 步：验证

- 打开登录页，应出现 **"使用 Microsoft 登录"** 按钮
- 点它 → 跳到微软登录 → 用任意 Microsoft 账号（公司邮箱或 Outlook 个人邮箱）登录
- 登录成功回到主页

### Microsoft 报错排查

| 报错 | 原因 | 解决 |
|---|---|---|
| `AADSTS50011`（redirect_uri 不在列表） | Azure 回调 URI 没配对 | 检查 Redirect URI 是否**精确**等于 `https://os.legspcpd.top/api/auth/microsoft/callback` |
| `AADSTS700016`（应用不存在） | Client ID 填错 | 检查 `MICROSOFT_CLIENT_ID` |
| `AADSTS7000215`（secret 无效/过期） | Client Secret 错或过期 | 重新创建 secret 并更新 |
| `AADSTS90002`（租户不存在） | Tenant ID 填错 | 用 `common` 或正确的租户 ID |
| 登录页没按钮 | 环境变量没配/没 Redeploy | 检查 `MICROSOFT_CLIENT_ID` 是否配置并 Redeploy |

## 常见问题

| 现象 | 原因与解决 |
|---|---|
| Google 报 `redirect_uri_mismatch` | **Google Cloud Console → Credentials → 你的 OAuth Client → Authorized redirect URIs** 里没有 `https://os.legspcpd.top/api/auth/google/callback`。把它**精确添加**（一个地址一行，末尾不要多余斜杠），保存后再试。 |
| GitHub 报 `redirect_uri_mismatch` | GitHub OAuth App 的 **Authorization callback URL** 与 `https://os.legspcpd.top/api/auth/github/callback` 不一致 |
| 登录失败 | `GITHUB_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET` 填错或漏配，或改了环境变量后没 Redeploy |
