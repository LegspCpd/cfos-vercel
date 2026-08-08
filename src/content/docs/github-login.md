# GitHub 登录配置

> 让用户可以用 GitHub 账号登录，并连接 GitHub（agent 可调用 GitHub API）。

## 创建 OAuth App

1. 打开 **https://github.com/settings/developers**
2. 点 **"New OAuth App"**
3. 填写：
   - **Application name**：`Cloudflare OS`
   - **Homepage URL**：`https://os.legspcpd.top`
   - **Authorization callback URL**：`https://os.legspcpd.top/api/auth/github/callback`
4. 点 **Register application**

## 拿到凭证

- **Client ID**：应用详情页直接复制
- **Client Secret**：点 **"Generate a new client secret"** → 生成后**立即复制**（只显示一次）

## 配置到 Vercel

添加环境变量：

```
GITHUB_CLIENT_ID=你的Client ID
GITHUB_CLIENT_SECRET=你的Client Secret
PUBLIC_SITE_URL=https://os.legspcpd.top
```

**Redeploy** 后生效。现在登录页有"使用 GitHub 登录"按钮。

## 本地测试

本地开发要把回调指向 localhost：

- GitHub OAuth 回调填 `http://localhost:3000/api/auth/github/callback`
- `.env` 里 `PUBLIC_SITE_URL=http://localhost:3000`

## 连接 GitHub（外部连接）

部署后，登录 → 侧边栏 **外部连接** → 连接 GitHub。连接后 agent 可以读取你的仓库和文件。

## 常见问题

| 现象 | 原因 |
|---|---|
| `redirect_uri_mismatch` | 回调地址不一致，检查 `PUBLIC_SITE_URL` |
| 登录失败 | `GITHUB_CLIENT_SECRET` 填错或漏配 |
