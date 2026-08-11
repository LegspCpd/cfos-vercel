# Pages Deploy (Cloudflare Pages)

> Deploy static sites to **Cloudflare Pages** from four sources — a workspace, a **GitHub** or
> **GitLab** repository, or a **ZIP/文件夹** upload — in a Cloudflare Pages–style interface
> (`/pages`). Deploy with one click, get a real `*.pages.dev` URL, bind custom domains, and
> optionally auto-generate a memorable **short link** for sharing.

## Overview

- **Four deploy sources** (`/pages/new`):
  - **Workspace** — deploy a workspace's static files.
  - **GitHub / GitLab** — pick a repo and a branch; the server pulls and deploys it.
  - **ZIP / 文件夹** — upload a `.zip` (or folder) of static files.
- **Project list** (`/pages`) — every deployment with live status, the real `.pages.dev`
  URL, bound custom domains, and copy/open actions.
- **Redeploy** — the detail page routes you back to the exact source flow that produced the
  deployment (workspace / git / upload), not a generic picker.
- **Delete** — remove a project (type the project name to confirm).
- **Custom domains** — bind a domain to any project's Pages project.
- **Right-hand usage panel** — usage / billing / account details (billing & account cards are
  opt-in via env, see below).

## Prerequisites

The Pages feature needs these env vars (see [Environment Variables](/en/docs/env)):

| Variable | Description |
|---|---|
| `PAGES_KEY` | Cloudflare API Token (must allow **Cloudflare Pages → Edit/Deploy**) |
| `PAGES_ACCOUNT_ID` | Cloudflare Account ID |
| `S_LINK` | Short-link service token (sink.cool) — optional |

> Without `PAGES_KEY` the Pages feature is disabled. Git-source deploys additionally need the
> GitHub and/or GitLab OAuth variables (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`,
> `GITLAB_CLIENT_ID`/`GITLAB_CLIENT_SECRET`).

### Getting the values

1. **PAGES_KEY**: Cloudflare console → **My Profile → API Tokens → Create Token** → use the
   **Edit Cloudflare Workers** template (or a custom token granting **Cloudflare Pages →
   Edit**). Put the token in `PAGES_KEY`.
2. **PAGES_ACCOUNT_ID**: Cloudflare console → **bottom-right of the dashboard**.
3. **S_LINK**: the sink.cool site token for the short-link service.

Redeploy after configuring.

## Deploying

### From a workspace

1. Open **Pages → New project**.
2. Choose **Workspace**, pick a workspace, optionally set a custom project name.
3. Click **Deploy**. On success the project appears in the list with its `.pages.dev` URL.

### From a GitHub / GitLab repository

1. **Connect** the service first (Profile → Connections → GitHub/GitLab). The OAuth screen
   asks you to authorize the repositories you want to deploy — pick the ones you need.
2. Open **Pages → New project → GitHub / GitLab** (GitLab requires the GitLab OAuth env vars).
3. Pick a repository (search + paginated list) and a branch.
4. Click **Deploy**. The server verifies the repo belongs to your connected account, then pulls
   and deploys it.

> **Security**: only repositories from your own connected account can be deployed. The server
> refuses to pull an arbitrary repo, so a compromised token can't be used to download external
> repositories.

### From a ZIP / folder upload

1. Open **Pages → New project → Upload**.
2. Drop a `.zip` (or a folder), optionally set a project name.
3. Click **Deploy**. The archive is validated (no path traversal, size/entry caps) and deployed.

## The project list

- Every deployment is shown with its **live** status and the real `.pages.dev` subdomain
  (fetched from Cloudflare, not a stale snapshot).
- **Custom domains** bound to the project are listed; use **Add domain** on any project to bind
  a new one.
- **Copy** the Pages URL or any domain with one click.
- **Delete**: open the delete dialog and **type the project name** to confirm before removal.

## Right-hand usage panel

- **Requests** card always shows an estimated monthly request count.
- **Billing** and **Account Details** cards are **opt-in**: set `PAGES_BILLING_SHOW` /
  `PAGES_ACCOUNT_SHOW` to `true` to show them. Environment variables take precedence over the
  admin-panel toggle.

## Redeploy

On a project's detail page, **Redeploy** returns you to the deploy form with the original
source pre-selected:
- workspace → the same workspace
- GitHub/GitLab → the same repo + branch
- upload → the upload flow

## Custom domain

1. On the project list, click **Add domain** on the project, enter a domain
   (e.g. `app.example.com`).
2. At your DNS provider, point that domain to Cloudflare (proxy through Cloudflare).
3. Once active, visit `https://app.example.com` to reach the deploy.

> The domain must be managed by Cloudflare (or proxied through it) so Pages can issue a
> certificate.

## Short link

After a successful deploy, a short link (`s.your-domain/xxxxxx`) is auto-created that
redirects to the `.pages.dev` URL, so your audience sees the short link instead of the long
one. Requires `S_LINK`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Pages feature disabled | Missing `PAGES_KEY`, or not redeployed after adding it |
| `PAGES_ACCOUNT_ID is not configured` | Missing `PAGES_ACCOUNT_ID`, or wrong account id |
| Cloudflare API 4xx on deploy | Token lacks Pages Edit permission, or project name collision |
| Pages URL but no short link | `S_LINK` not set; it will be created on the next deploy |
| Git repo deploy fails | Repo isn't in your connected account, or you didn't authorize it on the OAuth screen — reconnect and grant access |
| ZIP fails | Archive too large, too many entries, or contains unsafe paths |

## Notes

- Deploy uploads files as a **static site** (directly servable HTML/CSS/JS). If the source
  needs compilation (TS/React), build the static output first or use a Git repo.
- Every source path is validated server-side (no absolute paths, `..`, control characters) and
  deploy sizes are capped, so a malicious archive can't escape the project or exhaust memory.
