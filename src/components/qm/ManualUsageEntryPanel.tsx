import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface TenantUser {
  id: string;
  name: string | null;
  email: string;
}

interface CatalogOption {
  modelId: string;
  name: string;
}

/** One row at a time — covers any vendor with no live adapter and no ingest-token flow. CSV import isn't built. */
export function ManualUsageEntryPanel() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [models, setModels] = useState<CatalogOption[]>([]);
  const [userId, setUserId] = useState("");
  const [modelId, setModelId] = useState("");
  const [tokensIn, setTokensIn] = useState("");
  const [tokensOut, setTokensOut] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const usersRes = await apiFetch(`/tenants/${tenantId}/users?limit=100`);
        const usersData = await usersRes.json();
        if (usersData.success) setUsers(usersData.data.users ?? []);

        const catalogRes = await apiFetch(`/ai-usage/model-catalog`);
        const catalogData = await catalogRes.json();
        if (catalogData.success) {
          setModels(catalogData.data.filter((m: any) => m.isActive).map((m: any) => ({ modelId: m.modelId, name: m.name })));
        }
      } catch (error) {
        console.error("Failed to load manual entry options:", error);
      }
    })();
  }, [tenantId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const inNum = Number(tokensIn);
    const outNum = Number(tokensOut);
    if (!userId || !modelId || !Number.isFinite(inNum) || !Number.isFinite(outNum) || inNum < 0 || outNum < 0) {
      toast.error("Teammate, model and non-negative token counts are required");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/ai-usage/manual-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, modelId, tokensIn: inNum, tokensOut: outNum }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to log usage");
      toast.success("Usage logged");
      setTokensIn("");
      setTokensOut("");
    } catch (err) {
      toast.error("Failed to log usage", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel
      title="Log usage manually"
      subtitle="For a vendor with no live sync — add it to the model catalog above first"
    >
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="manual-user" className="text-xs">Teammate</Label>
          <select
            id="manual-user"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-9 rounded-md border border-glass-border bg-transparent px-2 text-sm"
          >
            <option value="">Choose...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-model" className="text-xs">Model</Label>
          <select
            id="manual-model"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="h-9 rounded-md border border-glass-border bg-transparent px-2 text-sm"
          >
            <option value="">Choose...</option>
            {models.map((m) => (
              <option key={m.modelId} value={m.modelId}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-tokens-in" className="text-xs">Input tokens</Label>
          <Input id="manual-tokens-in" type="number" min="0" value={tokensIn} onChange={(e) => setTokensIn(e.target.value)} className="h-9 w-28" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-tokens-out" className="text-xs">Output tokens</Label>
          <Input id="manual-tokens-out" type="number" min="0" value={tokensOut} onChange={(e) => setTokensOut(e.target.value)} className="h-9 w-28" />
        </div>
        <Button type="submit" size="sm" disabled={busy} className="gap-1.5">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Log usage
        </Button>
      </form>
    </GlassPanel>
  );
}
