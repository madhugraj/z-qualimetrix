import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { BugListResponse, WorkItemDetail } from "@/lib/queries/bugs";
import type { ConfluenceSearchResponse } from "@/lib/queries/confluence";

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data as T;
}

// `/work-items/:id` is a generic work-item lookup, not bug-specific — same
// endpoint useBugDetail (src/lib/queries/bugs.ts) hits.
export function useEpicDetail(epicId: string | undefined) {
  return useQuery({
    queryKey: ["epic-detail", epicId],
    queryFn: () => fetchApi<WorkItemDetail>(`/work-items/${epicId}`),
    enabled: !!epicId,
    retry: false,
  });
}

// Direct children of an epic (stories/tasks/bugs/subtasks) — `/work-items`
// already supports `parentId` filtering; unlike useBugsList this doesn't
// force `type=bug`, since an epic's children span every work item type.
export function useEpicChildren(epicId: string | undefined, limit: number = 100) {
  return useQuery({
    queryKey: ["epic-children", epicId, limit],
    queryFn: () => fetchApi<BugListResponse>(`/work-items?parentId=${epicId}&limit=${limit}`),
    enabled: !!epicId,
  });
}

export interface LinkedDocument {
  id: string;
  linkType: string;
  createdAt: string;
  page: {
    id: string;
    externalId: string;
    title: string;
    webUrl: string | null;
    updatedAt: string;
    space: { name: string };
  };
}

export function useLinkedDocuments(epicId: string | undefined) {
  return useQuery({
    queryKey: ["linked-documents", epicId],
    queryFn: () => fetchApi<LinkedDocument[]>(`/work-items/${epicId}/documents`),
    enabled: !!epicId,
  });
}

// Semantic-similarity suggestions are only worth the query once a reader
// actually opens the "Show suggested pages" disclosure — `enabled` is driven
// by the caller's open/closed state, not fired unconditionally on page load.
export function useSuggestedDocuments(epicId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["suggested-documents", epicId],
    queryFn: () => fetchApi<ConfluenceSearchResponse>(`/work-items/${epicId}/documents/suggested`),
    enabled: !!epicId && enabled,
  });
}

export function useLinkDocument(epicId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) =>
      fetchApi(`/work-items/${epicId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linked-documents", epicId] });
      queryClient.invalidateQueries({ queryKey: ["suggested-documents", epicId] });
    },
  });
}

export function useUnlinkDocument(epicId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      fetchApi(`/work-items/${epicId}/documents/${linkId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linked-documents", epicId] });
      queryClient.invalidateQueries({ queryKey: ["suggested-documents", epicId] });
    },
  });
}
