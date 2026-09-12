# 1. Initial setup

The first time anyone opens QualiMetrix for your organization, you'll go through a short setup wizard. It creates your organization ("tenant"), your first admin account, and optionally imports your team and a starting budget. You only do this once.

## Step 1 — Organization

Required:
- **Organization name** — shown throughout the app.
- **Admin email** and **password** (minimum 8 characters) — this becomes your first `pm`-role account, which has full administrative access (see [Users, roles & access](05-users-roles-teams.md)).

Optional:
- **Domain** — your company's email domain, for reference.
- **Timezone**.

You're signed in automatically as soon as this step completes.

## Step 2 — Import your team (optional, can be done later)

Paste one person per line, comma-separated:

```
john.smith@company.com,John Smith,developer,Squad Nova
jane.doe@company.com,Jane Doe,tester,Squad Kite
```

Format: `email,name,role,team`. `name` and `role` fall back to sensible defaults if omitted (role defaults to `developer`); see [Users, roles & access](05-users-roles-teams.md) for the full role list and what each unlocks.

**Note:** there is currently no email-invite flow. Importing a user here creates their account directly (optionally with a password, if you include one in a later CSV field via the Admin panel's bulk-import — the quick paste above doesn't set one). Until they have a password, use the Admin panel to set or reset one, or have them use "forgot password" if that's enabled for your deployment. This step is entirely skippable — you can add people any time from the Admin panel.

## Step 3 — Teams (optional)

You can name teams/squads and give each a rough budget figure here. **Be aware this step is currently cosmetic only** — it does not persist anywhere in QualiMetrix yet, so don't rely on it to track real team budgets. Squad names entered in Step 2's CSV are stored on each user's account regardless of what you enter here. We recommend skipping this step for now; see [Known limitations](10-known-limitations-and-roadmap.md).

## Step 4 — Budget

Two numbers, used as a starting point for future cost-visibility features:

- **Org sprint budget** — a rough $ figure for a sprint's worth of work across the org.
- **Default seat budget** — a rough per-person $ figure.

These are saved to your organization's settings and can be edited later from the Admin panel's Budget tab. They are not yet wired into any dashboard calculation (see [Known limitations](10-known-limitations-and-roadmap.md)) — they're a starting input for that future work, not a live metric today.

## Step 5 — Done

You'll land on a completion screen with links to the Admin panel and AI Usage setup. From here, go to **Integrations** to connect Jira and/or Azure DevOps — nothing in the Dashboard will show real data until you do. Continue to [Connecting Jira](02-connecting-jira.md).
