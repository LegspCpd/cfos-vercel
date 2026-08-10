# Cloudflare Access 完整配置教程

本文档教你如何给这个自托管应用启用 **Cloudflare Access**（完整版 SSO 门禁）。启用后，用户必须先通过你配置的身份提供商（IdP）登录，才能访问网站；后端敏感 API 还会额外校验 Cloudflare 注入的 JWT。

> 应用本身已经**实现了全部验证代码**，你只需要按本文档在 Cloudflare 和 Vercel 里完成配置即可。

---

## 一、前置条件

| 条件 | 说明 |
|---|---|
| Cloudflare 账户 | 免费版即可 |
| 域名托管在 Cloudflare | `your-domain.com` 的 DNS 在 Cloudflare 控制台 |
| 子域名 `os` | 用于 `os.your-domain.com`（或你自己的子域名） |
| Vercel 项目已部署 | `cfos-vercel` 已成功部署，可正常访问 |

---

## 二、工作原理（了解即可）

```
用户访问 https://os.your-domain.com
        │
        ▼
Cloudflare 边缘节点（域名走 CF 代理）
        │  未认证？
        ├─────► 跳转到 IdP 登录页（GitHub / Google / 邮箱一次性密码）
        │           用户登录
        │◄───── 登录成功，返回
        │
        ▼
Cloudflare 注入请求头：Cf-Access-Jwt-Assertion（一个 JWT）
        │
        ▼
Vercel 后端（你的应用）
        │  读取并验证 JWT（签名 / iss / aud / exp）
        ▼
放行请求
```

**关键点**：Cloudflare 负责"拦人 + 登录跳转"，你的应用只负责"验证登录结果"。两者缺一不可。

---

## 三、详细配置步骤

### 第 1 步：确认域名走 Cloudflare 代理（橙云）

1. 登录 **Cloudflare 控制台**：https://dash.cloudflare.com
2. 选择你的域名 **`your-domain.com`**
3. 左侧菜单点 **DNS → Records**
4. 找到 `os` 这条记录，看 **Proxy status**：
   - ✅ 应该是 **Proxied**（橙色云朵图标）
   - ❌ 如果是 **DNS only**（灰色云朵/灰色），点击它切换为 **Proxied**
5. 等待 1-2 分钟生效

> ⚠️ **这是最重要的一步**。如果域名不走 CF 代理，CF 不会注入 JWT，Access 完全不生效。同时，如果源站（Vercel）不可用，橙云状态下会看到 502，所以**先确保 Vercel 部署成功**。

### 第 2 步：进入 Zero Trust 并创建 Access 应用（新版界面）

> **新版入口**：Cloudflare 已经把 Zero Trust 整合进主控制台。打开 **https://one.dash.cloudflare.com**（会自动跳到你的账户），左侧菜单里找 **Networks → Access**（部分账号显示为 **Access**，功能相同，以你实际看到的为准）。**不要再在旧版 `dash.cloudflare.com/.../one/access` 路径下找。**

1. 打开 **https://one.dash.cloudflare.com**，在左侧菜单找到 **Access → Applications**（或 **Networks → Access → Applications**）
   - 如果还没开通 Zero Trust，会先引导你创建团队（免费）。
2. 点 **Add an application**，选择 **Self-hosted**（自托管）类型，点 **Next / Continue**
3. **填写应用配置**（新版向导第一步）：
   - **Application name**：`Cloudflare OS`（随便，如 `os`）
   - **Application domain**：`os.your-domain.com`（选择你的域名 `your-domain.com` + 子域名 `os`）
     - ⚠️ 必须填**自定义**域名，`*.vercel.app` / `*.pages.dev` 这类默认域名**无法**被 Access 保护
   - **Session duration**：登录有效期，如 `24 hours`
   - 其余保持默认 → **Next**

4. **配置身份提供程序（IdP）**（新版向导，对应你看到的"身份验证"页）：
   - 勾选可用的身份提供程序，例如 **GitHub**（或你之前接入的 IdP）
   - 其它保持默认（MFA 关、即时身份验证开）→ **Next**

5. **配置访问策略（Policies）**（新版向导，对应你看到的"策略"页）：
   - 点 **Add a policy**，策略名如 `allow-all`
   - **Action**：选 **Allow**
   - **Include / 规则**：选 **Everyone / 任何人**（允许所有已登录用户）
     - 也可以选 **Emails** / **Emails ending in** 限定特定邮箱
   - 其余保持默认 → **Next**，最后点 **Add application** 完成创建

6. **完成**：应用创建后进入应用详情页（Overview），可以在里面看到 **AUD Tag**（一长串 UUID）。**但本项目不强制用它**，详见下一步。

> **关于 AUD Tag（可跳过）**：新版 Cloudflare 面板把 AUD Tag 放在应用 Overview 页，位置较隐蔽。**你不填也没关系**。后端默认只校验 JWT 的**签名 + issuer（团队名）+ 过期时间**——而 Cloudflare Access 只会为通过你团队 Access 策略的用户签发 JWT，所以校验签名已足够证明用户通过门禁。只有在你想做最严格的 `aud` 匹配时才需要它。

### 第 3 步：确认 Zero Trust 团队名（必填）

团队名用于 JWT 验证的 `issuer`。两个地方能找到：
1. 打开 **https://one.dash.cloudflare.com**，看浏览器地址栏，形如 `https://lapdsss.cloudflareaccess.com` → **团队名就是 `lapdsss`**
2. 或 Zero Trust → **Settings** 页面看 **Team domain** / **Team name**

### 第 4 步：配置 Vercel 环境变量

1. 打开 Vercel 项目：**Settings → Environment Variables**
2. 添加（**Production** 和所有环境都要）——**只配这一个必填**：
   - `CF_ACCESS_TEAM` = 第 3 步的团队名（如 `lapdsss`）
3. （可选增强）如果你能找到 AUD Tag，可再加 `CF_ACCESS_AUD` = AUD Tag；找不到就留空。
4. **保存后 Redeploy**（重新部署）

### 第 5 步：验证

1. 用**无痕/隐私窗口**打开 `https://os.your-domain.com`
2. 应被重定向到 Cloudflare 登录页
3. 用你配置的 IdP 登录（如 GitHub）
4. 登录成功后进入你的应用
5. 用管理员账号登录 `/admin`，看到 **Cloudflare Access** 区块显示"已启用"

---

## 四、常见问题排查

| 现象 | 可能原因 | 解决 |
|---|---|---|
| 访问不跳登录，直接进 | 域名没走 CF 代理（灰云） | 第 1 步切橙云 |
| 访问不跳登录，直接进 | `CF_ACCESS_TEAM` 没配 | 配环境变量 + Redeploy |
| 出现 502 / 522 | 橙云了但源站 Vercel 异常 | 检查 Vercel 部署状态，先确保能直接访问 Vercel 域名 |
| 登录后 API 报 401 | 后端校验 CF JWT 失败 | 检查 `CF_ACCESS_TEAM` 是否与 Access 域名前缀一致；JWT 可能过期，刷新页面 |
| 登录后不断循环跳转 | 域名/路径不匹配 | 确认 Access 应用域名和实际访问地址一致 |
| 想临时关闭 | — | 删除 Vercel 的 `CF_ACCESS_TEAM` 环境变量并 Redeploy |

---

## 五、回滚 / 关闭 Access

如果不想再用 Cloudflare Access：
1. 到 Vercel **删除** `CF_ACCESS_TEAM`（和 `CF_ACCESS_AUD`，若填过）环境变量
2. **Redeploy**
3. 代码里 `isCfAccessEnabled()` 会返回 false，后端不再校验 CF JWT

（域名是否继续走 CF 代理不影响应用运行，可以留着。）

---

## 六、配置速查表

```
域名           : os.your-domain.com
CF 代理        : Proxied（橙云）✅ 必须
Access 应用    : Cloudflare OS（Self-hosted）
Policy         : allow-all / Everyone
CF_ACCESS_TEAM = <你的团队名，如 lapdsss>（必填）
CF_ACCESS_AUD  = <应用的 AUD Tag>（可选，找不到可跳过）
```

---

*本文档对应的应用代码位于 `src/lib/cf-access.ts` 和 `src/lib/require-access.ts`。*
