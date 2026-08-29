import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { KpiMetricCard } from "@/components/qm/KpiMetricCard";
import { CircularProgress } from "@/components/qm/CircularProgress";
import { useAuth } from "@/lib/auth-context";
import { useCurrentProduct } from "@/lib/product-context";
import { DefectHeatmap } from "@/components/qm/DefectHeatmap";
import { DeliverablesFeed, deliverableRecordToItem } from "@/components/qm/DeliverablesFeed";
import { BottleneckList, RtmTable } from "@/components/qm/tables";
import { ExecutionTrendChart, MttrChart, VelocityChart } from "@/components/qm/charts";
import { ProductHealthList } from "@/components/qm/ProductHealthList";
import { SimilarBugs } from "@/components/qm/SimilarBugs";
import { BugDomainDonut } from "@/components/qm/BugDomainDonut";
import { BUGS } from "@/lib/qm-bugs";
import { KPIS, ROLES, type Kpi } from "@/lib/qm-data";
import { liveKpi } from "@/lib/kpi-utils";
import {
  useMttr,
  useDefectLeakage,
  useTestExecutionMetrics,
  useVelocityTrend,
  useReleaseReadiness,
  useTenantAnalytics,
  useProductDeliverables,
} from "@/lib/queries/analytics";

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

const pct = (n: number) => `${n.toFixed(1)}%`;
const hrs = (n: number) => `${n.toFixed(1)} hrs`;

function Dashboard() {
  const { user, isLoading } = useAuth();
  const current = ROLES.find((r) => r.id === user?.role);
  const {
    currentProduct,
    isPortfolioView,
    isLoading: productsLoading,
  } = useCurrentProduct();

  const productId = currentProduct?.id;
  // Fires once either a specific product is selected, or the role is
  // confirmed portfolio-scoped (pm/executive with none selected) — the
  // backend rejects an omitted productId for any other role.
  const queryEnabled = !productsLoading && (!!productId || isPortfolioView);

  const mttr = useMttr(productId, queryEnabled);
  const defectLeakage = useDefectLeakage(productId, queryEnabled);
  const testMetrics = useTestExecutionMetrics(productId, queryEnabled);
  const velocityTrend = useVelocityTrend(productId);
  const releaseReadiness = useReleaseReadiness(productId);
  const deliverables = useProductDeliverables(productId);
  const tenantAnalytics = useTenantAnalytics(user?.tenantId ?? undefined);

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

  const testerKpis: Kpi[] = [
    testMetrics.data
      ? liveKpi("Test Execution", testMetrics.data.passRate, pct, testMetrics.data.executionTrend.map((t) => t.passRate))
      : KPIS.tester[0],
    defectLeakage.data
      ? liveKpi("Defect Leakage Rate", defectLeakage.data.rate, pct, defectLeakage.data.trend.map((t) => t.rate), true)
      : KPIS.tester[1],
    KPIS.tester[2], // Bug Reopen Rate — no backend source (no reopen-history table)
    testMetrics.data
      ? liveKpi("Automation Ratio", testMetrics.data.automationRate, pct)
      : KPIS.tester[3],
  ];

  const developerKpis: Kpi[] = [
    mttr.data ? liveKpi("Bug MTTR", mttr.data.overall, hrs, mttr.data.trend.map((t) => t.mttr), true) : KPIS.developer[0],
    KPIS.developer[1], // First-time fix rate — no backend source
    KPIS.developer[2], // Defect density — needs LOC, not tracked
    KPIS.developer[3], // QA rejections — no backend source
  ];

  const poKpis: Kpi[] = [
    releaseReadiness.data
      ? liveKpi("Release Readiness", releaseReadiness.data.overallScore, (n) => `${n.toFixed(0)}%`)
      : KPIS.po[0],
    KPIS.po[1], // RTM coverage — testCoverage is hardcoded server-side, not real
    KPIS.po[2], // Open P0/P1 — not returned as a standalone figure today
    KPIS.po[3], // Regression pass rate — no backend source
  ];

  const executiveKpis: Kpi[] = [
    tenantAnalytics.data
      ? liveKpi("Quality Health Index", tenantAnalytics.data.overallQualityScore / 10, (n) => `${n.toFixed(1)} /10`)
      : KPIS.executive[0],
    KPIS.executive[1], // Cost of Quality — no financial data modeled
    KPIS.executive[2], // Automation ROI — no financial data modeled
    KPIS.executive[3], // Escaped defects — no clean single-figure match
  ];

  const kpisByRole: Record<string, Kpi[]> = {
    tester: testerKpis,
    developer: developerKpis,
    po: poKpis,
    executive: executiveKpis,
    pm: executiveKpis,
  };

  const deliverableItems = deliverables.data?.map(deliverableRecordToItem);
  const risks = releaseReadiness.data?.risks ?? [];

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
        {kpisByRole[role].map((kpi) => (
          <KpiMetricCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {role === "tester" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel
            title="Test execution trend"
            subtitle="Daily pass rate"
            className="xl:col-span-2"
          >
            <ExecutionTrendChart data={testMetrics.data?.executionTrend} />
          </GlassPanel>
          <GlassPanel title="Execution progress" subtitle={currentProduct?.name ?? "All products"}>
            <div className="flex flex-wrap items-center justify-around gap-4 py-2">
              <CircularProgress
                value={testMetrics.data ? Math.round(testMetrics.data.passRate) : 94}
                label="Pass rate"
                caption={testMetrics.data ? `${testMetrics.data.total} cases` : "412 cases"}
              />
              <CircularProgress
                value={testMetrics.data ? Math.round(testMetrics.data.automationRate) : 68}
                label="Automated"
                caption="of suite"
                tone="ops"
              />
            </div>
          </GlassPanel>
          <GlassPanel
            title="Operational deliverables"
            subtitle="Demos, docs, RCAs & manual testing"
            className="xl:col-span-2"
          >
            <DeliverablesFeed data={deliverableItems} />
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
            title="MTTR trend"
            subtitle={currentProduct ? `${currentProduct.name} · last sprints` : "Last sprints"}
            className="xl:col-span-2"
          >
            <MttrChart data={mttr.data?.trend} />
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
            <VelocityChart data={velocityTrend.data} />
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
          <GlassPanel title="Release readiness" subtitle={currentProduct?.name ?? "Select a product"}>
            <div className="flex flex-wrap items-center justify-around gap-4 py-2">
              <CircularProgress
                value={releaseReadiness.data?.overallScore ?? 91}
                label="Release ready"
                caption="score"
              />
              <CircularProgress value={87} label="RTM coverage" caption="requirements" tone="ops" />
            </div>
            <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              {risks.length > 0 ? (
                risks.map((risk) => (
                  <li key={risk} className="flex justify-between gap-2">
                    <span>{risk}</span>
                  </li>
                ))
              ) : (
                <li>{releaseReadiness.data?.recommendation ?? "No risks flagged yet"}</li>
              )}
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
            <DeliverablesFeed data={deliverableItems} />
          </GlassPanel>
        </div>
      )}

      {(role === "executive" || role === "pm") && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel
            title="Portfolio quality health"
            subtitle="Health score per active product"
          >
            <ProductHealthList products={tenantAnalytics.data?.products ?? []} />
          </GlassPanel>
          <GlassPanel
            title="Quality velocity trend"
            subtitle={currentProduct ? `${currentProduct.name} · velocity vs defect flow` : "Select a product for velocity trend"}
            className="xl:col-span-2"
          >
            <VelocityChart data={velocityTrend.data} />
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
