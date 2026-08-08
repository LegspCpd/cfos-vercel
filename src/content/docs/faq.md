# 常见问题与排错

## 部署相关

### 登录报 500
- **原因**：Build Command 没改 / 数据库表没建
- **解决**：确认 Build Command 是 `pnpm install && pnpm db:push && pnpm build`

### 登录提示"无效用户名或密码"
- **原因**：密码格式不匹配（旧 argon2 / 新 scrypt）
- **解决**：用 GitHub 登录，或重置密码

### 域名打不开
- **原因**：DNS 没生效
- **解决**：检查 CNAME 记录，等生效（几分钟到几小时）

## AI 相关

### agent 报"未配置 AI"
- **原因**：没配 provider
- **解决**：后台添加 AI Provider 或配 `OPENAI_API_KEY`

### 用 DeepSeek 报 401
- **原因**：没配 `OPENAI_BASE_URL`
- **解决**：`OPENAI_BASE_URL=https://api.deepseek.com/v1`

## 登录相关

### GitHub 登录报 `redirect_uri_mismatch`
- **原因**：回调地址不一致
- **解决**：检查 `PUBLIC_SITE_URL` 和 GitHub 回调是否一致

## 文件分享

### 上传报"R2 未配置"
- **原因**：R2 变量没配全
- **解决**：配 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`

## Cloudflare Access

见 [Cloudflare Access](cf-access) 章节的排查表。

## 其他

### 忘记管理员密码
- **方案 A**：用 GitHub 登录（如已配置）
- **方案 B**：在数据库重置（需要数据库访问权限）

### 数据备份
- 数据都在 Postgres（Neon），Neon 有自动备份
- 分享的文件在 R2

### 升级代码
- 本地 `git pull` 新版本 → push → Vercel 自动重新部署
- 如新增了表，Build Command 的 `db:push` 会自动建表
