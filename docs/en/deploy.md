# Deploy Guide

> Deploy Cloudflare OS to Vercel and attach a custom domain, from scratch.

## Prerequisites

| Requirement | Purpose | Free? |
|---|---|---|
| GitHub account | Host code, authorize Vercel | Free |
| Neon account | Free Postgres | Free |
| Vercel account | Deployment platform | Free |
| Cloudflare account (optional) | R2, CF Access | Free |
| AI API key (optional) | DeepSeek / OpenAI | Paid |

## Step 1: Create a database (Neon)

1. Open **https://neon.tech**, sign up / log in
2. Click **"Create a project"**
3. Project name can be anything (e.g. `cfos`), region choose **Singapore**
4. After creation, copy the **connection string (DATABASE_URL)**:

```
postgresql://neondb_owner:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

> **Note**: the connection string contains your password — **never leak it**. If leaked, reset it in the Neon console.

> 💡 **Don't forget backups**: the database is the app's only persistent storage. Set up backups early using Neon's **Branch / point-in-time restore (PITR)** — see [Database Backup](/en/docs/backup).

## Step 2: Deploy to Vercel

### Push code to GitHub

`git init` locally, then `gh repo create` and push to GitHub.

### Import into Vercel

1. Open **https://vercel.com**, sign in with GitHub
2. **Add New → Project** → choose your repo → **Import**
3. Vercel auto-detects **Next.js**

### Important configuration

| Setting | Value |
|---|---|
| Framework | Next.js (auto) |
| **Build Command** | `pnpm install && pnpm db:push && pnpm build` |
| Output Directory | leave empty |

> **You must use the Build Command above**, otherwise DB tables aren't created and sign-in returns 500.

### Environment variables

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `AUTH_SECRET` | Random string |
| `ADMIN_USERNAME` | Admin username |

**Generate `AUTH_SECRET`**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Attach a custom domain (recommended)

1. Vercel → Settings → Domains → add `os.your-domain.com`
2. Get the CNAME record: `os → cname.vercel-dns.com`
3. Add that record at your DNS provider
4. Wait for it to propagate

### Deploy

Click **Deploy**, wait 1–3 minutes.

## Step 3: Configure the admin

- The first registered user automatically becomes admin
- Or use the `ADMIN_USERNAME=username` env var (multiple, comma-separated)
- Admins manage everything at `/admin`

## Step 4: Configure AI

**Method A (env vars)**:

| Key | Value |
|---|---|
| `OPENAI_API_KEY` | `sk-...` |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1` (DeepSeek) |
| `DEFAULT_MODEL` | `deepseek-chat` |

**Method B (admin panel)**: admin login → `/admin` → AI Providers → add.

> **Note**: `OPENAI_BASE_URL` must be set, otherwise it defaults to OpenAI and your `sk-` key will return 401.
