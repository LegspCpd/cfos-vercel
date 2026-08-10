# Cloudflare Access (full SSO gate)

> Put an SSO gate in front of your site. Users must first sign in through your configured identity provider (IdP); backend sensitive APIs also validate the JWT that Cloudflare injects.

> **Prerequisite**: your domain must go through the Cloudflare proxy (**Proxied / orange cloud**). If the domain is grey-clouded (DNS-only) in CF, CF won't inject the JWT and Access won't work.

## How it works

```
User visits https://os.legspcpd.top
  │
  ▼
Cloudflare edge (domain proxied through CF)
  │ unauthenticated? → redirect to IdP sign-in (GitHub/Google/email)
  │◄──── signed in
  ▼
CF injects header: Cf-Access-Jwt-Assertion (JWT)
  │
  ▼
Vercel backend → validate JWT (signature/iss/aud/exp) → allow
```

## Step 1: make sure the domain is proxied (orange cloud)

1. Log in to the **Cloudflare dashboard** → select the domain `legspcpd.top`
2. **DNS → Records**, find the `os` record
3. **Proxy status** must be **Proxied (orange cloud)**
4. If not, switch it to Proxied and wait 1–2 minutes

> **Important**: this is the most important step. Grey cloud means CF won't inject the JWT. Also make sure the Vercel deployment succeeded first, otherwise you'll get a 502 under the orange cloud.

## Step 2: enter Zero Trust and create an Access application

1. Open **https://one.dash.cloudflare.com** (Zero Trust dashboard; may need to click "Get Started" to enable your team)
2. Left menu: **Access → Applications** (some accounts show **Networks → Access → Applications** — same feature)
3. Click **Add an application** → choose **Self-hosted** → click **Next** / **Continue**
4. Fill in the app config:
   - **Application name**: `Cloudflare OS` (e.g. `os`)
   - **Application domain**: `os.legspcpd.top` (**note**: must be your **custom** domain; default domains like `xxx.pages.dev` / `xxx.vercel.app` **cannot** use Access)
   - **Session duration**: e.g. `24 hours`
   - Keep the rest default → **Next**

## Step 3: configure the identity provider (IdP)

1. Check the identity providers you want to allow, e.g. **GitHub** (or email / Google)
2. Keep the rest default (MFA off, Instant Auth on) → **Next**

## Step 4: configure the access policy

1. On the **Policies** step, click **Add a policy**
2. Policy name: `allow-all` (or `cfos`)
3. **Action**: choose **Allow**
4. **Include / rules**:
   - Choose **Everyone** (allow all signed-in users)
   - Or choose **Emails** / **Emails ending in** to restrict to specific emails
5. Keep the rest default → **Next**, then **Add application**

After creation you can find the **AUD Tag** (UUID) on the app's **Overview** page, but this project doesn't strictly require it — see the next step.

## Step 5: confirm the team name (required)

The team name is used for the JWT `issuer` and must be noted. Find it in either place:
1. Open **https://one.dash.cloudflare.com**, look at the browser address bar — e.g. `https://lapdsss.cloudflareaccess.com` → team name is `lapdsss`
2. Or Zero Trust → **Settings** → see **Team domain** / **Team name**

## Step 6: configure Vercel env vars (only one needed)

**Setting only `CF_ACCESS_TEAM` is enough**; `CF_ACCESS_AUD` is an optional enhancement:

```
CF_ACCESS_TEAM=lapdsss        # ← your team name, required
# CF_ACCESS_AUD=             # ← optional. Hard to find in the new panel; can be skipped
```

> Note: `CF_ACCESS_AUD` is the Access application's AUD Tag. **It works fine without it** — Cloudflare Access only issues JWTs to users who pass your team's Access policy, so signature + `issuer` validation already proves the user passed the gate. If you can find the AUD Tag (app's Overview page, labeled "Audience Tag" or "AUD Tag"), fill it in for strictest validation; otherwise leave it blank.

After setting `CF_ACCESS_TEAM`, **Redeploy**.

## Step 7: verify

Open the site in an incognito window → should redirect to CF sign-in → sign in → enter the app → admin `/admin` shows CF Access as "enabled".

## FAQ

| Symptom | Cause | Fix |
|---|---|---|
| No sign-in redirect | Domain grey-cloud / no team | switch to orange cloud + set var |
| 502/522 | Origin error | make sure Vercel is up |
| API 401 after sign-in | JWT expired / wrong issuer | check `CF_ACCESS_TEAM` matches the Access domain prefix, refresh |
| Redirect loop | Domain mismatch | confirm the Access domain matches |

## Disabling Access

Delete the `CF_ACCESS_TEAM` (and `CF_ACCESS_AUD` if set) env vars from Vercel and Redeploy. `isCfAccessEnabled()` returns false and the backend stops validating.
