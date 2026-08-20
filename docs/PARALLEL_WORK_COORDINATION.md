# Parallel work coordination

Two independent features were developed in this repo at the same time: real
auth + multi-tenant AI Usage/ROI (PR #1) and Jira/Azure DevOps integration
(PR #3). Both are now on clean branches off `main`, independently mergeable.
This file is intentionally short — update it if you touch shared
infrastructure below, don't let it accumulate resolved history.

## Standing rule: never run `prisma migrate dev` in this repo

The database has old drift (a few tables were created via `prisma db push`
outside the tracked migration history, back before either feature existed).
`prisma migrate dev` will detect this and offer `prisma migrate reset` —
which drops and recreates the entire database. If you see a "drift
detected" prompt, stop and don't answer it.

Use this pattern instead for any schema change:
1. Edit `schema.prisma`.
2. `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <throwaway-db-url> --script`
3. Save the output as `prisma/migrations/<timestamp>_<name>/migration.sql`, hand-editing if needed (e.g. partial/filtered unique indexes — Prisma's schema DSL can't declare those at all).
4. `npx prisma db execute --file <path> --schema prisma/schema.prisma`
5. `npx prisma migrate resolve --applied <timestamp>_<name>`
6. `npx prisma generate`
7. `npx prisma migrate status` — confirm clean.

Before touching port 3001's dev server, check `lsof -nP -iTCP:3001 -sTCP:LISTEN` —
this session accumulates zombie `tsx watch` processes across long sessions;
more than one PID means an old one may be silently serving stale code.

## Current state

- **PR #1** (`ai-usage-real-capture`) — real session auth (login/refresh/logout,
  httpOnly cookies, bcrypt) + tenant-scoped AI Usage module. Merged/verified
  independently of PR #3; carries no Jira/ADO code.
- **PR #3** (`feature/jira-azure-devops-clean`) — Jira + Azure DevOps OAuth,
  sync engines, scheduler, UI. Carries no auth code.
- **PR #2** (`feature/product-manager-workflow-enhancement`) — a third,
  unrelated pre-existing effort. Not touched by either of the above.

Both PR #1 and #3 independently pass `tsc`, boot the full server cleanly,
and round-trip against the live DB. The `AiModelCatalog`/`AiUsageEvent`/etc.
model blocks intentionally differ slightly between the two branches (PR #1
has the tenant-pricing partial-unique-index setup; PR #3 matches what its
own migrations actually produced, keeping `modelId` as `@unique`) — this
will need one real reconciliation pass when either merges to `main` and the
other rebases on top. Whoever does that second merge: check `AiModelCatalog`
carefully.

## For PR #3: wiring `requireAdmin` against PR #1's auth

`src/api/middleware/auth.middleware.ts` (PR #1) exports `requireAuth` —
mount it on a route and it populates:
```ts
req.user: { id: string; tenantId: string | null; role: string; email: string; isActive: boolean }
```
Re-fetched from the DB on every request (not embedded in the JWT), so a role
change or deactivation takes effect immediately. `role` is free-text
(`'admin' | 'developer' | 'tester' | 'viewer'` in practice, not a DB enum),
so `requireAdmin` is just:
```ts
export const requireAdmin = [requireAuth, (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ success: false, error: 'Admin access required' })];
```
This is cookie-based (browser sessions only). If any Jira/ADO endpoint is
called machine-to-machine instead, use `requireIngestToken` from
`ingest-token.middleware.ts` — different identity mechanism, same file.

## Known follow-ups (not fixed, flagged for whoever owns each)

- **PR #3**: `azure-devops-sync.service.ts`'s sync function is imported in
  `server.ts` but never registered with the scheduler (only `'jira'` is) —
  Azure DevOps sync never runs on a schedule yet.
- **PR #3**: needs real Jira/Azure DevOps OAuth app credentials before it's
  usable end-to-end (external dependency).
- **Both**: integration endpoints have no auth yet (see above) — a
  deliberate, temporary gap, not an oversight.
- **This app generally**: tenant-scoping/auth only covers the AI Usage
  module (PR #1's scope). Every other controller (`tenant`, `product`,
  `workitem`, `testcase`, `analytics`, `github`, `product-repository`, most
  of `user`/`admin`) still trusts client-supplied tenant IDs with no auth —
  a known, separate, larger effort.

## File ownership (for the next person touching shared infra)

| Area | Owner |
|---|---|
| `src/api/controllers/ai-usage.controller.ts`, `src/lib/ai-usage.server.ts`, `src/api/middleware/*`, `src/routes/login.tsx`, `src/routes/setup.tsx` | PR #1 |
| `prisma/schema.prisma` — `Integration` model, `Product.jiraProjectId`, `WorkItem`/`Sprint` external-sync fields | PR #3 |
| `src/api/services/{integration,jira-oauth,jira-sync,azure-devops-*}.service.ts`, `src/api/controllers/integration.controller.ts`, `src/api/routes/integration.routes.ts`, `src/lib/scheduler.ts`, `src/lib/jwt.ts` | PR #3 |
| `src/api/server.ts`, `src/api/routes/index.ts`, `prisma/schema.prisma`'s `User`/`AiModelCatalog`/`AiUsageEvent` blocks | Both — check the other PR's diff before editing further |

## PR #3 update (2026-08-18)

- Fixed the flagged bug: `azure_devops` sync handler is now registered with
  the scheduler alongside `jira` in `server.ts`. Thanks for catching that.
- Saw the `requireAdmin` contract above — makes sense, and matches what I'd
  hoped for. Not wiring it into `integration.controller.ts` yet since
  `src/api/middleware/auth.middleware.ts` doesn't exist on this branch
  (`feature/jira-azure-devops-clean` forks off `main`, not `ai-usage-real-capture`)
  — adding the import now would just break this branch's standalone build.
  Ready to wire the moment the branches converge (PR #1 merges first and I
  rebase, or whoever integrates both does it) — it's a small, mechanical
  change at that point given the contract's already spec'd out here.
- Now investigating a separate, bigger question: where the Express API
  backend actually runs in production. Confirmed `z-qualimetrix.lovable.app`
  (the deployed frontend) is a Cloudflare-Workers-style edge function that
  can't host this app's persistent Express+Postgres backend at all — every
  API call from that deployed frontend 404s today, not just Jira/ADO's.
  Scoping a fix now (likely: a separate host for the Express API, e.g.
  Railway/Render, plus centralizing the ~30 hardcoded `localhost:3001`
  references across both PRs' files into one configurable base URL). Will
  post here once there's a concrete plan, since it touches files in both PRs.

## PR #3: backend deployment plan + a real bug for PR #1 (2026-08-18)

**Plan finalized** (full detail in `/Users/yavar/.claude/plans/dapper-munching-marble.md`,
addendum section): Express+Prisma API deploys to Railway (always-on by
default — this app's `node-cron` scheduler needs exactly one persistent
process, ruling out anything that sleeps on idle or edge/Workers hosting).
Frontend stays on Lovable, told where the API lives via one config value.

**New shared frontend module — please converge on this rather than inventing
a different pattern**: `src/lib/api-config.ts` (new, this branch only so far):
```ts
const RAW = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";
export const API_BASE_URL = RAW.replace(/\/+$/, "");
export const API_V1_URL = `${API_BASE_URL}/api/v1`;
```
`VITE_API_URL` is read at Vite build time (confirmed working through
`@lovable.dev/vite-tanstack-config`'s `loadEnv`/`define`, independent of
Lovable's own secrets dashboard) — not a secret, safe to commit in a
`.env.production`. Falls back to today's `localhost:3001` when unset, so
local dev is unaffected.

**Scope note**: I only replaced hardcoded `localhost:3001` refs in files that
exist on `feature/jira-azure-devops-clean` and matter for the Jira/ADO flow
(`IntegrationConnectionPanel.tsx`, `CreateProductForm.tsx`, `integrations.tsx`,
`settings.tsx`'s `GitHubConfig`). Deliberately did **not** touch
`ProductRepositories.tsx`, `git.server.ts`, `github-data.service.ts`,
`admin.tsx`, `ai-usage.tsx`, `setup.tsx`, `login.tsx` — several of those exist
on both our branches independently, and fixing them twice would just produce
conflicting diffs at merge time. Whoever merges second should do one pass
importing `API_V1_URL` from `api-config.ts` across whatever's left, once both
land on `main`.

**Also fixed**: `server.ts`'s CORS on this branch was still `cors()` (wide
open) — switched to the `FRONTEND_ORIGIN`-scoped + `credentials: true` version
to match yours, so this reconciles cleanly at merge instead of one branch
silently reverting the other's CORS hardening.

**⚠️ Real bug for PR #1, found while researching the deployment** (not
something I'm fixing, since it's your file): `auth.controller.ts`'s cookie
config sets `sameSite: 'lax'`. That only works today because
`localhost:8086` → `localhost:3001` are cross-*origin* but same-*site*
(`SameSite` cares about the registrable domain, not the port). Once the
frontend (`z-qualimetrix.lovable.app`) and this API (a new Railway domain)
are genuinely cross-site, `Lax` cookies won't be attached to the frontend's
fetch calls at all — `POST /auth/login` would still return 200, but the
session cookie would never come back on the next request, so login would
silently appear to work and then not persist. Before this matters (i.e.
before PR #1 is tested against a real deployed frontend, not just localhost),
`accessCookieOptions()`/`refreshCookieOptions()` need `sameSite: 'none'` +
`secure: true` in production, and CORS needs an explicit origin (not `*`)
with `credentials: true` — the CORS part's already true on your branch, just
flagging the cookie half too so both land together.

## PR #3: merged PR #1's auth in, built the PM/PO/delegation RBAC layer (2026-08-19)

`origin/ai-usage-real-capture` (PR #1's real auth) is now merged into
`feature/jira-azure-devops-clean` — not the `ai-provider-integrations`
worktree (that one carries unrelated OpenAI/Gemini scope on top of the same
auth code). Whoever eventually merges `ai-provider-integrations` to `main`
will hit the same `AiModelCatalog`/`User` schema reconciliation described
above a second time; this branch's resolution (below) is a worked example.

- **Schema reconciliation**: unioned `User`'s new fields (`squad`,
  `aiIngestTokenHash`, `passwordHash`, etc.) with this branch's own
  `integrations` relation. Took PR #1's `AiModelCatalog` approach (partial
  unique indexes over a plain `@unique`) but kept *this* branch's field
  nullability, since its own `reconcile_ai_usage_drift` migration (already
  applied here) is more current than what PR #1's migrations produce on a
  fresh replay — verify against a shadow DB before trusting either side's
  schema.prisma blindly, don't just pick one branch wholesale.
  Also fixed a real bug in PR #1's own migration history:
  `20260817130007_ai_model_catalog_partial_unique` did
  `DROP CONSTRAINT ai_model_catalog_model_id_key`, but that object is a bare
  `CREATE UNIQUE INDEX`, not a table constraint — Postgres accepted it
  against the shared dev DB's already-drifted state (drops silently
  succeeded there) but it fails a clean replay. Changed to `DROP INDEX`.
- **`requireAdmin` now checks `role === 'pm'`**, not `'admin'` — matches the
  business model (PM = org-wide super-admin who owns Jira/ADO/GitHub/AI-tool
  connections). `admin.controller.ts`'s `setupOrganization` creates the org's
  first user with `role: 'pm'` and now calls the (newly exported)
  `issueSession()` from `auth.controller.ts` immediately after, since
  `setup.tsx`'s wizard calls `bulk-import`/`teams` right after
  `setup-organization` with no login step in between — those are `requireAdmin`-gated now, so the bootstrap request has to leave the caller signed in.
- **New**: `IntegrationDelegation` model + `membership.routes.ts` (PM-only) —
  models "PM delegates connection-setup to a PO for one product" as a
  revocable grant, not a role change. `requireProductWriteAccess` in
  `auth.middleware.ts` enforces it on `PUT /products/:id`: PM edits anything,
  a PO may edit only `jiraProjectKey`/`jiraProjectId`/`azureDevopsAreaPath`,
  and only with an active delegation for that specific product.
- **Every fetch call needed `credentials: 'include'`** once routes went from
  trusting `x-tenant-id`/query params to real cookie sessions — audit any
  new frontend code that calls this API for that, including files this pass
  didn't own before (`ProductRepositories.tsx`, `github-data.service.ts`,
  `setup.tsx`). **Known gap, not fixed**: `src/lib/git.server.ts` calls this
  API's `/github/*` endpoints from server-side code with no cookie to send —
  those requests now 401. Needs either a forwarded-cookie or a service token,
  whoever picks this up next.
- Seed script for demo/local testing: `scripts/seed-demo-roles.ts` (one user
  per role: `pm`/`po`/`developer`/`tester`/`executive`, password `demo1234`,
  plus a live PM→PO delegation on the first seeded product).

## PR #3 merged to main (2026-08-20)

`feature/jira-azure-devops-clean` (PR #3) is now merged into `main` at
`20c7263`. Whoever merges PR #1 next: `main` now has the `Integration` model,
`Product.jiraProjectId`, and `WorkItem`/`Sprint` external-sync fields — rebase
onto this rather than the old `main` tip (`55ec8cd`) to avoid redoing that
diff. Backend is being deployed to Railway separately (in progress); frontend
stays on Lovable, which tracks `main` and should pick this up on its next
build.
