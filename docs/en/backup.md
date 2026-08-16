# Database Backup (Neon platform-level)

> Protect your data with **Neon's built-in backup capabilities** — the **application code never touches backups**. This is the safest approach: no copy logic to write, hence no risk of copy errors or corrupting data.

## Core idea

**Backups are Neon's job, not the app's.**

The application layer (Next.js + Prisma) **only reads and writes the database** — it neither knows nor needs to know about backups. Backups, restores, and point-in-time rollbacks are all handled by the **Neon platform**; you just click a few buttons in the Neon console or run a few SQL statements. You get:

- **Automatic backups**: every Neon project keeps a history of your data
- **Point-in-time restore (PITR)**: roll the database back to any past moment
- **Branches**: fork an independent test database from any point in history, discard it when done
- **Read replicas**: read-only queries / exports without affecting the primary

> ⚠️ Why not let the app back up? Automatically copying production data across databases is **high-risk** — one buggy line can corrupt data or overwrite the primary. Neon's backups are a mature, battle-tested capability and far more reliable. The only thing the app should do is **not proactively delete or overwrite important data**.

## Recommended data layout (important/private data first)

This project supports **multiple databases** (1 primary + up to 4 secondaries; see [Environment Variables](/en/docs/env)). Following the "important data first, cold data later" principle:

| Database | Purpose | What it holds |
|---|---|---|
| Primary `DATABASE_URL` | Core data | **Users, workspaces, files, chats, shares, external connections, SSH hosts** — all important/private data |
| Secondary `DATABASE_URL_2` | Cold data | **Audit logs, email verification codes** (low priority, rebuildable) |
| Secondary `DATABASE_URL_3` | Cold data (optional) | More cold data (currently only audit / verification can be routed) |
| Other databases | **Backup disks** | Not wired into the app; used purely as Neon backup/restore targets |

> Note: the app currently routes only `audit` (audit log) and `verification` (email verification code) to secondaries (`MULTI_DB_COLD_TABLES`). Databases not wired into the app are simply used as Neon backup / redundancy resources. You can create as many Neon projects or databases as needed — keep the important stuff in the primary and use the rest for backup.

## Enabling Neon backups (recommended)

The steps below are mostly Neon console operations. **None require code changes or a redeploy.**

### 1. Confirm automatic backups are enabled

Every Neon project retains data history by default (used for point-in-time restore). Go to **Neon console → your project → Settings** and confirm retention is not disabled.

### 2. Create a manual backup snapshot (branch)

To get a **fixed backup copy decoupled from the primary**, create a branch:

1. Neon console → your project → **Branches**
2. Click **Create branch**
3. Fork from the **main branch** at the current / a past point in history
4. Name it e.g. `backup-2026-08-11`

This branch is a **full copy** of the primary and can be kept long-term as a backup. It doesn't consume primary read/write and doesn't affect the app.

> A branch freezes the primary's data at creation time. Later writes to the primary don't flow into the branch — **that's exactly what makes it a backup**: it's pinned to a moment in time and is a reliable historical snapshot.

### 3. Disaster recovery (restore a backup)

If something goes wrong with the primary, two recovery options:

- **Point-in-time restore (PITR)**: in Branches, click **Restore** on the main branch and choose a past moment; Neon rolls the main branch back to that point.
- **Restore from a backup branch**: in Branches, click **Set as primary / Restore** on the backup branch to promote it.

> Recovery is a Neon platform operation; the app just keeps reading/writing normally afterward. If you get a new connection string, just update `DATABASE_URL` in Vercel and redeploy.

### 4. Read replica / export (optional)

For offline backups or exporting data elsewhere:

- Neon console → project → **Read replicas**, create a read replica
- Connect any Postgres client to the read replica and run `pg_dump`

```bash
pg_dump "postgresql://...readonly..." > backup.sql
```

A read replica doesn't affect the primary and is great for periodic cold backups.

## FAQ

**Q: Does the app need to handle backups?**
No. The app only reads/writes the database. Backups and restores all happen on the Neon platform; no app code changes are needed.

**Q: Do backup branches consume database quota?**
Yes, a branch is an independent copy and consumes your Neon storage quota (limited on the free plan). Keep just 1–2 critical backup branches, or use point-in-time restore instead of long-lived branches.

**Q: Do I need to back up each secondary separately?**
Yes. If the secondaries (cold data) matter, **back up each database independently** on Neon (create a branch under the corresponding Neon project/Branches). The primary and each secondary are separate databases with separate backups.

**Q: Can I recover from an accidental delete / update?**
Yes. Use Neon point-in-time restore (PITR) to roll the database back to before the mishap. As long as the Neon retention window hasn't passed (the free plan retains data for a while; check your Neon console's retention settings).

**Q: Do backups affect application stability?**
**No.** Neon backups, branches, and read replicas all happen platform-side. They don't use primary read/write and don't go through app code. The app always connects to a single `DATABASE_URL` and behaves exactly as usual.

## Extra redundancy: D1 snapshot + R2 dump (optional)

Neon's platform backups are the primary safety net. As an **additional** cross-provider
redundancy layer, you can enable the Cloudflare **D1** mirror (see
[Environment Variables](/en/docs/env#cloudflare-d1-secondary-backup-optional)):

- **Neon → D1 snapshot** (part of the daily `/api/cron/daily` sweep): copies the most important Neon data
  (user accounts id/username/email/isAdmin, site settings, AI providers) into D1's
  `neon_backup` table. **Sensitive fields (password hashes, encrypted tokens) are excluded** —
  this is a recovery reference, not a full clone.
- **D1 → D1 dump** (same sweep): dumps each D1 database and stores the `.sqlite` backup **inside
  D1** (`d1_dumps` table). Backups are NOT written to R2 — R2 is reserved for file sharing.

**Retention**: both `neon_backup` and `d1_dumps` keep only the newest `D1_BACKUP_RETENTION`
entries (default 30), so D1 doesn't grow without bound. The sweep runs under `CRON_SECRET`
protection and is **best-effort** — a D1 failure is logged and skipped, never breaking the app.
This is optional; Neon's own backups remain the authoritative restore path.

## Key points

1. **Backup = Neon platform capability**, zero app changes, zero risk
2. **Important/private data lives in the primary**; only cold data goes to secondaries
3. Use **Branches** for fixed snapshot backups and **point-in-time restore (PITR)** for disaster recovery
4. Read replicas for export / cold backup without affecting the primary
5. Create branches periodically in the Neon console and store connection strings in a safe place
