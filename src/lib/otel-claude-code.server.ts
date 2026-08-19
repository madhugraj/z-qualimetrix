/**
 * Pure parsing helpers for Claude Code's OpenTelemetry (OTLP) logs export.
 *
 * Claude Code POSTs standard OTLP JSON (`ExportLogsServiceRequest` shape) directly
 * to whatever URL `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` points at — no OTel Collector
 * required. This module only flattens/maps that JSON; it has no Prisma dependency
 * so it stays unit-testable in isolation.
 *
 * The exact field that discriminates a `claude_code.api_request` log record from
 * other log records (`eventName` vs. an `event.name` attribute) wasn't independently
 * verified against a live payload at build time — `looksLikeApiRequest` below checks
 * both, plus an attribute-shape fallback. Re-check this against a real captured
 * payload during verification and tighten if needed.
 */

type OtelAnyValue = {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
};

type OtelAttribute = { key: string; value?: OtelAnyValue };

type OtelLogRecord = {
  eventName?: string;
  timeUnixNano?: string | number;
  attributes?: OtelAttribute[];
};

type OtelExportLogsServiceRequest = {
  resourceLogs?: {
    resource?: { attributes?: OtelAttribute[] };
    scopeLogs?: { logRecords?: OtelLogRecord[] }[];
  }[];
};

/** Flatten an OTLP attributes array into a plain key/value object. */
export function flattenAttributes(attrs: OtelAttribute[] = []): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const attr of attrs) {
    if (!attr?.key || !attr.value) continue;
    const v = attr.value;
    if (v.stringValue !== undefined) out[attr.key] = v.stringValue;
    else if (v.intValue !== undefined) out[attr.key] = Number(v.intValue);
    else if (v.doubleValue !== undefined) out[attr.key] = v.doubleValue;
    else if (v.boolValue !== undefined) out[attr.key] = v.boolValue;
  }
  return out;
}

function looksLikeApiRequest(record: OtelLogRecord, attrs: Record<string, unknown>): boolean {
  const eventName = record.eventName ?? attrs["event.name"] ?? attrs["event"];
  if (typeof eventName === "string") return eventName.includes("api_request");
  // Fallback: no explicit discriminator present — treat as an api_request if the
  // attribute shape matches (model + at least one token count).
  return typeof attrs.model === "string" && ("input_tokens" in attrs || "output_tokens" in attrs);
}

export interface ExtractedApiRequest {
  attrs: Record<string, string | number | boolean | undefined>;
  timeUnixNano?: string;
}

/** Extract every `claude_code.api_request` log record from a raw OTLP JSON body. */
export function extractApiRequestAttrs(body: unknown): ExtractedApiRequest[] {
  const req = body as OtelExportLogsServiceRequest;
  const out: ExtractedApiRequest[] = [];
  for (const resourceLog of req?.resourceLogs ?? []) {
    const resourceAttrs = flattenAttributes(resourceLog.resource?.attributes);
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of scopeLog.logRecords ?? []) {
        const attrs = { ...resourceAttrs, ...flattenAttributes(record.attributes) };
        if (!looksLikeApiRequest(record, attrs)) continue;
        out.push({
          attrs,
          timeUnixNano: record.timeUnixNano !== undefined ? String(record.timeUnixNano) : undefined,
        });
      }
    }
  }
  return out;
}

export interface RawTelemetryEvent {
  userId: string;
  modelId: string;
  activity: "code";
  tokensIn: number;
  tokensOut: number;
  cachedIn: number;
  latencyMs: number;
  accepted: true;
  reworked: false;
  ts?: string;
}

/**
 * Map flattened `claude_code.api_request` attributes to a raw ingest event.
 * `activity`/`accepted`/`reworked` are v1 approximations, not measured signals —
 * Claude Code's telemetry carries no equivalent of "did the dev keep this suggestion."
 */
export function mapToRawEvent(
  attrs: Record<string, string | number | boolean | undefined>,
  timeUnixNano: string | undefined,
  userId: string,
): RawTelemetryEvent {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
  return {
    userId,
    modelId: String(attrs.model ?? "unknown-model"),
    activity: "code",
    tokensIn: num(attrs.input_tokens) + num(attrs.cache_creation_tokens),
    tokensOut: num(attrs.output_tokens),
    cachedIn: num(attrs.cache_read_tokens),
    latencyMs: 0,
    accepted: true,
    reworked: false,
    ts: timeUnixNano
      ? new Date(Number(BigInt(timeUnixNano) / 1_000_000n)).toISOString()
      : undefined,
  };
}
