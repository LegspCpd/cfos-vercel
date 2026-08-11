# Cloudflare Access（完整版 SSO 门禁）

> 在站点前面加一道 SSO 认证。用户必须先通过你配置的身份提供商（IdP）登录，才能访问；后端敏感 API 还会校验 Cloudflare 注入的 JWT。

> **前提**：你的域名必须走 Cloudflare 代理（**橙云/Proxied**）。如果域名在 CF 里是灰云（仅 DNS），CF 不会注入 JWT，Access 不生效。

## 工作原理

```
用户访问 https://os.your-domain.com
  │
  ▼
Cloudflare 边缘节点（域名走 CF 代理）
  │ 未认证？→ 跳转 IdP 登录（GitHub/Google/邮箱）
  │◄──── 登录成功
  ▼
CF 注入请求头：Cf-Access-Jwt-Assertion（JWT）
  │
  ▼
Vercel 后端 → 验证 JWT（签名/iss/aud/exp）→ 放行
```

## 第一步：确认域名走 CF 代理（橙云）

1. 登录 **Cloudflare 控制台** → 选域名 `your-domain.com`
2. **DNS → Records**，找到 `os` 记录
3. **Proxy status** 必须是 **Proxied（橙云）**
4. 如果不是，点击切换为 Proxied，等 1-2 分钟生效

> **重要**：这是最重要的一步。灰云则 CF 不注入 JWT。同时先确保 Vercel 部署成功，否则橙云下会 502。

## 第二步：进入 Zero Trust 并创建 Access 应用

> 新版界面入口：直接访问 [one.dash.cloudflare.com](https://one.dash.cloudflare.com) 进入 Zero Trust 管理页。
> 在左侧菜单找到 **Access → Applications**（部分账号界面显示为 **Networks → Access → Applications**，功能相同，以你实际看到的为准）。

1. 打开 [one.dash.cloudflare.com](https://one.dash.cloudflare.com)（Zero Trust 管理页，可能需先点"开始使用"开通团队）
2. 左侧菜单：**Access → Applications**（或 **Networks → Access → Applications**）
3. 点 **Add an application** → 选择 **Self-hosted** → 点 **Next** / **Continue**
4. 填写应用配置：
   - **Application name**：`Cloudflare OS`（如 `os`）
   - **Application domain**：`os.your-domain.com`（**注意**：必须填你**自定义**的域名，`xxx.pages.dev` / `xxx.vercel.app` 这类默认域名**无法**用 Access）
   - **Session duration**：登录有效期，如 `24 hours`
   - 其余保持默认 → **Next**

## 第三步：配置身份提供程序（IdP）

新版向导会有一步"身份验证"，用来选允许的登录方式：

1. 勾选你要用的身份提供程序，例如 **GitHub**（或你接入的邮箱 / Google）
2. 其它保持默认（MFA 关、即时身份验证开）→ **Next**

## 第四步：配置访问策略（Policy）

1. 在 **Policies** 步骤，点 **Add a policy**
2. 策略名：`allow-all`（或 `cfos`）
3. **Action**：选 **Allow**
4. **Include / 规则**：
   - 选 **Everyone / 任何人**（允许所有已登录用户）
   - 或选 **Emails** / **Emails ending in** 限定特定邮箱
5. 其余保持默认 → **Next**，最后点 **Add application** 完成

创建后可在应用 **Overview** 页看到 **AUD Tag**（UUID），但本项目不强求它，见下一步。

## 第五步：确认团队名（Team Name）【必填】

团队名用于 JWT 验证的 `issuer`，必须记下来。两个地方能找到：
1. 打开 [one.dash.cloudflare.com](https://one.dash.cloudflare.com)，看浏览器地址栏，形如 `https://lapdsss.cloudflareaccess.com` → 团队名就是 `lapdsss`
2. 或 Zero Trust → **Settings** 页面看 **Team domain** / **Team name**

## 第六步：配置 Vercel 环境变量【只需一个】

**只配 `CF_ACCESS_TEAM` 即可**，`CF_ACCESS_AUD` 是可选增强项：

```
CF_ACCESS_TEAM=lapdsss        # ← 你的团队名，必填
# CF_ACCESS_AUD=             # ← 可选。新版面板不好找 AUD Tag，可跳过
```

> 说明：`CF_ACCESS_AUD` 是 Access 应用的 AUD Tag。**不填也能正常工作**——Cloudflare Access 只为通过你团队 Access 策略的用户签发 JWT，只要签名 + `issuer` 校验通过，就说明用户已通过门禁。如果你能找到 AUD Tag（应用的 Overview 页，标着 "Audience Tag" 或 "AUD Tag"），填上做最严格的校验；找不到就留空。

配置好 `CF_ACCESS_TEAM` 后 **Redeploy**。

## 第七步：验证

用无痕窗口打开站点 → 应跳转 CF 登录 → 登录后进入应用 → 管理员 `/admin` 看到 CF Access 显示"已启用"。

## 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 不跳登录 | 域名灰云 / 没配 team | 切橙云 + 配变量 |
| 502/522 | 源站异常 | 先确保 Vercel 正常 |
| 登录后 API 401 | JWT 过期 / issuer 配错 | 检查 `CF_ACCESS_TEAM` 是否与 Access 域名前缀一致，刷新页面 |
| 循环跳转 | 域名不匹配 | 确认 Access 域名一致 |

## 关闭 Access

删除 Vercel 的 `CF_ACCESS_TEAM`（和 `CF_ACCESS_AUD`，若填过）环境变量并 Redeploy。代码里 `isCfAccessEnabled()` 返回 false，后端不再校验。
