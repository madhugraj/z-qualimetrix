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

export interface WorkItemSummary {
  id: string;
  externalId: string | null;
  title: string;
  type: string;
  status: "open" | "in_progress" | "resolved" | "completed";
  externalStatusName: string | null;
  priority: "critical" | "high" | "medium" | "low" | null;
  labels: string[];
  productId: string;
  externalMetadata: { assigneeName?: string; assigneeEmail?: string; jiraKey?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface BugListParams {
  productId?: string;
  labels?: string[];
  status?: string[];
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface BugListResponse {
  workItems: WorkItemSummary[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

function buildBugsListPath(params: BugListParams): string {
  const q = new URLSearchParams({ type: "bug" });
  if (params.productId) q.set("productId", params.productId);
  if (params.labels?.length) q.set("labels", params.labels.join(","));
  if (params.status?.length) q.set("status", params.status.join(","));
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return `/work-items?${q.toString()}`;
}

export function useBugsList(params: BugListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["bugs-list", params],
    queryFn: () => fetchApi<BugListResponse>(buildBugsListPath(params)),
    enabled: options?.enabled ?? true,
  });
}

export interface WorkItemDetail extends WorkItemSummary {
  description: string | null;
  descriptionText: string;
  reopenCount: number;
  statusChangedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastSeenAtSourceAt: string | null;
  jiraSiteUrl: string | null;
}

export function useBugDetail(bugId: string | undefined) {
  return useQuery({
    queryKey: ["bug-detail", bugId],
    queryFn: () => fetchApi<WorkItemDetail>(`/work-items/${bugId}`),
    enabled: !!bugId,
    retry: false,
  });
}
