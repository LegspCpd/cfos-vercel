# Workspace Deploy (Cloudflare Pages + short links)

> Deploy a workspace's app to Cloudflare Pages in one click, then auto-generate a
> **memorable short link** (e.g. `s.legspcpd.top/xxxxxx`) for sharing. Deployment
> history, on-demand status checks, and custom-domain binding are all in the panel.

## Overview

- **One-click deploy**: Workspaces → **Deploy** (top-right) → pick a workspace →
  **Build & deploy** uploads the workspace's static files to Cloudflare Pages.
- **Short link**: after a successful deploy, a `s.legspcpd.top/xxxxxx` short link is
  auto-created that redirects to the long `.pages.dev` URL.
- **Deployment history**: list all your deploys (workspace, status, Pages URL, short
  link, time) with copy/open actions.
- **Check now**: re-verify a deployment's live status on the Cloudflare side.
- **Custom domain**: bind a custom domain to a deployment's Pages project.

## Prerequisites

The Deploy feature needs these env vars (see [Environment Variables](/en/docs/env)):

| Variable | Description |
|---|---|
| `PAGES_KEY` | Cloudflare API Token (must allow Pages Edit/Deploy) |
| `PAGES_ACCOUNT_ID` | Cloudflare Account ID |
| `S_LINK` | Short-link service Token (s.legspcpd.top / sink.cool) |

> Without `PAGES_KEY` the deploy feature is disabled; without `S_LINK` deploys still
> work but no short link is created.

### Getting the values

1. **PAGES_KEY**: Cloudflare console → **My Profile → API Tokens → Create Token** →
   use the **Edit Cloudflare Workers** template (or a custom token granting **Cloudflare
   Pages → Edit**). Put the token in `PAGES_KEY`.
2. **PAGES_ACCOUNT_ID**: Cloudflare console → **bottom-right of the dashboard**.
3. **S_LINK**: the sink.cool site token for the short-link service.

Redeploy after configuring.

## Usage

1. Open the **Workspaces** page.
2. Top-right, next to **New**, click **Deploy** — a panel slides in from the right.
3. In **Select a workspace to deploy**, pick a workspace.
4. Click **Build & deploy** and wait for the upload.
5. On success the panel shows:
   - **Pages URL**: `https://<project>.pages.dev` (copy button)
   - **Short link**: `https://s.legspcpd.top/xxxxxx` (copy button)
6. Every deploy appears in **Deployment history** with **Check now** / **Open** actions.

## Custom domain

1. At the bottom of the panel, enter a domain (e.g. `app.example.com`) under **Bind
   custom domain**.
2. Click **Bind**.
3. At your DNS provider, point that domain to Cloudflare (proxy through Cloudflare).
4. Once active, visit `https://app.example.com` to reach the deploy.

> The domain must be managed by Cloudflare (or proxied through it) so Pages can issue
> a certificate.

## Deployment record fields

| Field | Description |
|---|---|
| Workspace | Deployed workspace name |
| Status | `deployed` / `failed` / `deploying` |
| Pages URL | `.pages.dev` domain |
| Short link | `s.legspcpd.top/xxxxxx` |
| Custom domain | Bound domain, if any |
| Time | Deployment creation time |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `PAGES_KEY is not configured` | Missing `PAGES_KEY`, or not redeployed after adding it |
| `PAGES_ACCOUNT_ID is not configured` | Missing `PAGES_ACCOUNT_ID`, or wrong account id |
| `Cloudflare API 4xx` | Token lacks Pages Edit permission, or project name collision |
| Pages URL but no short link | `S_LINK` not set; it will be created on the next deploy |
| Short-link creation fails | Invalid short-link token or service down; deploy itself is unaffected |

## Notes

- Each deploy uploads the workspace's current files as a static site (directly
  servable HTML/CSS/JS). If the workspace needs compilation (TS/React sources), build
  the static output locally and put it in the workspace first.
- Deploy is async: success is reported once the upload completes; **Check now** queries
  the live Cloudflare status.
