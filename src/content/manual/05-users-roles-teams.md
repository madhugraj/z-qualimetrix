# 5. Users, roles & access

## Roles

| Role | What it can see/do |
|---|---|
| `pm` | Full administrative access — Integrations, Admin panel, all Products, all settings. Treat this as your "admin" role. |
| `executive` | Portfolio-wide read access across all products (Dashboard, Reports, infra/GPU spend), without the connection/admin controls `pm` has. |
| `po` (Product Owner) | Scoped to the specific product(s) granted to them (see **Access scoping** below). Can be delegated limited rights to edit their own product's Jira/Azure DevOps mapping without full admin access. |
| `developer` | Scoped to their assigned product(s); the default role for imported users. |
| `tester` | Scoped to their assigned product(s). |
| `unassigned` | Default for a brand-new account with no role set yet — effectively no access until assigned one of the above. |

## Access scoping

Beyond role, every account has a list of **accessible products** — which specific products/projects they can see. A `pm` or `executive` account sees everything in the organization regardless of this list; every other role is limited to it. Set this per person from the Admin panel.

## Adding people today

There is currently **no email-invite flow** — QualiMetrix doesn't send an invitation email that a new teammate clicks to set their own password. Accounts are created directly, one of two ways:

- **CSV import** (Setup wizard step 2, or Admin panel → Users → bulk import): paste `email,name,role,team` rows.
- **Admin panel**, one at a time, where you can also set an initial password directly.

If you need someone to set their own password rather than being given one, use your deployment's password-reset flow (if enabled) after creating their account.

## Delegated product configuration

A `po` can be granted a delegation to edit just their own product's Jira project mapping or Azure DevOps area path — without needing full `pm`/admin rights over the whole organization. This is useful when a product owner manages their own team's connection details but shouldn't see or touch billing, other products, or the organization's Jira/GitHub connections themselves.
