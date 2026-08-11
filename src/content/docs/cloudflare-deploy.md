# 工作区部署（Cloudflare Pages + 短链）

> 把工作区里的应用一键部署到 Cloudflare Pages，并自动生成一个**好记的短链**（如 `s.legspcpd.top/xxxxxx`）用于分享。部署记录、立即检测、自定义域名都可在面板里完成。

## 功能概览

- **一键部署**：工作区 → 右上角「部署」→ 选择工作区 →「构建并部署」，把工作区的静态文件上传到 Cloudflare Pages。
- **短链**：部署成功后，自动调用短链服务生成 `s.legspcpd.top/xxxxxx` 短链，跳转到 `.pages.dev` 域名（域名太长用户记不住）。
- **部署记录**：列出你的所有部署（工作区、状态、Pages 地址、短链、时间），可复制、可打开。
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
2. 右上角（「新建」旁边）点 **部署**，从右侧滑出部署面板。
3. 在 **选择要部署的工作区** 下拉里选一个工作区。
4. 点 **构建并部署**，等待上传完成。
5. 部署成功后，面板显示：
   - **Pages 地址**：`https://<project>.pages.dev`（点「复制」）
   - **短链**：`https://s.legspcpd.top/xxxxxx`（点「复制」，分享给他人）
6. 每次部署都会出现在 **部署记录** 里，可随时「立即检测」或「打开」。

## 绑定自定义域名

1. 在部署面板底部的 **绑定自定义域名** 输入框填写域名（如 `app.example.com`）。
2. 点 **绑定**。
3. 去你的域名 DNS 服务商，把该域名解析到 Cloudflare（走 Cloudflare 代理）。
4. 域名生效后，即可通过 `https://app.example.com` 访问该部署。

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
- 部署是异步的，上传完成即算成功；「立即检测」会查询 Cloudflare 侧的最新状态。
