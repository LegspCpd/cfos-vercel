# Cloudflare OS — Vercel Edition

> ⚠️ **二次开发 (Derivative work)**: This project is developed based on (二次开发自) [Cloudflare OS](https://github.com/cloudflare/cloudflare-os) under the [Apache License 2.0](LICENSE).

A full-stack rewrite of Cloudflare OS for Vercel (Next.js 14 + Postgres), removing the dependency on Cloudflare Durable Objects, Dynamic Workers, and Workers RPC.

This is a **derivative / secondary-development (二次开发)** of the original project, built on the standard `next` runtime. It preserves and restores the original product's capabilities while adapting the architecture to a classic serverless setup. See [NOTICE](NOTICE) for copyright and modification details.

## ✨ Features

### Core
- **Authentication** — register / sign-in with argon2id password hashing + JWT sessions, plus **GitHub / Google / Microsoft OAuth**, email verification-code registration, and email+password sign-in
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
- **AI Agent** — build/modify apps from natural language; the agent writes code files directly (supports markdown output and auto-run)
- **Multiple AI providers** — add several LLMs (DeepSeek / OpenAI / local, etc.) dynamically from the admin panel

### Content & sharing
- **Outputs** — aggregated list of all workspace apps (grid/list views + search)
- **Blueprints** — your app list + export/import `.gadget.json` archives + public share links (viewable without login)
- **Explore** — discover and try ideas
- **Favorites** — star workspaces and filter by them

### Admin & governance
- **Profiles** — display name, avatar, password
- **User groups & permissions** — groups fully determine what a user can do (workspace/AI, file sharing, context docs, connections, admin access, user management)
- **User management** `/admin/users` — create/delete users, change passwords/emails, move between groups
- **Operation log** `/admin/audit` — audit trail of sign-ins (with IP), agent runs, and AI calls (with token usage)
- **Ticket management** `/admin/tickets` — review and handle user tickets
- **Analytics** `/analytics` — personal stats (workspaces, files, today's sign-in IPs, AI token usage); admins additionally see a site-wide daily summary with login-IP distribution
- **Site customization** — brand favicon/logo, optional full-site background image (env-configured), human verification (Turnstile + reCAPTCHA), registration toggle

### Persistence
- **Postgres** via Prisma (Vercel Postgres or Neon free tier), replacing the original Durable Object + SQLite model

### Removed (not part of this rewrite)
- Real-time multi-user collab (Yjs)
- Per-gadget sandboxed processes (Dynamic Workers) → replaced by browser iframe static preview
- Gatekeeper external-OAuth integrations (GitHub/Google/Slack, require external service setup)
- Context & Skills (a "coming soon" placeholder in the original)
- Cloudflare Access SSO

## 🧰 Tech Stack

- **Next.js 14** (App Router, full-stack, Route Handlers as the backend)
- **React 18 + Tailwind CSS + lucide-react**
- **Prisma + Postgres** (Vercel Postgres or Neon free tier)
- **Monaco Editor** for code editing
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

- [简体中文文档](/docs)
- [English docs](/en/docs)
- [Cloudflare Access setup](docs/CLOUDFLARE_ACCESS_SETUP.md)
- [CI: hourly auto code-check](.github/AUTO_CHECK.md)

## 🏗 Architecture

| Original Cloudflare OS | This rewrite |
|---|---|
| Durable Object + SQLite | Postgres (Prisma) |
| Dynamic Worker sandbox | Browser iframe + CSP |
| Cap'n Web RPC over WebSocket | REST API (Next.js Route Handlers) |
| Workers AI / multi-provider | OpenAI-compatible SDK |
| KV / R2 | Postgres columns |

## 🔒 Security

- Passwords are hashed server-side with argon2id.
- Sessions are JWT (HS256) signed with `AUTH_SECRET`, expiring after 7 days.
- The preview iframe is sandboxed via CSP.
- `/api/preview/:id` is currently unauthenticated (single-user / local scenario). For multi-tenant deployments, switch to signed preview URLs (see the comments in that route).

## 🤝 Contributing

Contributions are welcome. Please:

1. Fork the repo and create a feature branch.
2. Run `pnpm lint` / `pnpm types:check` (or `npx tsc --noEmit`) before pushing.
3. Keep `workshop-backend` / `workshop-shared` diffs small and well-commented if applicable.

## 📄 License

This is a rewrite of [Cloudflare OS](https://github.com/cloudflare/cloudflare-os), which is licensed under the [Apache License 2.0](https://github.com/cloudflare/cloudflare-os/blob/master/LICENSE). This project is distributed under the same license.
