# 3. Connecting Azure DevOps

## Connecting

1. Go to **Integrations** → **Azure DevOps** → **Connect**. This opens Microsoft's login/consent screen in a new tab.
2. QualiMetrix requests read-only access to your work items and project metadata — **never write access**.
3. Approve access. QualiMetrix automatically detects your Azure DevOps organization from your account.
4. A panel titled **"Choose Azure DevOps projects to sync"** lists every project in your organization. Check the ones you want tracked — each checked project automatically becomes a "Product" in QualiMetrix, synced in full (every team/area within it) by default.
5. Click **Save selection**.

If you need a specific product scoped down to one team's area path instead of the whole project, that's a manual edit on the product afterward (its Azure DevOps mapping field) — most teams won't need this.

## Syncing

Same mechanism as Jira: a manual **Sync now** button, plus automatic sync on a schedule (minimum every 5 minutes).

## How Azure DevOps setup differs from Jira

Most of the [Jira setup guidance](02-connecting-jira.md#how-your-jira-should-be-set-up) applies the same way here — meaningful workflow status names for bottleneck detection, Priority set on bugs, Epics linked for deliverable status, and so on. Two real differences worth knowing:

- **No per-person cost or utilization tracking today.** Azure DevOps' API has no equivalent to Jira's per-entry, per-person work log — it only exposes cumulative hour totals (Original Estimate / Remaining Work / Completed Work) on the work item itself, with no per-person, per-day attribution. This is a genuine platform limitation, not a QualiMetrix gap: Team Utilization and Team Cost will correctly show "no data" for Azure DevOps–only products, rather than fabricating a number. Everything else — Backlog, Bug Intelligence, Epic rollups, cycle-time/bottleneck detection, Assignee Workload (by item count) — works the same as Jira.
- **No email-visibility wrinkle.** Unlike Jira, Azure DevOps assignee identity is always visible via the API, so there's no equivalent to the [Engineering Health caveat](02-connecting-jira.md#a-jira-setting-that-affects-one-page-engineering-health) — every assigned person shows up wherever the app identifies people by account.

## Mixed Jira + Azure DevOps organizations

QualiMetrix is built to run both side by side in the same organization — some products on Jira, others on Azure DevOps, shown together on the same Dashboard, Backlog, and Bug Intelligence pages. The only features that differ per-product are the two called out above (per-person cost/utilization), which simply won't populate for Azure DevOps–sourced products until that platform-level gap is closed.
