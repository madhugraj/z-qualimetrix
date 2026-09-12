import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { KpiMetricCard } from "@/components/qm/KpiMetricCard";
import { CircularProgress } from "@/components/qm/CircularProgress";
import { useAuth } from "@/lib/auth-context";
import { getTimeOfDayGreeting } from "@/lib/greeting";
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
import { PortfolioInsights, buildPortfolioInsights } from "@/components/qm/PortfolioInsights";
import { DataTable, BarCell } from "@/components/qm/DataTable";
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
  useEpicRollups,
  useCycleTimeByStage,
  useTeamUtilization,
  useTeamCost,
  useProjectsOverview,
  useWorklogAuthors,
  useSetWorklogAuthorRate,
} from "@/lib/queries/analytics";
import { useBacklogSummary } from "@/lib/queries/backlog";
import { useState } from "react";
import { cn } from "@/lib/utils";

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
const dollars = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

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
  // Team cost/utilization and tenant-wide analytics are pm/executive-only
  // server-side (analytics.controller.ts) — gate the queries the same way
  // projectsOverview/worklogAuthors already are below, or a tester/developer/
  // po loading this page gets a needless 403 for data never even rendered
  // to them.
  const canViewPortfolio = current?.id === "pm" || current?.id === "executive";

  const mttr = useMttr(productId, queryEnabled, startDate, endDate);
  const defectLeakage = useDefectLeakage(productId, queryEnabled, startDate, endDate);
  const testMetrics = useTestExecutionMetrics(productId, queryEnabled, startDate, endDate);
  const velocityTrend = useVelocityTrend(productId, queryEnabled, startDate, endDate);
  const releaseReadiness = useReleaseReadiness(productId);
  const deliverables = useProductDeliverables(productId);
  const tenantAnalytics = useTenantAnalytics(user?.tenantId ?? undefined, canViewPortfolio);
  const bugLabelDistribution = useBugLabelDistribution(productId, queryEnabled, startDate, endDate);
  const openP0P1 = useOpenP0P1Count(productId, queryEnabled);
  const reopenMetrics = useReopenMetrics(productId, queryEnabled, startDate, endDate);
  const qaBottlenecks = useQaBottlenecks(productId, queryEnabled);
  const mostRecentBugId = useMostRecentBugId(productId);
  const similarBugs = useSimilarBugs(productId, mostRecentBugId.data);
  const requirementTraceability = useRequirementTraceability(productId, queryEnabled);
  // Portfolio-level insight feed — pm/executive only, but fetched
  // unconditionally alongside everything else above rather than gated
  // behind role, since hooks can't be called conditionally.
  const backlogSummary = useBacklogSummary(productId, queryEnabled);
  const epicRollups = useEpicRollups(productId, queryEnabled, 500);
  const cycleTimeByStage = useCycleTimeByStage(productId, queryEnabled);
  const portfolioInsights = buildPortfolioInsights({
    backlogSummary: backlogSummary.data,
    epicSummary: epicRollups.data?.summary,
    cycleTime: cycleTimeByStage.data,
  });
  const teamUtilization = useTeamUtilization(productId, queryEnabled && canViewPortfolio, startDate, endDate);
  const teamCost = useTeamCost(productId, queryEnabled && canViewPortfolio, startDate, endDate);
  const projectsOverview = useProjectsOverview(queryEnabled && canViewPortfolio);
  const worklogAuthors = useWorklogAuthors(queryEnabled && current?.id === "pm");
  const setWorklogAuthorRate = useSetWorklogAuthorRate();
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});

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

  // Plain-language reads on two of the charts below — a raw chart shows
  // what happened, these say what it means, so the panel doesn't require
  // the viewer to do the arithmetic themselves.
  const bugLabelSorted = bugLabelDistribution.data?.distribution ?? [];
  const bugLabelTotal = bugLabelSorted.reduce((sum, d) => sum + d.count, 0);
  const topBugLabel = bugLabelSorted[0];
  const topBugLabelInsight = (() => {
    if (!topBugLabel || bugLabelTotal === 0) return null;
    const topPercent = Math.round((topBugLabel.count / bugLabelTotal) * 100);
    // "Unlabeled" being the top slice isn't an actionable module to go fix
    // — it's a tagging-discipline gap, and pretending otherwise would point
    // a PM at a fake lever. Say so plainly instead.
    if (topBugLabel.label === "Unlabeled") {
      return `${topPercent}% of open defects (${topBugLabel.count} of ${bugLabelTotal}) have no label at all, so this chart can't yet tell you where they concentrate. Fixing bug-tagging discipline at triage is the actual first lever here — once labeled, this same panel will show exactly where to focus.`;
    }
    const top3 = bugLabelSorted.slice(0, 3);
    const top3Count = top3.reduce((sum, d) => sum + d.count, 0);
    const top3Percent = Math.round((top3Count / bugLabelTotal) * 100);
    return `"${topBugLabel.label}" alone is ${topPercent}% of open defects (${topBugLabel.count} of ${bugLabelTotal}). Your top ${top3.length} labels together account for ${top3Percent}% — a focused regression pass on just those areas would move the portfolio number more than spreading QA effort evenly across everything.`;
  })();

  const velocityWindow = velocityTrend.data ?? [];
  const velocityCreated = velocityWindow.reduce((sum, p) => sum + p.created, 0);
  const velocityResolved = velocityWindow.reduce((sum, p) => sum + p.resolved, 0);
  const velocityInsight =
    velocityWindow.length > 0
      ? velocityCreated > velocityResolved
        ? `Bugs are arriving faster than they're being resolved over this window (${velocityCreated} created vs ${velocityResolved} resolved) — the open queue is growing.`
        : velocityResolved > velocityCreated
          ? `Resolving faster than new bugs arrive over this window (${velocityResolved} resolved vs ${velocityCreated} created) — the open queue is shrinking.`
          : `Created and resolved are roughly balanced over this window (${velocityCreated} vs ${velocityResolved}).`
      : null;

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
  const displayName = user?.name?.split(" ")[0] || user?.email?.split("@")[0];

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          {displayName && (
            <p className="text-sm font-medium text-muted-foreground">
              {getTimeOfDayGreeting()}, {displayName}
            </p>
          )}
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
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
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
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
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
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
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
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
          <GlassPanel
            title="Needs attention — Portfolio"
            subtitle="Plain-language findings from real backlog and epic data, most urgent first"
            className="xl:col-span-3"
          >
            <PortfolioInsights insights={portfolioInsights} />
          </GlassPanel>
          {/* Two independent stacked columns (not a shared grid row) — a
              product-count-driven list and a fixed-height chart can't share
              a row height without one of them leaving a ragged gap. */}
          <div className="grid grid-cols-1 gap-4 xl:col-span-3 xl:grid-cols-3">
            <div className="flex flex-col gap-4 xl:col-span-1">
              <GlassPanel
                title="Portfolio quality health"
                subtitle="Health score per active product"
              >
                <ProductHealthList products={tenantAnalytics.data?.products ?? []} />
              </GlassPanel>
              <GlassPanel
                title="CI test automation"
                subtitle={selectedRepo ? `GitHub Actions · ${selectedRepo}` : "Select a repository to see CI activity"}
                action={ciPassRate === null ? <DemoDataBadge /> : undefined}
              >
                {!selectedRepo ? (
                  <p className="text-sm text-muted-foreground">
                    Pick a repository from the Repository filter above.
                  </p>
                ) : workflowRuns.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : ciPassRate === null ? (
                  <p className="text-sm text-muted-foreground">
                    No completed runs yet for {selectedRepo}. No Xray/Zephyr/TestRail connected, so this reflects
                    CI activity only, not test-management coverage.
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
            <div className="flex flex-col gap-4 xl:col-span-2">
              <GlassPanel
                title="Quality velocity trend"
                subtitle={currentProduct ? `${currentProduct.name} · issues completed vs defect flow` : "Portfolio · issues completed vs defect flow"}
              >
                <VelocityChart
                  data={velocityTrend.data}
                  emptyMessage={
                    currentProduct
                      ? `No completed work yet for ${currentProduct.name}.`
                      : "No completed work yet across your portfolio."
                  }
                />
                {velocityInsight && <p className="mt-3 text-xs text-muted-foreground">{velocityInsight}</p>}
              </GlassPanel>
              <GlassPanel
                title="Portfolio defect heatmap"
                subtitle="Open defects per label"
                action={!bugLabelDistribution.data?.hasData ? <DemoDataBadge /> : undefined}
              >
                <DefectHeatmap distribution={bugLabelDistribution.data?.distribution} hasData={bugLabelDistribution.data?.hasData} />
                {topBugLabelInsight && <p className="mt-3 text-xs text-muted-foreground">{topBugLabelInsight}</p>}
              </GlassPanel>
            </div>
          </div>
          <GlassPanel
            title="Where work gets stuck"
            subtitle="Real dwell time per workflow stage, from Jira status history"
            className="xl:col-span-3"
            action={!cycleTimeByStage.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            {cycleTimeByStage.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !cycleTimeByStage.data?.hasData ? (
              <p className="text-sm text-muted-foreground">
                Not enough status-transition history synced yet for this scope to compute stage-by-stage timing.
              </p>
            ) : (
              <>
                {(() => {
                  const stages = cycleTimeByStage.data.stages.slice(0, 8);
                  const maxTotalDays = Math.max(...stages.map((s) => s.totalDays), 1);
                  return (
                    <DataTable
                      rows={stages}
                      rowKey={(s) => s.status}
                      defaultSortKey="total"
                      defaultSortDir="desc"
                      columns={[
                        {
                          key: "stage",
                          label: "Stage",
                          sortValue: (s) => s.status.toLowerCase(),
                          className: "w-32",
                          render: (s) => <span className="font-medium">{s.status}</span>,
                        },
                        {
                          key: "total",
                          label: "Total lost",
                          align: "right",
                          sortValue: (s) => s.totalDays,
                          render: (s) => (
                            <BarCell
                              value={s.totalDays}
                              max={maxTotalDays}
                              label={`${Math.round(s.totalDays)}d`}
                              tone={s.status === cycleTimeByStage.data!.bottleneckStage ? "bg-critical" : "bg-primary"}
                              labelClassName={s.status === cycleTimeByStage.data!.bottleneckStage ? "font-semibold text-critical" : undefined}
                            />
                          ),
                        },
                        {
                          key: "avg",
                          label: "Avg/item",
                          align: "right",
                          sortValue: (s) => s.avgDays,
                          render: (s) => <span className="text-muted-foreground">{s.avgDays}d</span>,
                        },
                        {
                          key: "count",
                          label: "Items",
                          align: "right",
                          sortValue: (s) => s.transitionCount,
                          render: (s) => <span className="text-muted-foreground">{s.transitionCount}</span>,
                        },
                      ]}
                    />
                  );
                })()}
                <p className="mt-3 text-xs text-muted-foreground">
                  Sorted by total team-days lost by default (average x volume) — click any header to re-sort.
                  A rare slow outlier can't outrank the real bottleneck this way.
                </p>
              </>
            )}
          </GlassPanel>

          <GlassPanel
            title="Team"
            subtitle="Real logged hours — utilization against an assumed capacity, and cost against a rate you set"
            className="xl:col-span-3"
          >
            <p className="-mt-2 mb-4 text-[11px] text-muted-foreground">
              Also see:{" "}
              <Link to="/engineering-health" className="text-primary hover:underline">
                Developer health profiles &amp; Assignee workload → Engineering Health
              </Link>
            </p>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Utilization</h3>
                  {!teamUtilization.data?.hasData && <DemoDataBadge />}
                </div>
                {teamUtilization.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : !teamUtilization.data?.hasData ? (
                  <p className="text-sm text-muted-foreground">No worklog hours synced yet.</p>
                ) : (
                  <>
                    <DataTable
                      dense
                      rows={teamUtilization.data.people.slice(0, 6)}
                      rowKey={(p) => p.authorAccountId ?? p.name}
                      defaultSortKey="utilization"
                      defaultSortDir="desc"
                      columns={[
                        {
                          key: "name",
                          label: "Person",
                          sortValue: (p) => p.name.toLowerCase(),
                          render: (p) => <span className="font-medium">{p.name}</span>,
                        },
                        {
                          key: "utilization",
                          label: "Utilization",
                          align: "right",
                          sortValue: (p) => p.utilizationPercent,
                          render: (p) => {
                            // 3-tier so a real 256% overload reads
                            // differently from a mild 105% — a flat
                            // over/under-100% split can't tell "slightly
                            // busy" from "logging 2.5x a normal week"
                            // (likely multi-project double counting, or a
                            // real burnout risk either way).
                            const tone = p.utilizationPercent >= 150 ? "bg-critical" : p.utilizationPercent > 100 ? "bg-warning" : "bg-primary";
                            const toneText = p.utilizationPercent >= 150 ? "font-semibold text-critical" : undefined;
                            return (
                              <BarCell value={p.utilizationPercent} max={150} label={pct(p.utilizationPercent)} tone={tone} labelClassName={toneText} />
                            );
                          },
                        },
                      ]}
                    />
                    <p className="mt-3 text-xs text-muted-foreground">
                      Portfolio average {pct(teamUtilization.data.avgUtilizationPercent ?? 0)} of an assumed
                      8h/business-day capacity — a stated assumption (no Jira leave/PTO calendar exists), not
                      measured availability.
                    </p>
                  </>
                )}
              </div>

              <div className="lg:border-l lg:border-glass-border/50 lg:pl-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cost</h3>
                  {!teamCost.data?.hasData && <DemoDataBadge />}
                </div>
                {teamCost.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : !teamCost.data?.hasData ? (
                  <p className="text-sm text-muted-foreground">No worklog hours synced yet.</p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-semibold">{dollars(teamCost.data.totalCostCents)}</p>
                      <p className="text-xs text-muted-foreground">
                        across {teamCost.data.people.length} rated {teamCost.data.people.length === 1 ? "person" : "people"}
                      </p>
                    </div>
                    {teamCost.data.people.length > 0 && (
                      <DataTable
                        dense
                        rows={teamCost.data.people.slice(0, 6)}
                        rowKey={(p) => p.name}
                        defaultSortKey="cost"
                        defaultSortDir="desc"
                        columns={[
                          {
                            key: "name",
                            label: "Person",
                            sortValue: (p) => p.name.toLowerCase(),
                            render: (p) => <span className="font-medium">{p.name}</span>,
                          },
                          {
                            key: "cost",
                            label: "Cost",
                            align: "right",
                            sortValue: (p) => p.costCents,
                            render: (p) => (
                              <BarCell
                                value={p.costCents}
                                max={Math.max(...teamCost.data!.people.map((x) => x.costCents), 1)}
                                label={dollars(p.costCents)}
                                tone="bg-good"
                              />
                            ),
                          },
                          {
                            key: "hours",
                            label: "Hours",
                            align: "right",
                            sortValue: (p) => p.loggedHours,
                            render: (p) => <span className="text-muted-foreground">{p.loggedHours}h</span>,
                          },
                        ]}
                      />
                    )}
                    {(teamCost.data.hoursWithoutRate > 0 || teamCost.data.unmatchedHours > 0) && (
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        +{Math.round(teamCost.data.hoursWithoutRate + teamCost.data.unmatchedHours)}h logged by
                        people with no rate set or an unmatched account — not included above. This total is a floor.
                      </p>
                    )}
                    {current?.id === "pm" && worklogAuthors.data && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-[11px] font-medium text-primary">
                          Set hourly rates
                        </summary>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Every name below is a real Jira/ADO worklog author — keyed by their account, not a
                          QualiMetrix login, so this works even where Jira hides their email.
                        </p>
                        <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                          {worklogAuthors.data.authors.map((a) => {
                            const currentValue = a.hourlyRateCents != null ? String(a.hourlyRateCents / 100) : "";
                            const draftValue = rateDrafts[a.authorAccountId] ?? currentValue;
                            const isDirty = draftValue !== currentValue;
                            return (
                              <li
                                key={a.authorAccountId}
                                className="flex items-center gap-2 rounded-lg border border-glass-border/50 bg-accent/10 px-2.5 py-1.5 text-xs"
                              >
                                <span className="flex-1 truncate font-medium">{a.authorName ?? a.authorAccountId}</span>
                                <span className="shrink-0 text-muted-foreground">{a.totalHours}h logged</span>
                                <span className="flex items-center gap-1 rounded-md border border-glass-border bg-background/60 px-1.5 py-0.5">
                                  <span className="text-muted-foreground">$</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={draftValue}
                                    onChange={(e) => setRateDrafts((d) => ({ ...d, [a.authorAccountId]: e.target.value }))}
                                    className="w-12 bg-transparent text-right outline-none"
                                    placeholder="0"
                                  />
                                  <span className="text-muted-foreground">/hr</span>
                                </span>
                                <button
                                  type="button"
                                  disabled={setWorklogAuthorRate.isPending || !isDirty}
                                  onClick={() => {
                                    const raw = rateDrafts[a.authorAccountId];
                                    const cents = raw === undefined || raw === "" ? null : Math.round(Number(raw) * 100);
                                    if (cents !== null && (Number.isNaN(cents) || cents < 0)) return;
                                    setWorklogAuthorRate.mutate({ authorAccountId: a.authorAccountId, authorName: a.authorName, hourlyRateCents: cents });
                                  }}
                                  className={cn(
                                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                                    isDirty ? "bg-primary text-primary-foreground hover:opacity-90" : "text-muted-foreground/40"
                                  )}
                                >
                                  Save
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>
            </div>
            <p className="mt-4 border-t border-glass-border/60 pt-3 text-[11px] text-muted-foreground">
              This is logged-hours utilization and cost — not a wellbeing or ticket-load signal.{" "}
              <Link to="/engineering-health" className="text-primary hover:underline">
                See Developer health profiles &amp; Assignee workload →
              </Link>
            </p>
          </GlassPanel>

          <GlassPanel
            title="Project portfolio"
            subtitle="Per-project status and team size"
            className="xl:col-span-3"
            action={!projectsOverview.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            {projectsOverview.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !projectsOverview.data?.projects.length ? (
              <p className="text-sm text-muted-foreground">No products yet.</p>
            ) : (
              (() => {
                const synced = projectsOverview.data.projects
                  .filter((p) => p.lastSyncedAt)
                  .sort((a, b) => (b.hasData ? b.healthScore : -1) - (a.hasData ? a.healthScore : -1));
                const unsynced = projectsOverview.data.projects.filter((p) => !p.lastSyncedAt);
                return (
                  <>
                    {synced.length > 0 && (
                      <DataTable
                        rows={synced}
                        rowKey={(p) => p.productId}
                        defaultSortKey="health"
                        defaultSortDir="desc"
                        columns={[
                          {
                            key: "project",
                            label: "Project",
                            sortValue: (p) => p.productName.toLowerCase(),
                            render: (p) => <span className="font-medium">{p.productName}</span>,
                          },
                          {
                            key: "synced",
                            label: "Synced",
                            sortValue: (p) => new Date(p.lastSyncedAt!).getTime(),
                            render: (p) => (
                              <span className="text-muted-foreground">{new Date(p.lastSyncedAt!).toLocaleDateString()}</span>
                            ),
                          },
                          {
                            key: "items",
                            label: "Items",
                            align: "right",
                            sortValue: (p) => p.totalWorkItems,
                            render: (p) => <span className="text-muted-foreground">{p.totalWorkItems}</span>,
                          },
                          {
                            key: "openBugs",
                            label: "Open bugs",
                            align: "right",
                            sortValue: (p) => p.openBugs,
                            render: (p) => (
                              <span className={p.openBugs > 0 ? "text-critical" : "text-muted-foreground"}>{p.openBugs}</span>
                            ),
                          },
                          {
                            key: "teamSize",
                            label: "Team size",
                            align: "right",
                            sortValue: (p) => p.teamSize || 0,
                            render: (p) => <span className="text-muted-foreground">{p.teamSize || "—"}</span>,
                          },
                          {
                            key: "health",
                            label: "Health",
                            align: "right",
                            sortValue: (p) => (p.hasData ? p.healthScore : -1),
                            render: (p) =>
                              p.hasData ? (
                                <BarCell
                                  value={p.healthScore}
                                  max={100}
                                  label={String(p.healthScore)}
                                  tone={p.healthScore >= 60 ? "bg-good" : "bg-critical"}
                                />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              ),
                          },
                        ]}
                      />
                    )}
                    {unsynced.length > 0 && (
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        {unsynced.length} more product{unsynced.length === 1 ? "" : "s"} not connected yet:{" "}
                        {unsynced.map((p) => p.productName).join(", ")}
                      </p>
                    )}
                  </>
                );
              })()
            )}
          </GlassPanel>
        </div>
      )}
    </AppShell>
  );
}
