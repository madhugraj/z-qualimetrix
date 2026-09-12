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

export interface ConfluencePageRow {
  id: string;
  externalId: string;
  title: string;
  webUrl: string | null;
  updatedAt: string;
  lastSeenAtSourceAt: string | null;
  space: { key: string; name: string };
}

export function useConfluencePages(enabled: boolean = true) {
  return useQuery({
    queryKey: ["confluence-pages"],
    queryFn: () => fetchApi<ConfluencePageRow[]>("/integrations/confluence/pages"),
    enabled,
  });
}

export interface ConfluenceSearchResult {
  id: string;
  externalId: string;
  title: string;
  webUrl: string | null;
  spaceName: string;
  snippet: string;
  score: number;
}

export interface ConfluenceSearchResponse {
  results: ConfluenceSearchResult[];
  hasData: boolean;
}

export function useConfluencePageSearch(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["confluence-search", query],
    queryFn: () => fetchApi<ConfluenceSearchResponse>(`/integrations/confluence/search?q=${encodeURIComponent(query)}`),
    enabled: enabled && query.trim().length > 0,
  });
}
