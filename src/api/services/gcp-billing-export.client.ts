/**
 * Shared BigQuery client for GCP's standard Billing Export table, used by
 * both vertex-ai-usage-sync.service.ts (Vertex AI/Gemini token usage) and
 * gcp-gpu-cost-sync.service.ts (Compute Engine/Vertex training GPU cost) —
 * same connection, same query mechanism, different SKU filter.
 *
 * GCP has no single REST "usage report" endpoint the way Anthropic/OpenAI
 * do. The standard enterprise pattern is Billing Export to BigQuery: the
 * customer enables it once in the GCP console (Billing -> Billing export),
 * and itemized rows land in a BigQuery table named
 * gcp_billing_export_v1_<BILLING_ACCOUNT_ID> (dashes removed). We cannot
 * enable this on the customer's behalf — the connect flow must say so
 * plainly and ask for the dataset location.
 *
 * The table/column names below (service.description, sku.description,
 * usage.amount, cost, usage_start_time/usage_end_time, project.id, labels)
 * come from Google's published Billing Export schema documentation, not a
 * captured live query result — same honesty caveat openai-usage-sync's own
 * header comment carries for OpenAI's field names. Re-verify against a real
 * connected project's export table during rollout before trusting figures.
 */
import { BigQuery } from "@google-cloud/bigquery";
import type { AiProviderConnection } from "@prisma/client";
import { getDecryptedCredential } from "./provider-connection.service";

export interface GcpBillingExportConfig {
  bigQueryDataset: string; // e.g. "billing_export" — the dataset the export table lives in
  bigQueryTableSuffix: string; // the BILLING_ACCOUNT_ID suffix (dashes removed) on gcp_billing_export_v1_<suffix>
}

export interface BillingExportRow {
  serviceDescription: string;
  skuDescription: string;
  usageAmount: number;
  usageUnit: string;
  cost: number;
  usageStartTime: string;
  usageEndTime: string;
  projectId: string | null;
  region: string | null;
  labels: Array<{ key: string; value: string }>;
}

export async function getBigQueryClient(connection: AiProviderConnection): Promise<BigQuery> {
  const credentialJson = await getDecryptedCredential(connection.id);
  if (!credentialJson) throw new Error("GCP connection has no stored credential.");
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(credentialJson);
  } catch {
    throw new Error("GCP credential is not valid JSON — expected a service-account key.");
  }
  return new BigQuery({ projectId: connection.externalAccountId, credentials: credentials as any });
}

/**
 * Queries the billing export for rows whose service matches `serviceFilter`
 * (a SQL LIKE pattern, e.g. '%Vertex AI%' or '%Compute Engine%'), between
 * `startDate` and `endDate` (inclusive, UTC dates).
 */
export async function queryBillingExport(
  connection: AiProviderConnection,
  serviceFilter: string,
  startDate: Date,
  endDate: Date,
): Promise<BillingExportRow[]> {
  const config = (connection.config as unknown as GcpBillingExportConfig) ?? {};
  if (!config.bigQueryDataset || !config.bigQueryTableSuffix) {
    throw new Error("GCP connection is missing bigQueryDataset/bigQueryTableSuffix config.");
  }
  const bigquery = await getBigQueryClient(connection);
  const table = `\`${connection.externalAccountId}.${config.bigQueryDataset}.gcp_billing_export_v1_${config.bigQueryTableSuffix}\``;

  const query = `
    SELECT
      service.description AS serviceDescription,
      sku.description AS skuDescription,
      SUM(usage.amount) AS usageAmount,
      ANY_VALUE(usage.unit) AS usageUnit,
      SUM(cost) AS cost,
      MIN(usage_start_time) AS usageStartTime,
      MAX(usage_end_time) AS usageEndTime,
      project.id AS projectId,
      ANY_VALUE(location.region) AS region,
      ANY_VALUE(labels) AS labels
    FROM ${table}
    WHERE service.description LIKE @serviceFilter
      AND usage_start_time >= @startDate
      AND usage_start_time < @endDate
    GROUP BY serviceDescription, skuDescription, projectId
  `;

  const [rows] = await bigquery.query({
    query,
    params: { serviceFilter, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
  });
  return rows as BillingExportRow[];
}

const GPU_TYPE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bH100\b/i, label: "H100" },
  { pattern: /\bA100\b.*80\s*GB|A100-80GB/i, label: "A100-80GB" },
  { pattern: /\bA100\b/i, label: "A100" },
  { pattern: /\bL4\b/i, label: "L4" },
  { pattern: /\bT4\b/i, label: "T4" },
  { pattern: /\bV100\b/i, label: "V100" },
  { pattern: /\bP100\b/i, label: "P100" },
  { pattern: /\bTPU\b/i, label: "TPU" },
];

/** Best-effort GPU model extraction from a SKU description string — returns null (not a wrong guess) when no known pattern matches. */
export function parseGpuType(skuDescription: string): string | null {
  for (const { pattern, label } of GPU_TYPE_PATTERNS) {
    if (pattern.test(skuDescription)) return label;
  }
  return null;
}
