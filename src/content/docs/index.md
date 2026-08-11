# Cloudflare OS 使用与部署文档

> 这是一份**面向小白的完整指南**。照着做，你就能把 Cloudflare OS（Vercel 版）部署到公网，并配置好所有可选功能。

## 这是什么

Cloudflare OS 是一个 **AI 编程工作区**：用自然语言让 AI agent 帮你构建网页应用，实时预览，还能分享文件、连接外部服务。

> ⚠️ **本项目基于 [Cloudflare OS](https://github.com/cloudflare/cloudflare-os) 二次开发而来**（Apache-2.0 协议）。

本版本是**基于 Cloudflare OS 二次开发、并重构到 Vercel 的版本**，使用 Next.js + Postgres，不需要 Cloudflare 付费计划，可以免费自托管。

## 功能一览

**账号与登录**
- 用户注册/登录（密码 + GitHub 登录 + Google 登录）
- Cloudflare Access SSO 门禁（可选）

**应用构建**
- 多文件代码编辑器（Monaco，和 VS Code 同款）
- AI Agent：用自然语言构建/修改应用
- 实时预览（iframe）
- 文件历史/版本回滚（每次修改自动记录，可一键恢复）

**分享与协作**
- 文件分享（Cloudflare R2，带有效期）
- 蓝图导出/导入（.gadget.json 归档）
- 公开蓝图分享链接（他人无需登录即可查看）
- 收藏工作区（星标）

**管理与扩展**
- 外部连接（GitHub）
- 上下文文档库（agent 参考）
- 管理后台（用户/设置/AI/审计）
- 操作审计日志
- 多 AI Provider（DeepSeek / OpenAI / 本地等）

## 文档导航

- [部署教程](/docs/deploy) — 从零开始部署到 Vercel
- [环境变量](/docs/env) — 全部环境变量详解
- [登录与 OAuth](/docs/github-login) — 配置 GitHub / Google / Microsoft 登录 + GitLab 外部连接与 Pages 仓库部署
- [文件分享 R2](/docs/r2) — 配置 Cloudflare R2 存储
- [KV 缓存加速](/docs/kv) — 多地区 KV 缓存，让页面秒开
- [Cloudflare Access](/docs/cf-access) — 完整版 SSO 门禁
- [数据库备份](/docs/backup) — 用 Neon 平台能力保护数据
- [Pages 部署](/docs/cloudflare-deploy) — 部署工作区 / Git 仓库 / ZIP 到 Cloudflare Pages + 短链
- [使用说明](/docs/usage) — 怎么用这个工作区
- [常见问题](/docs/faq) — 排错与技巧

## 快速开始（3 步）

1. **建数据库**：在 [Neon](https://neon.tech) 建免费 Postgres，拿到 `DATABASE_URL`
2. **部署**：推到 GitHub → Vercel 导入，Build Command 填 `pnpm install && pnpm db:push && pnpm build`
3. **配 AI**：管理后台 `/admin` → AI Providers 添加 DeepSeek 等

详细步骤见 [部署教程](/docs/deploy)。
