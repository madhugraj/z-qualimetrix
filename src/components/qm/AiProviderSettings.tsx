import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Loader2, Unplug, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface IntegrationStatus {
  isConnected: boolean;
  status?: string;
  connectedAccountLabel?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}

interface KeyMapping {
  id: string;
  externalKeyId: string;
  label: string | null;
  user: { id: string; name: string | null; email: string };
}

interface TenantUser {
  id: string;
  name: string | null;
  email: string;
}

/**
 * OpenAI has a real usage-reporting API, so this is a genuine "paste a
 * credential, sync happens automatically" panel — unlike Gemini/Vertex,
 * which has no such API and is handled instead by the reporting snippet in
 * ConnectClaudeCodePanel (see that file's comment for why).
 */
export function AiProviderSettings() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [adminKey, setAdminKey] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [mappings, setMappings] = useState<KeyMapping[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [newKeyId, setNewKeyId] = useState("");
  const [newKeyUserId, setNewKeyUserId] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`/integrations/openai/status`);
      const data = await res.json();
      if (data.success) setStatus(data.data);
    } catch (error) {
      console.error("Failed to fetch OpenAI status:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchMappings = useCallback(async () => {
    try {
      const res = await apiFetch(`/integrations/openai/key-mappings`);
      const data = await res.json();
      if (data.success) setMappings(data.data);
    } catch (error) {
      console.error("Failed to fetch key mappings:", error);
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      await fetchStatus();
      try {
        const usersRes = await apiFetch(`/tenants/${tenantId}/users?limit=100`);
        const usersData = await usersRes.json();
        if (usersData.success) setUsers(usersData.data.users ?? []);
      } catch (error) {
        console.error("Failed to load tenant users:", error);
      }
    })();
  }, [tenantId, fetchStatus]);

  useEffect(() => {
    if (status?.isConnected) fetchMappings();
  }, [status?.isConnected, fetchMappings]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey.trim()) return;
    setIsConnecting(true);
    try {
      const res = await apiFetch(`/integrations/openai/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminApiKey: adminKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to connect");
      toast.success("OpenAI connected");
      setAdminKey("");
      fetchStatus();
    } catch (err) {
      toast.error("Failed to connect OpenAI", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      const res = await apiFetch(`/integrations/openai/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Sync failed to start");
      toast.success("Sync started");
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      toast.error("Failed to start sync", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDisconnect() {
    try {
      const res = await apiFetch(`/integrations/openai`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to disconnect");
      toast.success("OpenAI disconnected");
      fetchStatus();
    } catch (err) {
      toast.error("Failed to disconnect", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleAddMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyId.trim() || !newKeyUserId) return;
    try {
      const res = await apiFetch(`/integrations/openai/key-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKeyId: newKeyId.trim(), userId: newKeyUserId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to add mapping");
      toast.success("Key mapping added");
      setNewKeyId("");
      setNewKeyUserId("");
      fetchMappings();
    } catch (err) {
      toast.error("Failed to add mapping", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleDeleteMapping(id: string) {
    try {
      const res = await apiFetch(`/integrations/key-mappings/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to remove mapping");
      setMappings((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      toast.error("Failed to remove mapping", { description: err instanceof Error ? err.message : undefined });
    }
  }

  if (isLoading) {
    return (
      <GlassPanel title="OpenAI">
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </GlassPanel>
    );
  }

  const isConnected = status?.isConnected;

  return (
    <GlassPanel
      title="OpenAI"
      subtitle={isConnected ? `Connected — ${status?.connectedAccountLabel ?? ""}` : "Automatic usage sync via an org Admin API Key"}
    >
      <div className="space-y-4">
        {!isConnected ? (
          <form onSubmit={handleConnect} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="openai-admin-key">Admin API Key</Label>
              <Input
                id="openai-admin-key"
                type="password"
                placeholder="sk-admin-..."
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Organization → API keys → Admin keys in the OpenAI dashboard — not a regular project
                key, which can't call the usage-reporting API.
              </p>
            </div>
            <Button type="submit" size="sm" disabled={isConnecting || !adminKey.trim()} className="gap-1.5">
              {isConnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Connect OpenAI
            </Button>
          </form>
        ) : (
          <>
            {status?.lastSyncError && (
              <p className="text-xs text-critical">Last sync error: {status.lastSyncError}</p>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              OpenAI connected — syncing automatically every few minutes
            </div>
            <div className="flex flex-wrap items-center gap-3">
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

            <div className="border-t border-glass-border/60 pt-3">
              <p className="mb-2 text-sm font-medium">Per-developer attribution</p>
              <p className="mb-2 text-xs text-muted-foreground">
                OpenAI reports usage per API key, not per person — map each teammate's key id (from
                the OpenAI dashboard) to their QualiMetrix account. Usage under an unmapped key still
                counts toward org-wide cost, just shows as "Unattributed" per-developer.
              </p>
              <ul className="mb-3 space-y-1.5">
                {mappings.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-glass-border/60 px-3 py-2 text-xs">
                    <span className="truncate font-mono">{m.externalKeyId}</span>
                    <span className="truncate text-muted-foreground">{m.user.name ?? m.user.email}</span>
                    <button
                      type="button"
                      aria-label={`Remove mapping for ${m.externalKeyId}`}
                      onClick={() => handleDeleteMapping(m.id)}
                      className="text-muted-foreground transition-colors hover:text-critical"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {mappings.length === 0 && (
                  <li className="rounded-lg border border-dashed border-glass-border p-3 text-center text-xs text-muted-foreground">
                    No mappings yet — all usage shows as Unattributed.
                  </li>
                )}
              </ul>
              <form onSubmit={handleAddMapping} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-key-id" className="text-xs">API key id</Label>
                  <Input
                    id="new-key-id"
                    placeholder="key_abc123"
                    value={newKeyId}
                    onChange={(e) => setNewKeyId(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-key-user" className="text-xs">Teammate</Label>
                  <select
                    id="new-key-user"
                    value={newKeyUserId}
                    onChange={(e) => setNewKeyUserId(e.target.value)}
                    className="h-8 rounded-md border border-glass-border bg-transparent px-2 text-xs"
                  >
                    <option value="">Choose...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={!newKeyId.trim() || !newKeyUserId} className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Map
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </GlassPanel>
  );
}
