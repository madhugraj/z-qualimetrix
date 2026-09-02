/**
 * Azure GPU-compute rental cost — third provider for the GPU-spend feature.
 * Like AWS, Azure Cost Management's Query API is directly callable (no
 * pre-provisioned export needed for a first cut, unlike GCP's Billing
 * Export) — via the official @azure/arm-costmanagement + @azure/identity
 * SDKs. Request/response shapes below (QueryDefinition, QueryResult's
 * columns/rows array-of-arrays layout) were checked against the installed
 * SDK's own type definitions, not just recalled — but column *ordering* in
 * the response isn't documented as fixed, so column index is resolved by
 * name at runtime rather than assumed by position.
 *
 * GPU VMs aren't a first-class Cost Management dimension either. Azure's
 * GPU VM series (NC/ND/NV, e.g. "NC24ads A100 v4", "ND96asr A100 v4") show
 * up in the MeterSubCategory dimension — matched against known series
 * prefixes, same "match known families or leave gpuType null" posture as
 * the AWS/GCP syncs. Re-verify the family->GPU mapping against a live
 * response during rollout, same caveat as every other vendor sync here.
 */
import { ClientSecretCredential } from "@azure/identity";
import { CostManagementClient } from "@azure/arm-costmanagement";
import { Prisma, type AiProviderConnection } from "@prisma/client";
import prisma from "../../lib/prisma";
import providerConnectionService, {
  getDecryptedCredential,
  recordSyncStart,
  recordSyncSuccess,
  recordSyncError,
} from "./provider-connection.service";

const OVERLAP_DAYS = 3;
const INITIAL_BACKFILL_DAYS = 30;

interface AzureCredential {
  tenantId: string; // Azure AD tenant id (service principal), distinct from our own tenantId
  clientId: string;
  clientSecret: string;
}

// Azure GPU VM series prefix (from MeterSubCategory, e.g. "NC24ads A100 v4
// Series") -> the Nvidia GPU it provisions. Same "unrecognized stays null"
// posture as AWS_GPU_FAMILY in aws-gpu-cost-sync.service.ts.
const AZURE_GPU_SERIES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bH100\b/i, label: "H100" },
  { pattern: /\bA100\b/i, label: "A100-80GB" },
  { pattern: /\bV100\b/i, label: "V100" },
  { pattern: /\bT4\b/i, label: "T4" },
  { pattern: /\bA10\b/i, label: "A10" },
  { pattern: /\bNC\w*\s*K80|K80/i, label: "K80" },
  { pattern: /\bM60\b/i, label: "M60" },
];

function gpuTypeFromMeterSubCategory(meterSubCategory: string): string | null {
  if (!/^N[CDV]/i.test(meterSubCategory) && !/GPU/i.test(meterSubCategory)) return null;
  for (const { pattern, label } of AZURE_GPU_SERIES) {
    if (pattern.test(meterSubCategory)) return label;
  }
  return null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

async function getClient(connection: AiProviderConnection): Promise<CostManagementClient> {
  const raw = await getDecryptedCredential(connection.id);
  if (!raw) throw new Error("Azure connection has no stored credential.");
  const credential: AzureCredential = JSON.parse(raw);
  const tokenCredential = new ClientSecretCredential(credential.tenantId, credential.clientId, credential.clientSecret);
  return new CostManagementClient(tokenCredential);
}

async function writeCostRow(
  connection: AiProviderConnection,
  date: string,
  meterSubCategory: string,
  region: string,
  costUsd: number,
): Promise<void> {
  const externalEventId = `azure_gpu:${region}:${meterSubCategory}:${date}`;
  const data = {
    tenantId: connection.tenantId,
    connectionId: connection.id,
    provider: "azure",
    externalAccountId: connection.externalAccountId,
    externalEventId,
    date: new Date(`${date}T00:00:00.000Z`),
    instanceType: meterSubCategory,
    gpuType: gpuTypeFromMeterSubCategory(meterSubCategory),
    region,
    squad: null, // Azure resource tags would carry this — not read here yet
    gpuHours: null, // Cost Management's UsageQuantity unit varies by meter and isn't reliably hours without per-meter unit lookup — left unset rather than guessed
    utilizationPct: null,
    costUsd,
    pricingModel: null,
    costSource: "provider_billed",
    metadata: { meterSubCategory } as Prisma.InputJsonValue,
  } satisfies Prisma.GpuComputeUsageEventUncheckedCreateInput;

  await prisma.gpuComputeUsageEvent.upsert({
    where: { connectionId_externalEventId: { connectionId: connection.id, externalEventId } },
    create: data,
    update: data,
  });
}

export async function syncAzureGpuCost(connection: AiProviderConnection): Promise<void> {
  await recordSyncStart(connection.id);
  try {
    const client = await getClient(connection);
    const cursor = (connection.syncCursor as Record<string, unknown>) ?? {};
    const end = new Date();
    const lastCompleted = typeof cursor.lastAzureGpuCostSyncDate === "string" ? new Date(cursor.lastAzureGpuCostSyncDate) : null;
    const start = lastCompleted ? addDays(lastCompleted, -OVERLAP_DAYS) : addDays(end, -INITIAL_BACKFILL_DAYS);

    const result = await client.query.usage(`/subscriptions/${connection.externalAccountId}`, {
      type: "ActualCost",
      timeframe: "Custom",
      timePeriod: { from: start, to: end },
      dataset: {
        granularity: "Daily",
        aggregation: { totalCost: { name: "Cost", function: "Sum" } },
        grouping: [
          { type: "Dimension", name: "MeterSubCategory" },
          { type: "Dimension", name: "ResourceLocation" },
        ],
      },
    });

    const columns = result?.columns ?? [];
    const rows = result?.rows ?? [];
    const idx = (name: string) => columns.findIndex((c) => c.name === name);
    const costIdx = idx("Cost");
    const dateIdx = idx("UsageDate");
    const meterIdx = idx("MeterSubCategory");
    const regionIdx = idx("ResourceLocation");

    for (const row of rows) {
      const meterSubCategory = meterIdx >= 0 ? String(row[meterIdx]) : "";
      if (!gpuTypeFromMeterSubCategory(meterSubCategory)) continue; // skip non-GPU rows sharing the same query
      const cost = costIdx >= 0 ? Number(row[costIdx]) : 0;
      if (cost <= 0) continue;
      const rawDate = dateIdx >= 0 ? String(row[dateIdx]) : "";
      // Azure's UsageDate column is typically an 8-digit integer (YYYYMMDD), not ISO — normalize either shape.
      const date = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
      const region = regionIdx >= 0 ? String(row[regionIdx]) : "unknown";
      await writeCostRow(connection, date, meterSubCategory, region, cost);
    }

    await recordSyncSuccess(connection.id, { ...cursor, lastAzureGpuCostSyncDate: end.toISOString().slice(0, 10) });
  } catch (error) {
    await recordSyncError(connection.id, error);
    throw error;
  }
}

export async function syncAllAzureGpuCost(): Promise<void> {
  const connections = await providerConnectionService.listDueForSync("azure");
  await Promise.allSettled(connections.map((c) => syncAzureGpuCost(c)));
}
