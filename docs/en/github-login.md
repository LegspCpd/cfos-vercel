# Sign-in Setup (GitHub + Google)

> Support one-click sign-in with GitHub or Google. After configuring, just fill in the keys as Vercel env vars and Redeploy — no code changes needed.

## Callback / Redirect URI quick reference

When configuring an OAuth app in the GitHub/Google console, **the callback URL must match exactly** (otherwise you'll get `redirect_uri_mismatch`). Replace `os.legspcpd.top` with your own domain.

| Service | Production (Vercel) | Local dev |
|---|---|---|
| **GitHub** | `https://os.legspcpd.top/api/auth/github/callback` | `http://localhost:3000/api/auth/github/callback` |
| **Google** | `https://os.legspcpd.top/api/auth/google/callback` | `http://localhost:3000/api/auth/google/callback` |

The `PUBLIC_SITE_URL` env var must match the callback domain (e.g. `https://os.legspcpd.top`).

## GitHub sign-in

## Create an OAuth App

1. Open **https://github.com/settings/developers**
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name**: `Cloudflare OS`
   - **Homepage URL**: `https://os.legspcpd.top`
   - **Authorization callback URL**: `https://os.legspcpd.top/api/auth/github/callback`
4. Click **Register application**

## Get credentials

- **Client ID**: copy it from the app detail page
- **Client Secret**: click **"Generate a new client secret"** → copy it **immediately** (shown only once)

## Configure in Vercel

Add environment variables:

```
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
PUBLIC_SITE_URL=https://os.legspcpd.top
```

**Redeploy** to apply. The sign-in page will now show "Continue with GitHub".

## Local testing

For local development, point the callback at localhost:

- GitHub OAuth callback: `http://localhost:3000/api/auth/github/callback`
- In `.env`: `PUBLIC_SITE_URL=http://localhost:3000`

## Connect GitHub (external connection)

After deploy, sign in → sidebar **Connections** → connect GitHub. Once connected, the agent can read your repositories and files.

## Google sign-in

Create an OAuth 2.0 Client ID in **Google Cloud Console**:

1. Open **https://console.cloud.google.com** → select or create a project
2. Left side **APIs & Services → OAuth consent screen** → fill in app name etc., save
3. **Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs**: `https://os.legspcpd.top/api/auth/google/callback` (local test: `http://localhost:3000/api/auth/google/callback`)
4. After creation, copy the **Client ID** and **Client Secret**

Configure in Vercel env vars:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
PUBLIC_SITE_URL=https://os.legspcpd.top
```

**Redeploy** to apply. The sign-in page will show "Continue with Google".

> Note: Google sign-in uses the email prefix as the username. If that username already exists (e.g. registered with a password), the Google account is automatically linked to the existing account rather than creating a duplicate.

## FAQ

| Symptom | Cause & fix |
|---|---|
| Google `redirect_uri_mismatch` | **Google Cloud Console → Credentials → your OAuth Client → Authorized redirect URIs** is missing `https://os.legspcpd.top/api/auth/google/callback`. Add it **exactly** (one URL per line, no trailing slash), save, retry. |
| GitHub `redirect_uri_mismatch` | The GitHub OAuth App's **Authorization callback URL** doesn't match `https://os.legspcpd.top/api/auth/github/callback` |
| Sign-in fails | `GITHUB_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET` is wrong/missing, or env vars were changed without Redeploy |
