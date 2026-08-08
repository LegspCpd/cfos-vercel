# Cloudflare Access 完整配置教程

本文档教你如何给这个自托管应用启用 **Cloudflare Access**（完整版 SSO 门禁）。启用后，用户必须先通过你配置的身份提供商（IdP）登录，才能访问网站；后端敏感 API 还会额外校验 Cloudflare 注入的 JWT。

> 应用本身已经**实现了全部验证代码**，你只需要按本文档在 Cloudflare 和 Vercel 里完成配置即可。

---

## 一、前置条件

| 条件 | 说明 |
|---|---|
| Cloudflare 账户 | 免费版即可 |
| 域名托管在 Cloudflare | `legspcpd.top` 的 DNS 在 Cloudflare 控制台 |
| 子域名 `os` | 用于 `os.legspcpd.top`（或你自己的子域名） |
| Vercel 项目已部署 | `cfos-vercel` 已成功部署，可正常访问 |

---

## 二、工作原理（了解即可）

```
用户访问 https://os.legspcpd.top
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
2. 选择你的域名 **`legspcpd.top`**
3. 左侧菜单点 **DNS → Records**
4. 找到 `os` 这条记录，看 **Proxy status**：
   - ✅ 应该是 **Proxied**（橙色云朵图标）
   - ❌ 如果是 **DNS only**（灰色云朵/灰色），点击它切换为 **Proxied**
5. 等待 1-2 分钟生效

> ⚠️ **这是最重要的一步**。如果域名不走 CF 代理，CF 不会注入 JWT，Access 完全不生效。同时，如果源站（Vercel）不可用，橙云状态下会看到 502，所以**先确保 Vercel 部署成功**。

### 第 2 步：创建 Access 应用

1. 打开 **Cloudflare 控制台 → Zero Trust**（https://one.dash.cloudflare.com）
   - 如果还没开通 Zero Trust，会引导你创建团队（免费）。
2. 左侧菜单：**Access → Applications**
3. 点 **Add an application** → 选 **Self-hosted** → **Select**
4. 填写应用信息：
   - **Application name**：`Cloudflare OS`（随便）
   - **Domain / Path**：`os.legspcpd.top`（选择你的域名 + 子域名）
   - 其余保持默认 → 点 **Next**

### 第 3 步：配置登录策略（Policy）

在 **Policy** 步骤：
1. 给策略起名，如 `allow-all`
2. **Action**：选择 **Allow**
3. **Include**：点 **Add** → 选 **Everyone**（允许所有已登录用户）
   - 也可以选特定邮箱、邮箱后缀、组等，限制谁能访问
4. 点 **Next**

### 第 4 步：记录 AUD Tag

在 **Setup** 步骤，页面会显示 **Application Audience (AUD) Tag**：
- 一长串类似 `6da1234abcd5678ef...` 的字符串
- **复制保存**它（后面配 Vercel 环境变量要用）

然后点 **Add application**。

### 第 5 步：确认 Zero Trust 团队名

1. 在 Zero Trust 控制台，看你的 **Access 域名**。
2. 形如 `https://abc123.cloudflareaccess.com`，则 **团队名（team）就是 `abc123`**。
   - 可以在 **Zero Trust → Settings** 里看到你的 team name。

### 第 6 步：配置 Vercel 环境变量

1. 打开 Vercel 项目：**Settings → Environment Variables**
2. 添加（**Production** 和所有环境都要）：
   - `CF_ACCESS_TEAM` = 第 5 步的团队名（如 `abc123`）
   - `CF_ACCESS_AUD` = 第 4 步的 AUD Tag
3. **保存后 Redeploy**（重新部署）

### 第 7 步：验证

1. 用**无痕/隐私窗口**打开 `https://os.legspcpd.top`
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
| 登录后 API 报 401 | 后端校验 CF JWT 失败 | 检查 `CF_ACCESS_AUD` 是否填对；JWT 可能过期，刷新页面 |
| 登录后不断循环跳转 | 域名/路径不匹配 | 确认 Access 应用域名和实际访问地址一致 |
| 想临时关闭 | — | 删除 Vercel 的 `CF_ACCESS_TEAM` 环境变量并 Redeploy |

---

## 五、回滚 / 关闭 Access

如果不想再用 Cloudflare Access：
1. 到 Vercel **删除** `CF_ACCESS_TEAM` 和 `CF_ACCESS_AUD` 两个环境变量
2. **Redeploy**
3. 代码里 `isCfAccessEnabled()` 会返回 false，后端不再校验 CF JWT

（域名是否继续走 CF 代理不影响应用运行，可以留着。）

---

## 六、配置速查表

```
域名        : os.legspcpd.top
CF 代理     : Proxied（橙云）✅ 必须
Access 应用 : Cloudflare OS（Self-hosted）
Policy      : allow-all / Everyone
CF_ACCESS_TEAM = <你的团队名，如 abc123>
CF_ACCESS_AUD  = <应用的 AUD Tag>
```

---

*本文档对应的应用代码位于 `src/lib/cf-access.ts` 和 `src/lib/require-access.ts`。*
