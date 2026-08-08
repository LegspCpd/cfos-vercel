# Cloudflare Access（完整版 SSO 门禁）

> 在站点前面加一道 SSO 认证。用户必须先通过你配置的身份提供商（IdP）登录，才能访问；后端敏感 API 还会校验 Cloudflare 注入的 JWT。

> **前提**：你的域名必须走 Cloudflare 代理（**橙云/Proxied**）。如果域名在 CF 里是灰云（仅 DNS），CF 不会注入 JWT，Access 不生效。

## 工作原理

```
用户访问 https://os.legspcpd.top
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

1. 登录 **Cloudflare 控制台** → 选域名 `legspcpd.top`
2. **DNS → Records**，找到 `os` 记录
3. **Proxy status** 必须是 **Proxied（橙云）**
4. 如果不是，点击切换为 Proxied，等 1-2 分钟生效

> ⚠️ 最重要的一步。灰云则 CF 不注入 JWT。同时先确保 Vercel 部署成功，否则橙云下会 502。

## 第二步：创建 Access 应用

1. **Cloudflare 控制台 → Zero Trust**（https://one.dash.cloudflare.com）
2. **Access → Applications** → **Add an application** → 选 **Self-hosted**
3. 填写：
   - **Application name**：`Cloudflare OS`
   - **Domain / Path**：`os.legspcpd.top`
   - 其余默认 → **Next**

## 第三步：配置登录策略

- 策略名：`allow-all`
- **Action**：Allow
- **Include**：选 **Everyone**（或指定邮箱/组）
- **Next**

## 第四步：记录 AUD Tag

在 **Setup** 步骤，复制 **Application Audience (AUD) Tag**（一长串）。→ **Add application**

## 第五步：确认团队名

看你的 Access 域名，形如 `https://abc123.cloudflareaccess.com`，团队名就是 `abc123`。

## 第六步：配置 Vercel 环境变量

```
CF_ACCESS_TEAM=你的团队名（如 abc123）
CF_ACCESS_AUD=你的AUD Tag
```

**Redeploy**。

## 第七步：验证

用无痕窗口打开站点 → 应跳转 CF 登录 → 登录后进入应用 → 管理员 `/admin` 看到 CF Access 显示"已启用"。

## 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 不跳登录 | 域名灰云 / 没配 team | 切橙云 + 配变量 |
| 502/522 | 源站异常 | 先确保 Vercel 正常 |
| 登录后 API 401 | AUD 配错 / JWT 过期 | 检查 AUD，刷新页面 |
| 循环跳转 | 域名不匹配 | 确认 Access 域名一致 |

## 关闭 Access

删除 Vercel 的 `CF_ACCESS_TEAM` 和 `CF_ACCESS_AUD` 环境变量并 Redeploy。代码里 `isCfAccessEnabled()` 返回 false，后端不再校验。
