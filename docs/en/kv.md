# Cloudflare KV Cache Guide

> The app caches several slow endpoints (the **Pages project list**, **GitHub/GitLab repo
> enumeration**, and the **Pages usage panel**) in **Cloudflare KV** so repeat visits are
> instant — a key part of making the whole site feel as smooth as Cloudflare itself.

## Why KV caching

To show the **live** Pages subdomain / bound domains, or to list your Git repos, the server
calls the Cloudflare / GitHub / GitLab APIs each time. Those external round-trips can take
seconds. Caching the result in KV means:

- First visit hits the external API and stores the result;
- Subsequent visits within the TTL return the **cached value** from KV (near-instant, no
  external call);
- When the cache expires it revalidates from the source automatically.

## 1. Create a KV namespace (single store — all you need)

**Just this one store makes the feature work.**

1. Cloudflare dashboard → **Workers & Pages** → **KV**.
2. Click **Create a namespace**, name it (e.g. `cfos-cache`), and open it.
3. Copy its **Namespace ID**.
4. In Vercel → **Settings → Environment Variables**, set:

   | Variable | Value |
   |---|---|
   | `KV_ACCOUNT_ID` | Your Cloudflare account id (same as `PAGES_ACCOUNT_ID`) |
   | `KV_API_TOKEN` | API token with **Workers KV → Edit** (reuse `PAGES_KEY` if it already has KV:Edit) |
   | `KV_NAMESPACE_ID` | The Namespace ID you copied |

5. Save and **Redeploy**.

> **Token permission**: Cloudflare → My Profile → API Tokens → Create Token. The "Edit Cloudflare
> Workers" template usually already includes **Workers KV → Edit**; otherwise create a custom
> token and grant **Account → Workers KV → Edit**.

## 2. (Optional) Add up to 4 more KV stores

If you have several KV namespaces (e.g. spread across regions), you can configure up to
**5** total. The first uses the base names; each extra store appends a numeric suffix
(`_2` … `_5`) to the three variables.

Example — two stores:
```
KV_ACCOUNT_ID=...
KV_API_TOKEN=...
KV_NAMESPACE_ID=...
KV_ACCOUNT_ID_2=...
KV_API_TOKEN_2=...
KV_NAMESPACE_ID_2=...
```

**Read/write strategy**:
- **Write**: data is written to **every** configured store (all of them), so any reader finds
  it regardless of which store it hits.
- **Read**: try the stores in order (store 1 first), falling through to the next store on a
  miss.
- With only the base store configured, reads and writes both use that one store.

## 3. Tuning (optional)

One set of vars, applies to all stores:

| Variable | Description | Default |
|---|---|---|
| `KV_PREFIX` | Cache-key prefix (isolate multiple instances) | `cfos` |
| `KV_DEFAULT_TTL` | Default cache TTL (seconds) | `60` |
| `KV_PAGES_PROJECTS_TTL` | Pages project list TTL (seconds) | `15` |
| `KV_GIT_REPOS_TTL` | Git repo list TTL (seconds, per-user) | `60` |
| `KV_PAGES_STATS_TTL` | Pages usage panel TTL (seconds) | `8` |
| `KV_ME_TTL` | `/api/me` (current user profile) TTL (seconds) | `5` |
| `KV_ANALYTICS_TTL` | `/api/analytics` (per-user) TTL (seconds) | `30` |
| `KV_SITE_TTL` | Public `/api/site` settings TTL (seconds) | `30` |
| `KV_SSH_HOSTS_TTL` | SSH host list TTL (seconds, per-user) | `10` |
| `KV_NOTIFICATIONS_TTL` | Notifications list TTL (seconds, per-user) | `5` |
| `KV_WORKSPACES_TTL` | Workspaces list TTL (seconds, per-user) | `5` |
| `KV_FAVORITES_TTL` | Favorites list TTL (seconds, per-user) | `5` |
| `KV_TICKETS_TTL` | Tickets list TTL (seconds, per-user) | `5` |

> Larger TTL = faster but staler; after deploying a new project you may want a smaller TTL (or
> just wait for the TTL to expire).

## 4. Without KV

If no KV is configured, the app falls back to an in-process in-memory cache (speeds up repeated
calls within one instance). Multi-instance deployments won't share the memory cache, so
cross-instance requests still hit the external APIs — configuring KV gives true global
nearest-store caching.

## 5. Scope

KV caching is applied to:

- `/api/deploy/list` — Pages project list (live subdomains, domains) → `KV_PAGES_PROJECTS_TTL`
- `/api/pages/sources` — GitHub / GitLab repo lists → `KV_GIT_REPOS_TTL`
- `/api/pages/stats` — Pages usage panel → `KV_PAGES_STATS_TTL`
- `/api/me` — current user profile / connection state → `KV_ME_TTL`
- `/api/analytics` — stats panel (per-user) → `KV_ANALYTICS_TTL` (`currentIp` is always live, never cached)
- `/api/site` — public site settings → `KV_SITE_TTL`
- `/api/ssh-hosts` — SSH host list → `KV_SSH_HOSTS_TTL` (invalidated immediately on add/edit/delete)
- `/api/notifications` — notifications list → `KV_NOTIFICATIONS_TTL` (invalidated on new/read)
- `/api/workspaces` — workspaces list → `KV_WORKSPACES_TTL` (invalidated on create/rename/delete)
- `/api/favorites` — favorites list → `KV_FAVORITES_TTL` (invalidated on favorite/unfavorite)
- `/api/tickets` — tickets list → `KV_TICKETS_TTL` (invalidated on new ticket / admin reply)

**In-memory cache (works even without KV)**: site settings reads (`getSetting` — site name,
favicon, banner, etc.) have a **30-second in-process cache**. Every page render reads these
settings, so the memory cache keeps the DB off the hot path; an admin edit clears the cache
immediately.

All cache keys include `KV_PREFIX` and (where relevant) the user id, so multiple instances and
users never read each other's data.

## 6. D1 secondary backup (optional)

You can mirror the KV cache into Cloudflare **D1** as a redundant store (see
[Environment Variables](/en/docs/env#cloudflare-d1-secondary-backup-optional)). When enabled:

- every KV cache write is **also copied to D1** (best-effort, non-blocking);
- a KV miss **falls back to D1** before the upstream loader runs.

Set `D1_ENABLED=true` and configure up to 5 D1 database ids (`D1_SQL_1` … `D1_SQL_5`).
Configuring more than 5 raises an error. The mirror table (`cache_store`) is created
automatically on first use.
