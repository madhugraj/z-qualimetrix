import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE_URL = "http://localhost:3001/api/v1";

interface ConnectResponse {
  success: boolean;
  userId?: string;
  setupSnippet?: string;
  error?: string;
}

export function ConnectClaudeCodePanel({ onConnected }: { onConnected?: (userId: string) => void }) {
  const [email, setEmail] = useState("");
  const [squad, setSquad] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai-usage/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, squad: squad || undefined }),
      });
      const data: ConnectResponse = await res.json();
      if (!res.ok || !data.success || !data.setupSnippet || !data.userId) {
        throw new Error(data.error ?? "Failed to connect");
      }
      setSnippet(data.setupSnippet);
      localStorage.setItem("qm.aiUsageUserId", data.userId);
      window.dispatchEvent(new CustomEvent("aiUsageUserChanged", { detail: { userId: data.userId } }));
      onConnected?.(data.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (snippet) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Run this in your shell before starting Claude Code. Your usage will start appearing here
          within a minute of your next session.
        </p>
        <div className="relative">
          <pre className="glass overflow-x-auto rounded-xl p-3 text-[11px] leading-relaxed">
            {snippet}
          </pre>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute right-2 top-2 h-7 px-2"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          This token is shown once. Reconnecting with the same email issues a new one and invalidates
          this one.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnect} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Connect your Claude Code sessions to track your real token usage, cost and model mix.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="connect-email" className="text-xs">
            Work email
          </Label>
          <Input
            id="connect-email"
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
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
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}
      <Button type="submit" size="sm" disabled={busy}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Connect Claude Code
      </Button>
    </form>
  );
}
