import crypto from "crypto";
import { Prisma, type AiProviderConnection } from "@prisma/client";
import prisma from "../../lib/prisma";
import aiProviderConnectionService, {
  type AnthropicCapabilities,
} from "./ai-provider-connection.service";
import { ensureModelCatalogEntry } from "../../lib/ai-usage.server";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableId(parts: unknown[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function utcDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

function sanitizeErrorText(value: string): string {
  return value
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 800);
}

class AnthropicSyncHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function getJson(path: string, apiKey: string): Promise<JsonRecord> {
  const response = await fetch(`https://api.anthropic.com${path}`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "user-agent": "QualiMetrix/1.0 (enterprise-ai-usage-monitoring)",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new AnthropicSyncHttpError(
      `Anthropic API ${response.status}: ${sanitizeErrorText(text)}`,
      response.status,
    );
  }
  return asRecord(text ? JSON.parse(text) : {});
}

async function getAllPages(
  path: string,
  apiKey: string,
): Promise<{ data: JsonRecord[]; organizationId: string | null }> {
  const data: JsonRecord[] = [];
  let page: string | null = null;
  let organizationId: string | null = null;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const body = await getJson(
      `${path}${page ? `${separator}page=${encodeURIComponent(page)}` : ""}`,
      apiKey,
    );
    data.push(...asArray(body.data));
    if (typeof body.organization_id === "string") organizationId = body.organization_id;
    const nextPage =
      typeof body.next_page === "string" && body.next_page.length > 0 ? body.next_page : null;
    // Anthropic's reporting APIs are not uniform: Usage/Cost exposes
    // `has_more`, while Enterprise activity uses a nullable `next_page` only.
    page = body.has_more === false ? null : nextPage;
  } while (page);
  return { data, organizationId };
}

function actorFields(row: JsonRecord): {
  externalUserId: string;
  email: string | null;
  name: string | null;
} {
  const actor = asRecord(row.actor ?? row.user);
  const email =
    typeof (actor.email ?? actor.email_address) === "string"
      ? String(actor.email ?? actor.email_address).toLowerCase()
      : null;
  const apiKeyName = typeof actor.api_key_name === "string" ? actor.api_key_name : null;
  const userId =
    typeof (actor.user_id ?? actor.id) === "string" ? String(actor.user_id ?? actor.id) : null;
  const externalUserId =
    userId ??
    (email
      ? `email:${email}`
      : apiKeyName
        ? `api_key:${apiKeyName}`
        : `unknown:${stableId([JSON.stringify(actor)])}`);
  return { externalUserId, email, name: typeof actor.name === "string" ? actor.name : apiKeyName };
}

async function upsertIdentity(connection: AiProviderConnection, row: JsonRecord) {
  const actor = actorFields(row);
  const user = actor.email
    ? await prisma.user.findFirst({
        where: {
          tenantId: connection.tenantId,
          email: { equals: actor.email, mode: "insensitive" },
        },
      })
    : null;
  return prisma.aiProviderIdentity.upsert({
    where: {
      connectionId_externalUserId: {
        connectionId: connection.id,
        externalUserId: actor.externalUserId,
      },
    },
    create: {
      tenantId: connection.tenantId,
      connectionId: connection.id,
      externalUserId: actor.externalUserId,
      email: actor.email,
      displayName: actor.name,
      userId: user?.id ?? null,
      metadata: { identitySource: "anthropic_api" },
    },
    update: {
      email: actor.email,
      displayName: actor.name,
      userId: user?.id ?? undefined,
      lastSeenAt: new Date(),
    },
  });
}

async function upsertRaw(
  connection: AiProviderConnection,
  source: string,
  externalEventId: string,
  occurredAt: Date,
  identityId: string | null,
  payload: JsonRecord,
) {
  await prisma.aiProviderRawEvent.upsert({
    where: {
      connectionId_source_externalEventId: { connectionId: connection.id, source, externalEventId },
    },
    create: {
      tenantId: connection.tenantId,
      connectionId: connection.id,
      identityId,
      source,
      externalEventId,
      occurredAt,
      payload: payload as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
    update: {
      identityId,
      occurredAt,
      payload: payload as Prisma.InputJsonValue,
      processedAt: new Date(),
      processingError: null,
    },
  });
}

async function upsertUsage(
  connection: AiProviderConnection,
  identity: { id: string; userId: string | null },
  params: {
    date: Date;
    source: string;
    externalEventId: string;
    modelId: string;
    tokensIn: number;
    tokensOut: number;
    cachedIn: number;
    requestCount: number;
    providerCostUsd?: number | null;
    estimatedCostUsd?: number | null;
    costSource?: string | null;
    metadata?: JsonRecord;
  },
) {
  await ensureModelCatalogEntry(params.modelId, { vendor: "Anthropic" });
  const data = {
    timestamp: params.date,
    sprint: null,
    userId: identity.userId,
    modelId: params.modelId,
    activity: null,
    tokensIn: Math.max(0, Math.round(params.tokensIn)),
    tokensOut: Math.max(0, Math.round(params.tokensOut)),
    cachedIn: Math.max(0, Math.round(params.cachedIn)),
    latencyMs: null,
    accepted: null,
    reworked: null,
    tenantId: connection.tenantId,
    provider: "claude_code",
    providerConnectionId: connection.id,
    providerIdentityId: identity.id,
    source: params.source,
    externalEventId: params.externalEventId,
    requestCount: Math.max(0, Math.round(params.requestCount)),
    providerCostUsd: params.providerCostUsd ?? null,
    estimatedCostUsd: params.estimatedCostUsd ?? null,
    costSource: params.costSource ?? null,
    metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
  } satisfies Prisma.AiUsageEventUncheckedCreateInput;
  const existing = await prisma.aiUsageEvent.findFirst({
    where: {
      providerConnectionId: connection.id,
      source: params.source,
      externalEventId: params.externalEventId,
    },
    select: { id: true },
  });
  if (existing) await prisma.aiUsageEvent.update({ where: { id: existing.id }, data });
  else await prisma.aiUsageEvent.create({ data });
}

function toolTotals(toolActions: JsonRecord): { accepted: number; rejected: number } {
  return Object.values(toolActions).reduce(
    (totals, value) => {
      const item = asRecord(value);
      totals.accepted += num(item.accepted);
      totals.rejected += num(item.rejected);
      return totals;
    },
    { accepted: 0, rejected: 0 },
  );
}

export function normalizeEnterpriseClaudeCodeActivity(row: JsonRecord) {
  const metrics = asRecord(row.claude_code_metrics);
  const core = asRecord(metrics.core_metrics);
  const lines = asRecord(core.lines_of_code);
  const tools = toolTotals(asRecord(metrics.tool_actions));
  return {
    sessionCount: num(core.distinct_session_count ?? core.num_sessions ?? core.session_count),
    commits: num(core.commit_count ?? core.commits_by_claude_code ?? core.commits),
    pullRequests: num(
      core.pull_request_count ?? core.pull_requests_by_claude_code ?? core.pull_requests,
    ),
    linesAdded: num(lines.added_count ?? lines.added),
    linesRemoved: num(lines.removed_count ?? lines.removed),
    suggestionsAccepted: tools.accepted,
    suggestionsRejected: tools.rejected,
    toolMetrics: asRecord(metrics.tool_actions),
  };
}

async function syncConsoleDay(connection: AiProviderConnection, apiKey: string, day: string) {
  const report = await getAllPages(
    `/v1/organizations/usage_report/claude_code?starting_at=${day}&limit=1000`,
    apiKey,
  );
  if (report.organizationId && report.organizationId !== connection.externalAccountId) {
    throw new Error(
      `Anthropic response organization ${report.organizationId} does not match connection ${connection.externalAccountId}.`,
    );
  }

  for (const row of report.data) {
    const identity = await upsertIdentity(connection, row);
    const rowDate = utcDate(typeof row.date === "string" ? row.date : day);
    const actor = actorFields(row);
    const rawId = `console_daily:${dateString(rowDate)}:${actor.externalUserId}:${row.terminal_type ?? "all"}`;
    await upsertRaw(connection, "anthropic_console_analytics", rawId, rowDate, identity.id, row);

    const core = asRecord(row.core_metrics);
    const lines = asRecord(core.lines_of_code);
    const tools = toolTotals(asRecord(row.tool_actions));
    await prisma.aiProviderDailyActivity.upsert({
      where: {
        connectionId_identityId_date_product_source: {
          connectionId: connection.id,
          identityId: identity.id,
          date: rowDate,
          product: "claude_code",
          source: "anthropic_console_analytics",
        },
      },
      create: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        identityId: identity.id,
        date: rowDate,
        product: "claude_code",
        source: "anthropic_console_analytics",
        sessionCount: num(core.num_sessions),
        commits: num(core.commits_by_claude_code),
        pullRequests: num(core.pull_requests_by_claude_code),
        linesAdded: num(lines.added),
        linesRemoved: num(lines.removed),
        suggestionsAccepted: tools.accepted,
        suggestionsRejected: tools.rejected,
        toolMetrics: asRecord(row.tool_actions),
        metadata: {
          terminalType: row.terminal_type ?? null,
          customerType: row.customer_type ?? null,
          subscriptionType: row.subscription_type ?? null,
        },
      },
      update: {
        sessionCount: num(core.num_sessions),
        commits: num(core.commits_by_claude_code),
        pullRequests: num(core.pull_requests_by_claude_code),
        linesAdded: num(lines.added),
        linesRemoved: num(lines.removed),
        suggestionsAccepted: tools.accepted,
        suggestionsRejected: tools.rejected,
        toolMetrics: asRecord(row.tool_actions),
      },
    });

    for (const breakdown of asArray(row.model_breakdown)) {
      const tokens = asRecord(breakdown.tokens);
      const estimated = asRecord(breakdown.estimated_cost);
      const modelId = typeof breakdown.model === "string" ? breakdown.model : "unknown-model";
      await upsertUsage(connection, identity, {
        date: rowDate,
        source: "anthropic_console_analytics",
        externalEventId: `console_usage:${dateString(rowDate)}:${actor.externalUserId}:${modelId}:${row.terminal_type ?? "all"}`,
        modelId,
        tokensIn: num(tokens.input) + num(tokens.cache_creation),
        tokensOut: num(tokens.output),
        cachedIn: num(tokens.cache_read),
        requestCount: 0,
        estimatedCostUsd:
          typeof estimated.amount === "number" || typeof estimated.amount === "string"
            ? num(estimated.amount) / 100
            : null,
        costSource: "provider_estimated",
        metadata: { currency: estimated.currency ?? null, terminalType: row.terminal_type ?? null },
      });
    }
  }
}

async function syncEnterpriseActivity(
  connection: AiProviderConnection,
  apiKey: string,
  day: string,
) {
  const report = await getAllPages(
    `/v1/organizations/analytics/users?date=${day}&limit=1000`,
    apiKey,
  );
  if (report.organizationId && report.organizationId !== connection.externalAccountId)
    throw new Error("Enterprise activity response organization mismatch.");
  const date = utcDate(day);
  for (const row of report.data) {
    const identity = await upsertIdentity(connection, row);
    const actor = actorFields(row);
    await upsertRaw(
      connection,
      "anthropic_enterprise_activity",
      `enterprise_activity:${day}:${actor.externalUserId}`,
      date,
      identity.id,
      row,
    );
    const activity = normalizeEnterpriseClaudeCodeActivity(row);
    await prisma.aiProviderDailyActivity.upsert({
      where: {
        connectionId_identityId_date_product_source: {
          connectionId: connection.id,
          identityId: identity.id,
          date,
          product: "claude_code",
          source: "anthropic_enterprise_activity",
        },
      },
      create: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        identityId: identity.id,
        date,
        product: "claude_code",
        source: "anthropic_enterprise_activity",
        ...activity,
        metadata: {
          lastActivityDate: row.last_activity_date ?? null,
          rbacGroupId: row.rbac_group_id ?? null,
          rbacGroupName: row.rbac_group_name ?? null,
        },
      },
      update: {
        ...activity,
      },
    });
  }
}

async function syncEnterpriseUsageAndCost(
  connection: AiProviderConnection,
  apiKey: string,
  day: string,
) {
  const endingDay = dateString(addDays(utcDate(day), 1));
  const common = `starting_at=${day}T00%3A00%3A00Z&ending_at=${endingDay}T00%3A00%3A00Z&bucket_width=1d&products%5B%5D=claude_code&group_by%5B%5D=product&group_by%5B%5D=model&limit=1000`;
  const [usageReport, costReport] = await Promise.all([
    getAllPages(`/v1/organizations/analytics/user_usage_report?${common}`, apiKey),
    getAllPages(`/v1/organizations/analytics/user_cost_report?${common}`, apiKey),
  ]);
  for (const orgId of [usageReport.organizationId, costReport.organizationId]) {
    if (orgId && orgId !== connection.externalAccountId)
      throw new Error(`Enterprise response organization ${orgId} does not match connection.`);
  }

  const costs = new Map<string, number>();
  for (const row of costReport.data) {
    const actor = actorFields(row);
    const model = typeof row.model === "string" ? row.model : "all-models";
    const key = `${actor.externalUserId}|${model}`;
    costs.set(key, (costs.get(key) ?? 0) + num(row.amount) / 100);
    const identity = await upsertIdentity(connection, row);
    await upsertRaw(
      connection,
      "anthropic_enterprise_cost",
      `enterprise_cost:${day}:${actor.externalUserId}:${model}`,
      utcDate(day),
      identity.id,
      row,
    );
  }

  const usageKeys = new Set<string>();
  for (const row of usageReport.data) {
    const identity = await upsertIdentity(connection, row);
    const actor = actorFields(row);
    const modelId = typeof row.model === "string" ? row.model : "unknown-model";
    const key = `${actor.externalUserId}|${modelId}`;
    usageKeys.add(key);
    await upsertRaw(
      connection,
      "anthropic_enterprise_usage",
      `enterprise_usage:${day}:${actor.externalUserId}:${modelId}`,
      utcDate(day),
      identity.id,
      row,
    );
    const cacheCreation = asRecord(row.cache_creation);
    await upsertUsage(connection, identity, {
      date: utcDate(day),
      source: "anthropic_enterprise_analytics",
      externalEventId: `enterprise_usage:${day}:${actor.externalUserId}:${modelId}`,
      modelId,
      tokensIn:
        num(row.uncached_input_tokens) +
        num(cacheCreation.ephemeral_5m_input_tokens) +
        num(cacheCreation.ephemeral_1h_input_tokens),
      tokensOut: num(row.output_tokens),
      cachedIn: num(row.cache_read_input_tokens),
      requestCount: num(row.requests),
      providerCostUsd: costs.get(key) ?? null,
      costSource: costs.has(key) ? "provider_billed" : null,
      metadata: { product: row.product ?? "claude_code" },
    });
  }

  // Preserve billed rows even when the provider reports no token row for the same dimension.
  for (const row of costReport.data) {
    const actor = actorFields(row);
    const modelId = typeof row.model === "string" ? row.model : "unknown-model";
    const key = `${actor.externalUserId}|${modelId}`;
    if (usageKeys.has(key)) continue;
    const identity = await upsertIdentity(connection, row);
    await upsertUsage(connection, identity, {
      date: utcDate(day),
      source: "anthropic_enterprise_analytics",
      externalEventId: `enterprise_usage:${day}:${actor.externalUserId}:${modelId}`,
      modelId,
      tokensIn: 0,
      tokensOut: 0,
      cachedIn: 0,
      requestCount: num(row.requests),
      providerCostUsd: costs.get(key) ?? 0,
      costSource: "provider_billed",
      metadata: { costOnly: true, product: row.product ?? "claude_code" },
    });
  }
}

function syncWindow(connection: AiProviderConnection, adapter: "enterprise" | "console") {
  const cursor = asRecord(connection.syncCursor);
  const overlapDays = Math.max(1, num(cursor.overlapDays) || 2);
  const backfillDays = Math.max(1, num(cursor.initialBackfillDays) || 30);
  const end = addDays(new Date(), adapter === "enterprise" ? -2 : -1);
  const last =
    typeof cursor.lastCompletedDate === "string" ? utcDate(cursor.lastCompletedDate) : null;
  const start = last ? addDays(last, -overlapDays) : addDays(end, -(backfillDays - 1));
  return { start, end, cursor, overlapDays, backfillDays };
}

export async function syncAnthropicConnection(connection: AiProviderConnection): Promise<void> {
  await aiProviderConnectionService.recordSyncStart(connection.id);
  try {
    const capabilities = connection.capabilities as unknown as AnthropicCapabilities;
    if (!capabilities.apiAdapter)
      throw new Error("This Anthropic connection has no reporting API capability.");
    const apiKey = await aiProviderConnectionService.getDecryptedCredential(connection.id);
    if (!apiKey) throw new Error("Reporting credential is missing.");
    const window = syncWindow(connection, capabilities.apiAdapter);
    for (let date = window.start; date <= window.end; date = addDays(date, 1)) {
      const day = dateString(date);
      if (capabilities.apiAdapter === "console") await syncConsoleDay(connection, apiKey, day);
      else {
        await syncEnterpriseActivity(connection, apiKey, day);
        await syncEnterpriseUsageAndCost(connection, apiKey, day);
      }
    }
    await aiProviderConnectionService.recordSyncSuccess(connection.id, {
      ...window.cursor,
      initialBackfillDays: window.backfillDays,
      overlapDays: window.overlapDays,
      lastCompletedDate: dateString(window.end),
    });
  } catch (error) {
    await aiProviderConnectionService.recordSyncError(connection.id, error);
    throw error;
  }
}
