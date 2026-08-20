import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiFetch, API_BASE_URL } from "@/lib/api-client";

interface ConnectResponse {
  success: boolean;
  token?: string;
  quickSetupCommand?: string;
  setupSnippet?: string;
  error?: string;
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <pre className="glass overflow-x-auto rounded-xl p-3 pr-10 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {text}
      </pre>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="absolute right-2 top-2 h-7 px-2"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

const GEMINI_SNIPPET_TEMPLATE = (token: string) => `async function reportGeminiUsage(usageMetadata, modelId) {
  await fetch('${API_BASE_URL}/public/ai-usage/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-qualimetrix-token': '${token}',
    },
    body: JSON.stringify([{
      modelId,
      tokensIn: usageMetadata.promptTokenCount,
      tokensOut: usageMetadata.candidatesTokenCount,
      activity: 'code',
    }]),
  });
}

// After any Gemini call — modelId must match an id in Settings > Model catalog:
const result = await model.generateContent(prompt);
await reportGeminiUsage(result.response.usageMetadata, 'gemini');`;

interface ConnectClaudeCodePanelProps {
  /** Both share the same personal token; only the post-connect content differs. */
  mode?: "claude" | "gemini";
}

export function ConnectClaudeCodePanel({ mode = "claude" }: ConnectClaudeCodePanelProps) {
  const [squad, setSquad] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ quickSetupCommand: string; setupSnippet: string; token: string } | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/ai-usage/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squad: squad || undefined }),
      });
      const data: ConnectResponse = await res.json();
      if (!res.ok || !data.success || !data.quickSetupCommand || !data.setupSnippet || !data.token) {
        throw new Error(data.error ?? "Failed to connect");
      }
      setResult({ quickSetupCommand: data.quickSetupCommand, setupSnippet: data.setupSnippet, token: data.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    if (mode === "gemini") {
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Gemini has no automatic export like Claude Code's — drop this into your own code, right
            after each call.
          </p>
          <CopyBlock text={GEMINI_SNIPPET_TEMPLATE(result.token)} label="Gemini usage reporter" />
          <p className="text-[11px] text-muted-foreground">
            Your token is shown once. Reconnecting with the same email issues a new one and invalidates
            this one.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Paste this once into a terminal and press enter — no need to know your shell, and it works
          in every future Claude Code session automatically. Then quit and reopen Claude Code (or
          start a new session) to begin tracking.
        </p>
        <CopyBlock text={result.quickSetupCommand} label="setup command" />

        <Collapsible>
          <CollapsibleTrigger className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Advanced: use shell environment variables instead (CI, containers, shared machines)
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Only applies to the current shell session — you'd need to re-run it (or add it to your
              shell profile) for it to persist.
            </p>
            <CopyBlock text={result.setupSnippet} label="shell export snippet" />
          </CollapsibleContent>
        </Collapsible>

        <p className="text-[11px] text-muted-foreground">
          Your token is shown once. Reconnecting with the same email issues a new one and invalidates
          this one.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnect} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {mode === "gemini"
          ? "Gemini shares the same personal token as Claude Code. Connecting here gets you a token and the snippet to paste into your own code."
          : "Connect your Claude Code sessions to track your real token usage, cost and model mix."}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="connect-squad" className="text-xs">
          Squad (optional)
        </Label>
        <Input
          id="connect-squad"
          type="text"
          placeholder="Squad Nova"
          value={squad}
          onChange={(e) => setSquad(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}
      <Button type="submit" size="sm" disabled={busy}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {mode === "gemini" ? "Connect Gemini" : "Connect Claude Code"}
      </Button>
    </form>
  );
}
