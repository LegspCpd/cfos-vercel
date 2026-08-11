# 部署（Cloudflare Pages + 短链）

> 把应用一键部署到 Cloudflare Pages，并自动生成一个**好记的短链**（如 `s.legspcpd.top/xxxxxx`）用于分享。完整的 Pages 管理在左侧菜单 **Pages** 页（`/pages`）。

## 功能概览

- **Pages 管理页（双语）**：左侧菜单 **Pages** 入口 → `/pages`，相当于 Cloudflare "Workers & Pages" 的 **Pages 专用版**，可新建项目、管理项目列表。
- **新建项目 → 先选来源再部署**：点「新建项目」先进入**来源选择**（`/pages/new`，问"先用什么部署？"），选好后**跳转**到对应的部署界面（`/pages/deploy`）。
- **四种部署来源**：
  - **选择工作区**：把工作区文件部署上去（命令可选）。
  - **选择 GitHub 仓库**：拉取 **GitHub** 仓库部署（复用已连接账号）。
  - **选择 GitLab 仓库**：拉取 **GitLab** 仓库部署（需配置 `GITLAB_CLIENT_ID`/`GITLAB_CLIENT_SECRET` 才启用）。
  - **上传 ZIP / 文件夹**：直接上传 `.zip` 压缩包或选择整个文件夹（自动打包）部署，**无需填写任何命令**。
- **可配置构建**：可填安装命令、构建命令、输出目录、环境变量；**默认都是空的**，不填也能直接部署。
- **实时构建日志**：部署过程以 SSE 流式输出到页面的终端控制台，用户可实时观看进度与错误。
- **部署详情页**：部署完成后**自动跳转**到 `/pages/[id]` 详情页，展示该次部署的地址、短链、状态、完整日志、项目名等。
- **随机项目名**：每个工作区首次部署分配一个三段随机名（格式 `xxx-yyy-zzz`，仅英文小写+数字），同一个工作区复用它，新建工作区则分配新随机名。
- **短链**：部署成功后，自动调用短链服务生成 `s.legspcpd.top/xxxxxx` 短链，跳转到 `.pages.dev` 域名（域名太长用户记不住）。
- **部署记录**：列出你的所有部署（工作区、状态、Pages 地址、短链、时间），可复制、可打开、可回看历史日志。
- **立即检测**：随时对某次部署重新检测 Cloudflare 侧的实际状态。

## 前置条件

「部署」功能需要配置以下环境变量（见 [环境变量配置指南](/docs/env)）：

**核心（开启 Pages 部署必需，只有两个）**

| 变量 | 说明 |
|---|---|
| `PAGES_KEY` | Cloudflare API Token（需有 Pages 编辑/部署权限） |
| `PAGES_ACCOUNT_ID` | Cloudflare 账户 ID |

**可选增强**

| 变量 | 说明 |
|---|---|
| `S_LINK` | 短链服务 Token（s.legspcpd.top / sink.cool），配置后自动生成短链 |
| `S_LINK_BASE` | 短链基址，默认 `https://sink.cool` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 启用「从 GitHub 仓库部署」 |
| `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` | 启用「从 GitLab 仓库部署」（默认关闭，检测到才放开） |
| `GITLAB_BASE_URL` | GitLab 实例地址，默认 `https://gitlab.com` |
| `PAGES_BILLING_SHOW` | Pages 右侧「账单」面板是否显示，`true` 显示，默认隐藏 |
| `PAGES_ACCOUNT_SHOW` | Pages 右侧「Account Details」面板是否显示，`true` 显示，默认隐藏 |
| `PAGES_SUBDOMAIN` | 账户子域，仅 Account Details 展示用，默认 `pages.dev` |

> 未配置 `PAGES_KEY` 时，「部署」功能不会启用；未配置 `S_LINK` 时部署仍可进行，但不会生成短链。未配置 GitHub/GitLab OAuth 时，对应仓库部署入口默认隐藏/禁用。

> **右侧面板显示开关**：Pages 页右侧的「账单」和「Account Details」面板**默认隐藏**。可在管理面板（设置 → Pages 仪表盘面板）勾选开启；也可通过环境变量 `PAGES_BILLING_SHOW=true` / `PAGES_ACCOUNT_SHOW=true` 开启。环境变量优先级高于管理面板（设置后管理面板对应开关被锁定）。「使用情况」进度条面板始终显示。

### 如何获取

1. **PAGES_KEY**：Cloudflare 控制台 → **My Profile → API Tokens → Create Token** → 选 **Edit Cloudflare Workers** 模板（或自定义，勾选 **Cloudflare Pages** 的 **Edit** 权限）。把生成的 Token 填到 `PAGES_KEY`。
2. **PAGES_ACCOUNT_ID**：Cloudflare 控制台**首页右下角**可看到 Account ID。
3. **S_LINK**：短链系统（sink.cool）的管理 Token，填到 `S_LINK`。

配置后 **Redeploy** 生效。

## 使用步骤（新建项目 → 部署）

1. 左侧菜单 → **Pages** → **新建项目**。
2. 先进入**来源选择**页（`/pages/new`，问"先用什么部署？"），选择一个来源：
   - **选择工作区** / **GitHub** / **GitLab** / **上传 ZIP / 文件夹**
3. 选好后**自动跳转**到对应的部署界面（`/pages/deploy?source=...`）。
4. 在部署界面按来源操作：
   - **工作区**：选工作区；安装/构建命令、输出目录、环境变量（JSON）**均可选**，不填也能部署。
   - **GitHub / GitLab**：选仓库 + 分支；命令可选。
   - **上传 ZIP / 文件夹**：直接选文件，**无需填写任何命令**。
5. 点 **部署**，右侧终端控制台会**实时滚动**构建日志。
6. 部署成功后**自动跳转**到部署详情页 `/pages/[id]`，展示地址、短链、状态、完整日志，可复制、打开、立即检测、重新部署。

> 上传限制：单文件 ≤ 50 MB，仅支持 `.zip` 格式；解压后的文件会做安全过滤（拒绝路径穿越），自动跳过 `.git` 等隐藏目录（`_redirects`/`_headers` 除外）。

## 项目名规则

- 每个工作区首次部署时，系统分配一个**三段随机项目名**：`随机段-随机段-随机段`（每段 6 位英文小写字母+数字，如 `a1b2c3-x4y5z6-a7b8c9`）。
- 同一个工作区重复部署会**复用**该项目名（不新建），避免项目堆积。
- 新建工作区再部署时，会分配一个新的三段随机项目名。
- ZIP 上传每次都会分配一个新的随机项目名。
- 随机名完全由随机数生成，不会与工作区标题或用户相关，因此永远不会冲突。

## 绑定自定义域名

1. 在部署记录里任选一次部署，使用「Open」打开对应项目后，在 Cloudflare 控制台给该项目绑定自定义域名（或联系管理员）。
2. 去你的域名 DNS 服务商，把该域名解析到 Cloudflare（走 Cloudflare 代理）。
3. 域名生效后，即可通过 `https://app.example.com` 访问该部署。

> 自定义域名需要你的域名已由 Cloudflare 管理（或解析指向 Cloudflare），Pages 才能签发证书。

## 部署记录字段说明

| 字段 | 说明 |
|---|---|
| 工作区 | 被部署的工作区名称 |
| 状态 | `deployed`（成功）/ `failed`（失败）/ `deploying`（进行中） |
| Pages 地址 | `.pages.dev` 域名 |
| 短链 | `s.legspcpd.top/xxxxxx` |
| 自定义域名 | 绑定的域名（如有） |
| 时间 | 部署创建时间 |

## 常见问题

| 现象 | 原因与解决 |
|---|---|
| 部署失败 `PAGES_KEY is not configured` | 没配 `PAGES_KEY`，或配了没 Redeploy |
| 部署失败 `PAGES_ACCOUNT_ID is not configured` | 没配 `PAGES_ACCOUNT_ID`，或账户 ID 填错 |
| 部署失败 `Cloudflare API 4xx` | Token 权限不足（需 Pages Edit）；或项目名冲突。可在 Cloudflare 控制台检查 |
| 生成了 Pages 地址但没有短链 | 没配 `S_LINK`；配了后下次部署会生成 |
| 短链生成失败 | 短链服务 Token 无效或服务不可用；部署本身不受影响 |

## 说明

- 每次部署会把工作区的**当前文件**作为静态站点上传（直接可访问的 HTML/CSS/JS）。若工作区需要编译（如 TS/React 源码），请先在本地构建出静态产物再放入工作区。
- 构建命令、安装命令、输出目录、环境变量会在部署时记录到部署记录里（并注入环境变量替换文件中的 `$KEY` 占位）。
- 部署是异步的，上传完成即算成功；「Check」会查询 Cloudflare 侧的最新状态。
