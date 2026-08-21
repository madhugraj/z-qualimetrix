import crypto from "crypto";
import { Prisma, type AiProviderConnection } from "@prisma/client";
import prisma from "../../lib/prisma";
import {
  extractClaudeCodeLogRecords,
  extractClaudeCodeMetricPoints,
  type ExtractedClaudeCodeLogRecord,
  type ExtractedClaudeCodeMetricPoint,
} from "../../lib/otel-claude-code.server";
import { ensureModelCatalogEntry } from "../../lib/ai-usage.server";

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampFromNanos(value?: string): Date {
  if (!value || !/^\d+$/.test(value)) return new Date();
  return new Date(Number(BigInt(value) / 1_000_000n));
}

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  );
}

function stableId(parts: Array<string | undefined>): string {
  return crypto.createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex");
}

function attrString(attrs: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function assertConnectionAttributes(
  connection: AiProviderConnection,
  attrs: Record<string, unknown>,
) {
  const tenant = attrString(attrs, "qualimetrix.tenant_id");
  const connectionId = attrString(attrs, "qualimetrix.connection_id");
  const organizationId = attrString(attrs, "organization.id");
  if (!tenant || tenant !== connection.tenantId)
    throw new Error(
      "OTel tenant resource attribute is missing or does not match the authenticated connection.",
    );
  if (!connectionId || connectionId !== connection.id)
    throw new Error(
      "OTel connection resource attribute is missing or does not match the request route.",
    );
  if (connection.acquisitionChannel === "anthropic_direct" && !organizationId) {
    throw new Error("Direct Anthropic telemetry is missing organization.id.");
  }
  if (
    organizationId &&
    ["anthropic_direct", "anthropic_console"].includes(connection.acquisitionChannel) &&
    organizationId !== connection.externalAccountId
  ) {
    throw new Error("OTel organization.id does not match the connected Anthropic organization.");
  }
}

async function resolveIdentity(connection: AiProviderConnection, attrs: Record<string, unknown>) {
  const email = attrString(attrs, "user.email")?.toLowerCase() ?? null;
  const externalUserId = attrString(
    attrs,
    "user.account_uuid",
    "user.account_id",
    "user.email",
    "user.id",
  );
  if (!externalUserId) return null;

  const matchedUser = email
    ? await prisma.user.findFirst({
        where: { tenantId: connection.tenantId, email: { equals: email, mode: "insensitive" } },
      })
    : null;
  return prisma.aiProviderIdentity.upsert({
    where: { connectionId_externalUserId: { connectionId: connection.id, externalUserId } },
    create: {
      tenantId: connection.tenantId,
      connectionId: connection.id,
      externalUserId,
      email,
      displayName: attrString(attrs, "user.name"),
      userId: matchedUser?.id ?? null,
      metadata: { identitySource: email ? "otel_user_email" : "otel_user_id" },
    },
    update: {
      email,
      displayName: attrString(attrs, "user.name") ?? undefined,
      userId: matchedUser?.id ?? undefined,
      lastSeenAt: new Date(),
    },
  });
}

function eventNameMatches(eventName: string, target: string): boolean {
  return eventName === target || eventName.endsWith(`.${target}`) || eventName.includes(target);
}

async function ingestLogRecord(
  connection: AiProviderConnection,
  record: ExtractedClaudeCodeLogRecord,
) {
  assertConnectionAttributes(connection, record.attrs);
  const occurredAt = timestampFromNanos(record.timeUnixNano);
  const identity = await resolveIdentity(connection, record.attrs);
  const sessionId = attrString(record.attrs, "session.id");
  const providerRequestId = attrString(
    record.attrs,
    "request_id",
    "gen_ai.response.id",
    "client_request_id",
  );
  const externalEventId = providerRequestId
    ? `${record.eventName}:${providerRequestId}`
    : stableId([
        record.eventName,
        record.timeUnixNano,
        sessionId ?? undefined,
        stableJson(record.attrs),
      ]);

  const existingRaw = await prisma.aiProviderRawEvent.findUnique({
    where: {
      connectionId_source_externalEventId: {
        connectionId: connection.id,
        source: "otel_log",
        externalEventId,
      },
    },
    select: { id: true },
  });
  const dayStart = new Date(
    Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate()),
  );
  const sessionPreviouslySeen =
    !existingRaw && sessionId && identity
      ? await prisma.aiProviderRawEvent.findFirst({
          where: {
            connectionId: connection.id,
            identityId: identity.id,
            sessionId,
            occurredAt: { gte: dayStart },
          },
          select: { id: true },
        })
      : null;
  await prisma.aiProviderRawEvent.upsert({
    where: {
      connectionId_source_externalEventId: {
        connectionId: connection.id,
        source: "otel_log",
        externalEventId,
      },
    },
    create: {
      tenantId: connection.tenantId,
      connectionId: connection.id,
      identityId: identity?.id ?? null,
      source: "otel_log",
      externalEventId,
      occurredAt,
      sessionId,
      payload: { eventName: record.eventName, attributes: record.attrs },
      processedAt: new Date(),
    },
    update: {
      identityId: identity?.id ?? null,
      occurredAt,
      sessionId,
      payload: { eventName: record.eventName, attributes: record.attrs },
      processedAt: new Date(),
      processingError: null,
    },
  });

  if (eventNameMatches(record.eventName, "api_request")) {
    const modelId = attrString(record.attrs, "model") ?? "unknown-model";
    await ensureModelCatalogEntry(modelId, { vendor: "Anthropic" });
    const usage = {
      timestamp: occurredAt,
      sprint: null,
      userId: identity?.userId ?? null,
      modelId,
      activity: null,
      tokensIn:
        numberValue(record.attrs.input_tokens) + numberValue(record.attrs.cache_creation_tokens),
      tokensOut: numberValue(record.attrs.output_tokens),
      cachedIn: numberValue(record.attrs.cache_read_tokens),
      latencyMs:
        record.attrs.duration_ms === undefined
          ? null
          : Math.round(numberValue(record.attrs.duration_ms)),
      accepted: null,
      reworked: null,
      tenantId: connection.tenantId,
      provider: "claude_code",
      providerConnectionId: connection.id,
      providerIdentityId: identity?.id ?? null,
      source: "otel_log",
      externalEventId,
      sessionId,
      requestCount: 1,
      estimatedCostUsd:
        record.attrs.cost_usd === undefined ? null : numberValue(record.attrs.cost_usd),
      costSource: record.attrs.cost_usd === undefined ? null : "otel_estimated",
      metadata: { eventName: record.eventName, success: record.attrs.success ?? null },
    } satisfies Prisma.AiUsageEventUncheckedCreateInput;
    const existingUsage = await prisma.aiUsageEvent.findFirst({
      where: { providerConnectionId: connection.id, source: "otel_log", externalEventId },
      select: { id: true },
    });
    if (existingUsage)
      await prisma.aiUsageEvent.update({ where: { id: existingUsage.id }, data: usage });
    else await prisma.aiUsageEvent.create({ data: usage });
  }

  if (!existingRaw && identity) {
    const date = dayStart;
    const isRequest = eventNameMatches(record.eventName, "api_request");
    const isDecision = eventNameMatches(record.eventName, "tool_decision");
    const decision = attrString(record.attrs, "decision");
    await prisma.aiProviderDailyActivity.upsert({
      where: {
        connectionId_identityId_date_product_source: {
          connectionId: connection.id,
          identityId: identity.id,
          date,
          product: "claude_code",
          source: "otel_log",
        },
      },
      create: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        identityId: identity.id,
        date,
        product: "claude_code",
        source: "otel_log",
        requestCount: isRequest ? 1 : 0,
        sessionCount: sessionId && !sessionPreviouslySeen ? 1 : 0,
        suggestionsAccepted: isDecision && decision === "accept" ? 1 : 0,
        suggestionsRejected: isDecision && decision === "reject" ? 1 : 0,
      },
      update: {
        requestCount: { increment: isRequest ? 1 : 0 },
        sessionCount: { increment: sessionId && !sessionPreviouslySeen ? 1 : 0 },
        suggestionsAccepted: { increment: isDecision && decision === "accept" ? 1 : 0 },
        suggestionsRejected: { increment: isDecision && decision === "reject" ? 1 : 0 },
      },
    });
  }
}

async function ingestMetricPoint(
  connection: AiProviderConnection,
  point: ExtractedClaudeCodeMetricPoint,
) {
  assertConnectionAttributes(connection, point.attrs);
  const occurredAt = timestampFromNanos(point.timeUnixNano);
  const identity = await resolveIdentity(connection, point.attrs);
  const externalEventId = stableId([
    point.metricName,
    point.timeUnixNano,
    point.startTimeUnixNano,
    stableJson(point.attrs),
    String(point.value),
  ]);
  await prisma.aiProviderRawEvent.upsert({
    where: {
      connectionId_source_externalEventId: {
        connectionId: connection.id,
        source: "otel_metric",
        externalEventId,
      },
    },
    create: {
      tenantId: connection.tenantId,
      connectionId: connection.id,
      identityId: identity?.id ?? null,
      source: "otel_metric",
      externalEventId,
      occurredAt,
      sessionId: attrString(point.attrs, "session.id"),
      payload: point as unknown as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
    update: {
      identityId: identity?.id ?? null,
      payload: point as unknown as Prisma.InputJsonValue,
      processedAt: new Date(),
      processingError: null,
    },
  });
}

export async function ingestAnthropicOtelLogs(connection: AiProviderConnection, body: unknown) {
  const records = extractClaudeCodeLogRecords(body);
  for (const record of records) await ingestLogRecord(connection, record);
  if (records.length > 0) {
    await prisma.aiProviderConnection.update({
      where: { id: connection.id },
      data: { lastTelemetryAt: new Date(), status: "connected", lastSyncError: null },
    });
  }
  return { accepted: records.length };
}

export async function ingestAnthropicOtelMetrics(connection: AiProviderConnection, body: unknown) {
  const points = extractClaudeCodeMetricPoints(body);
  for (const point of points) await ingestMetricPoint(connection, point);
  if (points.length > 0) {
    await prisma.aiProviderConnection.update({
      where: { id: connection.id },
      data: { lastTelemetryAt: new Date(), status: "connected", lastSyncError: null },
    });
  }
  return { accepted: points.length };
}
