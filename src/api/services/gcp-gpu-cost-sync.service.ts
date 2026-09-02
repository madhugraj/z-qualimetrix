/**
 * GCP GPU-compute rental cost — first slice of the external-GPU-spend
 * leadership feature. Same connection and BigQuery plumbing as
 * vertex-ai-usage-sync.service.ts, different SKU filter (Compute Engine
 * GPU-accelerator SKUs and Vertex AI custom-training SKUs, not Vertex AI
 * *inference* SKUs) and writes to GpuComputeUsageEvent, not AiUsageEvent —
 * GPU rental isn't token-shaped data.
 *
 * Squad attribution: GCP billing export rows carry whatever cost-allocation
 * labels the customer applies to their resources (a real, common enterprise
 * practice) — if a row has a "squad" or "team" label, use it; otherwise the
 * row is genuinely unattributed, and stays null rather than guessing.
 * Utilization is not collected here at all (utilizationPct stays null on
 * every row) — that needs live Cloud Monitoring telemetry, deferred to a
 * later phase per the approved plan, not fabricated from cost data.
 */
import { Prisma, type AiProviderConnection } from "@prisma/client";
import prisma from "../../lib/prisma";
import providerConnectionService, {
  recordSyncStart,
  recordSyncSuccess,
  recordSyncError,
} from "./provider-connection.service";
import { queryBillingExport, parseGpuType, type BillingExportRow } from "./gcp-billing-export.client";

const OVERLAP_DAYS = 3;
const INITIAL_BACKFILL_DAYS = 30;
// Compute Engine's GPU SKUs and Vertex AI's custom-training SKUs both carry
// "GPU" in the SKU description (e.g. "Nvidia A100 GPU running in Americas",
// "Vertex AI Custom Training A100 GPU") — filtering by service alone would
// also pull in non-GPU Compute Engine spend (CPU VMs, disks, network).
const GPU_SKU_KEYWORD = "%GPU%";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function resolveSquad(row: BillingExportRow): string | null {
  const label = row.labels.find((l) => ["squad", "team", "department"].includes(l.key.toLowerCase()));
  return label?.value ?? null;
}

async function writeCostRow(connection: AiProviderConnection, row: BillingExportRow): Promise<void> {
  const externalEventId = `gcp_gpu:${row.projectId ?? "unknown"}:${row.skuDescription}:${row.usageStartTime}`;
  const data = {
    tenantId: connection.tenantId,
    connectionId: connection.id,
    provider: "gcp",
    externalAccountId: connection.externalAccountId,
    externalEventId,
    date: new Date(row.usageStartTime),
    instanceType: null,
    gpuType: parseGpuType(row.skuDescription),
    region: row.region,
    squad: resolveSquad(row),
    gpuHours: row.usageUnit?.toLowerCase().includes("hour") ? row.usageAmount : null,
    utilizationPct: null,
    costUsd: row.cost,
    pricingModel: null,
    costSource: "provider_billed",
    metadata: {
      skuDescription: row.skuDescription,
      serviceDescription: row.serviceDescription,
      projectId: row.projectId,
      usageUnit: row.usageUnit,
    } as Prisma.InputJsonValue,
  } satisfies Prisma.GpuComputeUsageEventUncheckedCreateInput;

  await prisma.gpuComputeUsageEvent.upsert({
    where: { connectionId_externalEventId: { connectionId: connection.id, externalEventId } },
    create: data,
    update: data,
  });
}

export async function syncGcpGpuCost(connection: AiProviderConnection): Promise<void> {
  await recordSyncStart(connection.id);
  try {
    const cursor = (connection.syncCursor as Record<string, unknown>) ?? {};
    const end = addDays(new Date(), 0);
    const lastCompleted =
      typeof cursor.lastGpuCostSyncDate === "string" ? new Date(cursor.lastGpuCostSyncDate) : null;
    const start = lastCompleted ? addDays(lastCompleted, -OVERLAP_DAYS) : addDays(end, -INITIAL_BACKFILL_DAYS);

    const rows = await queryBillingExport(connection, GPU_SKU_KEYWORD, start, end);
    for (const row of rows) {
      await writeCostRow(connection, row);
    }

    await recordSyncSuccess(connection.id, {
      ...cursor,
      lastGpuCostSyncDate: end.toISOString().slice(0, 10),
    });
  } catch (error) {
    await recordSyncError(connection.id, error);
    throw error;
  }
}

export async function syncAllGcpGpuCost(): Promise<void> {
  const connections = await providerConnectionService.listDueForSync("gcp");
  await Promise.allSettled(connections.map((c) => syncGcpGpuCost(c)));
}
