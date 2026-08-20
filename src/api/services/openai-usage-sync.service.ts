/**
 * Pull-based usage sync for OpenAI: GET /v1/organization/usage/completions,
 * requiring an org-level Admin API Key (distinct from a regular project key).
 * Unlike Claude Code's push-based per-request OTLP export, this reports
 * pre-aggregated buckets (one day x one model x one API key, by default) —
 * each bucket becomes one AiUsageEvent row carrying the bucket's token totals,
 * not one row per underlying request. `num_model_requests` is available per
 * bucket but has no home on AiUsageEvent (designed for one-row-per-event), so
 * the dashboard's "requests" count under-counts for OpenAI-sourced rows
 * specifically — token/cost figures stay accurate since those are true
 * aggregate sums. Documented limitation, not a bug to silently ship unnoted.
 *
 * The exact response field names (input_tokens/input_cached_tokens semantics
 * in particular — whether cached is a subset of the total or reported
 * separately) come from OpenAI's published API reference, not a captured
 * live payload. Re-verify against a real response during rollout and adjust
 * if needed, same caveat as otel-claude-code.server.ts carries for Claude.
 */

import prisma from '../../lib/prisma';
import integrationService from './integration.service';
import { ensureModelCatalogEntry, SPRINTS } from '../../lib/ai-usage.server';
import type { Integration } from '@prisma/client';

const OPENAI_USAGE_URL = 'https://api.openai.com/v1/organization/usage/completions';
const OVERLAP_SECONDS = 2 * 24 * 60 * 60;
const INITIAL_BACKFILL_SECONDS = 30 * 24 * 60 * 60;

// Placeholder default for a GPT model this adapter hasn't seen before — real
// per-model pricing should be seeded by an admin (or a future pricing-refresh
// pass); this only stops an unrecognized model from silently inheriting
// Claude's $3/$15 rate via ensureModelCatalogEntry's own generic fallback.
const OPENAI_CATALOG_HINT = {
  vendor: 'OpenAI',
  priceIn: 2.5,
  priceOut: 10,
  purpose: 'Auto-detected from OpenAI usage sync — verify pricing before trusting cost figures.',
};

interface OpenAiUsageResult {
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  num_model_requests?: number;
  model?: string;
  api_key_id?: string;
}

interface OpenAiUsageBucket {
  start_time: number;
  end_time: number;
  results: OpenAiUsageResult[];
}

interface OpenAiUsageResponse {
  data: OpenAiUsageBucket[];
  has_more: boolean;
  next_page: string | null;
}

async function fetchUsagePage(adminApiKey: string, startTime: number, endTime: number, page?: string): Promise<OpenAiUsageResponse> {
  const params = new URLSearchParams({
    start_time: String(startTime),
    end_time: String(endTime),
    bucket_width: '1d',
    group_by: 'model,api_key_id',
    limit: '31',
  });
  if (page) params.set('page', page);

  const response = await fetch(`${OPENAI_USAGE_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI usage API failed (${response.status}): ${body}`);
  }
  return response.json();
}

/** Falls back to a per-tenant synthetic user when the OpenAI api_key_id has no recorded mapping. */
async function resolveUserId(tenantId: string, apiKeyId: string | undefined): Promise<string> {
  if (apiKeyId) {
    const mapping = await prisma.aiProviderKeyMapping.findUnique({
      where: { tenantId_provider_externalKeyId: { tenantId, provider: 'openai', externalKeyId: apiKeyId } },
    });
    if (mapping) return mapping.userId;
  }
  return integrationService.getOrCreateSystemUser(tenantId);
}

/**
 * findFirst-then-create/update rather than createMany or Prisma upsert() —
 * this table's dedup key is a partial unique index (WHERE bucket_start IS NOT
 * NULL), which Prisma's schema DSL can't declare, so it can't be an upsert()
 * target either. Same pattern as ensureModelCatalogEntry.
 */
async function writeUsageRow(tenantId: string, bucketStart: Date, row: OpenAiUsageResult): Promise<void> {
  const modelId = row.model ?? 'unknown-openai-model';
  const apiKeyId = row.api_key_id;
  const groupKey = apiKeyId ?? 'unattributed';

  await ensureModelCatalogEntry(modelId, OPENAI_CATALOG_HINT);
  const userId = await resolveUserId(tenantId, apiKeyId);

  const tokensIn = row.input_tokens ?? 0;
  const cachedIn = Math.min(tokensIn, row.input_cached_tokens ?? 0);
  const tokensOut = row.output_tokens ?? 0;

  const existing = await prisma.aiUsageEvent.findFirst({
    where: { tenantId, provider: 'openai', modelId, bucketStart, groupKey },
  });

  const data = {
    tokensIn,
    tokensOut,
    cachedIn,
    latencyMs: 0,
    accepted: true,
    reworked: false,
  };

  if (existing) {
    // Re-synced bucket (within the overlap window) — OpenAI revised it; overwrite rather than double-count.
    await prisma.aiUsageEvent.update({ where: { id: existing.id }, data });
  } else {
    await prisma.aiUsageEvent.create({
      data: {
        ...data,
        timestamp: bucketStart,
        sprint: SPRINTS[SPRINTS.length - 1],
        userId,
        modelId,
        tenantId,
        provider: 'openai',
        bucketStart,
        groupKey,
      },
    });
  }
}

export async function syncOpenAiUsage(integration: Integration): Promise<void> {
  await integrationService.recordSyncStart(integration.id);

  try {
    const tokens = await integrationService.getDecryptedTokens(integration.tenantId, 'openai');
    if (!tokens) return; // disconnected mid-flight between scheduling and running

    const nowSeconds = Math.floor(Date.now() / 1000);
    const cursor = typeof tokens.externalMetadata.lastIngestedUnixTime === 'number'
      ? tokens.externalMetadata.lastIngestedUnixTime
      : nowSeconds - INITIAL_BACKFILL_SECONDS;
    const startTime = Math.max(0, cursor - OVERLAP_SECONDS);

    let page: string | undefined;
    let maxBucketEndSeen = cursor;

    do {
      const response = await fetchUsagePage(tokens.accessToken, startTime, nowSeconds, page);

      for (const bucket of response.data ?? []) {
        const bucketStart = new Date(bucket.start_time * 1000);
        for (const row of bucket.results ?? []) {
          await writeUsageRow(integration.tenantId, bucketStart, row);
        }
        maxBucketEndSeen = Math.max(maxBucketEndSeen, bucket.end_time ?? bucket.start_time);
      }

      page = response.has_more ? (response.next_page ?? undefined) : undefined;
    } while (page);

    await integrationService.updateExternalMetadata(integration.tenantId, 'openai', {
      lastIngestedUnixTime: maxBucketEndSeen,
    });
    await integrationService.recordSyncSuccess(integration.id);
  } catch (error) {
    await integrationService.recordSyncError(integration.id, error instanceof Error ? error.message : String(error));
  }
}
