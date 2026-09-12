# 8. Engineering Health

Per-developer metrics: activity signal, contribution mix, and (where GitHub is connected) commit-based data. This is the one page in QualiMetrix most affected by a specific Jira setting.

## The email-visibility caveat

Engineering Health identifies developers by the email address selected during [Jira connection](02-connecting-jira.md#connecting) — Jira lets each person hide their email from the API via a personal privacy setting, and this page can't show someone it can't match an email for.

**If a real, active contributor isn't showing up here:**

1. Check the [Assignee Workload panel](06-dashboard-and-analytics.md) instead — it identifies people by Jira account ID, which is always visible, so it isn't affected by this setting and will confirm the person's real activity exists.
2. Ask that person (or your Jira org admin, depending on your site's policy) to make their email visible in their Atlassian account profile.
3. Re-run "Sync now" from Integrations after the email becomes visible — QualiMetrix picks it up on the next sync, no reconnection needed.

This is a Jira-side setting outside QualiMetrix's control — there's no override on our end that can bypass a person's own privacy choice.
