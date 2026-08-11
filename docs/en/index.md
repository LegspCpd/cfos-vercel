# Cloudflare OS — Deploy & Usage Guide

> A **beginner-friendly, complete guide**. Follow it and you'll have Cloudflare OS (Vercel edition) deployed to the public web, with all optional features configured.

## What this is

Cloudflare OS is an **AI coding workspace**: describe an app in natural language and an AI agent builds it for you, with a live preview, file sharing, and external service connections.

> ⚠️ **Derivative work**: This project is developed based on (二次开发自) [Cloudflare OS](https://github.com/cloudflare/cloudflare-os) under the Apache License 2.0.

This version is a **secondary development (二次开发) rebuilt for Vercel** using Next.js + Postgres. It needs no paid Cloudflare plan and can be self-hosted for free.

## Feature overview

**Accounts & sign-in**
- Registration / login (password + GitHub + Google + email-code)
- Cloudflare Access SSO gate (optional)

**App building**
- Multi-file code editor (Monaco, same engine as VS Code)
- AI Agent: build / modify apps with natural language
- Live preview (iframe)
- File history / version rollback (each change is recorded; restore with one click)

**Share & collaborate**
- File sharing (Cloudflare R2, expiring links)
- Blueprint export / import (`.gadget.json` archive)
- Public blueprint share links (viewable without logging in)
- Favorite workspaces (star)

**Manage & extend**
- External connections (GitHub)
- Context doc library (agent reference)
- Admin panel (users / settings / AI / audit)
- Audit log
- Multiple AI Providers (DeepSeek / OpenAI / local, etc.)

## Documentation

- [Deploy](/en/docs/deploy) — deploy to Vercel from scratch
- [Environment Variables](/en/docs/env) — full reference
- [Sign-in Setup](/en/docs/github-login) — configure GitHub / Google OAuth
- [File Sharing (R2)](/en/docs/r2) — set up Cloudflare R2 storage
- [KV Cache](/en/docs/kv) — multi-region KV caching for instant pages
- [Cloudflare Access](/en/docs/cf-access) — full SSO gate
- [Database Backup](/en/docs/backup) — protect data with Neon platform capabilities
- [Pages Deploy](/en/docs/cloudflare-deploy) — deploy workspaces, GitHub/GitLab repos, or ZIP uploads to Cloudflare Pages + short links
- [Usage](/en/docs/usage) — how to use the workspace
- [FAQ](/en/docs/faq) — troubleshooting & tips

## Quick start (3 steps)

1. **Create a database**: make a free Postgres on [Neon](https://neon.tech) and get `DATABASE_URL`
2. **Deploy**: push to GitHub → import into Vercel, set Build Command to `pnpm install && pnpm db:push && pnpm build`
3. **Configure AI**: Admin panel `/admin` → AI Providers → add DeepSeek, etc.

Full steps in the [Deploy guide](/en/docs/deploy).
