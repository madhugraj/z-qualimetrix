# 9. Reports & Manual Log

## Reports

A deeper, trend-focused set of panels for a selected product, all computed from real synced data:

- Test execution outcomes (daily pass rate)
- Resolution efficiency (MTTR trend)
- Quality velocity (issues completed vs. defect flow)
- Velocity by issue type (bugs vs. features vs. sub-tasks)
- High-priority bugs fixed, most recent sprint
- Velocity vs. previous quarter
- Portfolio comparison (health score per active product)
- Requirements traceability matrix — requirement → linked defects → status, built from real Jira/Azure DevOps issue links (not a separate requirements tool; see [Known limitations](10-known-limitations-and-roadmap.md) for what this can and can't cover)

## Manual Log

Not everything a team does lives in a ticket. The Manual Log lets anyone record operational deliverables that Jira/Azure DevOps wouldn't otherwise capture — demos given, documentation written, RCAs completed, manual test passes — so they show up alongside real sync'd data instead of being invisible to reporting. Log an entry from **"Log an activity"**; recent entries appear in the same feed regardless of who logged them.

This is genuinely manual, self-reported data — it's not verified against any external source, so treat it as a team-maintained record rather than an audited one.
