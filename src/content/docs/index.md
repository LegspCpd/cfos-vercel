# Cloudflare OS 使用与部署文档

> 这是一份**面向小白的完整指南**。照着做，你就能把 Cloudflare OS（Vercel 版）部署到公网，并配置好所有可选功能。

## 这是什么

Cloudflare OS 是一个 **AI 编程工作区**：用自然语言让 AI agent 帮你构建网页应用，实时预览，还能分享文件、连接外部服务。

本版本是**重构到 Vercel 的版本**，使用 Next.js + Postgres，不需要 Cloudflare 付费计划，可以免费自托管。

## 功能一览

- 🖥️ 用户注册/登录（密码 + GitHub 登录）
- 📝 多文件代码编辑器（Monaco，和 VS Code 同款）
- 🤖 AI Agent：用自然语言构建/修改应用
- 👁️ 实时预览（iframe）
- 📁 文件分享（Cloudflare R2，带有效期）
- 🔗 外部连接（GitHub）
- 📚 上下文文档库（agent 参考）
- 🛡️ 管理后台（用户/设置/AI/审计）
- 📊 操作审计日志
- 🔐 Cloudflare Access SSO 门禁

## 文档导航

- [部署教程](deploy) — 从零开始部署到 Vercel
- [环境变量](env) — 全部 16 个环境变量详解
- [GitHub 登录](github-login) — 配置 OAuth 登录
- [文件分享 R2](r2) — 配置 Cloudflare R2 存储
- [Cloudflare Access](cf-access) — 完整版 SSO 门禁
- [使用说明](usage) — 怎么用这个工作区
- [常见问题](faq) — 排错与技巧

## 快速开始（3 步）

1. **建数据库**：在 [Neon](https://neon.tech) 建免费 Postgres，拿到 `DATABASE_URL`
2. **部署**：推到 GitHub → Vercel 导入，Build Command 填 `pnpm install && pnpm db:push && pnpm build`
3. **配 AI**：管理后台 `/admin` → AI Providers 添加 DeepSeek 等

详细步骤见 [部署教程](deploy)。
