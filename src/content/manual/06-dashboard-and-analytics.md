# 6. Dashboard & analytics

The Dashboard is the main PM/executive view: portfolio-wide by default, or filtered to a single product. Everything on it updates as your Jira/Azure DevOps sync runs.

## Top KPI tiles

| Tile | Status |
|---|---|
| **Quality Health Index** | Real — see formula below. |
| Cost of Quality | **Demo data** — no cost-of-failure model exists yet. |
| Automation ROI | **Demo data** — no $ cost model to compute ROI against yet. |
| Escaped Defects | **Demo data** — neither Jira nor Azure DevOps exposes which environment a bug was found in, so "escaped to production" can't be measured today. |

The demo tiles are clearly labeled **DEMO DATA** in the UI at all times — they're a placeholder for a future release, not a real reading you should act on.

### Quality Health Index — how to read it

It's the average health score across your active products. Each product's score is a weighted blend of whichever of these it actually has real data for (weights redistribute over just what's available — nothing is ever defaulted to a guessed value):

- **Defect leakage (25%)** — `100 − (% of bugs marked Critical/High priority)`. A priority-mix proxy, not a true escaped-to-production measurement — see [the Jira setup guide's caveat](02-connecting-jira.md#two-honest-caveats-worth-knowing-up-front).
- **Test pass rate (30%)** — % of logged test executions that passed, from QualiMetrix's own test-case/test-execution records. This requires test executions to actually be logged (manually, or via a test-management integration) — Jira/Azure DevOps sync alone doesn't populate this.
- **Release readiness (25%)** — itself a blend of bug-closure rate, recent test pass rate, and automation coverage.
- **Epic completion (20%)** — average % complete across real epics.

**Practical read:** until your team logs test executions somewhere QualiMetrix can see, this score leans almost entirely on bug severity mix and epic progress — treat it as a delivery/defect signal first, a full "quality" picture second, until test data starts flowing in.

## Needs attention — Portfolio

A plain-language, prioritized list of real findings from your backlog and epic data — unassigned critical work, epics blocked by an open critical/high bug, bugs not linked to any epic, and the single biggest workflow bottleneck by total time lost (not just average time — a rare slow outlier can't disguise the real bottleneck this way). Every finding here traces back to real, currently-true data; nothing is a canned suggestion.

## Portfolio quality health

Each active product's health score (the same formula as above, per-product). A product showing **"Not synced yet"** genuinely has no data; a product showing a bare **0** has real data (usually a just-started epic at 0% complete) but no other signal yet — those are different situations, worth distinguishing before assuming something's broken.

## Where work gets stuck

Real dwell time per workflow status, computed from your tracker's own status-change history. Ranked by *total* time lost (average × volume), not average alone, so a high-volume-but-average bottleneck isn't hidden behind a rare slow outlier. This is where the [meaningful-status-names guidance](02-connecting-jira.md#how-your-jira-should-be-set-up) pays off directly — generic statuses produce a generic, less actionable answer here.

## Team utilization

Real logged hours vs. an assumed 8-hour/business-day capacity per person (explicitly labeled as an assumption — there's no leave/PTO calendar synced, so this is not a measure of true availability). Requires actual logged work; see the [cost/efficiency row](02-connecting-jira.md#how-your-jira-should-be-set-up) in the Jira setup table. Azure DevOps–only products won't populate this (see [Connecting Azure DevOps](03-connecting-azure-devops.md#how-azure-devops-setup-differs-from-jira)).

## Team cost {#team-cost}

Real $ cost = logged hours × an hourly rate you set. To use it:

1. Open the **Team** panel's "Set hourly rates" section (PM role only).
2. Every name listed is a real worklog author from your tracker — you're not limited to people with a QualiMetrix login, and Jira's email-visibility setting doesn't block this (rates are keyed to the person's tracker account, not an email address).
3. Enter a $/hr rate and save.

Anyone without a rate set still has their real hours disclosed (as "+Xh logged by people with no rate set") rather than silently excluded from the total — the total cost figure is a floor, not a fabricated complete number, until every real contributor has a rate.

## Project portfolio

A sortable table of every active product: sync status, item count, open bugs, team size, and health score — click any column header to re-sort.
