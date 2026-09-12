import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data as T;
}

export type NotificationSeverity = "critical" | "warning" | "info";

export interface NotificationAlert {
  id: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  to: string;
  params?: Record<string, string>;
  isRead: boolean;
}

export interface NotificationsResult {
  alerts: NotificationAlert[];
  unreadCount: number;
}

const NOTIFICATIONS_KEY = ["notifications"];

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => fetchApi<NotificationsResult>("/notifications"),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchApi(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      fetchApi("/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
