# 安全审查 Checklist Prompt（可复用）

> 用法：把下面整段复制给任意 AI 编码助手，让它对目标代码库执行一轮系统化安全审查。
> 本清单综合了 Akamai / Huawei / Authgear / Next.js / Tencent 的安全实践，并针对本项目的实际架构（Next.js 14 App Router + Prisma/Postgres + 自研 JWT 会话 + OAuth 多提供商 + 外部 API 集成）做了裁剪。

---

## 角色设定

你是一名资深应用安全工程师（红队视角），正在对以下代码库做一次**只读**安全审查。逐文件阅读，不要跳过。发现漏洞时给出：文件路径、行号、漏洞类型、攻击场景、修复建议。最后按严重程度（Critical / High / Medium / Low）汇总。

## 审查范围

- 所有 `src/app/api/**/route.ts`（API 路由）
- 所有 `src/lib/*.ts`（核心逻辑）
- `next.config.mjs`、`middleware.ts`（如有）、`src/app/layout.tsx`
- 客户端敏感代码：token 存储、iframe 渲染、dangerouslySetInnerHTML

## 逐项检查清单

### 1. 认证与会话
- [ ] JWT 签名密钥是否在非生产环境有默认值？生产环境是否强制要求？（`AUTH_SECRET`）
- [ ] JWT 是否设置了过期时间？算法是否固定（HS256）而非 `none`/`alg` 混淆？
- [ ] 会话 token 是否通过 URL query string 传递（会进日志）？应只用 header / fragment / httpOnly cookie
- [ ] 密码哈希是否用 scrypt/bcrypt/argon2（带盐、慢哈希）？是否用 `timingSafeEqual` 比较？
- [ ] 登录失败是否返回统一错误信息（防用户名枚举）？是否限流？
- [ ] 验证码（email code）是否哈希存储？是否限流 + 过期？

### 2. 授权与 IDOR
- [ ] 每个按 id 操作的端点是否都做了所有权检查（`findFirst({ where: { id, userId } })`）？有没有直接 `findUnique({ where: { id } })` 就返回数据的？
- [ ] 协作/分享场景是否区分 owner / write / read 三级权限？
- [ ] 管理端点是否都检查 `isUserAdmin`？权限提升路径（改自己 isAdmin、改自己 group）是否被禁止？
- [ ] OAuth 回调是否只按 provider 的稳定 id（githubId/googleId/sub）关联账号？**绝不**按 username/email 前缀关联（同名账号接管攻击）
- [ ] OAuth state 是否 HMAC 签名 + 过期？CSRF 是否被防住？

### 3. 注入
- [ ] SQL：是否全部走 Prisma 参数化查询？有没有字符串拼接 SQL？（`d1.ts` 的 table 名拼接是否有白名单校验？）
- [ ] 命令注入：是否用 `exec` 拼接 shell？应改用 `execFile`/参数数组/`conn.exec`（无 shell）
- [ ] XSS：`dangerouslySetInnerHTML` 是否只用于静态内容？用户内容渲染是否转义？iframe 是否有 `sandbox` + CSP？
- [ ] 存储型 XSS：上传的文件（R2/avatar）是否校验 MIME + magic bytes？是否禁止 `text/html`/`image/svg+xml` 内联渲染？
- [ ] 路径穿越：zip 解压、文件读写是否校验 `..`、绝对路径、反斜杠、控制字符？

### 4. SSRF
- [ ] 所有用户可控 URL 的 fetch（webhook、远程拉取）是否在**创建时**和**执行时**双重校验？
- [ ] IP 校验是否覆盖：IPv4 私有段（10/8、172.16/12、192.168/16、169.254/16、127/8、0/8、100.64/10、198.18/15、224+、240+）？
- [ ] IPv6 校验是否覆盖：`::1`、`::`、`fc00::/7`、`fe80::/10`、`ff00::/8`？
- [ ] **IPv4-mapped IPv6**（`::ffff:1.2.3.4`）和 IPv4-compatible（`::1.2.3.4`）是否被解析并重新检查内嵌 IPv4？这是最常见的绕过点
- [ ] 是否防 DNS rebinding（执行时重新解析）？是否限制重定向次数/目标？

### 5. 文件上传与解压
- [ ] 上传大小是否限制（请求体 + 解码后）？base64 是否严格校验（round-trip）？
- [ ] zip 解压是否限制：总大小、单文件大小、文件数量、路径长度？
- [ ] zip-slip：解压路径是否规范化后校验？
- [ ] 上传的 MIME 是否白名单？未知类型是否降级为 `application/octet-stream`（强制下载）？

### 6. 限流与滥用
- [ ] 登录/注册/验证码发送/部署/上传/工单/AI 调用是否都有限流？
- [ ] 限流键是否合理（用户 id / IP / identifier+IP）？
- [ ] AI 配额（每日调用次数）是否在服务端强制执行（不只是前端隐藏）？

### 7. 敏感数据
- [ ] OAuth token / SSH 凭据是否加密存储（AES-256-GCM）？密钥是否从主密钥派生？
- [ ] API 响应是否泄露密钥？（masked 显示、绝不返回完整 key）
- [ ] 日志/审计是否记录敏感字段（密码、token、header、请求体）？
- [ ] 环境变量是否优先于 DB 设置（防被入侵的 admin 会话覆盖认证配置）？

### 8. 开放重定向与 URL 处理
- [ ] 重定向目标是否来自用户输入（`?next=`、`?redirect=`）？是否校验为站内路径？
- [ ] 分享链接/预览 URL 是否 HMAC 签名 + 过期？
- [ ] 公开端点（blueprint、published site）是否只暴露该公开的数据？

### 9. 依赖与配置
- [ ] 依赖是否有已知 CVE？（`pnpm audit`）
- [ ] `next.config.mjs` 是否有危险配置（`images.remotePatterns` 过宽、CSP 缺失）？
- [ ] 生产环境是否强制 HTTPS + Secure cookie？
- [ ] 错误信息是否泄露内部细节（堆栈、SQL、内部 URL）？

### 10. 业务逻辑
- [ ] 竞态条件：先检查后写入是否有 TOCTOU？（如配额检查与扣减分离）
- [ ] 删除操作是否有确认/冷却期？级联删除是否合理？
- [ ] 数字参数是否 clamp（limit/offset/expiresInDays）？
- [ ] 批量操作是否有上限（文件数、大小、分页）？

## 输出格式

```
## 审查结果

### Critical（可远程利用 / 数据泄露 / 提权）
- [文件:行] 描述 | 攻击场景 | 修复建议

### High
...

### Medium
...

### Low
...

### 已确认安全的关键点（简述）
...
```