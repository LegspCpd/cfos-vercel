# 登录与 OAuth 配置（GitHub / Google / Microsoft / GitLab）

> 支持用 GitHub、Google 或 Microsoft 账号一键登录；GitLab 作为**外部连接 + Pages 仓库部署来源**。配置好后只需在 Vercel 环境变量填上密钥并 Redeploy 即可生效，无需改代码。

## 回调地址（Callback / Redirect URI）速查

在 GitHub / Google 控制台配置 OAuth 应用时，**回调地址必须与下面完全一致**（否则报 `redirect_uri_mismatch`）。把 `os.your-domain.com` 换成你自己的域名即可。

| 服务 | 生产环境（Vercel） | 本地开发 |
|---|---|---|
| **GitHub** | `https://os.your-domain.com/api/auth/github/callback` | `http://localhost:3000/api/auth/github/callback` |
| **Google** | `https://os.your-domain.com/api/auth/google/callback` | `http://localhost:3000/api/auth/google/callback` |
| **Microsoft** | `https://os.your-domain.com/api/auth/microsoft/callback` | `http://localhost:3000/api/auth/microsoft/callback` |

对应的环境变量：`PUBLIC_SITE_URL` 必须与回调里的域名一致（如 `https://os.your-domain.com`）。

## GitHub 登录（详细手把手教程）

### 第 1 步：创建 OAuth App
1. 打开 [GitHub → Settings → Developer settings](https://github.com/settings/developers)（用 GitHub 账号登录）
2. 点 **"New OAuth App"（新 OAuth 应用）**
3. 填写：
   - **Application name（应用名称）**：`Cloudflare OS`
   - **Homepage URL（主页 URL）**：`https://os.your-domain.com`
   - **Authorization callback URL（授权回调 URL）**：`https://os.your-domain.com/api/auth/github/callback`
     > **必须精确到 `/api/auth/github/callback`**，不能只填域名，否则报 `redirect_uri_mismatch`
4. 点 **Register application（注册应用）**

### 第 2 步：拿到凭证
- **Client ID**：应用详情页直接复制 → `GITHUB_CLIENT_ID`
- **Client Secret**：点 **"Generate a new client secret"（生成新客户端密钥）** → 生成后**立即复制**（只显示一次）→ `GITHUB_CLIENT_SECRET`

### 第 3 步：配置到 Vercel

```
GITHUB_CLIENT_ID=你的Client ID
GITHUB_CLIENT_SECRET=你的Client Secret
PUBLIC_SITE_URL=https://os.your-domain.com
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
| `redirect_uri_mismatch` | 回调 URL 不对 | GitHub OAuth App 的 **Authorization callback URL** 精确改为 `https://os.your-domain.com/api/auth/github/callback` |
| `bad_verification_code` | 回调 URL 前后不一致 | 检查授权时用的回调 URL 与代码里的完全一致 |
| 登录页没按钮 | 环境变量没配/没 Redeploy | 检查 `GITHUB_CLIENT_ID` 并 Redeploy |

## Google 登录（详细手把手教程）

在 **Google Cloud Console** 创建 OAuth 2.0 Client ID：

### 第 1 步：创建/选择项目
1. 打开 [Google Cloud Console](https://console.cloud.google.com)，用 Google 账号登录
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
   https://os.your-domain.com/api/auth/google/callback
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
PUBLIC_SITE_URL=https://os.your-domain.com
```

**Redeploy** 后生效，登录页出现"使用 Google 登录"按钮。

> 说明：Google 登录会用邮箱前缀作为用户名。如果该用户名已存在（例如之前用密码注册过），会自动把 Google 账号关联到现有账号，不会重复创建。

### Google 报错排查

| 报错 | 原因 | 解决 |
|---|---|---|
| `redirect_uri_mismatch` | 回调地址不在授权列表 | Credentials → 你的 Client → **Authorized redirect URIs** 精确添加 `https://os.your-domain.com/api/auth/google/callback` |
| `invalid_client` | Client ID/Secret 错 | 检查 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| `access_denied`（页面报） | OAuth 同意屏幕未发布为生产 | OAuth consent screen → 点 **Publish app（发布应用）** |
| 登录页没按钮 | 环境变量没配/没 Redeploy | 检查并 Redeploy |

## Microsoft 登录（详细手把手教程）

用 **Microsoft Entra ID（Azure AD）** 账号登录。下面是完整步骤，照着做就行。

### 第 1 步：注册应用

1. 浏览器打开 [Azure 门户](https://portal.azure.com)，用你的 Microsoft 账号登录（建议用管理员账号）
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
     - 后面填 `https://os.your-domain.com/api/auth/microsoft/callback`
     - （本地测试再点 **"Add a URI"** 加一条 `http://localhost:3000/api/auth/microsoft/callback`）
5. 点 **Register（注册）**

> **回调地址必须精确到 `/api/auth/microsoft/callback`**，不能只填 `https://os.your-domain.com`，否则报 `redirect_uri_mismatch`。

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
| `AADSTS50011`（redirect_uri 不在列表） | Azure 回调 URI 没配对 | 检查 Redirect URI 是否**精确**等于 `https://os.your-domain.com/api/auth/microsoft/callback` |
| `AADSTS700016`（应用不存在） | Client ID 填错 | 检查 `MICROSOFT_CLIENT_ID` |
| `AADSTS7000215`（secret 无效/过期） | Client Secret 错或过期 | 重新创建 secret 并更新 |
| `AADSTS90002`（租户不存在） | Tenant ID 填错 | 用 `common` 或正确的租户 ID |
| 登录页没按钮 | 环境变量没配/没 Redeploy | 检查 `MICROSOFT_CLIENT_ID` 是否配置并 Redeploy |

## GitLab 外部连接 + Pages 仓库部署（GitLab OAuth，详细教程）

GitLab 在项目里是**外部连接 + Pages 仓库部署来源**（非登录）：

- **外部连接**：登录用户在「外部连接」页连接自己的 GitLab 账号，agent 可代为读取项目 / 创建 issue（受 Gatekeeper 写权限控制）。
- **Pages 仓库部署**：在 `/pages` 页「新建项目 → 选择 Git 仓库」里选择 **GitLab**，拉取你的仓库直接部署到 Cloudflare Pages。

> **重要**：GitLab 登录与 GitHub/Google/Microsoft **不同**——它**不会**出现在登录页。它是纯"外部连接 + Pages 仓库部署"功能。且**默认关闭**：只有配置了 `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` 后，外部连接页和 Pages 页才会显示 GitLab 选项。

### 第 0 步：准备一个 GitLab 账号 / 实例

这一步是很多新手卡住的地方，先讲清楚：

- **用官方 gitlab.com（最简单）**：直接去 [GitLab.com](https://gitlab.com) 免费注册一个账号即可，无需任何付费。本教程默认用 gitlab.com。
- **用自建 GitLab（私有化部署）**：如果你公司/团队用自建的 GitLab（例如 `git.your-company.com`），需要先登录那个实例，并且后续环境变量要填 `GITLAB_BASE_URL`。GitLab 是开源的（CE 免费版也支持），可以自建，但这里不做展开。

> 用哪个 GitLab，取决于你希望从哪里拉取仓库。**选 gitlab.com 就行，不用自己搭服务器。**

### 第 1 步：登录 GitLab 并进入 Application 设置

1. 用浏览器打开 [GitLab.com](https://gitlab.com)，登录你的账号。
2. 打开 **User Settings → Applications** 页面，地址是：
   [https://gitlab.com/-/profile/applications](https://gitlab.com/-/profile/applications)
   （自建实例则是 `https://你的实例域名/-/profile/applications`，或点右上角头像 → **Preferences（偏好设置）→ Applications（应用）**）
3. 页面标题是 **Applications**，下面有 **Add new application（添加新应用）** 的输入区。

### 第 2 步：填写并创建 Application

在 **Add new application** 表单里填写：

- **Name（名称）**：填 `Cloudflare OS`（随便，只是给你自己看的标识）
- **Redirect URI（重定向 URI）**：**必须精确填**：
  ```
  https://os.your-domain.com/api/gitlab/callback
  ```
  > ⚠️ **必须精确到 `/api/gitlab/callback`**，不能只填域名 `https://os.your-domain.com`，否则会报 `redirect_uri_mismatch`。把 `os.your-domain.com` 换成你自己的域名。
  >
  > **本地开发**：如需本地联调，在同一框里换行加一条 `http://localhost:3000/api/gitlab/callback`。
- **Scopes（权限范围）**：勾选下面这些（用 Shift 或逐个勾选）：
  - **`read_api`** —— 必选，让 agent / Pages 能读取你的项目和仓库（拉取代码、列项目）。
  - **`api`** —— 可选，如果要创建 issue、写操作；**如果你要在 Pages 页部署私有仓库，或想 agent 帮忙建 issue，勾上它**。勾了 `api` 其实也包含读取能力，可以只勾 `api`。
  - **`read_user`** —— 可选，读取你的用户信息。
  - **`profile`** / **`openid`** —— 可选，读取公开资料。
  > 最小可用组合：**`read_api`**（只读部署用）；要写操作就加 **`api`**。
- 下方 **Confidential（机密）** 保持勾选（默认勾选，正常）。
- 点 **Save application（保存应用）**。

### 第 3 步：拿到 Application ID 和 Secret

保存后页面会自动刷新，**在你刚才创建的应用卡片里**显示：

- **Application ID** —— 一长串 UUID，复制 → 对应环境变量 `GITLAB_CLIENT_ID`
- **Secret** —— 一长串密钥，复制 → 对应环境变量 `GITLAB_CLIENT_SECRET`

> ⚠️ **Secret 只在创建后的这一次显示**，刷新或离开页面后就看不到了。**务必立刻复制保存**。万一没复制，就删掉这个应用重新创建一个。

### 第 4 步：把凭证填到 Vercel 环境变量

去 **Vercel → 你的项目 → Settings → Environment Variables**，添加：

| Key | Value |
|---|---|
| `GITLAB_CLIENT_ID` | 第 3 步复制的 Application ID |
| `GITLAB_CLIENT_SECRET` | 第 3 步复制的 Secret |
| `GITLAB_BASE_URL` | 用 gitlab.com 就填 `https://gitlab.com`；用自建实例就填 `https://你的实例域名` |

然后到 **Deployments** 页点 **Redeploy（重新部署）** 使其生效。

> 三者在 [env 文档](/docs/env) 里有完整说明。`GITLAB_BASE_URL` 不填时默认就是 `https://gitlab.com`，所以用官方站可以省略。

### 第 5 步：验证是否生效

Redeploy 完成后：

- 打开登录后的侧边栏 → **外部连接** → 应该能看到 **GitLab** 卡片（之前没配是看不到的）。
- 打开 **/pages** → **新建项目 → 选择 Git 仓库** → 应该能看到 **GitLab** 选项（之前没配是灰的/不显示）。

> 如果还是看不到，说明环境变量没配对或没 Redeploy，见下方排查表。

### 第 6 步：连接你的 GitLab 账号

1. 侧边栏 → **外部连接** → GitLab → 点 **连接**。
2. 跳转到 GitLab 授权页 → 点 **Authorize（授权）**。
3. 授权完成后回到你的站点，GitLab 卡片显示已连接。

### 第 7 步：在 Pages 页用 GitLab 仓库部署

连接后就可以拉仓库部署了：

1. 侧边栏 → **Pages** → **新建项目**。
2. **选择部署来源** → **选择 Git 仓库**。
3. **仓库平台**选 **GitLab**。
4. **仓库**下拉框里选你的项目（如 `group/project`），**分支**填默认分支（如 `main` / `master`）。
5. 填构建配置（安装命令 `npm install`、构建命令 `npm run build`、输出目录 `dist` 等，可留空直接部署静态文件）。
6. 点 **部署**，实时观看日志，部署完成自动跳转详情页。

> 若仓库是**私有**的，需在创建应用时勾选 `read_api`（或 `api`）权限；未勾选会拉取不到文件。

### GitLab 报错排查

| 报错 | 原因 | 解决 |
|---|---|---|
| `redirect_uri_mismatch` | 回调地址不对 | GitLab 应用的 **Redirect URI** 精确改为 `https://os.your-domain.com/api/gitlab/callback`（末尾无多余斜杠） |
| `invalid_client` | Client ID/Secret 填错 | 检查 `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` 是否与 Application ID / Secret 完全一致 |
| 外部连接页不显示 GitLab | 环境变量没配/没 Redeploy | 配置 `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` 后 Redeploy |
| Pages 页 GitLab 是灰的 | 未配置环境变量 | 同上一行：配置变量并 Redeploy |
| 部署时"未连接 GitLab" | 你还没授权连接 | 外部连接 → GitLab → 连接 |
| 部署私有仓库拉不到文件 | 应用没勾 `read_api`/`api` 权限 | 编辑应用勾上 `read_api`，重新授权 |

## 关于"未配置的服务不显示"

外部连接页（以及登录页、Pages 页的 GitLab 选项）**只显示已配置环境变量的服务**：

- 若没有设置 `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET`，外部连接页和 Pages 页就**不会显示 GitLab**（Pages 页 GitLab 按钮显示"未启用"）
- 同理，GitHub / Google / Microsoft 登录按钮也只在对应环境变量配置后才出现

这样部署时不会出现"点连接却报未配置"的死卡片。想启用哪个服务，就配置哪个服务的环境变量并 Redeploy。

## 常见问题

| 现象 | 原因与解决 |
|---|---|
| Google 报 `redirect_uri_mismatch` | **Google Cloud Console → Credentials → 你的 OAuth Client → Authorized redirect URIs** 里没有 `https://os.your-domain.com/api/auth/google/callback`。把它**精确添加**（一个地址一行，末尾不要多余斜杠），保存后再试。 |
| GitHub 报 `redirect_uri_mismatch` | GitHub OAuth App 的 **Authorization callback URL** 与 `https://os.your-domain.com/api/auth/github/callback` 不一致 |
| 登录失败 | `GITHUB_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET` 填错或漏配，或改了环境变量后没 Redeploy |
