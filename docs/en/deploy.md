# Deploy Guide

> Take Cloudflare OS from zero to live on Vercel. Every step below says **where the command goes, what to fill in, and what it looks like**.
>
> Full env-var list: [Environment Variables](/en/docs/env). Database backups: [Database Backup](/en/docs/backup).

## 0. What you need

| Need | Purpose | Free? |
|---|---|---|
| **GitHub account** | Host the code, authorize Vercel | ✅ |
| **Neon account** | Free Postgres database | ✅ |
| **Vercel account** | Hosting platform (sign in with GitHub) | ✅ |
| **A domain** (optional) | Attach to the deployment | Paid |
| **AI API key** (optional) | DeepSeek / OpenAI etc. for AI features | ❌ Paid |

> **The minimum to get running is just 3 things**: GitHub + Neon + Vercel, all free. Set `DATABASE_URL` and `AUTH_SECRET` and you can sign in; AI and file-sharing stay off until you add those keys.

---

## Step 1: Create a database (Neon)

`DATABASE_URL` is **required** — without it the app won't start.

1. Open **https://neon.tech**, sign up and log in
2. Click **Create a project**
3. Name it anything (e.g. `cfos`); pick region **Singapore** (low latency to Asia)
4. Neon gives you a **connection string** like:
   ```
   postgresql://neondb_owner:your-password@ep-xxxx-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
5. Click **copy** next to the string and **save it in a notepad** — you'll paste it into the env vars next.

> ⚠️ **This string contains your DB password — never post it online or commit it to git.** If leaked, go to Neon console → **Reset password**.
>
> 💡 **Don't forget backups**: the database is the app's only persistent storage. Set up backups early with Neon's **Branch / PITR** — see [Database Backup](/en/docs/backup).

---

## Step 2: Push the code to GitHub

Vercel imports from GitHub, so push the repo there first.

**Run these in your local terminal** (Git Bash / PowerShell — same commands):

```bash
# 1. cd into the project
cd your/project/path

# 2. init git (if there's no .git yet)
git init
git add .
git commit -m "init"

# 3. create a remote GitHub repo and push
#    No `gh` CLI? Create an empty repo at github.com manually, then:
#    git remote add origin https://github.com/you/your-repo.git
gh repo create your-repo --public --source=. --push
```

> Public or private both work. **Private is safer** (avoids leaking connection strings). `.env` / `.env.local` are already gitignored, so they never get uploaded.

---

## Step 3: Import and deploy on Vercel

### 3.1 Import the project

1. Open **https://vercel.com**, sign in with GitHub
2. Click **Add New → Project**
3. Find your repo in the list, click **Import**
4. Vercel auto-detects **Next.js** (Framework should show Next.js)

### 3.2 Set the Build Command (critical!)

**The most commonly missed step.** On the Import page, scroll to **Build and Output Settings** and set the **Build Command** to:

```
pnpm install && pnpm db:push && pnpm build
```

> ⚠️ **You must set this.** `db:push` **creates the database tables**. If you skip it, Vercel only runs `next build`, no tables are created, and **sign-in returns 500**.

### 3.3 Add environment variables

Still on the Import page, in **Environment Variables**, add these:

| Key | Value (example) | Required |
|---|---|---|
| `DATABASE_URL` | the Neon connection string from Step 1 | ✅ |
| `AUTH_SECRET` | a random string (generate below) | ✅ |
| `PUBLIC_SITE_URL` | `https://your-domain` (or Vercel's domain) | for sign-in |
| `ADMIN_USERNAME` | your username, e.g. `admin` | Recommended |
| `OPENAI_API_KEY` | `sk-...` (e.g. DeepSeek) | AI features |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1` | AI features |
| `DEFAULT_MODEL` | `deepseek-chat` | AI features |

**Generate `AUTH_SECRET`** (run in your local terminal):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the output (a ~44-char string) into `AUTH_SECRET`.

> To run locally first, put these into a local `.env` file — see "Local development" at the end.
>
> **Other optional vars** (GitHub/Google OAuth, R2 file sharing, email verification, Cloudflare Access, human verification, etc.) are in the [Environment Variables](/en/docs/env). **The app runs fine without them** — those features just stay off.

### 3.4 Click Deploy

Hit **Deploy** and wait 1–3 minutes. First build compiles native deps (`ssh2`, `sharp`), so it's a bit slower.

**After deploy:**
- Vercel gives you a domain like `https://your-project.vercel.app`
- If you set `PUBLIC_SITE_URL`, visit that Vercel domain to confirm you can sign in

---

## Step 4: Attach your own domain (recommended)

1. Vercel project → **Settings → Domains** → enter your domain (e.g. `os.example.com`) → **Add**
2. Vercel shows a **CNAME record** like:
   ```
   os.example.com  →  cname.vercel-dns.com
   ```
3. At your DNS provider (Cloudflare / Route53 / etc.), **add a CNAME**: host `os`, value `cname.vercel-dns.com`
4. Wait for DNS to propagate (minutes to hours); Vercel auto-issues the HTTPS cert

> After the domain is live, update `PUBLIC_SITE_URL` to `https://os.example.com` and **Redeploy**.

---

## Step 5: Sign in and configure the admin

1. Open your site and **register an account**
2. **The first registered user automatically becomes admin** (if you didn't set `ADMIN_USERNAME`)
3. Go to `/admin` to manage everything:
   - **AI Providers**: add multiple LLMs (DeepSeek / OpenAI / local)
   - **User management**, **site settings**, **audit log**, etc.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Sign-in / register returns 500** | DB tables weren't created | Make sure the Build Command contains `pnpm db:push`; Redeploy |
| **`DATABASE_URL` errors** | wrong or leaked connection string | Re-copy the Neon string, update the env var |
| **AI doesn't reply** | missing `OPENAI_API_KEY` / `OPENAI_BASE_URL` | Set `OPENAI_BASE_URL=https://api.deepseek.com/v1`, otherwise the key 401s |
| **Build fails `db:push` data-loss warning** | conservative warning for new unique constraints | `--accept-data-loss` is already built in; existing data is not touched |
| **Build fails `Module parse failed ... .node`** | ssh2 native deps | already externalized in `next.config.mjs`; should pass |
| **Env vars not taking effect** | Vercel needs a redeploy | Click **Redeploy** after saving |

---

## Local development (optional)

```bash
# 1. install deps
pnpm install

# 2. copy the env template and edit it
cp .env.example .env
# open .env and fill in DATABASE_URL / AUTH_SECRET, etc.

# 3. create DB tables
pnpm db:push

# 4. start the dev server
pnpm dev
# open http://localhost:3000
```

> Locally use `http://localhost:3000`; GitHub OAuth callbacks should be `http://localhost:3000/api/auth/github/callback` (see the OAuth table in the README).

---

## Deploy flow

```
GitHub repo ──Import──▶ Vercel project
                          ├─ Build Command: pnpm install && pnpm db:push && pnpm build
                          ├─ Env: DATABASE_URL / AUTH_SECRET / ...
                          └─ Deploy ──▶ live site (.vercel.app or your domain)
```
