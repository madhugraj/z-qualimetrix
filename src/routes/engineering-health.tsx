import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { RequireRole } from "@/components/qm/RequireRole";
import { KpiMetricCard } from "@/components/qm/KpiMetricCard";
import { DemoDataBanner } from "@/components/qm/DemoDataNotice";
import { DeveloperProfileCard } from "@/components/qm/DeveloperProfileCard";
import { AllocationChart, ConsistencyChart, type ConsistencyPoint } from "@/components/qm/people-charts";
import { SiloAlerts, TrainingList } from "@/components/qm/people-panels";
import { HR_KPIS } from "@/lib/qm-people";
import { useDeveloperHealthProfiles } from "@/lib/queries/engineering-health";
import {
  useAssigneeWorkload,
  useFeatureFixAllocation,
  useKnowledgeSilo,
  useVelocityTrend,
  useDefectLeakage,
} from "@/lib/queries/analytics";

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

export const Route = createFileRoute("/engineering-health")({
  head: () => ({
    meta: [
      { title: "Engineering Health — People & Workload | QualiMetrix" },
      {
        name: "description",
        content:
          "Workload balance, burnout signals, feature-vs-fix allocation, knowledge silos and training opportunities for engineering managers and HR partners.",
      },
      { property: "og:title", content: "Engineering Health — QualiMetrix" },
      {
        property: "og:description",
        content: "Sustainable performance metrics focused on support, not surveillance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // This page's own copy already claims to be "Restricted to Managers,
  // Leads and HR partners" — that was previously just header text, not an
  // actual enforced gate. pm/executive are this app's closest real roles to
  // that audience (same tier infra-spend.tsx already gates to).
  component: () => (
    <RequireRole roles={["pm", "executive"]}>
      <EngineeringHealth />
    </RequireRole>
  ),
});

function EngineeringHealth() {
  const { data } = useDeveloperHealthProfiles();
  const workload = useAssigneeWorkload();
  const allocation = useFeatureFixAllocation();
  const silo = useKnowledgeSilo();
  const velocity = useVelocityTrend();
  const defectLeakage = useDefectLeakage();

  // Two independently-computed real series joined by sprint/period name —
  // not a fabricated composite. Either query missing a given period leaves
  // that field null rather than 0, so a real "no bugs this sprint" (rate 0)
  // is never confused with "leakage data unavailable" (null).
  const consistencyData: ConsistencyPoint[] | undefined = useMemo(() => {
    if (!velocity.data?.length) return undefined;
    const leakageByPeriod = new Map(defectLeakage.data?.trend.map((t) => [t.period, t.rate]) ?? []);
    return velocity.data.map((v) => ({
      period: v.period,
      velocity: v.velocity,
      leakageRate: leakageByPeriod.get(v.period) ?? null,
    }));
  }, [velocity.data, defectLeakage.data]);

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Engineering Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manager / HR perspective · workload balance, knowledge spread and growth areas
        </p>
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-glass-border bg-accent/20 px-3 py-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-ops" strokeWidth={1.6} />
          Restricted to Managers, Leads and HR partners. Metrics are aggregated to guide support and
          resourcing decisions — never used for individual performance ranking.
        </p>
        <DemoDataBanner>
          The developer health profiles, assignee workload, feature/fix allocation, knowledge-silo and
          quality-to-effort panels below are real, computed from actual commit, work-item, worklog and
          sprint data. The KPI cards and training panel are still illustrative sample data — skill-gap
          categories need a defined defect-classification methodology this app hasn't settled on yet,
          not just a query.
        </DemoDataBanner>
      </header>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {HR_KPIS.map((kpi) => (
          <KpiMetricCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <GlassPanel
          title="Feature vs fix allocation"
          subtitle="Real resolved-item split per assignee (story=feature, bug=fix, task=maintenance)"
          className="xl:col-span-2"
        >
          <AllocationChart assignees={allocation.data?.assignees} />
        </GlassPanel>

        <GlassPanel title="Knowledge silo detection" subtitle="Bus-factor risk by label/tag, on resolved bugs (Jira labels or Azure DevOps tags)">
          <SiloAlerts labels={silo.data?.labels} />
        </GlassPanel>

        <GlassPanel
          title="Quality-to-effort consistency"
          subtitle="Real velocity (items resolved per sprint) vs. defect leakage rate — two real series, not a composite score"
          className="xl:col-span-2"
        >
          <ConsistencyChart data={consistencyData} />
        </GlassPanel>

        <GlassPanel title="Skill gap & training" subtitle="Derived from recurring defect categories">
          <TrainingList />
        </GlassPanel>

        <GlassPanel
          title="Developer health profiles"
          subtitle="Workload strain, after-hours activity and P0/P1 load — real, from commits and work items"
          className="xl:col-span-3"
          bodyClassName="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {data?.developers.length === 0 && (
            <p className="text-sm text-muted-foreground">No developers found for this organization yet.</p>
          )}
          {data?.developers.map((dev) => (
            <DeveloperProfileCard key={dev.id} dev={dev} burnoutFormula={data.burnoutFormula} />
          ))}
          <p className="border-t border-glass-border/60 pt-3 text-[11px] text-muted-foreground md:col-span-2 xl:col-span-3">
            This is a burnout/wellbeing signal — not logged-hours utilization or ticket counts.{" "}
            <Link to="/dashboard" className="text-primary hover:underline">
              See Team Utilization &amp; Cost →
            </Link>
          </p>
        </GlassPanel>

        <GlassPanel
          title="Assignee workload"
          subtitle="Open/in-progress/resolved item counts per real assignee from Jira or Azure DevOps — no QualiMetrix account required. Logged hours come from Jira worklogs only (Azure DevOps has no per-entry worklog API); other providers show 0 there, not an error."
          className="xl:col-span-3"
        >
          {workload.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading assignee workload…</p>
          ) : workload.isError ? (
            <div className="text-sm text-muted-foreground">
              Couldn't load assignee workload.{" "}
              <button type="button" className="text-primary hover:underline" onClick={() => workload.refetch()}>
                Retry
              </button>
            </div>
          ) : !workload.data?.assignees.length ? (
            <p className="text-sm text-muted-foreground">No assigned work items synced yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-glass-border/60 text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Assignee</th>
                    <th className="py-2 pr-4 font-medium">Open</th>
                    <th className="py-2 pr-4 font-medium">In progress</th>
                    <th className="py-2 pr-4 font-medium">Resolved</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 pr-4 font-medium">Hours logged</th>
                  </tr>
                </thead>
                <tbody>
                  {workload.data.assignees.map((a) => (
                    <tr key={a.externalAssigneeId} className="border-b border-glass-border/30 last:border-0">
                      <td className="py-2 pr-4 font-medium">{a.displayName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{a.itemsByStatus.open ?? 0}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{a.itemsByStatus.in_progress ?? 0}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {(a.itemsByStatus.resolved ?? 0) + (a.itemsByStatus.completed ?? 0)}
                      </td>
                      <td className="py-2 pr-4">{a.totalItems}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatHours(a.hoursLoggedSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {workload.data.unassignedCount > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {workload.data.unassignedCount} synced item{workload.data.unassignedCount === 1 ? "" : "s"} have no assignee in Jira.
                </p>
              )}
            </div>
          )}
          <p className="mt-4 border-t border-glass-border/60 pt-3 text-[11px] text-muted-foreground">
            This is raw ticket counts — not a burnout signal or logged-hours cost.{" "}
            <Link to="/dashboard" className="text-primary hover:underline">
              See Team Utilization &amp; Cost →
            </Link>
          </p>
        </GlassPanel>
      </div>
    </AppShell>
  );
}
