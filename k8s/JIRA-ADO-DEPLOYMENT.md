# Deploying the Jira/Azure DevOps integration to GKE

This documents exactly what changed in `k8s/` for the Jira Cloud + Azure DevOps
integration, and the steps to deploy it. Written for whoever has
`Kubernetes Engine Developer` + `Artifact Registry Writer` on the
`yavar-studio` GCP project (`madhu.r@yavar.ai` did not have these as of
2026-08-20 — confirm access before starting).

## What changed and why

- **`k8s/service.yaml`**: added a second port (`3001`, name `api`). The app's
  single pod already runs both the frontend (port 3000) and the Express API
  (port 3001) — see `start.sh` — but the Service only ever exposed port 3000.
  Every `/api/*` call was silently falling through to the frontend's own
  router and returning its 404 page instead of reaching the backend at all.
- **`k8s/ingress.yaml`**: added a `/api` route rule (checked before the
  catch-all `/` rule — HTTPRoute matches in list order) pointing at the new
  port 3001 service port.
- **`k8s/configmap.yaml`**: added `FRONTEND_ORIGIN` (CORS requires an exact
  origin match once credentials are involved), and both providers'
  `*_REDIRECT_URI` values, pointed at `qubeiq.yavar.ai`.
- **`k8s/secret.yaml`**: replaced `JWT_SECRET`/`ENCRYPTION_KEY`, which were
  still the literal placeholder strings from `.env.example` — the app now
  **fails to boot** if `JWT_SECRET` is missing, short, or equal to that exact
  placeholder (see `src/lib/jwt.ts`, `assertJwtSecretConfigured`), since it
  signs the OAuth `state` parameter and a forgeable one would let an attacker
  attach their own Jira/ADO account to any tenant. Also added empty
  `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET`/`AZURE_DEVOPS_CLIENT_ID`/
  `AZURE_DEVOPS_CLIENT_SECRET` fields — **fill these in before deploying**
  (see below).
- **`k8s/deployment.yaml`**: fixed the container image to the literal string
  `IMAGE_PLACEHOLDER`. It had a real tag (`:latest-final`) hardcoded instead,
  which meant `deploy.sh`'s `sed "s|IMAGE_PLACEHOLDER|...|"` substitution was
  a silent no-op — the script built and pushed a new image but then deployed
  whatever `:latest-final` already happened to be in the registry, not the
  image it just built.

## Before deploying: fill in real OAuth credentials

Edit `k8s/secret.yaml`:

- **Jira**: register an OAuth 2.0 (3LO) app at
  [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/)
  (doesn't require access to any specific Jira site — any Atlassian account
  can do this). Permissions → add the Jira API → scopes `read:jira-work`,
  `read:jira-user`, `offline_access`. Authorization → callback URL:
  `https://qubeiq.yavar.ai/api/v1/integrations/jira/callback`. Copy the
  Client ID + Secret from Settings into `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET`.
- **Azure DevOps**: register at
  [app.vssps.visualstudio.com/app/register](https://app.vssps.visualstudio.com/app/register)
  — this is the dedicated Azure DevOps OAuth app registration, **not** a
  general Entra ID/Azure AD app. Scopes: `vso.work`, `vso.project`. Callback
  URL: `https://qubeiq.yavar.ai/api/v1/integrations/azure_devops/callback`.
  Cloud only — Azure DevOps Server (on-prem) doesn't support this flow.

## Deploy

```bash
# 1. Confirm access
gcloud config set project yavar-studio
gcloud container clusters list

# 2. Get cluster credentials (see gcp-k8s-setup.md for the one-time auth steps)
gcloud container clusters get-credentials <cluster-name> --region asia-south1

# 3. Pull latest main (has the Jira/ADO app code + these k8s fixes)
git pull origin main

# 4. Run the existing deploy script — builds the image, pushes to Artifact
#    Registry, and applies all manifests in the right order
./k8s/deploy.sh
```

`deploy.sh` already handles: Docker build → push → substitute the image tag
into `deployment.yaml` → apply configmap/secret → apply postgres/redis →
wait for them → apply deployment/service/ingress → wait for rollout → run
`prisma migrate deploy` inside the pod. Nothing about that sequence needs to
change.

## Verify

```bash
# Both should return real JSON now, not a 404 (previously /api/* 404'd on the
# frontend's own router — that was the bug this fixes)
curl https://qubeiq.yavar.ai/api/v1/health
curl "https://qubeiq.yavar.ai/api/v1/integrations/jira/status?tenantId=<a-real-tenant-id>"
```

Then in the browser: `https://qubeiq.yavar.ai/settings` → Integrations tab →
"Connect Jira Cloud" should redirect to Atlassian's real login/consent
screen, not an error.

## Known limitations carried over from local testing

- **Single replica only.** `k8s/deployment.yaml` already has `replicas: 1` —
  keep it that way. The sync scheduler (`src/lib/scheduler.ts`) uses an
  in-memory lock with no cross-process coordination; a second replica would
  run an independent scheduler tick and double-sync every connected
  integration. Scaling this requires a BullMQ+Redis rewrite first (not done).
- **`ENCRYPTION_KEY` is a single static key**, not per-tenant-derived (a
  pre-existing limitation shared with the GitHub token storage, unchanged
  here — see `src/lib/encryption.ts`).
- **Postgres password (`postgres:postgres` in `DATABASE_URL`) is weak** —
  fine since it's only reachable inside the cluster (no external Postgres
  exposure), but worth hardening if that ever changes.
