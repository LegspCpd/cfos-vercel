# Environment Variables

This document lists every environment variable the application uses, along with its purpose, whether it is required, and its default value.

## Configuration Location

Environment variables are configured in **Vercel project → Settings → Environment Variables**. For local development, create a `.env` file in the project root (see `.env.example`).

Changes to environment variables take effect only after a **Redeploy**.

## Variable Reference

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres (Neon / Vercel Postgres) connection string. |
| `AUTH_SECRET` | Secret used to sign sessions. See «Generate AUTH_SECRET» below. |

### Recommended

| Variable | Description |
|---|---|
| `ADMIN_USERNAME` | Admin usernames, comma-separated. When unset, the first registered user becomes admin. |
| `PUBLIC_SITE_URL` | Public base URL of the app (used for sign-in, OAuth callbacks, etc.), e.g. `https://os.example.com`. |
| `OPENAI_API_KEY` | LLM API key (DeepSeek, OpenAI, etc.). |
| `OPENAI_BASE_URL` | LLM API endpoint; required when not using the OpenAI default address, e.g. `https://api.deepseek.com/v1`. |
| `DEFAULT_MODEL` | Default model name, e.g. `deepseek-chat`. |

> LLM providers can also be added dynamically from the admin panel `/admin`; these variables configure the default provider.

### Third-party Sign-in (OAuth)

| Variable | Description |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID. |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret. |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret. |
| `MICROSOFT_CLIENT_ID` | Microsoft Entra ID Client ID. |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth Client Secret. |
| `MICROSOFT_TENANT_ID` | Tenant ID, default `common` (multi-tenant). |
| `GITLAB_CLIENT_ID` | GitLab OAuth Application ID (used by the external-connection feature). |
| `GITLAB_CLIENT_SECRET` | GitLab OAuth Secret. |
| `GITLAB_BASE_URL` | GitLab instance base URL, default `https://gitlab.com`. |

See the OAuth callback table in the main README for the exact callback URLs.

### Email Verification (Resend)

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key (`re_xxxxxx`). Enables email-verification registration when set. |
| `RESEND_FROM_EMAIL` | Sender address, default `no-reply@your-domain.com`; the domain must be verified in Resend. |

### Human Verification (Turnstile / reCAPTCHA)

| Variable | Description |
|---|---|
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile site key and secret. |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA site key and secret. |

Configuring either provider locks that provider's settings in the admin panel; environment variables take precedence over admin-panel configuration.

### File Sharing (Cloudflare R2)

| Variable | Description |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare Account ID. |
| `R2_ACCESS_KEY_ID` | R2 Access Key. |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Key. |
| `R2_BUCKET` | R2 bucket name. |

### Pages Deploy (Cloudflare Pages — deploy apps)

The **Pages** feature (`/pages`) deploys workspace files, Git repositories (GitHub/GitLab),
or ZIP uploads to Cloudflare Pages as static sites, and auto-creates short links.

| Variable | Description |
|---|---|
| `PAGES_KEY` | Cloudflare API Token with **Cloudflare Pages → Edit** (Deploy) permission. Required to enable the Pages feature. |
| `PAGES_ACCOUNT_ID` | Cloudflare Account ID (the account that owns the Pages projects). |
| `PAGES_SUBDOMAIN` | Pages workers subdomain, default `pages.dev`. |
| `S_LINK` | Short-link service token (e.g. sink.cool). Optional — without it deploys still work but no short link is created. |
| `S_LINK_BASE` | Short-link service base URL, default `https://sink.cool`. |
| `PAGES_BILLING_SHOW` | Show the "Billing" card in the right-hand usage panel; `true`/`false`, off by default. |
| `PAGES_ACCOUNT_SHOW` | Show the "Account Details" card in the right-hand usage panel; `true`/`false`, off by default. |

> Git-source deploys (from GitHub / GitLab repositories) also need the corresponding OAuth
> variables from the **Third-party Sign-in** section (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`
> and/or `GITLAB_CLIENT_ID`/`GITLAB_CLIENT_SECRET`). Those are reused for Pages Git deploys.

### Cloudflare Workers (Compute → Worker) deploy (optional)

The **Compute** → **Worker** nav entry deploys JS scripts as Cloudflare Workers. It is **separate
from Pages** and uses its own `WORKER_` env vars (uppercase) so it never collides with `PAGES_*`.
The Worker feature is available once `WORKER_API_TOKEN` and `WORKER_ACCOUNT_ID` are set.

| Variable | Description |
|---|---|
| `WORKER_API_TOKEN` | Cloudflare API token (needs **Workers Scripts → Edit** on the account). |
| `WORKER_ACCOUNT_ID` | Cloudflare account id (usually the same as `PAGES_ACCOUNT_ID`). |
| `WORKER_SUBDOMAIN` | Worker access subdomain, default `workers.dev`. |

### Cloudflare KV Response Cache (optional)

Used to make slow cross-service calls (the Cloudflare Pages project list, GitHub/GitLab repo enumeration) feel instant on repeat visits. Everything degrades gracefully when not configured (falls back to a per-instance in-memory cache).

**Up to 5 KV namespaces.** The first store uses the base names; additional stores append a numeric suffix (`_2` … `_5`). Reads try the stores in order (store 1 first) and fall through on a miss; writes fan out to **every** configured store so any reader finds the value. You only need one store to get going — the rest are optional.

Store 1 (required base):

| Variable | Description |
|---|---|
| `KV_ACCOUNT_ID` | Cloudflare account id (same account as the Pages projects). |
| `KV_API_TOKEN` | Cloudflare API token with KV read/write on the namespace. You can reuse `PAGES_KEY` if that token also has **Workers KV → Edit** permission, otherwise create a dedicated token. |
| `KV_NAMESPACE_ID` | The KV namespace id to store into. Create a namespace in Cloudflare → Workers & Pages → KV and paste its ID here — "give it an ID and it just works". |

Stores 2–5 (optional) — same three vars with a numeric suffix:

| Variable | Description |
|---|---|
| `KV_ACCOUNT_ID_N` / `KV_API_TOKEN_N` / `KV_NAMESPACE_ID_N` | The N-th store (N = 2..5), where N is a plain number (e.g. `KV_NAMESPACE_ID_2`). |

Example — two stores:
```
KV_ACCOUNT_ID=...
KV_API_TOKEN=...
KV_NAMESPACE_ID=...
KV_ACCOUNT_ID_2=...
KV_API_TOKEN_2=...
KV_NAMESPACE_ID_2=...
```

Shared tuning vars (one set, applies to all stores):

| Variable | Description |
|---|---|
| `KV_PREFIX` | Optional cache-key prefix (isolate multiple instances), default `cfos`. |
| `KV_DEFAULT_TTL` | Default cache TTL in seconds, default `60`. |
| `KV_PAGES_PROJECTS_TTL` | TTL (seconds) for the Pages project list, default `15`. |
| `KV_GIT_REPOS_TTL` | TTL (seconds) for the per-user GitHub/GitLab repo lists, default `60`. |
| `KV_PAGES_STATS_TTL` | TTL (seconds) for the Pages usage panel stats, default `8`. |
| `KV_ME_TTL` | TTL (seconds) for `/api/me` (per-user profile), default `5`. |
| `KV_ANALYTICS_TTL` | TTL (seconds) for `/api/analytics` (per-user, IP always live), default `30`. |
| `KV_SITE_TTL` | TTL (seconds) for the public `/api/site` settings, default `30`. |
| `KV_SSH_HOSTS_TTL` | TTL (seconds) for the per-user SSH host list, default `10`. |

### Cloudflare D1 Secondary Backup (optional, OFF by default)

A redundant store that **mirrors the KV cache** (and can hold copies of important data alongside
Neon). When enabled, every KV cache write is also copied to D1, and a KV miss falls back to D1.
Default OFF — set `D1_ENABLED=true` to turn it on.

| Variable | Description |
|---|---|
| `D1_ENABLED` | Set to `true`/`1` to enable the D1 mirror. Omit to keep it off. |
| `D1_API_KEY` | Cloudflare API token (needs **Workers D1 read/write** on the database). |
| `D1_ACCESS` | Cloudflare account id (usually the same as `PAGES_ACCOUNT_ID`). |
| `D1_SQL_1` … `D1_SQL_5` | Up to **5** D1 database ids. Configuring **more than 5** raises an error asking you to remove one. |
| `D1_BACKUP_RETENTION` | How many recent snapshots/dumps to keep (default `30`). |
| `CRON_SECRET` | Required to run the cron endpoints (`/api/cron/daily` — the single daily sweep that bundles cleanup, cache-warm, scheduled tasks and the D1 backup). |

> The mirror table (`cache_store`) is created automatically on first use. All D1 operations are
> best-effort: a D1 failure never breaks a request — it just means the mirror/fallback is skipped.
>
> **Backups are stored IN D1 (not R2 — R2 is reserved for file sharing).** The cron job copies the
> most important Neon data into D1 (`neon_backup` snapshot) and dumps the D1 database(s) into D1
> (`d1_dumps` table), keeping only the newest `D1_BACKUP_RETENTION` entries.

### Cloudflare Access (full-site gate)

| Variable | Description |
|---|---|
| `CF_ACCESS_TEAM` | Cloudflare team name. Required. |
| `CF_ACCESS_AUD` | Cloudflare AUD Tag. Optional. |

### Site Appearance & Comments

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_BEIJIN` | Site-wide background image URL; re-requested on every refresh. Client components need the `NEXT_PUBLIC_` prefix. |
| `SITE_IMG_URL` | Server-side favicon/logo image URL. At build time it is downloaded and converted to PNG for the site icon (works even if the source is JPG). |
| `NEXT_PUBLIC_SITE_IMG_URL` | Client-side logo image URL; it is recommended to set this to the same value as `SITE_IMG_URL`. |
| `NEXT_PUBLIC_COMMENTS_ENABLED` | Whether the bottom-right Waline comment widget is enabled; `true` / `false`, off by default. |
| `NEXT_PUBLIC_COMMENTS_SERVER_URL` | Waline comment server URL (used when comments are enabled). |
| `NEXT_PUBLIC_WALINE_CSS` / `NEXT_PUBLIC_WALINE_JS` | Waline front-end asset CDN URLs, default unpkg official. |

### Other

| Variable | Description |
|---|---|
| `ALLOW_SIGNUPS` | Registration toggle; `enabled` / `disabled`. Takes precedence over the admin-panel toggle. |
| `REDIRECT_TO_DOMAIN` | Canonical-domain redirect (optional). When set, every request whose Host is NOT this domain (old domains, `*.vercel.app` preview domains, etc.) is **308-permanently redirected** to it, preserving the path and query string. When unset, nothing is redirected (local development is unaffected). Example: `REDIRECT_TO_DOMAIN=os.legspcpd.top`. |
| `IMGHOST_BASE_URL` | Avatar image host base URL, default `https://hub.your-domain.com`. |
| `IMGHOST_TOKEN` | Image host API token (e.g. `imgbed_xxx`). |
| `IMGHOST_FOLDER` | Upload folder, default `photos/avatars`. |
| `VERIFY_CODE_TTL_MINUTES` | Email verification-code lifetime in minutes, default `10`. |
| `CRON_SECRET` | Access key for the cron endpoints (`/api/cron/daily` and friends). |
| `CACHE_WARM_INTERVAL_MINUTES` | How often the daily cron re-warms the KV cache (default `60`). The daily sweep skips warming when the last warm was more recent than this interval. |
| `SSH_SESSION_TTL_MINUTES` | SSH persistent-session inactivity timeout in minutes, default `30`. |
| `LIVEBLOCKS_SECRET_KEY` | Liveblocks **Secret key** (`sk_dev_...`); when set, the workspace code editor enables **multi-user realtime collaboration**. When unset, the editor stays purely offline (see [Realtime Collaboration](/en/docs/realtime)). |
| `INDEXNOW_KEY` | Bing **IndexNow** key (generate with `openssl rand -hex 16`). When set, the site serves `/{key}.txt` at the root and a daily cron submits the public URLs to Bing for faster indexing (see [Search & Indexing](/en/docs/usage#search--indexing)). When unset, IndexNow is fully off; `sitemap.xml` / `robots.txt` still work. |

### Multiple Databases (optional)

| Variable | Description |
|---|---|
| `DATABASE_URL_2` – `DATABASE_URL_5` | Connection strings for the 2nd through 5th Neon databases, used to store cold data (audit log, email verification codes). |
| `MULTI_DB_ENABLED` | Whether multiple databases are enabled; `true` / `false`, off by default. When enabled, at least one of `DATABASE_URL_2`..`DATABASE_URL_5` must be set. |
| `MULTI_DB_COLD_TABLES` | Cold-data table routing; format `table@secondary-index`, e.g. `audit@0,verification@0`; default `audit,verification` (both routed to the first secondary). |

See «Multiple Databases» below for the enablement steps and behavioral guarantees.

## Generate AUTH_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the command output into `AUTH_SECRET`.

## Multiple Databases

When a single Neon database is close to its storage limit, low-priority cold data (audit log, email verification codes) can be routed to dedicated Neon databases (up to 4 secondaries plus 1 primary, 5 in total), keeping the primary for important data.

### Enablement

1. Create the secondary database(s) and set their connection strings in `DATABASE_URL_2`; add `DATABASE_URL_3` through `DATABASE_URL_5` as needed.
2. Set `MULTI_DB_ENABLED=true`.
3. Optionally use `MULTI_DB_COLD_TABLES` to specify which table goes to which secondary; by default both `audit` and `verification` route to the first secondary.

### Behavior

- Once enabled, newly written audit log entries and email verification codes are written directly to the designated secondary; the primary stops growing.
- Reads merge the primary with all secondaries: the admin panel, analytics, and verification-code checks query and combine results, so old primary data and new secondary data are both visible.
- Existing primary data is not migrated or deleted automatically; this feature only stops primary growth and does not clean historical data.
- If a secondary connection or initialization fails, cold-data writes fall back to the primary automatically; registration, email-change, and audit flows are unaffected.
- Merged reads tolerate individual secondary failures: a failing secondary is skipped without blocking the overall result.
- When no secondary is configured or `MULTI_DB_ENABLED` is unset, all data is written to the primary, matching the single-database behavior.

### Hard Limits

- The project supports at most 5 Neon databases (1 primary + 4 secondaries).
- The build validates the configuration: if a 6th or higher connection string is present (e.g. `DATABASE_URL_6`), the build fails to signal that the limit was exceeded.
- Only the `audit` (audit log) and `verification` (email verification code) tables, which have no foreign-key relations, can be routed to secondaries. Important foreign-keyed tables (users, workspaces, files, chats) are never migrated.
- If the secondaries live on a different Neon instance from the primary, run `pnpm db:push:secondary` once against each secondary connection string to create the two tables from `schema-secondary.prisma`.
