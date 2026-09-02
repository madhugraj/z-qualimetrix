import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircleQuestion, Plus, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useAssistantConversations,
  useAssistantMessages,
  useCreateAssistantConversation,
  useSendAssistantMessage,
} from "@/lib/queries/assistant";

// Compact markdown rendering for assistant replies — the model formats with
// headings/bold/lists, which needs actual parsing (not whitespace-pre-wrap)
// or a PM sees literal "**text**"/"* item" asterisks. User messages stay
// plain text; only the assistant writes markdown.
const MARKDOWN_COMPONENTS = {
  p: (props: React.ComponentPropsWithoutRef<"p">) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props: React.ComponentPropsWithoutRef<"ul">) => <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0" {...props} />,
  ol: (props: React.ComponentPropsWithoutRef<"ol">) => <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0" {...props} />,
  li: (props: React.ComponentPropsWithoutRef<"li">) => <li className="leading-relaxed" {...props} />,
  strong: (props: React.ComponentPropsWithoutRef<"strong">) => <strong className="font-semibold" {...props} />,
  h1: (props: React.ComponentPropsWithoutRef<"h3">) => <h3 className="mb-1 text-[13px] font-semibold" {...props} />,
  h2: (props: React.ComponentPropsWithoutRef<"h3">) => <h3 className="mb-1 text-[13px] font-semibold" {...props} />,
  h3: (props: React.ComponentPropsWithoutRef<"h3">) => <h3 className="mb-1 text-[13px] font-semibold" {...props} />,
  code: (props: React.ComponentPropsWithoutRef<"code">) => <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px]" {...props} />,
  a: (props: React.ComponentPropsWithoutRef<"a">) => <a className="underline" target="_blank" rel="noreferrer" {...props} />,
};

/**
 * Global floating widget — PM/Leadership only. Every request is re-checked
 * server-side (requireRole('pm','executive') + tenant scoping inside the
 * tool dispatcher); this role check is a UI convenience, not the security
 * boundary.
 */
export function AssistantWidget({ role }: { role?: string }) {
  const isAllowed = role === "pm" || role === "executive";
  const [open, setOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversations = useAssistantConversations(isAllowed && open);
  const messages = useAssistantMessages(activeConversationId);
  const createConversation = useCreateAssistantConversation();
  const sendMessage = useSendAssistantMessage();

  useEffect(() => {
    if (open && !activeConversationId && conversations.data && conversations.data.length > 0) {
      setActiveConversationId(conversations.data[0].id);
    }
  }, [open, activeConversationId, conversations.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data, sendMessage.isPending]);

  if (!isAllowed) return null;

  const handleNewChat = async () => {
    const conversation = await createConversation.mutateAsync();
    setActiveConversationId(conversation.id);
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sendMessage.isPending) return;
    let conversationId = activeConversationId;
    if (!conversationId) {
      const conversation = await createConversation.mutateAsync();
      conversationId = conversation.id;
      setActiveConversationId(conversationId);
    }
    setDraft("");
    await sendMessage.mutateAsync({ conversationId, content });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="glass fixed right-6 bottom-6 z-30 flex h-12 w-12 items-center justify-center rounded-full text-primary shadow-lg transition-transform hover:scale-105"
          aria-label="Ask the analytics assistant"
        >
          <MessageCircleQuestion className="h-5 w-5" strokeWidth={1.7} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="glass flex h-[520px] w-[380px] flex-col rounded-2xl p-0">
        <header className="flex items-center justify-between border-b border-glass-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Analytics assistant</p>
            <p className="text-[11px] text-muted-foreground">Shared with PM &amp; Leadership · answers from live data only</p>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            aria-label="New chat"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </header>

        {conversations.data && conversations.data.length > 0 && (
          <div className="flex gap-1 overflow-x-auto border-b border-glass-border px-2 py-1.5">
            {conversations.data.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveConversationId(c.id)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap",
                  c.id === activeConversationId ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/40",
                )}
              >
                {c.title ?? "New chat"}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
          {!activeConversationId && (
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Ask about sprint health, defect trends, AI-vs-human commit share, or AI/GPU spend.
            </p>
          )}
          {messages.data?.map((m) => (
            <div key={m.id} className={cn("mb-3 flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground whitespace-pre-wrap" : "bg-accent/40 text-foreground",
                )}
              >
                {m.role === "assistant" ? (
                  <ReactMarkdown components={MARKDOWN_COMPONENTS}>{m.content}</ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          {sendMessage.isPending && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
            </div>
          )}
          {sendMessage.isError && (
            <p className="text-[11px] text-destructive">{(sendMessage.error as Error).message}</p>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-glass-border p-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question about your analytics…"
            className="min-h-9 resize-none text-xs"
            rows={1}
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={sendMessage.isPending || !draft.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
