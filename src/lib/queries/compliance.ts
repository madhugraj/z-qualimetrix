import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data as T;
}

export interface ComplianceRow {
  id: string;
  externalId: string | null;
  title: string;
  type: string;
  status: string;
  externalStatusName: string | null;
  productId: string;
  productName: string;
  updatedAt: string;
}

export interface StaleComplianceRow extends ComplianceRow {
  daysStale: number;
}

export interface CategoryCount {
  label: string;
  count: number;
}

export interface ComplianceSignalsResult {
  unloggedWork: ComplianceRow[];
  orphanedIssues: ComplianceRow[];
  staleInProgress: StaleComplianceRow[];
  counts: { unloggedWork: number; orphanedIssues: number; staleInProgress: number };
  denominators: { unloggedWork: number; orphanedIssues: number; staleInProgress: number };
  byProduct: { unloggedWork: CategoryCount[]; orphanedIssues: CategoryCount[]; staleInProgress: CategoryCount[] } | null;
  unloggedWorkTrend: { current: number; previous: number; changePercent: number | null } | null;
  orphanedBreakdown: { createdThisWindow: number; predatesWindow: number } | null;
  staleBreakdown: { justCrossedThreshold: number; longStanding: number } | null;
  hasData: boolean;
}

function buildPath(productId?: string, limit?: number, startDate?: Date, endDate?: Date): string {
  const q = new URLSearchParams();
  if (productId) q.set("productId", productId);
  if (limit) q.set("limit", String(limit));
  if (startDate) q.set("startDate", startDate.toISOString());
  if (endDate) q.set("endDate", endDate.toISOString());
  const qs = q.toString();
  return qs ? `/analytics/compliance?${qs}` : "/analytics/compliance";
}

export function useComplianceSignals(
  productId?: string,
  enabled: boolean = true,
  limit?: number,
  startDate?: Date,
  endDate?: Date
) {
  return useQuery({
    queryKey: ["compliance-signals", productId, limit, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () => fetchApi<ComplianceSignalsResult>(buildPath(productId, limit, startDate, endDate)),
    enabled,
  });
}
