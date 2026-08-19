import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { KpiMetricCard } from "@/components/qm/KpiMetricCard";
import { CircularProgress } from "@/components/qm/CircularProgress";
import { useAuth } from "@/lib/auth-context";
import { DefectHeatmap } from "@/components/qm/DefectHeatmap";
import { DeliverablesFeed } from "@/components/qm/DeliverablesFeed";
import { BottleneckList, RtmTable } from "@/components/qm/tables";
import {
  ExecutionTrendChart,
  MttrChart,
  PortfolioRadar,
  VelocityChart,
} from "@/components/qm/charts";
import { SimilarBugs } from "@/components/qm/SimilarBugs";
import { BugDomainDonut } from "@/components/qm/BugDomainDonut";
import { BUGS } from "@/lib/qm-bugs";
import { KPIS, ROLES } from "@/lib/qm-data";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "QualiMetrix — Quality & Team Performance Hub" },
      {
        name: "description",
        content:
          "Role-based QA analytics: test execution, defect leakage, MTTR, release readiness and portfolio quality health in one glass dashboard.",
      },
      { property: "og:title", content: "QualiMetrix — Quality Intelligence Dashboard" },
      {
        property: "og:description",
        content:
          "Track product quality and team productivity across Jira, Azure DevOps and manual deliverables.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, isLoading } = useAuth();
  const current = ROLES.find((r) => r.id === user?.role);

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      </AppShell>
    );
  }

  if (!current) {
    return (
      <AppShell>
        <GlassPanel title="No role assigned yet">
          <p className="text-sm text-muted-foreground">
            Your account doesn't have a role yet. Ask your PM to assign one before you can see a
            dashboard.
          </p>
        </GlassPanel>
      </AppShell>
    );
  }

  const role = current.id;

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">
            Quality &amp; Performance Hub
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {current.label} perspective · {current.blurb}
          </p>
        </div>
      </header>

      <div className="mb-5">
        <FilterBar />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS[role].map((kpi) => (
          <KpiMetricCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {role === "tester" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel
            title="Test execution by sprint"
            subtitle="Pass / fail / blocked outcomes"
            className="xl:col-span-2"
          >
            <ExecutionTrendChart />
          </GlassPanel>
          <GlassPanel title="Execution progress" subtitle="Sprint 12 · all suites">
            <div className="flex flex-wrap items-center justify-around gap-4 py-2">
              <CircularProgress value={94} label="Executed" caption="412 cases" />
              <CircularProgress value={68} label="Automated" caption="of suite" tone="ops" />
            </div>
          </GlassPanel>
          <GlassPanel
            title="Operational deliverables"
            subtitle="Demos, docs, RCAs & manual testing"
            className="xl:col-span-2"
          >
            <DeliverablesFeed />
          </GlassPanel>
          <GlassPanel title="Defect density heatmap" subtitle="Open defects per module">
            <DefectHeatmap />
          </GlassPanel>
          <GlassPanel
            title="Related / similar bugs"
            subtitle="Duplicate screening on the newest report"
            className="xl:col-span-2"
          >
            <SimilarBugs bug={BUGS[0]} />
          </GlassPanel>
          <GlassPanel title="Bug domain distribution" subtitle="Auto-tagged defect layers">
            <BugDomainDonut />
          </GlassPanel>

        </div>
      )}

      {role === "developer" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel
            title="MTTR & first-time fix rate"
            subtitle="Squad Nova · last 7 sprints"
            className="xl:col-span-2"
          >
            <MttrChart />
          </GlassPanel>
          <GlassPanel title="QA bottleneck alerts" subtitle="Items waiting on QA or rework">
            <BottleneckList />
          </GlassPanel>
          <GlassPanel title="Defect density heatmap" subtitle="Modules you touched this sprint">
            <DefectHeatmap />
          </GlassPanel>
          <GlassPanel
            title="Velocity vs defect flow"
            subtitle="Story points against bugs created / resolved"
            className="xl:col-span-2"
          >
            <VelocityChart />
          </GlassPanel>
          <GlassPanel
            title="Related / similar bugs"
            subtitle="Check before you start: this may already be fixed"
          >
            <SimilarBugs bug={BUGS[2]} />
          </GlassPanel>
          <GlassPanel
            title="Bug domain distribution"
            subtitle="Where defects concentrate across layers"
            className="xl:col-span-2"
          >
            <BugDomainDonut />
          </GlassPanel>

        </div>
      )}

      {role === "po" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel title="Release readiness" subtitle="Release 24.7 scorecard">
            <div className="flex flex-wrap items-center justify-around gap-4 py-2">
              <CircularProgress value={91} label="Release ready" caption="score" />
              <CircularProgress value={87} label="RTM coverage" caption="requirements" tone="ops" />
            </div>
            <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <li className="flex justify-between">
                <span>Open P0 / P1 defects</span>
                <span className="font-medium text-critical">4</span>
              </li>
              <li className="flex justify-between">
                <span>Regression pass rate</span>
                <span className="font-medium text-good">96%</span>
              </li>
              <li className="flex justify-between">
                <span>Stories without test coverage</span>
                <span className="font-medium text-warning">3</span>
              </li>
            </ul>
          </GlassPanel>
          <GlassPanel
            title="Requirements traceability matrix"
            subtitle="Story → test cases → bug status"
            className="xl:col-span-2"
          >
            <RtmTable />
          </GlassPanel>
          <GlassPanel
            title="Feature defect heatmap"
            subtitle="Unstable modules across the release"
            className="xl:col-span-2"
          >
            <DefectHeatmap />
          </GlassPanel>
          <GlassPanel title="Recent deliverables" subtitle="Demos, docs & RCAs">
            <DeliverablesFeed />
          </GlassPanel>
        </div>
      )}

      {(role === "executive" || role === "pm") && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel
            title="Multi-product quality health"
            subtitle="Quality · stability · velocity · ROI · automation"
          >
            <PortfolioRadar />
          </GlassPanel>
          <GlassPanel
            title="Quality velocity trend"
            subtitle="Velocity overlaid with bug creation & resolution"
            className="xl:col-span-2"
          >
            <VelocityChart />
          </GlassPanel>
          <GlassPanel
            title="Portfolio defect heatmap"
            subtitle="Aggregate open defects per module"
            className="xl:col-span-2"
          >
            <DefectHeatmap />
          </GlassPanel>
          <GlassPanel title="Automation ROI" subtitle="Coverage vs manual effort saved">
            <div className="flex flex-wrap items-center justify-around gap-4 py-2">
              <CircularProgress value={68} label="Automation coverage" tone="ops" />
              <CircularProgress value={82} label="Manual effort saved" />
            </div>
          </GlassPanel>
        </div>
      )}
    </AppShell>
  );
}
