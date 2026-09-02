import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { RequireRole } from "@/components/qm/RequireRole";
import { DemoDataBadge } from "@/components/qm/DemoDataNotice";
import { SpendTrendChart, SpendBreakdownChart } from "@/components/qm/charts";
import { useDateRange } from "@/lib/date-range-context";
import {
  useGpuSpendSummary,
  useGpuSpendTrend,
  useGpuSpendBySquad,
  useGpuSpendByType,
} from "@/lib/queries/gpu-spend";

export const Route = createFileRoute("/infra-spend")({
  head: () => ({
    meta: [
      { title: "GPU & Compute Spend — QualiMetrix" },
      {
        name: "description",
        content: "What the org spends renting external GPU compute for AI R&D and production, by squad and GPU type.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["pm", "executive"]}>
      <InfraSpendPage />
    </RequireRole>
  ),
});

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function connectionStatusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function InfraSpendPage() {
  const { startDate, endDate } = useDateRange();
  const summary = useGpuSpendSummary();
  const trend = useGpuSpendTrend(true, startDate, endDate);
  const bySquad = useGpuSpendBySquad();
  const byType = useGpuSpendByType();

  const squadRows = bySquad.data?.breakdown.map((r) => ({ label: r.squad, costUsd: r.costUsd })) ?? [];
  const typeRows = byType.data?.breakdown.map((r) => ({ label: r.gpuType, costUsd: r.costUsd })) ?? [];

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">GPU & Compute Spend</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the org spends renting external GPU compute for AI R&amp;D and production, across GCP, AWS and
          Azure, with real cost tracking for each. Krutrim Cloud can also be connected, but only confirms
          how many GPU resources are active for now — Krutrim's usage API doesn't yet expose cost isolated
          from other compute spend. Utilization (GPU-hours idle vs. busy) needs live provider telemetry per
          vendor, not yet built for any provider. Specialized GPU clouds (CoreWeave, Lambda Labs, RunPod,
          etc.) aren't connected yet either.
        </p>
      </header>

      {summary.data && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <GlassPanel>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total GPU spend</p>
            <p className="mt-1 text-2xl font-semibold">
              {summary.data.hasData ? formatUsd(summary.data.totalCostUsd) : "—"}
            </p>
          </GlassPanel>
          <GlassPanel>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">GPU-hours (where reported)</p>
            <p className="mt-1 text-2xl font-semibold">
              {summary.data.totalGpuHours !== null ? summary.data.totalGpuHours.toLocaleString() : "—"}
            </p>
          </GlassPanel>
          <GlassPanel>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Connected sources</p>
            <p className="mt-1 text-2xl font-semibold">{summary.data.connections.length}</p>
          </GlassPanel>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassPanel
          title="Spend trend"
          subtitle="Weekly GPU-compute cost"
          className="xl:col-span-2"
          action={!trend.data?.hasData ? <DemoDataBadge /> : undefined}
        >
          <SpendTrendChart data={trend.data?.trend} />
        </GlassPanel>

        <GlassPanel title="Connected sources" subtitle="Provider sync status">
          {!summary.data || summary.data.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No GPU-compute provider connected yet. Connect GCP, AWS, Azure or Krutrim from the Integrations page.
            </p>
          ) : (
            <ul className="space-y-2">
              {summary.data.connections.map((c) => (
                <li key={c.id} className="rounded-xl border border-glass-border p-3 text-xs">
                  <p className="font-medium uppercase">{c.provider}</p>
                  <p className="mt-0.5 text-muted-foreground">{c.externalAccountId}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {connectionStatusLabel(c.status)}
                    {c.lastSyncedAt ? ` · synced ${new Date(c.lastSyncedAt).toLocaleDateString()}` : " · never synced"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>

        <GlassPanel
          title="Spend by squad"
          subtitle="Unmapped = no cost-allocation label on the resource"
          action={!bySquad.data?.hasData ? <DemoDataBadge /> : undefined}
        >
          <SpendBreakdownChart data={squadRows} />
        </GlassPanel>

        <GlassPanel
          title="Spend by GPU type"
          subtitle="Parsed from provider SKU descriptions — best effort"
          className="xl:col-span-2"
          action={!byType.data?.hasData ? <DemoDataBadge /> : undefined}
        >
          <SpendBreakdownChart data={typeRows} />
        </GlassPanel>
      </div>
    </AppShell>
  );
}
