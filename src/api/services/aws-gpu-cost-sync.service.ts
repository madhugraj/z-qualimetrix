/**
 * AWS GPU-compute rental cost — second provider for the GPU-spend feature,
 * same shape as gcp-gpu-cost-sync.service.ts (writes GpuComputeUsageEvent
 * via provider-connection.service.ts), different mechanism: AWS Cost
 * Explorer's GetCostAndUsage is a direct, callable REST API (via the
 * official @aws-sdk/client-cost-explorer), not a pre-provisioned export the
 * customer has to set up first the way GCP's Billing Export is — simpler
 * connect flow for this one.
 *
 * GPU instances aren't a first-class Cost Explorer dimension — there's no
 * "give me GPU cost" filter. EC2's USAGE_TYPE dimension embeds the instance
 * type after a colon (e.g. "BoxUsage:p4d.24xlarge", "SpotUsage:g5.2xlarge"),
 * so GPU rows are identified by matching that suffix against known
 * Nvidia-GPU EC2 instance families (p2/p3/p4/p5, g3/g4/g5/g6) client-side,
 * same "match known families or leave gpuType null" honesty posture GCP's
 * SKU-description parsing uses. This family list and the GetCostAndUsage
 * request/response shape were checked directly against the installed SDK's
 * own type definitions (not just recalled), but the actual GPU-per-family
 * mapping (e.g. p4d -> A100) is standard/well-known, not independently
 * re-verified against a live AWS response — re-check during rollout before
 * trusting per-GPU-type figures, same caveat as every other vendor sync.
 */
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { Prisma, type AiProviderConnection } from "@prisma/client";
import prisma from "../../lib/prisma";
import providerConnectionService, {
  getDecryptedCredential,
  recordSyncStart,
  recordSyncSuccess,
  recordSyncError,
} from "./provider-connection.service";

const OVERLAP_DAYS = 3; // Cost Explorer data can be revised for a few days after the fact
const INITIAL_BACKFILL_DAYS = 30;
const EC2_COMPUTE_SERVICE = "Amazon Elastic Compute Cloud - Compute";

interface AwsCredential {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

// EC2 instance-family prefix -> the Nvidia GPU it provisions. Covers the
// well-known current/recent GPU families; an unrecognized family (a brand
// new instance type, or a non-GPU EC2 usage type that slipped through the
// filter) keeps gpuType null rather than a wrong guess.
const AWS_GPU_FAMILY: Record<string, string> = {
  p5: "H100",
  p4d: "A100-80GB",
  p4de: "A100-80GB",
  p3: "V100",
  p3dn: "V100",
  p2: "K80",
  g6: "L4",
  g5: "A10G",
  g4dn: "T4",
  g4ad: "Radeon Pro V520",
  g3: "M60",
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function parseInstanceType(usageType: string): string | null {
  // "BoxUsage:p4d.24xlarge" / "USW2-SpotUsage:g5.2xlarge" -> "p4d.24xlarge"
  const match = usageType.match(/(?:BoxUsage|SpotUsage|HostBoxUsage|DedicatedUsage):([a-z0-9.]+)/i);
  return match ? match[1] : null;
}

function gpuTypeForInstance(instanceType: string | null): string | null {
  if (!instanceType) return null;
  const family = instanceType.split(".")[0]?.toLowerCase();
  return AWS_GPU_FAMILY[family] ?? null;
}

async function getClient(connection: AiProviderConnection): Promise<CostExplorerClient> {
  const raw = await getDecryptedCredential(connection.id);
  if (!raw) throw new Error("AWS connection has no stored credential.");
  const credential: AwsCredential = JSON.parse(raw);
  // Cost Explorer is a global service reachable only via us-east-1, regardless of which region the GPU spend itself occurred in.
  return new CostExplorerClient({
    region: "us-east-1",
    credentials: { accessKeyId: credential.accessKeyId, secretAccessKey: credential.secretAccessKey },
  });
}

async function writeCostRow(
  connection: AiProviderConnection,
  date: string,
  usageType: string,
  region: string,
  costUsd: number,
  usageQuantity: number,
): Promise<void> {
  const instanceType = parseInstanceType(usageType);
  const externalEventId = `aws_gpu:${region}:${usageType}:${date}`;
  const data = {
    tenantId: connection.tenantId,
    connectionId: connection.id,
    provider: "aws",
    externalAccountId: connection.externalAccountId,
    externalEventId,
    date: new Date(`${date}T00:00:00.000Z`),
    instanceType,
    gpuType: gpuTypeForInstance(instanceType),
    region,
    squad: null, // AWS cost-allocation tags would carry this — not read here yet, same "unmapped, not guessed" posture as GCP
    gpuHours: usageType.toLowerCase().includes("hrs") || usageType.toLowerCase().includes("box") ? usageQuantity : null,
    utilizationPct: null,
    costUsd,
    pricingModel: usageType.toLowerCase().includes("spot") ? "spot" : "on_demand",
    costSource: "provider_billed",
    metadata: { usageType } as Prisma.InputJsonValue,
  } satisfies Prisma.GpuComputeUsageEventUncheckedCreateInput;

  await prisma.gpuComputeUsageEvent.upsert({
    where: { connectionId_externalEventId: { connectionId: connection.id, externalEventId } },
    create: data,
    update: data,
  });
}

export async function syncAwsGpuCost(connection: AiProviderConnection): Promise<void> {
  await recordSyncStart(connection.id);
  try {
    const client = await getClient(connection);
    const cursor = (connection.syncCursor as Record<string, unknown>) ?? {};
    const end = new Date();
    const lastCompleted = typeof cursor.lastAwsGpuCostSyncDate === "string" ? new Date(cursor.lastAwsGpuCostSyncDate) : null;
    const start = lastCompleted ? addDays(lastCompleted, -OVERLAP_DAYS) : addDays(end, -INITIAL_BACKFILL_DAYS);

    const command = new GetCostAndUsageCommand({
      TimePeriod: { Start: start.toISOString().slice(0, 10), End: end.toISOString().slice(0, 10) },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost", "UsageQuantity"],
      Filter: { Dimensions: { Key: "SERVICE", Values: [EC2_COMPUTE_SERVICE] } },
      GroupBy: [
        { Type: "DIMENSION", Key: "USAGE_TYPE" },
        { Type: "DIMENSION", Key: "REGION" },
      ],
    });
    const response = await client.send(command);

    for (const result of response.ResultsByTime ?? []) {
      const date = result.TimePeriod?.Start;
      if (!date) continue;
      for (const group of result.Groups ?? []) {
        const [usageType, region] = group.Keys ?? [];
        if (!usageType || !parseInstanceType(usageType)) continue; // skip non-GPU-instance EC2 usage types (EBS, data transfer, etc. share this service)
        const cost = Number(group.Metrics?.UnblendedCost?.Amount ?? 0);
        const quantity = Number(group.Metrics?.UsageQuantity?.Amount ?? 0);
        if (cost <= 0) continue;
        await writeCostRow(connection, date, usageType, region ?? "unknown", cost, quantity);
      }
    }

    await recordSyncSuccess(connection.id, { ...cursor, lastAwsGpuCostSyncDate: end.toISOString().slice(0, 10) });
  } catch (error) {
    await recordSyncError(connection.id, error);
    throw error;
  }
}

export async function syncAllAwsGpuCost(): Promise<void> {
  const connections = await providerConnectionService.listDueForSync("aws");
  await Promise.allSettled(connections.map((c) => syncAwsGpuCost(c)));
}
