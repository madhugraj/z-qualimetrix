import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { DeliverablesFeed } from "@/components/qm/DeliverablesFeed";
import { PRODUCTS, type DeliverableType } from "@/lib/qm-data";

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
  component: ManualLog;
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
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              toast.success("Activity logged", {
                description: "It will appear in the operational deliverables feed.",
              });
              (e.target as HTMLFormElement).reset();
            }}
          >
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
              <input className={fieldClass} placeholder="Sprint 12 stakeholder demo" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Product</label>
                <select className={fieldClass}>
                  {PRODUCTS.map((p) => (
                    <option key={p} className="bg-popover text-popover-foreground">
                      {p}
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
                <input type="number" min={1} max={5} step={0.1} className={fieldClass} placeholder="4.5" />
              </div>
            )}

            {(type === "DOC" || type === "RCA") && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Document link</label>
                <input type="url" className={fieldClass} placeholder="https://wiki/..." />
              </div>
            )}

            {type === "TEST" && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Hours logged</label>
                <input type="number" min={0} step={0.25} className={fieldClass} placeholder="3.5" />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Reviewer / approver</label>
              <input className={fieldClass} placeholder="Optional" />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
              <textarea className={fieldClass} rows={3} placeholder="Context, outcomes, follow-ups" />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-8px_var(--primary)] transition-opacity hover:opacity-90"
            >
              Log activity
            </button>
          </form>
        </GlassPanel>

        <GlassPanel
          title="Recent operational deliverables"
          subtitle="Demos, docs, RCAs and manual testing"
          className="xl:col-span-3"
        >
          <DeliverablesFeed />
        </GlassPanel>
      </div>
    </AppShell>
  );
}
