import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { apiFetch } from "@/lib/api-client";

type Provider = "anthropic" | "openai" | "gemini";

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  gemini: "Google (Gemini)",
};
const PROVIDER_KEY_HINT: Record<Provider, string> = {
  anthropic: "sk-ant-…",
  openai: "sk-…",
  gemini: "AIza…",
};

interface Status {
  isConnected: boolean;
  provider?: string;
  maskedApiKey?: string;
  modelId?: string | null;
  lastValidated?: string;
  lastUsed?: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error ?? body.message ?? `Request failed: ${path}`);
  return body.data as T;
}

const fieldClass = "w-full rounded-xl border border-glass-border bg-input/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

/**
 * PM-only: connects the tenant's own LLM API key to power the
 * PM/Leadership analytics assistant floating widget. Tenant-owned and
 * tenant-billed — no platform-wide fallback key exists, so the assistant
 * won't work for this org until this is set up.
 */
export function AssistantProviderConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setStatus(await fetchJson<Status>("/assistant/provider-connection/status"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load assistant connection status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const connect = async () => {
    if (!apiKey.trim()) {
      toast.error("An API key is required");
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson("/assistant/provider-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), modelId: modelId.trim() || undefined }),
      });
      toast.success("Analytics assistant connected");
      setApiKey("");
      setModelId("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect");
    } finally {
      setSubmitting(false);
    }
  };

  const disconnect = async () => {
    try {
      await fetchJson("/assistant/provider-connection", { method: "DELETE" });
      toast.success("Disconnected");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect");
    }
  };

  return (
    <GlassPanel title="Analytics assistant" subtitle="Bring your own LLM key to power the PM/Leadership chat assistant — your org's usage bills to this key">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : status?.isConnected ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {PROVIDER_LABEL[status.provider as Provider] ?? status.provider} · <span className="font-mono text-xs text-muted-foreground">{status.maskedApiKey}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {status.modelId && `Model: ${status.modelId} · `}
            {status.lastValidated && `Verified ${new Date(status.lastValidated).toLocaleString()}`}
            {status.lastUsed && ` · last used ${new Date(status.lastUsed).toLocaleString()}`}
          </p>
          <button type="button" onClick={disconnect} className="glass rounded-full px-4 py-2 text-xs font-medium text-critical">
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Not connected — the assistant widget won't work for your organization until this is set up.</p>
          <select className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
              <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
            ))}
          </select>
          <input className={fieldClass} type="password" placeholder={`API key (${PROVIDER_KEY_HINT[provider]})`} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <input className={fieldClass} placeholder="Model id override (optional)" value={modelId} onChange={(e) => setModelId(e.target.value)} />
          <button type="button" onClick={connect} disabled={submitting} className="glass rounded-full px-4 py-2 text-xs font-medium disabled:opacity-50">
            {submitting ? "Verifying…" : "Connect"}
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
