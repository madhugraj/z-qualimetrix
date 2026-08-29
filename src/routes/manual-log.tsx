import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { DeliverablesFeed, deliverableRecordToItem } from "@/components/qm/DeliverablesFeed";
import { useCurrentProduct } from "@/lib/product-context";
import { useProductDeliverables } from "@/lib/queries/analytics";
import { apiFetch } from "@/lib/api-client";
import { type DeliverableType } from "@/lib/qm-data";

export const Route = createFileRoute("/manual-log")({
  head: () => ({
    meta: [
      { title: "Manual Activity Log — Demos, Docs & RCAs | QualiMetrix" },
      {
        name: "description",
        content:
          "Log demos, technical documentation, RCAs and manual testing hours that Jira and Azure DevOps cannot capture automatically.",
      },
      { property: "og:title", content: "QualiMetrix Manual Activity Log" },
      {
        property: "og:description",
        content: "Capture demos, documentation, RCAs and exploratory testing hours.",
      },
    ],
  }),
  component: ManualLog,
});

const TYPES: { id: DeliverableType; label: string }[] = [
  { id: "DEMO", label: "Demo given" },
  { id: "DOC", label: "Documentation" },
  { id: "RCA", label: "Root cause analysis" },
  { id: "TEST", label: "Manual testing hours" },
];

const fieldClass =
  "w-full rounded-xl border border-glass-border bg-input/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

function ManualLog() {
  const [type, setType] = useState<DeliverableType>("DEMO");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { products, currentProduct, setCurrentProductId } = useCurrentProduct();
  const queryClient = useQueryClient();
  const deliverables = useProductDeliverables(currentProduct?.id);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;

    if (!currentProduct) {
      toast.error("Select a product first");
      return;
    }

    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;

    const rating = data.get("rating");
    const documentLink = String(data.get("documentLink") ?? "").trim();
    const hours = data.get("hours");
    const reviewer = String(data.get("reviewer") ?? "").trim();
    const notes = String(data.get("notes") ?? "").trim();

    const description = [hours ? `${hours} hours logged` : null, reviewer ? `Reviewer: ${reviewer}` : null, notes || null]
      .filter(Boolean)
      .join(" · ");

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/products/${currentProduct.id}/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          description: description || undefined,
          rating: type === "DEMO" && rating ? Number(rating) : undefined,
          links: documentLink ? [documentLink] : [],
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error ?? "Failed to log activity");

      toast.success("Activity logged", {
        description: "It will appear in the operational deliverables feed.",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["product-deliverables", currentProduct.id] });
    } catch (error) {
      toast.error("Couldn't log activity", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Manual activity log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Capture the operational deliverables that APIs cannot track.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <GlassPanel title="Log an activity" subtitle="Fields adapt per type" className="xl:col-span-2">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    type === t.id
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-glass-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Title</label>
              <input name="title" className={fieldClass} placeholder="Sprint 12 stakeholder demo" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Product</label>
                <select
                  className={fieldClass}
                  value={currentProduct?.id ?? ""}
                  onChange={(e) => setCurrentProductId(e.target.value || null)}
                >
                  {products.length === 0 && <option value="">No products</option>}
                  {products.map((p) => (
                    <option key={p.id} value={p.id} className="bg-popover text-popover-foreground">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Date</label>
                <input type="date" className={fieldClass} required />
              </div>
            </div>

            {type === "DEMO" && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Demo rating (1–5)</label>
                <input name="rating" type="number" min={1} max={5} step={0.1} className={fieldClass} placeholder="4.5" />
              </div>
            )}

            {(type === "DOC" || type === "RCA") && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Document link</label>
                <input name="documentLink" type="url" className={fieldClass} placeholder="https://wiki/..." />
              </div>
            )}

            {type === "TEST" && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Hours logged</label>
                <input name="hours" type="number" min={0} step={0.25} className={fieldClass} placeholder="3.5" />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Reviewer / approver</label>
              <input name="reviewer" className={fieldClass} placeholder="Optional" />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
              <textarea name="notes" className={fieldClass} rows={3} placeholder="Context, outcomes, follow-ups" />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-8px_var(--primary)] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting ? "Logging…" : "Log activity"}
            </button>
          </form>
        </GlassPanel>

        <GlassPanel
          title="Recent operational deliverables"
          subtitle="Demos, docs, RCAs and manual testing"
          className="xl:col-span-3"
        >
          <DeliverablesFeed data={deliverables.data?.map(deliverableRecordToItem)} />
        </GlassPanel>
      </div>
    </AppShell>
  );
}
