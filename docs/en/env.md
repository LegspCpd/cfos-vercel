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
| `IMGHOST_BASE_URL` | Avatar image host base URL, default `https://hub.your-domain.com`. |
| `IMGHOST_TOKEN` | Image host API token (e.g. `imgbed_xxx`). |
| `IMGHOST_FOLDER` | Upload folder, default `photos/avatars`. |
| `VERIFY_CODE_TTL_MINUTES` | Email verification-code lifetime in minutes, default `10`. |
| `CRON_SECRET` | Access key for the cleanup cron task. |

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
