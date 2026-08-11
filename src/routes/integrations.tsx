import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { DocumentHub } from "@/components/qm/DocumentHub";
import { GitInsights } from "@/components/qm/GitInsights";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { INTEGRATIONS } from "@/lib/qm-data";


export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Jira, Azure DevOps & CI | QualiMetrix" },
      {
        name: "description",
        content:
          "Connect Jira Cloud, Azure DevOps, GitHub and CI pipelines to sync work items, test executions and sprint data into QualiMetrix.",
      },
      { property: "og:title", content: "QualiMetrix Integrations" },
      {
        property: "og:description",
        content: "OAuth and webhook ingestion for Jira Cloud, Azure DevOps, GitHub and CI.",
      },
    ],
  }),
  component: Integrations,
});

function Integrations() {
  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Integrations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Automated ingestion sources. Dashboards fall back to sample data until a source is
            connected.
          </p>
        </div>
        <Link
          to="/settings"
          className="glass rounded-full px-4 py-2 text-xs font-medium transition-colors hover:text-primary"
        >
          + Add integration
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {INTEGRATIONS.map((i) => {
          const connected = i.status === "Connected";
          return (
            <GlassPanel key={i.name} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{i.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{i.detail}</p>
                </div>
                <span
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    connected ? "bg-good/20 text-good" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {connected ? (
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5" strokeWidth={1.8} />
                  )}
                  {i.status}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-glass-border/60 pt-3 text-xs text-muted-foreground">
                <span>Last sync: {i.synced}</span>
                <button className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 font-medium text-primary transition-colors hover:bg-primary/25">
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {connected ? "Sync now" : "Connect"}
                </button>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      <GitInsights />

      <DocumentHub />


      <GlassPanel

        title="Sync pipeline"
        subtitle="Webhook ingestion → normalisation → aggregation"
        className="mt-4"
      >
        <ol className="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
          {[
            ["1 · Ingest", "Webhook payloads queued durably with retry + backoff"],
            ["2 · Normalise", "Jira & ADO payloads mapped to unified WorkItem model"],
            ["3 · Aggregate", "Daily & sprint QualityMetricsSnapshot rollups"],
            ["4 · Serve", "Cached dashboard aggregates under 200ms"],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl border border-glass-border/60 p-3">
              <p className="text-xs font-semibold text-foreground">{t}</p>
              <p className="mt-1">{d}</p>
            </li>
          ))}
        </ol>
      </GlassPanel>
    </AppShell>
  );
}
