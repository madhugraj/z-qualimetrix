# 2. Connecting Jira

This is the most important page in this manual. QualiMetrix's biggest insights — cost & efficiency, resource planning, delivery bottlenecks, client deliverable status — all come from real data your team already puts into Jira. The quality of those insights depends entirely on a handful of Jira habits, listed below. None of them require buying anything or changing your workflow dramatically — most are just "use the field that's already there, consistently."

## Connecting

1. Go to **Integrations** → **Jira Cloud** → **Connect**. This opens Atlassian's own login/consent screen in a new tab.
2. QualiMetrix requests read-only access: it can read work items, boards/sprints, and your organization's user directory. **It never requests write access** — QualiMetrix cannot create, edit, or delete anything in your Jira.
3. Approve access to your Jira site. The tab closes automatically and the Integrations page shows "Connected."
4. A panel titled **"Choose Jira analytics scope"** appears, listing every Jira project and every user QualiMetrix can see:
   - **Projects** — check every project you want tracked. Each checked project automatically becomes a "Product" in QualiMetrix; nothing else needs to be created manually.
   - **Users** — this list scopes *per-person* analytics (currently, the [Engineering Health](08-engineering-health.md) page). It does **not** filter what work items sync — deselecting someone doesn't hide their tickets from the Backlog, Bugs, or Dashboard pages, it only excludes them from that one per-developer view.
5. Click **Save analytics scope**.

Some people in the Users list may show "Email hidden by Jira" instead of an email address — see [the email-visibility note](#a-jira-setting-that-affects-one-page-engineering-health) below.

## Syncing

- A manual **Sync now** button is always available on the Integrations page.
- Automatic sync runs on a schedule, minimum every 5 minutes, configurable per integration.
- The very first sync can take longer on a large Jira site — give it a few minutes before assuming something's wrong.

## How your Jira should be set up

The table below maps each insight to the specific Jira habit it depends on. If your team already works this way, you don't need to change anything — QualiMetrix will pick it up on the next sync.

| You want to see... | Your Jira needs... |
|---|---|
| **Real $ cost per project or person** | Time actually logged against issues, using Jira's built-in **"Log work"** action (not just an estimate). Estimates alone don't produce cost data — only logged hours do. After that, a QualiMetrix admin sets a $/hr rate per person (see [Dashboard & analytics](06-dashboard-and-analytics.md#team-cost)). |
| **Resource / capacity planning, team utilization %** | Every work item has an **assignee**. Utilization is computed from logged hours vs. an assumed working-day capacity — an unassigned or unlogged item can't count toward anyone's workload. |
| **Bottleneck / cycle-time detection ("where work gets stuck")** | A workflow with **distinct, meaningful status names** — not just "To Do / In Progress / Done." QualiMetrix measures real dwell time per status name, so if "Code Review" and "Ready for QA" are separate, real statuses in your workflow, you'll see exactly which one is the actual drag on delivery. Collapsing everything into 3 generic statuses makes this insight far less useful. |
| **Client deliverable status** | Use **Epics**, and link every Story/Task/Bug to its parent Epic. QualiMetrix rolls up % complete and health (on track / at risk / blocked) per Epic — this only works for work that's actually linked to one. |
| **Defect hotspot / heatmap analysis** | Consistent, meaningful **labels** on bugs (e.g. by module or component area) — avoid one-off tags. Purely structural labels like sprint numbers or severity tags are already filtered out automatically and won't clutter the heatmap. |
| **Unassigned-critical-work alerts** | The **Priority** field set on every bug (Critical/High/Medium/Low or your site's equivalent). |
| **Backlog filtering by status/assignee** | Nothing extra — this works as soon as items sync, since status and assignee are core Jira fields. |
| **Sprint velocity trend** | Use Jira Software **Sprints** on a Scrum board. |

### Two honest caveats worth knowing up front

- **"Defect leakage" is a priority-mix proxy, not a true escaped-to-production measurement.** Jira has no built-in field for "which environment was this bug found in," so QualiMetrix approximates leakage as *the share of your bugs marked Critical/High priority*. It's a genuinely useful quality signal, but it is not literally counting bugs that reached production — treat it as "how severe is our bug mix," not "how many bugs escaped."
- **A Jira privacy setting affects one page: Engineering Health.** See below.

### A Jira setting that affects one page: Engineering Health

Jira lets each person hide their email address from the API (a personal privacy setting, not something your org admin can see or override from Jira's side in most cases). QualiMetrix's [Engineering Health](08-engineering-health.md) page currently identifies developers by the email address selected during the connection step above — so a person with a hidden email won't appear there.

**This does not affect anything else.** Dashboard panels like Assignee Workload, Team Utilization, Team Cost, and Knowledge Silo Detection identify people by Jira's internal account ID instead, which is always visible regardless of that privacy setting — those work correctly for everyone.

If you want someone to show up on Engineering Health specifically, they (or your Jira org admin, depending on your site's policy) need to make their email visible in their Atlassian profile.

## Troubleshooting

- **"Cost shows $0" or "across 0 rated people"** — either nobody has logged time in Jira for the selected scope, or no one has an hourly rate set yet in QualiMetrix. Check the "+Xh logged by people with no rate set" note on that panel — it tells you exactly how much real, unrated time exists.
- **"Someone is missing from Engineering Health"** — see the email-visibility note above; check them on the Assignee Workload panel instead, which isn't affected.
- **"A product's health score shows 0"** — this can mean two different things, and QualiMetrix distinguishes them: "Not synced yet" means literally no data exists for that product. A bare "0" means real data exists (usually an Epic that's genuinely 0% complete) but no other signal (bugs, tests) has started yet — it's a real, low number, not a broken one.
- **"A selected project/person isn't showing up after connecting"** — re-check your selection under Integrations → "Choose Jira analytics scope," and confirm the sync has run at least once (check "Last synced" on the Integrations page, or hit "Sync now").
