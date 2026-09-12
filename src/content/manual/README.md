# QualiMetrix Enterprise Setup & User Manual

QualiMetrix turns the work your teams are already tracking in Jira Cloud and/or Azure DevOps into real, evidence-based insight for engineering leaders and PMs: quality trends, delivery bottlenecks, team utilization, and $ cost — computed from your actual data, never estimated or fabricated. Where a number can't be computed from real data yet, QualiMetrix says so explicitly rather than guessing.

This manual is written for the two people who'll do the most with it early on:

- **Your IT/systems admin**, who runs the initial setup and connects Jira/Azure DevOps/GitHub.
- **Your PM or engineering lead**, who reads the dashboards day to day and decides who should see what.

## How to use this manual

Read in this order the first time:

1. [Initial setup](01-initial-setup.md) — the setup wizard, your first admin account, importing your team.
2. [Connecting Jira](02-connecting-jira.md) — **read this even if you're on Azure DevOps**, since it explains the "insight → what your tracker needs" mapping that most of the app's analytics depend on.
3. [Connecting Azure DevOps](03-connecting-azure-devops.md)
4. [Connecting GitHub](04-connecting-github.md)
5. [Users, roles & access](05-users-roles-teams.md)
6. [Dashboard & analytics](06-dashboard-and-analytics.md)
7. [Backlog, bugs & epics](07-backlog-bugs-epics.md)
8. [Engineering Health](08-engineering-health.md)
9. [Reports & manual log](09-reports-and-manual-log.md)
10. [Known limitations & roadmap](10-known-limitations-and-roadmap.md) — a short, honest list of what isn't built yet. Worth reading before you commit to a rollout plan around any specific number.

AI provider connections (Anthropic/OpenAI usage & cost tracking) are covered in a separate manual, published alongside that feature.

## Core principle: real data, or an honest "not yet"

Every number in QualiMetrix is either computed from data your team actually produced in Jira/Azure DevOps/GitHub, or it's clearly marked **DEMO DATA**. QualiMetrix never fills a gap with an estimated, averaged, or "reasonable-looking" placeholder presented as real. If a panel shows "no data yet" instead of a number, that's accurate — not a bug — and usually means one specific thing needs to happen upstream in your tracker (this manual tells you what, panel by panel).
