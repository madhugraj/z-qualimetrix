import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { WorkItemSummary } from "@/lib/queries/bugs";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data as T;
}

export interface BacklogListParams {
  productId?: string;
  type?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface BacklogListResponse {
  workItems: WorkItemSummary[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

function buildBacklogPath(params: BacklogListParams): string {
  const q = new URLSearchParams({ status: "open,in_progress" });
  if (params.productId) q.set("productId", params.productId);
  if (params.type) q.set("type", params.type);
  if (params.priority) q.set("priority", params.priority);
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  q.set("sortBy", params.sortBy ?? "createdAt");
  q.set("sortOrder", params.sortOrder ?? "asc");
  return `/work-items?${q.toString()}`;
}

export function useBacklogList(params: BacklogListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["backlog-list", params],
    queryFn: () => fetchApi<BacklogListResponse>(buildBacklogPath(params)),
    enabled: options?.enabled ?? true,
  });
}

export interface BacklogSummary {
  total: number;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  oldestCreatedAt: string | null;
  hasData: boolean;
}

export function useBacklogSummary(productId?: string, enabled: boolean = true, type?: string) {
  const q = new URLSearchParams();
  if (productId) q.set("productId", productId);
  if (type) q.set("type", type);
  const qs = q.toString();
  return useQuery({
    queryKey: ["backlog-summary", productId, type],
    queryFn: () => fetchApi<BacklogSummary>(`/analytics/backlog-summary${qs ? `?${qs}` : ""}`),
    enabled,
  });
}

export interface AgeDistributionBucket {
  label: string;
  count: number;
}

export interface AgeDistributionResult {
  buckets: AgeDistributionBucket[];
  hasData: boolean;
}

export function useAgeDistribution(productId?: string, enabled: boolean = true, type?: string) {
  const q = new URLSearchParams();
  if (productId) q.set("productId", productId);
  if (type) q.set("type", type);
  const qs = q.toString();
  return useQuery({
    queryKey: ["age-distribution", productId, type],
    queryFn: () => fetchApi<AgeDistributionResult>(`/analytics/age-distribution${qs ? `?${qs}` : ""}`),
    enabled,
  });
}

export interface BacklogFlowPoint {
  period: string;
  created: number;
  completed: number;
  netChange: number;
}

export function useBacklogFlow(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date) {
  const q = new URLSearchParams();
  if (productId) q.set("productId", productId);
  if (startDate) q.set("startDate", startDate.toISOString());
  if (endDate) q.set("endDate", endDate.toISOString());
  const qs = q.toString();
  return useQuery({
    queryKey: ["backlog-flow", productId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () => fetchApi<BacklogFlowPoint[]>(`/analytics/backlog-flow${qs ? `?${qs}` : ""}`),
    enabled,
  });
}
