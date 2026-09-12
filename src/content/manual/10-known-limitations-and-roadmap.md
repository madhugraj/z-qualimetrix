# 10. Known limitations & roadmap

One consolidated, honest list — worth reading before you build a rollout plan around any specific number. Every item here is a genuine current gap, not a bug hiding in plain sight.

| Area | What's true today |
|---|---|
| **Cost of Quality, Automation ROI, Escaped Defects** (top Dashboard tiles) | Demo data, clearly labeled. No cost-of-failure model, no $ ROI model, and no "which environment was this found in" field exist yet to compute these for real. |
| **Setup wizard → Teams step** | Cosmetic only — doesn't persist anywhere. Team-level budgets and membership entered there are lost after the wizard. Real per-org budget (Step 4) does persist. |
| **Azure DevOps: per-person cost & utilization** | Not available. Azure DevOps has no per-person, per-entry work-log API (unlike Jira) — there's no source data to compute this from, not a QualiMetrix gap that can be closed with more engineering alone. |
| **Requirements-to-test traceability (RTM)** | The Reports page's traceability view is built from real issue *links* (e.g. "tested by," "relates to") already present in your tracker — there's no separate requirements-management data model, so a requirement never formally linked to its tests won't appear connected, even if the work happened. |
| **User invitations** | No email-invite flow. Accounts are created directly (CSV import or Admin panel) with an admin-set password, not a self-service "click a link to join" flow. |
| **Azure DevOps project mapping granularity** | A connected project maps 1:1 to a whole product by default (synced in full). Scoping a product to one specific team/area path within a larger ADO project is a manual edit today, not a guided picker. |
| **"Defect leakage"** | A bug-priority-mix proxy (`% marked Critical/High`), not a literal measurement of bugs that reached production — no environment field exists in Jira/Azure DevOps to measure that directly. |
| **Engineering Health roster** | Limited to people whose Jira email is visible (a per-person Jira privacy setting) — see [Engineering Health](08-engineering-health.md). Every other page identifies people by tracker account ID instead and isn't affected. |

If any of these blocks a specific decision you need to make, talk to your QualiMetrix contact — several of these are active roadmap items, not permanent gaps.
