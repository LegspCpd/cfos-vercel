# Environment Variables

> Configure all environment variables in Vercel project **Settings → Environment Variables**.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (Neon) |
| `AUTH_SECRET` | Yes | Session signing secret |
| `ADMIN_USERNAME` | Recommended | Admin usernames, comma-separated |
| `PUBLIC_SITE_URL` | When signing in | Your public base URL |
| `OPENAI_API_KEY` | AI features | LLM API key |
| `OPENAI_BASE_URL` | Non-OpenAI | LLM endpoint, e.g. DeepSeek |
| `DEFAULT_MODEL` | Optional | Default model |
| `GITHUB_CLIENT_ID` | GitHub sign-in | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub sign-in | GitHub OAuth Client Secret |
| `GOOGLE_CLIENT_ID` | Google sign-in | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google sign-in | Google OAuth Client Secret |
| `MICROSOFT_CLIENT_ID` | Microsoft sign-in | Microsoft Entra ID Client ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft sign-in | Microsoft OAuth Client Secret |
| `MICROSOFT_TENANT_ID` | Microsoft sign-in | Tenant ID, default `common` (multi-tenant) |
| `GITLAB_CLIENT_ID` | GitLab connection | GitLab OAuth Application ID |
| `GITLAB_CLIENT_SECRET` | GitLab connection | GitLab OAuth Secret |
| `GITLAB_BASE_URL` | GitLab connection | Instance base URL, default `https://gitlab.com` |
| `RESEND_API_KEY` | Email verification | Resend API key, e.g. `re_xxxxxx` |
| `RESEND_FROM_EMAIL` | Email verification | Sender, default `no-reply@your-domain.com` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Human verification | Cloudflare Turnstile (locks the admin panel once set) |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | Human verification | Google reCAPTCHA (locks the admin panel once set) |
| `IMGHOST_BASE_URL` | Avatar image host | Default `https://hub.your-domain.com` |
| `IMGHOST_TOKEN` | Avatar image host | Image host API token, e.g. `imgbed_xxx` |
| `IMGHOST_FOLDER` | Avatar image host | Upload folder, default `photos/avatars` |
| `ALLOW_SIGNUPS` | Registration toggle | `enabled` allows signup / `disabled` blocks (env takes precedence over the admin toggle) |
| `NEXT_PUBLIC_COMMENTS_ENABLED` | Public comments/chat | `true` enables the bottom-right Waline comment widget, off by default |
| `NEXT_PUBLIC_BEIJIN` | Site-wide background | Background image URL, re-requested on every refresh; client components need the `NEXT_PUBLIC_` prefix |
| `SITE_IMG_URL` | Site icon / logo | Image URL for a custom favicon/logo. At build time it is downloaded and converted to PNG for the site icon (works even if the source is JPG). `SITE_IMG_URL` is used server-side for the favicon; for the client-side logo use `NEXT_PUBLIC_SITE_IMG_URL` (recommended: set both to the same value) |
| `NEXT_PUBLIC_COMMENTS_SERVER_URL` | Comment service | Waline comment server URL (used when comments are enabled) |
| `NEXT_PUBLIC_WALINE_CSS` / `NEXT_PUBLIC_WALINE_JS` | Comment assets | Waline front-end asset CDN URLs (default: unpkg official) |
| `VERIFY_CODE_TTL_MINUTES` | Code lifetime | Email verification-code lifetime in minutes (default 10) |
| `R2_ACCOUNT_ID` | File sharing | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | File sharing | Cloudflare R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | File sharing | Cloudflare R2 Secret Key |
| `R2_BUCKET` | File sharing | Cloudflare R2 bucket name |
| `CF_ACCESS_TEAM` | CF Access | Cloudflare team name (required) |
| `CF_ACCESS_AUD` | CF Access | Cloudflare AUD Tag (optional, can be skipped) |
| `CRON_SECRET` | Optional | Access key for the cleanup cron |

## Generate AUTH_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the output into `AUTH_SECRET`.

## Grouped by feature

### Required
- `DATABASE_URL`, `AUTH_SECRET`

### AI
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `DEFAULT_MODEL`

### Sign-in (OAuth)
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `PUBLIC_SITE_URL` (GitHub)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google)

### Email verification (Resend)
- `RESEND_API_KEY` (required to enable email signup verification)
- `RESEND_FROM_EMAIL` (optional, default `no-reply@your-domain.com`, the domain must be verified in Resend)

> Human verification (Turnstile / reCAPTCHA) **supports env var config** (recommended; the admin panel locks once set):
> - `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY`
> - Or configure in the admin panel `/admin` → Site settings (editable only when that provider has no env var)
> - Env vars take precedence over the admin panel.
>
> Custom icons (favicon/logo) are configured in the admin panel `/admin` → Site settings (stored in the DB, not via env vars).

### File sharing (R2)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`

### Cloudflare Access
- `CF_ACCESS_TEAM` (required), `CF_ACCESS_AUD` (optional)

## After changing environment variables

You must **Redeploy** for changes to take effect.
