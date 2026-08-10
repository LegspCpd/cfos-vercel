# Automated Code Check

This repository includes a scheduled CI workflow that continuously validates the codebase and reports issues via pull requests.

## Overview

`.github/workflows/auto-check.yml` runs automatic checks:

- **TypeScript type check**: `pnpm exec tsc --noEmit`
- **Prisma schema validation**: `pnpm exec prisma validate`

It runs on two triggers:

1. **On every push to `master`** — instant feedback during development.
2. **On an hourly schedule** — periodic re-validation even without new commits.
3. **Manually** — via the Actions tab (`Run workflow`).

## Behavior

- **On success**: the workflow exits quietly and opens nothing.
- **On failure**: it writes a report to `.auto-check/report.md` and opens a pull request titled **"🚨 自动代码检查发现错误"** from the `bot/auto-check` branch to `master`.

The report PR is **report-only** — it contains the error details, not code changes. Review the report, fix the underlying issues, then merge (or close) the PR.

## Safety

This workflow is intentionally conservative:

- It **never modifies `master` directly**.
- It only writes a report into the `bot/auto-check` branch and opens a PR for review.
- All actual code changes must go through a normal PR review.

> Note: GitHub Copilot cannot be invoked from a GitHub Action — it is an IDE assistant without a CI-usable API. If automated *fixing* is desired, a safer approach is to have the workflow generate candidate fixes in a separate branch and open a PR for review, rather than mutating the main branch directly.

## Configuring the schedule

Edit the `cron` expression in `auto-check.yml`:

- Every 30 minutes: `*/30 * * * *`
- Every hour on weekdays: `0 * * * 1-5`
- Daily at 03:00: `0 3 * * *`

## FAQ

- **Are uncommitted changes checked?** No — only code already pushed to `master`.
- **What if a report PR is stale?** Close it; a new one will open if issues persist.
- **Can it auto-fix instead of reporting?** Not recommended for an unattended workflow. If desired, have it propose fixes in a separate branch and open a PR for review.
