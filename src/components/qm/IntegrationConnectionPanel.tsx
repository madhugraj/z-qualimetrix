import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const API_BASE_URL = "http://localhost:3001/api/v1";

// Matches the hardcoded demo tenant/user used throughout the rest of the app
// (e.g. ProductRepositories.tsx, settings.tsx's GitHubConfig) until real
// session identity replaces these everywhere.
const DEMO_TENANT_ID = "11d0f8f8-fd2e-4e2c-8d01-8f9b0ae1e167";
const DEMO_USER_ID = "1f9c1029-80ed-48ef-8892-c9aa06092640";

const SYNC_FREQUENCY_OPTIONS = [5, 15, 30, 60];

interface IntegrationStatusResponse {
  isConnected: boolean;
  status?: string;
  connectedAccountLabel?: string | null;
  syncFrequencyMinutes?: number;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}

export function IntegrationConnectionPanel({
  provider,
  displayName,
  connectHint,
}: {
  provider: "jira" | "azure_devops";
  displayName: string;
  connectHint: string;
}) {
  const [status, setStatus] = useState<IntegrationStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/${provider}/status?tenantId=${DEMO_TENANT_ID}`);
      const data = await res.json();
      if (data.success) setStatus(data.data);
    } catch (error) {
      console.error(`Failed to fetch ${displayName} status:`, error);
    } finally {
      setIsLoading(false);
    }
  }, [provider, displayName]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // After the OAuth callback redirects back to /integrations?connected=<provider>,
  // that page reloads status for every panel — but also handle it here in case
  // this panel is rendered standalone (e.g. inside the Settings tab).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === provider) {
      toast.success(`${displayName} connected`);
      fetchStatus();
    } else if (params.get("error") && window.location.pathname.includes("integrations")) {
      toast.error(`${displayName} connection failed`, { description: params.get("error") ?? undefined });
    }
  }, [provider, displayName, fetchStatus]);

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/${provider}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: DEMO_TENANT_ID, userId: DEMO_USER_ID }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to start connection");
      window.location.href = data.data.authorizeUrl;
    } catch (error) {
      toast.error(`Failed to connect ${displayName}`, {
        description: error instanceof Error ? error.message : undefined,
      });
      setIsConnecting(false);
    }
  }

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/${provider}/sync?tenantId=${DEMO_TENANT_ID}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Sync failed to start");
      toast.success("Sync started");
      setTimeout(fetchStatus, 2000);
    } catch (error) {
      toast.error("Failed to start sync", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDisconnect() {
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/${provider}?tenantId=${DEMO_TENANT_ID}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to disconnect");
      toast.success(`${displayName} disconnected`);
      fetchStatus();
    } catch (error) {
      toast.error("Failed to disconnect", { description: error instanceof Error ? error.message : undefined });
    }
  }

  async function handleFrequencyChange(minutes: number) {
    try {
      await fetch(`${API_BASE_URL}/integrations/${provider}/sync-frequency?tenantId=${DEMO_TENANT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      setStatus((prev) => (prev ? { ...prev, syncFrequencyMinutes: minutes } : prev));
    } catch (error) {
      toast.error("Failed to update sync frequency");
    }
  }

  if (isLoading) {
    return (
      <GlassPanel title={displayName}>
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </GlassPanel>
    );
  }

  const isConnected = status?.isConnected;

  return (
    <GlassPanel
      title={displayName}
      subtitle={isConnected ? `Connected as ${status?.connectedAccountLabel ?? "—"}` : connectHint}
    >
      <div className="space-y-4">
        {!isConnected ? (
          <Button onClick={handleConnect} disabled={isConnecting} className="gap-1.5">
            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Connect {displayName}
          </Button>
        ) : (
          <>
            {status?.status === "reauth_required" && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Connection needs to be re-authorized — reconnect below.
              </div>
            )}
            {status?.status === "connected" && (
              <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {displayName} Connected
              </div>
            )}
            {status?.lastSyncError && (
              <p className="text-xs text-critical">Last sync error: {status.lastSyncError}</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5">
                <Label>Sync frequency</Label>
                <select
                  value={status?.syncFrequencyMinutes ?? 5}
                  onChange={(e) => handleFrequencyChange(Number(e.target.value))}
                  className="rounded-md border border-glass-border bg-transparent px-3 py-2 text-sm"
                >
                  {SYNC_FREQUENCY_OPTIONS.map((m) => (
                    <option key={m} value={m}>Every {m} min</option>
                  ))}
                </select>
              </div>
              <Button onClick={handleSyncNow} disabled={isSyncing} size="sm" variant="outline" className="gap-1.5">
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sync now
              </Button>
              <Button onClick={handleDisconnect} size="sm" variant="ghost" className="gap-1.5 text-critical hover:text-critical">
                <Unplug className="h-4 w-4" />
                Disconnect
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Last synced: {status?.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "Never"}
            </p>
          </>
        )}
      </div>
    </GlassPanel>
  );
}
