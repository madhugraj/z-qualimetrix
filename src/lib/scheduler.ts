import cron from "node-cron";
import type { AiProviderConnection, GitHubIntegration, Integration } from "@prisma/client";
import integrationService, { IntegrationProvider } from "../api/services/integration.service";
import aiProviderConnectionService from "../api/services/ai-provider-connection.service";
import providerConnectionService from "../api/services/provider-connection.service";
import { listGithubIntegrationsForSync } from "../api/services/github-commit-sync.service";

/**
 * node-cron only supports fixed cron expressions, not per-row dynamic
 * intervals. The "poll the poll interval" pattern below is what makes
 * admin-configurable per-tenant sync frequency work on top of a single fixed
 * tick: every minute, ask the DB which integrations are actually due, and
 * only dispatch those.
 */
const TICK_CRON_EXPRESSION = "* * * * *";
const MAX_CONCURRENT_SYNCS = 8;

type SyncHandler = (integration: Integration) => Promise<void>;
type AiProviderSyncHandler = (connection: AiProviderConnection) => Promise<void>;
type GithubCommitSyncHandler = (integration: GitHubIntegration) => Promise<void>;

const syncHandlers: Partial<Record<IntegrationProvider, SyncHandler>> = {};
const aiProviderSyncHandlers: Record<string, AiProviderSyncHandler> = {};
// GitHubIntegration is its own model (not Integration or AiProviderConnection
// — see integration.service.ts's IntegrationProvider union, which doesn't
// include "github"), so it gets its own single-slot registration rather than
// reusing either map above.
let githubCommitSyncHandler: GithubCommitSyncHandler | null = null;

export function registerSyncHandler(provider: IntegrationProvider, handler: SyncHandler): void {
  syncHandlers[provider] = handler;
}

/** Used by the manual "sync now" endpoint so it doesn't need its own hardcoded provider-to-handler mapping. */
export function getSyncHandler(provider: IntegrationProvider): SyncHandler | undefined {
  return syncHandlers[provider];
}

export function registerAiProviderSyncHandler(
  vendor: string,
  handler: AiProviderSyncHandler,
): void {
  aiProviderSyncHandlers[vendor] = handler;
}

export function registerGithubCommitSyncHandler(handler: GithubCommitSyncHandler): void {
  githubCommitSyncHandler = handler;
}

// In-memory overlap lock — shared between the scheduled tick and manual
// "Sync now" requests so a button click can't race a concurrently-running
// scheduled sync for the same integration. Single-process only: if this API
// ever runs as 2+ replicas, each would run an independent tick with no
// cross-process coordination (a v2 concern requiring BullMQ+Redis, not this).
const runningIntegrationIds = new Set<string>();

/**
 * Reserves a connection for an operation that must not overlap with sync
 * (for example credential removal or permanent deletion). The lock is
 * process-local, matching the scheduler's current single-process contract.
 */
export function reserveIntegrationOperation(integrationId: string): boolean {
  if (runningIntegrationIds.has(integrationId)) return false;
  runningIntegrationIds.add(integrationId);
  return true;
}

export function releaseIntegrationOperation(integrationId: string): void {
  runningIntegrationIds.delete(integrationId);
}

async function runSync(integration: Integration): Promise<void> {
  const handler = syncHandlers[integration.provider as IntegrationProvider];
  if (!handler) {
    console.warn(
      `[scheduler] No sync handler registered for provider "${integration.provider}" — skipping integration ${integration.id}`,
    );
    return;
  }

  if (!reserveIntegrationOperation(integration.id)) return;
  try {
    await handler(integration);
  } catch (err) {
    console.error(
      `[scheduler] Sync failed for integration ${integration.id} (${integration.provider}):`,
      err,
    );
  } finally {
    releaseIntegrationOperation(integration.id);
  }
}

async function runAiProviderSync(connection: AiProviderConnection): Promise<void> {
  const handler = aiProviderSyncHandlers[connection.vendor];
  if (!handler) {
    console.warn(
      `[scheduler] No AI provider sync handler registered for vendor "${connection.vendor}" — skipping ${connection.id}`,
    );
    return;
  }
  if (!reserveIntegrationOperation(connection.id)) return;
  try {
    await handler(connection);
  } catch (err) {
    console.error(
      `[scheduler] AI provider sync failed for ${connection.id} (${connection.vendor}):`,
      err,
    );
  } finally {
    releaseIntegrationOperation(connection.id);
  }
}

async function runGithubCommitSync(integration: GitHubIntegration): Promise<void> {
  if (!githubCommitSyncHandler) return;
  if (!reserveIntegrationOperation(integration.id)) return;
  try {
    await githubCommitSyncHandler(integration);
  } catch (err) {
    console.error(`[scheduler] GitHub commit sync failed for ${integration.id}:`, err);
  } finally {
    releaseIntegrationOperation(integration.id);
  }
}

/**
 * Used by the manual "Sync now" endpoint. Returns false (caller should 409)
 * if a sync for this integration is already running, whether kicked off by
 * this call, an earlier manual call, or the scheduled tick.
 */
export function requestSyncNow(integrationId: string, run: () => Promise<void>): boolean {
  if (!reserveIntegrationOperation(integrationId)) return false;
  run()
    .catch((err) =>
      console.error(`[scheduler] Manual sync failed for integration ${integrationId}:`, err),
    )
    .finally(() => releaseIntegrationOperation(integrationId));
  return true;
}

async function dispatchDueIntegrations(): Promise<void> {
  // Anthropic and every other AI/GPU-compute vendor (GCP, later AWS/Azure)
  // are two separate listDueForSync-style calls — different services,
  // different required fields — but both feed the same runAiProviderSync
  // dispatcher below, which looks up a handler by connection.vendor either way.
  const [candidates, anthropicCandidates, otherProviderCandidates, githubCandidates] = await Promise.all([
    integrationService.listDueForSync(),
    aiProviderConnectionService.listDueAnthropicApiConnections(),
    providerConnectionService.listDueForSync(),
    listGithubIntegrationsForSync(),
  ]);
  const aiProviderCandidates = [...anthropicCandidates, ...otherProviderCandidates];
  const now = Date.now();

  const due = candidates.filter((integration) => {
    if (runningIntegrationIds.has(integration.id)) return false;
    const lastSyncedAtMs = integration.lastSyncedAt?.getTime() ?? 0;
    const dueAtMs = lastSyncedAtMs + integration.syncFrequencyMinutes * 60_000;
    return now >= dueAtMs;
  });

  for (let i = 0; i < due.length; i += MAX_CONCURRENT_SYNCS) {
    const chunk = due.slice(i, i + MAX_CONCURRENT_SYNCS);
    await Promise.allSettled(chunk.map((integration) => runSync(integration)));
  }

  const dueAiProviders = aiProviderCandidates.filter((connection) => {
    if (runningIntegrationIds.has(connection.id)) return false;
    const lastSyncedAtMs = connection.lastSyncedAt?.getTime() ?? 0;
    return now >= lastSyncedAtMs + connection.syncFrequencyMinutes * 60_000;
  });
  for (let i = 0; i < dueAiProviders.length; i += MAX_CONCURRENT_SYNCS) {
    await Promise.allSettled(
      dueAiProviders.slice(i, i + MAX_CONCURRENT_SYNCS).map(runAiProviderSync),
    );
  }

  const dueGithubIntegrations = githubCandidates.filter((integration) => {
    if (runningIntegrationIds.has(integration.id)) return false;
    const lastSyncedAtMs = integration.lastSyncedAt?.getTime() ?? 0;
    return now >= lastSyncedAtMs + integration.syncFrequencyMinutes * 60_000;
  });
  for (let i = 0; i < dueGithubIntegrations.length; i += MAX_CONCURRENT_SYNCS) {
    await Promise.allSettled(
      dueGithubIntegrations.slice(i, i + MAX_CONCURRENT_SYNCS).map(runGithubCommitSync),
    );
  }
}

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  cron.schedule(TICK_CRON_EXPRESSION, () => {
    dispatchDueIntegrations().catch((err) => console.error("[scheduler] Tick failed:", err));
  });

  console.log(
    "[scheduler] Started — polling for due integrations every minute (single-process only, see scheduler.ts)",
  );
}
