# 7. Backlog, Bugs & Epics

## Backlog

A filterable, sortable view of every synced work item — filter by status, assignee, priority, and product. Includes a live count of unassigned critical/high-priority items, so nothing urgent slips through unnoticed.

## Bug Intelligence

A dedicated view of every synced bug: sortable table, filter by parent epic, and a "Bugs by epic" breakdown showing which epics are carrying the most open defects. The header callout shows what share of your bugs aren't linked to any epic at all — a high number here is itself a useful signal (see [the Jira setup table](02-connecting-jira.md#how-your-jira-should-be-set-up)), not necessarily a problem to fix immediately if your team just doesn't organize work that way.

## Epics — your client deliverable status view

Each epic shows real % complete (computed from its child items' status) and a health flag:

- **On track** — progressing normally.
- **At risk** — stalled 14+ days with no blocker.
- **Blocked** — has an open Critical/High bug attached.
- Open-bug count per epic, linking straight to the affected bugs.

This is the view to use for "what's the status of this client's deliverable" — as long as the underlying stories/bugs are actually linked to their parent epic (see the Jira/Azure DevOps setup guides). An epic with no linked children, or bugs that were never linked to it, will understate its own real progress — that's a tracker-hygiene issue to fix at the source, not something QualiMetrix can infer around.
