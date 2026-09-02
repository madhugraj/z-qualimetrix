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

export interface GpuSpendConnection {
  id: string;
  provider: string;
  status: string;
  lastSyncedAt: string | null;
  externalAccountId: string;
}

export interface GpuSpendSummary {
  totalCostUsd: number;
  totalGpuHours: number | null;
  connections: GpuSpendConnection[];
  hasData: boolean;
}

export function useGpuSpendSummary(enabled: boolean = true) {
  return useQuery({
    queryKey: ["gpu-spend-summary"],
    queryFn: () => fetchApi<GpuSpendSummary>("/gpu-spend/summary"),
    enabled,
  });
}

export interface GpuSpendTrendPoint {
  period: string;
  costUsd: number;
}

export function useGpuSpendTrend(enabled: boolean = true, startDate?: Date, endDate?: Date) {
  const q = new URLSearchParams();
  if (startDate) q.set("startDate", startDate.toISOString());
  if (endDate) q.set("endDate", endDate.toISOString());
  const qs = q.toString();
  return useQuery({
    queryKey: ["gpu-spend-trend", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () => fetchApi<{ trend: GpuSpendTrendPoint[]; hasData: boolean }>(`/gpu-spend/trend${qs ? `?${qs}` : ""}`),
    enabled,
  });
}

export function useGpuSpendBySquad(enabled: boolean = true) {
  return useQuery({
    queryKey: ["gpu-spend-by-squad"],
    queryFn: () => fetchApi<{ breakdown: Array<{ squad: string; costUsd: number }>; hasData: boolean }>("/gpu-spend/by-squad"),
    enabled,
  });
}

export function useGpuSpendByType(enabled: boolean = true) {
  return useQuery({
    queryKey: ["gpu-spend-by-type"],
    queryFn: () => fetchApi<{ breakdown: Array<{ gpuType: string; costUsd: number }>; hasData: boolean }>("/gpu-spend/by-type"),
    enabled,
  });
}
