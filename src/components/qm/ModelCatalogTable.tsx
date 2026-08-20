import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";

interface CatalogRow {
  id: string;
  modelId: string;
  name: string;
  vendor: string;
  purpose: string | null;
  priceIn: string;
  priceOut: string;
  cacheDiscount: string;
  isActive: boolean;
  tenantId: string | null;
}

/**
 * The concrete "super user can add a new provider" surface: any vendor name,
 * any modelId, your own pricing — with or without a live sync adapter behind
 * it. Reads every distinct row (not the dashboard's tenant-wins-over-global
 * merged view) so an admin can see both a global default and their own
 * override for the same modelId side by side.
 */
export function ModelCatalogTable() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await apiFetch(`/ai-usage/model-catalog`);
      const data = await res.json();
      if (data.success) setRows(data.data);
    } catch (error) {
      console.error("Failed to fetch model catalog:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  async function handleDeactivate(id: string) {
    try {
      const res = await apiFetch(`/ai-usage/model-catalog/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to deactivate");
      toast.success("Model deactivated");
      fetchRows();
    } catch (err) {
      toast.error("Failed to deactivate", { description: err instanceof Error ? err.message : undefined });
    }
  }

  if (isLoading) {
    return (
      <GlassPanel title="Model catalog & pricing">
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel
      title="Model catalog & pricing"
      subtitle="Every model driving cost figures on the AI Usage dashboard — add a vendor with no live adapter here"
      action={<AddModelDialog open={addOpen} onOpenChange={setAddOpen} onCreated={fetchRows} />}
    >
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {row.tenantId ? "Your override" : "Global default"}
                </span>
                {!row.isActive && (
                  <span className="shrink-0 rounded-full bg-critical/10 px-2 py-0.5 text-[10px] text-critical">Inactive</span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {row.vendor} · {row.modelId} · ${Number(row.priceIn).toFixed(2)} in / ${Number(row.priceOut).toFixed(2)} out per 1M tokens
              </p>
            </div>
            {row.tenantId && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Edit pricing for ${row.name}`}
                  onClick={() => setEditing(row)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {row.isActive && (
                  <button
                    type="button"
                    aria-label={`Deactivate ${row.name}`}
                    onClick={() => handleDeactivate(row.id)}
                    className="text-muted-foreground transition-colors hover:text-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-glass-border p-6 text-center text-xs text-muted-foreground">
            No models yet.
          </p>
        )}
      </div>

      {editing && (
        <EditPriceDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            fetchRows();
          }}
        />
      )}
    </GlassPanel>
  );
}

function AddModelDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [modelId, setModelId] = useState("");
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [priceIn, setPriceIn] = useState("");
  const [priceOut, setPriceOut] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setModelId("");
    setName("");
    setVendor("");
    setPriceIn("");
    setPriceOut("");
  }

  async function submit() {
    if (!modelId.trim() || !name.trim() || !vendor.trim()) {
      toast.error("Model id, name and vendor are required");
      return;
    }
    const inNum = Number(priceIn);
    const outNum = Number(priceOut);
    if (!Number.isFinite(inNum) || !Number.isFinite(outNum)) {
      toast.error("Both prices are required");
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch(`/ai-usage/model-catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: modelId.trim(), name: name.trim(), vendor: vendor.trim(), priceIn: inNum, priceOut: outNum }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to add model");
      toast.success(`${name.trim()} added`);
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error("Failed to add model", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add model
        </Button>
      </DialogTrigger>
      <DialogContent className="glass sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a model</DialogTitle>
          <DialogDescription>
            Any vendor, with or without a live sync adapter — pricing here drives cost figures for
            events logged against this model, including manual entries.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="model-id">Model id</Label>
            <Input id="model-id" placeholder="deepseek-v4" value={modelId} onChange={(e) => setModelId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model-name">Display name</Label>
            <Input id="model-name" placeholder="DeepSeek V4" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model-vendor">Vendor</Label>
            <Input id="model-vendor" placeholder="DeepSeek" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="model-price-in">$ per 1M input tokens</Label>
              <Input id="model-price-in" type="number" step="0.01" min="0" value={priceIn} onChange={(e) => setPriceIn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-price-out">$ per 1M output tokens</Label>
              <Input id="model-price-out" type="number" step="0.01" min="0" value={priceOut} onChange={(e) => setPriceOut(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPriceDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CatalogRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [priceIn, setPriceIn] = useState(row.priceIn);
  const [priceOut, setPriceOut] = useState(row.priceOut);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const inNum = Number(priceIn);
    const outNum = Number(priceOut);
    if (!Number.isFinite(inNum) || !Number.isFinite(outNum) || inNum < 0 || outNum < 0) {
      toast.error("Prices must be non-negative numbers");
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch(`/ai-usage/model-catalog/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceIn: inNum, priceOut: outNum }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to update pricing");
      toast.success("Pricing updated");
      onSaved();
    } catch (err) {
      toast.error("Failed to update pricing", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit pricing — {row.name}</DialogTitle>
          <DialogDescription>Updates cost figures for every event logged against this model from now on.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-price-in">$ per 1M input tokens</Label>
            <Input id="edit-price-in" type="number" step="0.01" min="0" value={priceIn} onChange={(e) => setPriceIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-price-out">$ per 1M output tokens</Label>
            <Input id="edit-price-out" type="number" step="0.01" min="0" value={priceOut} onChange={(e) => setPriceOut(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
