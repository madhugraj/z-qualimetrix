import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

async function fetchAssistant<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data as T;
}

export interface ChatConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  startedBy: { id: string; name: string | null; email: string };
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: Array<{ tool: string; args: unknown; resultSummary: string }> | null;
  createdAt: string;
}

// Only ever mounted for pm/executive (AssistantWidget checks the role before
// rendering), so `enabled` defaults to true — callers that need to gate it
// further (e.g. while auth is still loading) can still pass `enabled: false`.
export function useAssistantConversations(enabled: boolean = true) {
  return useQuery({
    queryKey: ["assistant-conversations"],
    queryFn: () => fetchAssistant<ChatConversation[]>("/assistant/conversations"),
    enabled,
  });
}

export function useAssistantMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["assistant-messages", conversationId],
    queryFn: () => fetchAssistant<ChatMessage[]>(`/assistant/conversations/${conversationId}`),
    enabled: !!conversationId,
  });
}

export function useCreateAssistantConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchAssistant<ChatConversation>("/assistant/conversations", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assistant-conversations"] }),
  });
}

export function useSendAssistantMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      fetchAssistant<ChatMessage>(`/assistant/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["assistant-messages", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["assistant-conversations"] });
    },
  });
}
