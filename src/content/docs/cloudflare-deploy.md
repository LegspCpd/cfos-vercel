# 工作区部署（Cloudflare Pages + 短链）

> 把工作区里的应用一键部署到 Cloudflare Pages，并自动生成一个**好记的短链**（如 `s.legspcpd.top/xxxxxx`）用于分享。部署记录、实时构建日志、自定义域名都可在独立的部署页完成。

## 功能概览

- **独立部署页**：工作区 → 右上角「部署」→ 跳转到 `/workspace/deploy` 独立页面。
- **一键部署**：选择一个工作区，可配置构建命令、安装命令、输出目录、环境变量，然后「Deploy」。
- **实时构建日志**：部署过程以 SSE 流式输出到页面的终端控制台，用户可实时观看进度与错误。
- **随机项目名**：每个工作区首次部署分配一个三段随机名（格式 `xxx-yyy-zzz`，仅英文小写+数字），同一个工作区复用它，新建工作区则分配新随机名。
- **短链**：部署成功后，自动调用短链服务生成 `s.legspcpd.top/xxxxxx` 短链，跳转到 `.pages.dev` 域名（域名太长用户记不住）。
- **部署记录**：列出你的所有部署（工作区、状态、Pages 地址、短链、时间），可复制、可打开、可回看历史日志。
- **立即检测**：随时对某次部署重新检测 Cloudflare 侧的实际状态。
- **绑定域名**：可为某次部署的 Pages 项目绑定自定义域名（需要你已把域名接入 Cloudflare）。

## 前置条件

「部署」功能需要配置以下环境变量（见 [环境变量配置指南](/docs/env)）：

| 变量 | 说明 |
|---|---|
| `PAGES_KEY` | Cloudflare API Token（需有 Pages 编辑/部署权限） |
| `PAGES_ACCOUNT_ID` | Cloudflare 账户 ID |
| `S_LINK` | 短链服务 Token（s.legspcpd.top / sink.cool） |

> 未配置 `PAGES_KEY` 时，「部署」按钮不会启用对应功能；未配置 `S_LINK` 时部署仍可进行，但不会生成短链。

### 如何获取

1. **PAGES_KEY**：Cloudflare 控制台 → **My Profile → API Tokens → Create Token** → 选 **Edit Cloudflare Workers** 模板（或自定义，勾选 **Cloudflare Pages** 的 **Edit** 权限）。把生成的 Token 填到 `PAGES_KEY`。
2. **PAGES_ACCOUNT_ID**：Cloudflare 控制台**首页右下角**可看到 Account ID。
3. **S_LINK**：短链系统（sink.cool）的管理 Token，填到 `S_LINK`。

配置后 **Redeploy** 生效。

## 使用步骤

1. 打开 **工作区** 页。
2. 右上角（「新建」旁边）点 **部署**，跳转到独立部署页 `/workspace/deploy`（该页面为英文界面）。
3. 在 **Workspace** 下拉里选一个工作区。
4. （可选）在 **Build configuration** 里填写安装命令、构建命令、输出目录、环境变量（JSON，支持 `$KEY` 占位注入到文件内容）。
5. 点 **Deploy**，右侧终端控制台会**实时滚动**构建日志。
6. 部署成功后，页面显示：
   - **Pages 地址**：`https://<project>.pages.dev`（点「复制」）
   - **短链**：`https://s.legspcpd.top/xxxxxx`（点「复制」，分享给他人）
7. 每次部署都会出现在 **Deployment history** 里，可随时「Check」或「Open」，也可点「Log」回看某次的完整日志。

## 项目名规则

- 每个工作区首次部署时，系统分配一个**三段随机项目名**：`随机段-随机段-随机段`（每段 6 位英文小写字母+数字，如 `a1b2c3-x4y5z6-a7b8c9`）。
- 同一个工作区重复部署会**复用**该项目名（不新建），避免项目堆积。
- 新建工作区再部署时，会分配一个新的三段随机项目名。
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
