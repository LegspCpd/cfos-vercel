# FAQ & Troubleshooting

## Deployment

### Sign-in returns 500
- **Cause**: Build Command not changed / DB tables not created
- **Fix**: ensure Build Command is `pnpm install && pnpm db:push && pnpm build`

### "Invalid username/email or password"
- **Cause**: the password is wrong, or the account uses an old argon2 hash (older builds used `argon2`; the app now uses Node built-in `crypto.scrypt` and the two are not compatible)
- **Fix**: confirm the password; for old argon2 accounts, sign in with GitHub or ask an admin to reset the password

### Domain won't open
- **Cause**: DNS not propagated
- **Fix**: check the CNAME record, wait for propagation (minutes to hours)

## AI

### Agent says "AI not configured"
- **Cause**: no provider configured
- **Fix**: add an AI Provider in the admin panel, or set `OPENAI_API_KEY`

### DeepSeek returns 401
- **Cause**: `OPENAI_BASE_URL` not set
- **Fix**: `OPENAI_BASE_URL=https://api.deepseek.com/v1`

## Sign-in

### GitHub login `redirect_uri_mismatch`
- **Cause**: callback URL mismatch
- **Fix**: check `PUBLIC_SITE_URL` matches the GitHub callback

## File sharing

### Upload says "R2 not configured"
- **Cause**: R2 variables incomplete
- **Fix**: set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`

## Cloudflare Access

See the troubleshooting table in the [Cloudflare Access](/en/docs/cf-access) section.

## Other

### Forgot admin password
- **Option A**: sign in with GitHub (if configured)
- **Option B**: reset in the database (requires DB access)

### Data backup
- All data lives in Postgres (Neon), which has automatic backups
- Shared files live in R2

### Upgrading code
- `git pull` locally → push → Vercel auto-redeploys
- If new tables were added, the `db:push` in Build Command creates them automatically
