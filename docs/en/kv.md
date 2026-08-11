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

All cache keys include `KV_PREFIX` and (where relevant) the user id, so multiple instances and
users never read each other's data.
