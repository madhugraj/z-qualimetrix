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
