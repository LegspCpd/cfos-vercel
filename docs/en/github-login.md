# Sign-in Setup (GitHub + Google)

> Support one-click sign-in with GitHub or Google. After configuring, just fill in the keys as Vercel env vars and Redeploy — no code changes needed.

## Callback / Redirect URI quick reference

When configuring an OAuth app in the GitHub/Google console, **the callback URL must match exactly** (otherwise you'll get `redirect_uri_mismatch`). Replace `os.your-domain.com` with your own domain.

| Service | Production (Vercel) | Local dev |
|---|---|---|
| **GitHub** | `https://os.your-domain.com/api/auth/github/callback` | `http://localhost:3000/api/auth/github/callback` |
| **Google** | `https://os.your-domain.com/api/auth/google/callback` | `http://localhost:3000/api/auth/google/callback` |
| **Microsoft** | `https://os.your-domain.com/api/auth/microsoft/callback` | `http://localhost:3000/api/auth/microsoft/callback` |

The `PUBLIC_SITE_URL` env var must match the callback domain (e.g. `https://os.your-domain.com`).

## GitHub sign-in

## Create an OAuth App

1. Open **https://github.com/settings/developers**
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name**: `Cloudflare OS`
   - **Homepage URL**: `https://os.your-domain.com`
   - **Authorization callback URL**: `https://os.your-domain.com/api/auth/github/callback`
4. Click **Register application**

## Get credentials

- **Client ID**: copy it from the app detail page
- **Client Secret**: click **"Generate a new client secret"** → copy it **immediately** (shown only once)

## Configure in Vercel

Add environment variables:

```
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
PUBLIC_SITE_URL=https://os.your-domain.com
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
   - **Authorized redirect URIs**: `https://os.your-domain.com/api/auth/google/callback` (local test: `http://localhost:3000/api/auth/google/callback`)
4. After creation, copy the **Client ID** and **Client Secret**

Configure in Vercel env vars:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
PUBLIC_SITE_URL=https://os.your-domain.com
```

**Redeploy** to apply. The sign-in page will show "Continue with Google".

> Note: Google sign-in uses the email prefix as the username. If that username already exists (e.g. registered with a password), the Google account is automatically linked to the existing account rather than creating a duplicate.

## Microsoft sign-in (detailed guide)

Sign in with a **Microsoft Entra ID (Azure AD)** account. Full step-by-step:

### Step 1: Register the app
1. Open **https://portal.azure.com** and sign in with your Microsoft account (preferably admin)
2. In the top search bar type **"App registrations"** and open it
3. Click **"+ New registration"**
4. Fill in:
   - **Name**: `Cloudflare OS`
   - **Supported account types**: **must select the third option**
     ```
     Accounts in any organizational directory (Any Azure AD directory - Multitenant)
     and personal Microsoft accounts (e.g. Skype, Xbox)
     ```
     > Only this option allows **any company tenant + personal Microsoft accounts (Outlook/consumer)** to sign in.
   - **Redirect URI**: choose platform **Web**, enter `https://os.your-domain.com/api/auth/microsoft/callback`
     - For local testing, click **"Add a URI"** and add `http://localhost:3000/api/auth/microsoft/callback`
5. Click **Register**

> The callback must be **exactly** `/api/auth/microsoft/callback` — not just the domain — otherwise you'll get `redirect_uri_mismatch`.

### Step 2: Copy the Client ID
After registering you land on the Overview page:
- **Application (client) ID** → this is **`MICROSOFT_CLIENT_ID`**

> There's also a **Directory (tenant) ID**, but to allow **any tenant + personal accounts** just use `common` for `MICROSOFT_TENANT_ID`.

### Step 3: Create a Client Secret
1. Left menu **Certificates & secrets** (or **Client credentials**)
2. In **Client secrets** tab, click **"+ New client secret"**
3. Fill:
   - **Description**: `cfos` (anything)
   - **Expires**: `24 months` or `12 months`
     > Secrets expire! When one expires, login breaks — create a new one and update the env var.
4. Click **Add**
5. **Copy the Value** of the new secret immediately → this is **`MICROSOFT_CLIENT_SECRET`**
   > The Value is shown only once — copy it right away.

### Step 4: Configure in Vercel

| Key | Value |
|---|---|
| `MICROSOFT_CLIENT_ID` | Client ID from step 2 |
| `MICROSOFT_CLIENT_SECRET` | Secret Value from step 3 |
| `MICROSOFT_TENANT_ID` | `common` (= any tenant + personal accounts, recommended) |

Then **Redeploy**.

### Step 5: Verify
- The sign-in page shows **"Continue with Microsoft"**
- Click it → sign in with any Microsoft account (work email or Outlook personal)
- You're redirected back logged in

### Microsoft error troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `AADSTS50011` (redirect_uri not in list) | Azure callback URI wrong | Make sure Redirect URI is **exactly** `https://os.your-domain.com/api/auth/microsoft/callback` |
| `AADSTS700016` (app not found) | Wrong Client ID | Check `MICROSOFT_CLIENT_ID` |
| `AADSTS7000215` (invalid/expired secret) | Secret wrong or expired | Create a new secret and update |
| `AADSTS90002` (tenant not found) | Wrong Tenant ID | Use `common` or the correct tenant ID |
| No button on sign-in | Env vars not set / not redeployed | Check `MICROSOFT_CLIENT_ID` and Redeploy |

## GitLab external connection (GitLab OAuth)

GitLab is an **external connection** (not sign-in): once configured, logged-in users can
connect their own GitLab account on the **Connections** page, and the agent can read
projects / create issues on their behalf (subject to Gatekeeper write access).

> **Note**: unlike GitHub/Google/Microsoft, GitLab does **not** appear on the sign-in
> page — it is purely an external-connection feature.

### Step 1: Create a GitLab OAuth Application

1. Open **https://gitlab.com/-/profile/applications** (or your self-hosted GitLab → **Preferences → Applications**)
2. Fill in:
   - **Name**: `Cloudflare OS`
   - **Redirect URI**: `https://os.your-domain.com/api/gitlab/callback`
     > Must be **exactly** `/api/gitlab/callback` — otherwise `redirect_uri_mismatch`
   - **Scopes**: tick **`read_api`** (or **`api`** if you need writes; creating issues needs `api`)
3. Click **Save application**
4. Copy the **Application ID** and **Secret** (Secret shows only once — copy immediately)

### Step 2: Add to Vercel env vars

```
GITLAB_CLIENT_ID=your Application ID
GITLAB_CLIENT_SECRET=your Secret
GITLAB_BASE_URL=https://gitlab.com
```

**Redeploy** to apply.

### Step 3: Connect & use

- Sidebar → **Connections** → GitLab → **Connect** → authorize your GitLab account
- Agent chat → bottom **External service tools (Gatekeeper)** → choose GitLab → read projects / create issues

### GitLab troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | Callback URL wrong | Set the app's **Redirect URI** to exactly `https://os.your-domain.com/api/gitlab/callback` |
| `invalid_client` | Wrong ID/Secret | Check `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` |
| GitLab missing on Connections | `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` unset | Unconfigured services are **not shown**; configure and Redeploy |

## About "unconfigured services are hidden"

The Connections page (and the sign-in page) **only shows services whose environment
variables are configured**:

- Without `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET`, the Connections page **won't show
  GitLab**
- Likewise, the GitHub / Google / Microsoft sign-in buttons appear only once their env
  vars are set

This avoids a dead card that errors on connect. Enable the services you want, then Redeploy.

## FAQ

| Symptom | Cause & fix |
|---|---|
| Google `redirect_uri_mismatch` | **Google Cloud Console → Credentials → your OAuth Client → Authorized redirect URIs** is missing `https://os.your-domain.com/api/auth/google/callback`. Add it **exactly** (one URL per line, no trailing slash), save, retry. |
| GitHub `redirect_uri_mismatch` | The GitHub OAuth App's **Authorization callback URL** doesn't match `https://os.your-domain.com/api/auth/github/callback` |
| Sign-in fails | `GITHUB_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET` is wrong/missing, or env vars were changed without Redeploy |
