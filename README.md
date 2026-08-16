# Cloudflare OS — Vercel Edition

**🌏 Languages:** English | [简体中文](README-ZH-CN.md)

> ⚠️ **二次开发 (Derivative work)**: This project is developed based on (二次开发自) [Cloudflare OS](https://github.com/cloudflare/cloudflare-os) under the [Apache License 2.0](LICENSE).

A full-stack rewrite of Cloudflare OS for Vercel (Next.js 14 + Postgres), removing the dependency on Cloudflare Durable Objects, Dynamic Workers, and Workers RPC.

This is a **derivative / secondary-development (二次开发)** of the original project, built on the standard `next` runtime. It preserves and restores the original product's capabilities while adapting the architecture to a classic serverless setup. See [NOTICE](NOTICE) for copyright and modification details.

## ✨ Features

### Core
- **Authentication** — register / sign-in with scrypt password hashing (Node built-in `crypto.scrypt`) + JWT sessions, plus **GitHub / Google / Microsoft OAuth**, email verification-code registration, and email+password sign-in
- **Cloudflare Access SSO** — optional full-site gate via `CF_ACCESS_TEAM` / `CF_ACCESS_AUD` (see [docs](docs/CLOUDFLARE_ACCESS_SETUP.md))
- **OAuth onboarding** — accounts created via a third-party login must complete a profile (username + password + human verification, optional email binding) before entering the app
- **Email management** — bind an email, or change it with a two-step ownership verification (old email code → new email code) plus human verification
- **Account deletion** — self-serve with email-code or OAuth re-authentication + human verification, then a 4–7 day cooldown before permanent removal (email/username are freed and can be re-registered); cancellable during the cooldown
- **Support tickets** — users submit feedback / appeals / email-change requests (with human verification + IP logging); admins are notified by email with a one-click handle link

### App shell
- Sidebar navigation: Home · Workspaces · Blueprints · Outputs · Explore · Admin · Tickets · Operation Log
- **Home** hero with a chat input and task-suggestion cards
- **Bilingual docs site** at `/docs` (Simplified Chinese) and `/en/docs` (English), with a one-click sidebar switcher
- **Command palette (⌘K)** — search/jump to workspaces, create documents
- **Theme** — light / dark / system

### Workspace & agent
- Multi-file **Monaco editor** with a file tree, **iframe preview**, and a chat panel (conversations persist automatically)
- **File history / version rollback** — every change is snapshotted and can be restored
- **Realtime multi-user collaboration** (Liveblocks) — when several collaborators open the same workspace, edits sync live to every editor with an online-count badge; degrades gracefully to offline editing when unconfigured
- **One-click static publish** — the workspace toolbar's **Publish** button inlines all files into a single self-contained HTML and returns a public unguessable link (`/p/<token>`), no external deploy needed; republish keeps the link, unpublish 404s it
- **AI Agent** — build/modify apps from natural language; the agent writes code files directly (supports markdown output and auto-run)
- **Multi-turn tool loop** — the agent can call external tools (GitHub/GitLab list/read/create-issue) mid-conversation, gated by the per-connection **read-only / read-write** capability (write tools require an explicit grant); tool calls are shown in the chat
- **Multiple AI providers** — add several LLMs (DeepSeek / OpenAI / local, etc.) dynamically from the admin panel

### Output formats (blueprints)
- **Output formats** — the deployment's standard "New …" menu (Document / Presentation / Spreadsheet bundled), each with seed files and an agent hint
- **Start with a format** — one-click creation from the home page; switch a workspace's format anytime from the editor toolbar (existing files are preserved)
- **Template marketplace** — submit any workspace as a template; admins review it in Admin → Formats and approve it for everyone
- **Admin curation** — enable/disable formats, edit presentation (noun/plural/icon) and agent hint, review pending submissions
- **Outputs grouped by kind** — the Outputs page groups workspaces by their format family (Docs / Decks / Sheets / Apps)
- **Blueprint archives carry the format** — `.gadget.json` export/import preserves the workspace's format association

### Content & sharing
- **Outputs** — aggregated list of all workspace apps (grid/list views + search)
- **Blueprints** — your app list + export/import `.gadget.json` archives + public share links (viewable without login)
- **Explore** — discover and try ideas
- **Favorites** — star workspaces and filter by them
- **Workspace collaborators** — invite users by username with **read-only / editable** roles; read-only collaborators get a locked editor and disabled agent; the owner manages the team from the workspace toolbar
- **File-level shares** — grant a single file inside a workspace without opening the whole workspace (effective access = max of workspace + file roles)
- **Public context library** — mark a context doc public → admin review queue (Admin → Formats) → approved docs appear in the public library and every user's agent references them automatically
- **Notifications** — in-app bell (polls every 30s) for collaborator changes, doc review results, ticket replies; **Profile → Notification preferences** opts event types into email (Resend)

### Admin & governance
- **Profiles** — display name, avatar, password
- **User groups & permissions** — groups fully determine what a user can do (workspace/AI, file sharing, context docs, connections, admin access, user management)
- **User management** `/admin/users` — create/delete users, change passwords/emails, move between groups
- **AI usage quotas** — per-user and per-group **daily AI call limits** (user quota overrides group); hitting the limit returns 429 and resets at midnight
- **Operation log** `/admin/audit` — audit trail of sign-ins (with IP), agent runs, and AI calls (with token usage); **export the current filter as CSV/JSON** (BOM-prefixed) for archiving
- **Scheduled tasks** — admin-defined cron jobs (AI instruction against a workspace, or HTTP callback) swept once a day via Vercel Cron (`/api/cron/daily`, guarded by `CRON_SECRET`); the sweep runs every task that came due since its last run, so hourly schedules still fire on the free plan, with per-run logs
- **Ticket management** `/admin/tickets` — review and handle user tickets
- **Analytics** `/analytics` — personal stats (workspaces, files, today's sign-in IPs, AI token usage); admins additionally see a site-wide daily summary with login-IP distribution
- **Site customization** — brand favicon/logo, optional full-site background image (env-configured), human verification (Turnstile + reCAPTCHA), registration toggle

### Remote connections (SSH)
- **SSH host manager** — add/remove/test servers with password or private-key auth; credentials are **AES-256-GCM encrypted** at rest (never plaintext)
- **Live monitoring** — probe a host to show hostname, OS, cores, uptime, load, memory and disk usage
- **Command terminal** — run a command and stream its output live over SSE; auto-reconnects (up to 5 attempts) on transient failures and shows a clear timeout message if it gives up
- **Persistent sessions** — open a session from the terminal header to keep the **working directory and exported env vars** across commands (`cd` + `export` are parsed and restored on every run); sessions expire after `SSH_SESSION_TTL_MINUTES` (default 30) of inactivity
- Host input accepts `host:port`, plain domains, and IPv6 (`[::1]:22`)

### Pages deploy (Cloudflare Pages)
- **Cloudflare Pages-style deploy** at `/pages` — deploy a static site from a **workspace**, a **GitHub/GitLab repo**, or a **ZIP/文件夹** upload, all in one UI
- Live project list with real `.pages.dev` subdomains, custom-domain binding, delete-with-confirmation, and source-aware redeploy
- Optional **short links** (sink.cool) that redirect to the long Pages URL
- Optional **Cloudflare KV** response cache (up to 5 namespaces, numbered `KV_*_2`…`_5`, write-all / read-fallthrough) to keep Pages project lists and Git repo enumeration instant

### Persistence
- **Postgres** via Prisma (Vercel Postgres or Neon free tier), replacing the original Durable Object + SQLite model
- **Optional multi-database** — offload cold data (audit logs, email verification codes) to up to 4 secondary Neon databases (`MULTI_DB_ENABLED`) to keep the primary small; reads merge across DBs and cold writes safely fall back to the primary on failure

### Removed (not part of this rewrite)
- Per-gadget sandboxed processes (Dynamic Workers) → replaced by browser iframe static preview
- Gatekeeper external-OAuth integrations (GitHub/Google/Slack, require external service setup). Note: GitHub/GitLab **OAuth is still available** for signing in and for **Pages Git deploys**.

> Realtime multi-user collaboration is **back** via Liveblocks (see Workspace & agent) — the original Yjs collab is not ported, but the same UX (live edits + presence) is provided by the Liveblocks integration instead.

## 🧰 Tech Stack

- **Next.js 14** (App Router, full-stack, Route Handlers as the backend)
- **React 18 + Tailwind CSS + lucide-react**
- **Prisma + Postgres** (Vercel Postgres or Neon free tier)
- **Monaco Editor** for code editing
- **@liveblocks/client** for realtime collaboration
- **OpenAI SDK** (compatible with any OpenAI endpoint, incl. DeepSeek and local ollama)

## 🚀 Getting Started

### Local development

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env: DATABASE_URL, AUTH_SECRET, OPENAI_API_KEY

# 3. Initialize the database
pnpm db:push

# 4. Start the dev server
pnpm dev
# Visit http://localhost:3000
```

### Deploy to Vercel

1. **Database** — create a free Postgres instance on [Neon](https://neon.tech) or Vercel and note the `DATABASE_URL`.
2. **Import** — push the repo to GitHub and import it in Vercel (**Add New → Project**).
3. **Environment variables** — add the ones you need (see the table below).
4. **Build command** — in Settings → General, set:

   ```
   pnpm install && pnpm db:push && pnpm build
   ```

5. **Deploy** and wait 1–3 minutes.

### Environment variables

| Key | Description | Required |
|---|---|---|
| `DATABASE_URL` | Neon/Postgres connection string | ✅ |
| `AUTH_SECRET` | Session signing secret (`openssl rand -base64 32`) | ✅ |
| `PUBLIC_SITE_URL` | Public origin, e.g. `https://os.example.com` | ✅ |
| `ADMIN_USERNAME` | Admin usernames, comma-separated | Recommended |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `DEFAULT_MODEL` | LLM (or add providers from the admin panel) | Recommended |
| `LIVEBLOCKS_SECRET_KEY` | Liveblocks secret key — enables realtime collaboration | Optional |
| `CRON_SECRET` | Guard for `/api/cron/*` endpoints (scheduled tasks, cleanup, backups) | Optional |

See the **[简体中文配置文档](/docs/env)** / **[English configuration docs](/en/docs/env)** for the full list of optional variables (OAuth, email, human verification, branding, comments, etc.).

## 🔐 OAuth Callback URLs

Configure the callback exactly as below (replace `os.example.com` with your domain):

| Service | Production (Vercel) | Local |
|---|---|---|
| **GitHub** | `https://os.example.com/api/auth/github/callback` | `http://localhost:3000/api/auth/github/callback` |
| **Google** | `https://os.example.com/api/auth/google/callback` | `http://localhost:3000/api/auth/google/callback` |
| **Microsoft** | `https://os.example.com/api/auth/microsoft/callback` | `http://localhost:3000/api/auth/microsoft/callback` |

> `PUBLIC_SITE_URL` must match the domain used in the callbacks.

## 🧭 Documentation

- [简体中文文档](/docs) — 从部署到每个功能的完整指南
- [English docs](/en/docs) — full English guide
- Key pages: [Deploy](/docs/deploy) · [Environment variables](/docs/env) · [Static publish](/docs/publish) · [Realtime collaboration](/docs/realtime) · [Sharing & collaboration](/docs/sharing) · [KV cache](/docs/kv)
- [Cloudflare Access setup](docs/CLOUDFLARE_ACCESS_SETUP.md)

## 🏗 Architecture

| Original Cloudflare OS | This rewrite |
|---|---|
| Durable Object + SQLite | Postgres (Prisma) |
| Dynamic Worker sandbox | Browser iframe + CSP |
| Cap'n Web RPC over WebSocket | REST API (Next.js Route Handlers) |
| Workers AI / multi-provider | OpenAI-compatible SDK |
| KV / R2 | Postgres columns |

## 🔒 Security

- Passwords are hashed server-side with scrypt (`crypto.scrypt`, Node built-in, no native compile).
- Sessions are JWT (HS256) signed with `AUTH_SECRET`, expiring after 7 days.
- The preview iframe is sandboxed via CSP.
- `/api/preview/:id` requires a short-lived HMAC-signed URL (10-min TTL) minted server-side after authorizing the caller (the workspace owner, or a valid public blueprint share). A bare workspace id returns `403`, so private workspace source is not exposed by guessing an id.

## 🤝 Contributing

Contributions are welcome. Please:

1. Fork the repo and create a feature branch.
2. Run `pnpm lint` / `pnpm types:check` (or `npx tsc --noEmit`) before pushing.
3. Keep `workshop-backend` / `workshop-shared` diffs small and well-commented if applicable.

## 📄 License

This is a rewrite of [Cloudflare OS](https://github.com/cloudflare/cloudflare-os), which is licensed under the [Apache License 2.0](https://github.com/cloudflare/cloudflare-os/blob/master/LICENSE). This project is distributed under the same license.
