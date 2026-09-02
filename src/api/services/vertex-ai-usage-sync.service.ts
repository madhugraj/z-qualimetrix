/**
 * GCP Vertex AI / Gemini usage sync — third real AI-usage vendor, alongside
 * Anthropic (anthropic-usage-sync.service.ts) and OpenAI
 * (openai-usage-sync.service.ts). Unlike those two, GCP has no single REST
 * usage-report endpoint; this reads Billing Export to BigQuery instead — see
 * gcp-billing-export.client.ts for the full explanation and the honesty
 * caveat on field names.
 *
 * Token counts are not present in the billing export (it's a cost ledger,
 * not a request log) — `usage.amount` for Vertex AI SKUs is billed token
 * count for the matching SKU (e.g. "Gemini 1.5 Pro Input" has its own SKU
 * row), so tokensIn/tokensOut are derived by SKU description keyword match,
 * not read directly off a single field. This is a real limitation: a new
 * Gemini SKU whose description doesn't match "Input"/"Output" lands with
 * both at 0 and the row's cost preserved — same "preserve cost even when a
 * dimension can't be attributed" posture anthropic-usage-sync.service.ts
 * already uses for cost-only rows.
 */
import { Prisma, type AiProviderConnection } from "@prisma/client";
import prisma from "../../lib/prisma";
import { ensureModelCatalogEntry } from "../../lib/ai-usage.server";
import integrationService from "./integration.service";
import providerConnectionService, {
  recordSyncStart,
  recordSyncSuccess,
  recordSyncError,
} from "./provider-connection.service";
import { queryBillingExport, type BillingExportRow } from "./gcp-billing-export.client";

const OVERLAP_DAYS = 3; // GCP billing export rows can arrive/settle a few days late
const INITIAL_BACKFILL_DAYS = 30;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function modelIdFromSku(skuDescription: string): string {
  // "Gemini 1.5 Pro Input" / "Gemini 1.5 Pro Output" -> "gemini-1.5-pro"
  return skuDescription
    .replace(/\b(input|output|text|cached|batch)\b/gi, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown-gemini-model";
}

function isOutputRow(skuDescription: string): boolean {
  return /\boutput\b/i.test(skuDescription);
}

async function writeUsageRow(connection: AiProviderConnection, row: BillingExportRow): Promise<void> {
  const modelId = modelIdFromSku(row.skuDescription);
  await ensureModelCatalogEntry(modelId, {
    vendor: "Google",
    // Rough Gemini 1.5 Pro-tier placeholder, same spirit as OpenAI's own
    // OPENAI_CATALOG_HINT default — real pricing varies by exact model, this
    // just stops an unrecognized Gemini SKU from silently inheriting
    // Claude's $3/$15 rate via ensureModelCatalogEntry's generic fallback.
    priceIn: 1.25,
    priceOut: 5,
    purpose: "Auto-detected from GCP Billing Export — verify pricing before trusting cost figures.",
  });

  const userId = await integrationService.getOrCreateSystemUser(connection.tenantId);
  const externalEventId = `gcp_billing:${row.projectId ?? "unknown"}:${row.skuDescription}:${row.usageStartTime}`;

  const tokens = Math.max(0, Math.round(row.usageAmount));
  const data = {
    tenantId: connection.tenantId,
    timestamp: new Date(row.usageStartTime),
    userId,
    modelId,
    tokensIn: isOutputRow(row.skuDescription) ? 0 : tokens,
    tokensOut: isOutputRow(row.skuDescription) ? tokens : 0,
    cachedIn: 0,
    provider: "gcp_vertex",
    providerConnectionId: connection.id,
    source: "gcp_billing_export",
    externalEventId,
    requestCount: 0,
    providerCostUsd: row.cost,
    costSource: "provider_billed",
    metadata: { skuDescription: row.skuDescription, projectId: row.projectId, region: row.region } as Prisma.InputJsonValue,
  } satisfies Prisma.AiUsageEventUncheckedCreateInput;

  const existing = await prisma.aiUsageEvent.findFirst({
    where: { providerConnectionId: connection.id, source: "gcp_billing_export", externalEventId },
    select: { id: true },
  });
  if (existing) await prisma.aiUsageEvent.update({ where: { id: existing.id }, data });
  else await prisma.aiUsageEvent.create({ data });
}

export async function syncVertexAiConnection(connection: AiProviderConnection): Promise<void> {
  await recordSyncStart(connection.id);
  try {
    const cursor = (connection.syncCursor as Record<string, unknown>) ?? {};
    const end = addDays(new Date(), 0);
    const lastCompleted =
      typeof cursor.lastCompletedDate === "string" ? new Date(cursor.lastCompletedDate) : null;
    const start = lastCompleted ? addDays(lastCompleted, -OVERLAP_DAYS) : addDays(end, -INITIAL_BACKFILL_DAYS);

    const rows = await queryBillingExport(connection, "%Vertex AI%", start, end);
    for (const row of rows) {
      await writeUsageRow(connection, row);
    }

    await recordSyncSuccess(connection.id, {
      ...cursor,
      lastCompletedDate: end.toISOString().slice(0, 10),
    });
  } catch (error) {
    await recordSyncError(connection.id, error);
    throw error;
  }
}

export async function syncAllVertexAiConnections(): Promise<void> {
  const connections = await providerConnectionService.listDueForSync("gcp");
  await Promise.allSettled(connections.map((c) => syncVertexAiConnection(c)));
}
