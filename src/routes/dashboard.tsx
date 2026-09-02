import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { KpiMetricCard } from "@/components/qm/KpiMetricCard";
import { CircularProgress } from "@/components/qm/CircularProgress";
import { useAuth } from "@/lib/auth-context";
import { useCurrentProduct } from "@/lib/product-context";
import { useDateRange } from "@/lib/date-range-context";
import { getWorkflowRuns } from "@/lib/github-data.service";
import { useProductRepositories, primaryRepo } from "@/lib/queries/product-repositories";
import { DefectHeatmap } from "@/components/qm/DefectHeatmap";
import { DeliverablesFeed, deliverableRecordToItem } from "@/components/qm/DeliverablesFeed";
import { BottleneckList, RtmTable } from "@/components/qm/tables";
import { ExecutionTrendChart, MttrChart, VelocityChart } from "@/components/qm/charts";
import { ProductHealthList } from "@/components/qm/ProductHealthList";
import { SimilarBugs } from "@/components/qm/SimilarBugs";
import { BugDomainDonut } from "@/components/qm/BugDomainDonut";
import { DemoDataBadge } from "@/components/qm/DemoDataNotice";
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
  useBugLabelDistribution,
  useOpenP0P1Count,
  useReopenMetrics,
  useQaBottlenecks,
  useMostRecentBugId,
  useSimilarBugs,
  useRequirementTraceability,
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

interface KpiTile {
  kpi: Kpi;
  isDemo: boolean;
}
const live = (kpi: Kpi): KpiTile => ({ kpi, isDemo: false });
const demo = (kpi: Kpi): KpiTile => ({ kpi, isDemo: true });

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
  const { startDate, endDate } = useDateRange();

  const mttr = useMttr(productId, queryEnabled, startDate, endDate);
  const defectLeakage = useDefectLeakage(productId, queryEnabled, startDate, endDate);
  const testMetrics = useTestExecutionMetrics(productId, queryEnabled, startDate, endDate);
  const velocityTrend = useVelocityTrend(productId, queryEnabled, startDate, endDate);
  const releaseReadiness = useReleaseReadiness(productId);
  const deliverables = useProductDeliverables(productId);
  const tenantAnalytics = useTenantAnalytics(user?.tenantId ?? undefined);
  const bugLabelDistribution = useBugLabelDistribution(productId, queryEnabled, startDate, endDate);
  const openP0P1 = useOpenP0P1Count(productId, queryEnabled);
  const reopenMetrics = useReopenMetrics(productId, queryEnabled, startDate, endDate);
  const qaBottlenecks = useQaBottlenecks(productId, queryEnabled);
  const mostRecentBugId = useMostRecentBugId(productId);
  const similarBugs = useSimilarBugs(productId, mostRecentBugId.data);
  const requirementTraceability = useRequirementTraceability(productId, queryEnabled);

  // Same source FilterBar's GitHubRepoPill reads — the current product's
  // mapped ProductRepository row(s) — instead of the old localStorage
  // key + window event, which had no relationship to what's actually
  // mapped and let the CI panel query repos the backend now 403s on.
  const productRepos = useProductRepositories(productId);
  const selectedRepo = primaryRepo(productRepos.data);
  const [repoOwner, repoName] = selectedRepo?.split("/") ?? [undefined, undefined];
  const workflowRuns = useQuery({
    queryKey: ["github-workflow-runs", repoOwner, repoName],
    queryFn: () => getWorkflowRuns(repoOwner!, repoName!, 30),
    enabled: !!repoOwner && !!repoName,
  });
  const completedRuns = (workflowRuns.data ?? []).filter((r) => r.status === "completed");
  const passedRuns = completedRuns.filter((r) => r.conclusion === "success");
  const ciPassRate = completedRuns.length > 0 ? Math.round((passedRuns.length / completedRuns.length) * 100) : null;

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

  // `hasData` (not just "the query resolved") gates every live KPI below —
  // the backend returns a real object even for a product with zero synced
  // activity, so checking `.data` truthiness alone would render fabricated
  // zeros as if they were measured. `isDemo` tracks the fallback so the tile
  // can visibly say so, instead of a mock number sitting unmarked next to
  // real ones.
  const testerKpis: KpiTile[] = [
    testMetrics.data?.hasData
      ? live(liveKpi("Test Execution", testMetrics.data.passRate, pct, testMetrics.data.executionTrend.map((t) => t.passRate)))
      : demo(KPIS.tester[0]),
    defectLeakage.data?.hasData
      ? live(liveKpi("Defect Leakage Rate", defectLeakage.data.rate, pct, defectLeakage.data.trend.map((t) => t.rate), true))
      : demo(KPIS.tester[1]),
    reopenMetrics.data?.hasData
      ? live(liveKpi("Bug Reopen Rate", reopenMetrics.data.reopenRate, pct, undefined, true))
      : demo(KPIS.tester[2]),
    testMetrics.data?.hasData
      ? live(liveKpi("Automation Ratio", testMetrics.data.automationRate, pct))
      : demo(KPIS.tester[3]),
  ];

  const developerKpis: KpiTile[] = [
    mttr.data?.hasData
      ? live(liveKpi("Bug MTTR", mttr.data.overall, hrs, mttr.data.trend.map((t) => t.mttr), true))
      : demo(KPIS.developer[0]),
    reopenMetrics.data?.hasData
      ? live(liveKpi("First-Time Fix Rate", reopenMetrics.data.firstTimeFixRate, pct))
      : demo(KPIS.developer[1]),
    demo(KPIS.developer[2]), // Defect density — needs LOC, not tracked
    demo(KPIS.developer[3]), // QA rejections — no backend source
  ];

  const poKpis: KpiTile[] = [
    releaseReadiness.data?.hasData
      ? live(liveKpi("Release Readiness", releaseReadiness.data.overallScore, (n) => `${n.toFixed(0)}%`))
      : demo(KPIS.po[0]),
    demo(KPIS.po[1]), // RTM coverage — testCoverage has no data source (see components.testCoverage)
    openP0P1.data?.hasData
      ? live(liveKpi("Open P0/P1", openP0P1.data.count, (n) => `${n}`, undefined, true))
      : demo(KPIS.po[2]),
    demo(KPIS.po[3]), // Regression pass rate — no backend source
  ];

  const executiveKpis: KpiTile[] = [
    tenantAnalytics.data?.hasData
      ? live(liveKpi("Quality Health Index", tenantAnalytics.data.overallQualityScore / 10, (n) => `${n.toFixed(1)} /10`))
      : demo(KPIS.executive[0]),
    demo(KPIS.executive[1]), // Cost of Quality — no financial data modeled
    demo(KPIS.executive[2]), // Automation ROI — no financial data modeled
    demo(KPIS.executive[3]), // Escaped defects — no clean single-figure match
  ];

  const kpisByRole: Record<string, KpiTile[]> = {
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
        <FilterBar showRepository />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpisByRole[role].map(({ kpi, isDemo }) => (
          <KpiMetricCard key={kpi.label} kpi={kpi} isDemo={isDemo} />
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
                value={testMetrics.data ? Math.round(testMetrics.data.passRate) : 0}
                unavailable={!testMetrics.data?.hasData}
                label="Pass rate"
                caption={testMetrics.data ? `${testMetrics.data.total} cases` : undefined}
              />
              <CircularProgress
                value={testMetrics.data ? Math.round(testMetrics.data.automationRate) : 0}
                unavailable={!testMetrics.data?.hasData}
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
          <GlassPanel
            title="Defect distribution heatmap"
            subtitle="Open defects per Jira label"
            action={!bugLabelDistribution.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <DefectHeatmap distribution={bugLabelDistribution.data?.distribution} hasData={bugLabelDistribution.data?.hasData} />
          </GlassPanel>
          <GlassPanel
            title="Related / similar bugs"
            subtitle="Duplicate screening on the newest report"
            className="xl:col-span-2"
            action={!similarBugs.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <SimilarBugs hasData={similarBugs.data?.hasData} matches={similarBugs.data?.similar} isLoading={mostRecentBugId.isLoading || similarBugs.isLoading} />
          </GlassPanel>
          <GlassPanel title="Bug domain distribution" subtitle="Auto-tagged defect layers" action={!bugLabelDistribution.data?.hasData ? <DemoDataBadge /> : undefined}>
            <BugDomainDonut distribution={bugLabelDistribution.data?.distribution} hasData={bugLabelDistribution.data?.hasData} />
          </GlassPanel>

        </div>
      )}

      {role === "developer" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel
            title="MTTR trend"
            subtitle={currentProduct ? `${currentProduct.name} · recent sprints or weeks` : "Recent sprints or weeks"}
            className="xl:col-span-2"
          >
            <MttrChart data={mttr.data?.trend} />
          </GlassPanel>
          <GlassPanel
            title="QA bottleneck alerts"
            subtitle="Items waiting on QA or rework"
            action={!qaBottlenecks.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <BottleneckList bottlenecks={qaBottlenecks.data?.bottlenecks} hasData={qaBottlenecks.data?.hasData} />
          </GlassPanel>
          <GlassPanel
            title="Defect distribution heatmap"
            subtitle="Open defects by Jira label"
            action={!bugLabelDistribution.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <DefectHeatmap distribution={bugLabelDistribution.data?.distribution} hasData={bugLabelDistribution.data?.hasData} />
          </GlassPanel>
          <GlassPanel
            title="Velocity vs defect flow"
            subtitle="Issues completed against bugs created / resolved"
            className="xl:col-span-2"
          >
            <VelocityChart
              data={velocityTrend.data}
              emptyMessage={
                currentProduct
                  ? `No completed work yet for ${currentProduct.name}.`
                  : "Select a product to see its velocity trend."
              }
            />
          </GlassPanel>
          <GlassPanel
            title="Related / similar bugs"
            subtitle="Check before you start: this may already be fixed"
            action={!similarBugs.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <SimilarBugs hasData={similarBugs.data?.hasData} matches={similarBugs.data?.similar} isLoading={mostRecentBugId.isLoading || similarBugs.isLoading} />
          </GlassPanel>
          <GlassPanel
            title="Bug domain distribution"
            subtitle="Where defects concentrate across layers"
            className="xl:col-span-2"
            action={!bugLabelDistribution.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <BugDomainDonut distribution={bugLabelDistribution.data?.distribution} hasData={bugLabelDistribution.data?.hasData} />
          </GlassPanel>

        </div>
      )}

      {role === "po" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel title="Release readiness" subtitle={currentProduct?.name ?? "Select a product"}>
            <div className="flex flex-wrap items-center justify-around gap-4 py-2">
              <CircularProgress
                value={releaseReadiness.data?.overallScore ?? 0}
                unavailable={!releaseReadiness.data?.hasData}
                label="Release ready"
                caption="score"
              />
              <CircularProgress value={0} unavailable label="RTM coverage" caption="no traceability data source" tone="ops" />
            </div>
            <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              {risks.length > 0 ? (
                risks.map((risk) => (
                  <li key={risk} className="flex justify-between gap-2">
                    <span>{risk}</span>
                  </li>
                ))
              ) : (
                <li>{releaseReadiness.data?.recommendation ?? "Loading…"}</li>
              )}
            </ul>
          </GlassPanel>
          <GlassPanel
            title="Requirements traceability matrix"
            subtitle="Requirement → linked defects → status, from real Jira/ADO issue links"
            className="xl:col-span-2"
            action={!requirementTraceability.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <RtmTable requirements={requirementTraceability.data?.requirements} hasData={requirementTraceability.data?.hasData} />
          </GlassPanel>
          <GlassPanel
            title="Feature defect heatmap"
            subtitle="Unstable Jira labels across the release"
            className="xl:col-span-2"
            action={!bugLabelDistribution.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <DefectHeatmap distribution={bugLabelDistribution.data?.distribution} hasData={bugLabelDistribution.data?.hasData} />
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
            subtitle={currentProduct ? `${currentProduct.name} · issues completed vs defect flow` : "Portfolio · issues completed vs defect flow"}
            className="xl:col-span-2"
          >
            <VelocityChart
              data={velocityTrend.data}
              emptyMessage={
                currentProduct
                  ? `No completed work yet for ${currentProduct.name}.`
                  : "No completed work yet across your portfolio."
              }
            />
          </GlassPanel>
          <GlassPanel
            title="Portfolio defect heatmap"
            subtitle="Aggregate open defects per Jira label"
            className="xl:col-span-2"
            action={!bugLabelDistribution.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <DefectHeatmap distribution={bugLabelDistribution.data?.distribution} hasData={bugLabelDistribution.data?.hasData} />
          </GlassPanel>
          <GlassPanel
            title="CI test automation"
            subtitle={selectedRepo ? `GitHub Actions · ${selectedRepo}` : "Select a repository to see CI activity"}
            action={ciPassRate === null ? <DemoDataBadge /> : undefined}
          >
            {!selectedRepo ? (
              <p className="text-sm text-muted-foreground">
                Pick a repository from the Repository filter above to see its automated test-run history.
              </p>
            ) : workflowRuns.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : ciPassRate === null ? (
              <p className="text-sm text-muted-foreground">
                No completed GitHub Actions runs yet for {selectedRepo}. This reflects real CI activity, not a
                test-management tool — there's no connected Xray/Zephyr/TestRail integration, so "% of test cases
                automated" isn't something this app can measure yet.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-around gap-4 py-2">
                <CircularProgress value={ciPassRate} label="CI pass rate" caption={`last ${completedRuns.length} runs`} tone="ops" />
                <div className="text-center">
                  <p className="text-3xl font-semibold">{completedRuns.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Automated runs (recent)</p>
                </div>
              </div>
            )}
          </GlassPanel>
        </div>
      )}
    </AppShell>
  );
}
