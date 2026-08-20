import cron from 'node-cron';
import type { Integration } from '@prisma/client';
import integrationService, { IntegrationProvider } from '../api/services/integration.service';

/**
 * node-cron only supports fixed cron expressions, not per-row dynamic
 * intervals. The "poll the poll interval" pattern below is what makes
 * admin-configurable per-tenant sync frequency work on top of a single fixed
 * tick: every minute, ask the DB which integrations are actually due, and
 * only dispatch those.
 */
const TICK_CRON_EXPRESSION = '* * * * *';
const MAX_CONCURRENT_SYNCS = 8;

type SyncHandler = (integration: Integration) => Promise<void>;

const syncHandlers: Partial<Record<IntegrationProvider, SyncHandler>> = {};

export function registerSyncHandler(provider: IntegrationProvider, handler: SyncHandler): void {
  syncHandlers[provider] = handler;
}

// In-memory overlap lock — shared between the scheduled tick and manual
// "Sync now" requests so a button click can't race a concurrently-running
// scheduled sync for the same integration. Single-process only: if this API
// ever runs as 2+ replicas, each would run an independent tick with no
// cross-process coordination (a v2 concern requiring BullMQ+Redis, not this).
const runningIntegrationIds = new Set<string>();

async function runSync(integration: Integration): Promise<void> {
  const handler = syncHandlers[integration.provider as IntegrationProvider];
  if (!handler) {
    console.warn(`[scheduler] No sync handler registered for provider "${integration.provider}" — skipping integration ${integration.id}`);
    return;
  }

  runningIntegrationIds.add(integration.id);
  try {
    await handler(integration);
  } catch (err) {
    console.error(`[scheduler] Sync failed for integration ${integration.id} (${integration.provider}):`, err);
  } finally {
    runningIntegrationIds.delete(integration.id);
  }
}

/**
 * Used by the manual "Sync now" endpoint. Returns false (caller should 409)
 * if a sync for this integration is already running, whether kicked off by
 * this call, an earlier manual call, or the scheduled tick.
 */
export function requestSyncNow(integrationId: string, run: () => Promise<void>): boolean {
  if (runningIntegrationIds.has(integrationId)) return false;

  runningIntegrationIds.add(integrationId);
  run()
    .catch((err) => console.error(`[scheduler] Manual sync failed for integration ${integrationId}:`, err))
    .finally(() => runningIntegrationIds.delete(integrationId));
  return true;
}

async function dispatchDueIntegrations(): Promise<void> {
  const candidates = await integrationService.listDueForSync();
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
}

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  cron.schedule(TICK_CRON_EXPRESSION, () => {
    dispatchDueIntegrations().catch((err) => console.error('[scheduler] Tick failed:', err));
  });

  console.log('[scheduler] Started — polling for due integrations every minute (single-process only, see scheduler.ts)');
}
