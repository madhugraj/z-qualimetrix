import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { ExportMenu, type ExportDataset } from "@/components/qm/ExportMenu";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { InsightBlock, ChartDisclosure, type Insight } from "@/components/qm/InsightBlock";
import { ExecutionTrendChart, MttrChart, VelocityChart, VelocityByTypeChart } from "@/components/qm/charts";
import { RtmTable, RecentHighPriorityFixesList } from "@/components/qm/tables";
import { ProductHealthList } from "@/components/qm/ProductHealthList";
import { DemoDataBadge } from "@/components/qm/DemoDataNotice";
import { useAuth } from "@/lib/auth-context";
import { useCurrentProduct } from "@/lib/product-context";
import { useDateRange } from "@/lib/date-range-context";
import { ROLES } from "@/lib/qm-data";
import {
  useMttr,
  useTestExecutionMetrics,
  useVelocityTrend,
  useTenantAnalytics,
  useRecentHighPriorityFixes,
  useQuarterOverQuarterVelocity,
  useRequirementTraceability,
  type MttrResult,
  type TestExecutionMetricsResult,
  type VelocityTrendEntry,
  type RequirementTraceabilityResult,
  type QuarterOverQuarterVelocityResult,
  type TenantAnalyticsResult,
} from "@/lib/queries/analytics";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — QualiMetrix Quality Analytics" },
      {
        name: "description",
        content:
          "Cross-sprint QA reports: execution outcomes, MTTR trends, velocity vs defect flow and requirements traceability.",
      },
      { property: "og:title", content: "QualiMetrix Reports" },
      {
        property: "og:description",
        content: "Cross-sprint quality reporting across products, squads and releases.",
      },
    ],
  }),
  component: Reports,
});

// ---- Insights: a plain-language read + a next step per panel, computed
// entirely from data already fetched for that panel — no new queries. ----

function mttrInsight(mttr: MttrResult | undefined, isMine: boolean): Insight | null {
  if (!mttr?.hasData || mttr.trend.length === 0) return null;
  const whose = isMine ? "Your" : "Team";
  const last = mttr.trend[mttr.trend.length - 1];
  const prev = mttr.trend.length > 1 ? mttr.trend[mttr.trend.length - 2] : null;
  if (!prev || prev.mttr === 0) {
    return {
      text: `${whose} average resolution time is ${mttr.overall}h overall.`,
      action: "Check the priority breakdown below for which severity is slowest to close.",
    };
  }
  const changePercent = Math.round(((last.mttr - prev.mttr) / prev.mttr) * 100);
  const faster = changePercent < 0;
  return {
    text: `${whose} MTTR is ${Math.abs(changePercent)}% ${faster ? "faster" : "slower"} than the previous period (${prev.mttr}h → ${last.mttr}h).`,
    action: faster
      ? "Keep doing whatever changed — worth naming it in the next retro."
      : "Look at what's still open past the average — a few old stragglers usually explain a slowdown.",
  };
}

function velocityInsight(velocityTrend: VelocityTrendEntry[] | undefined): Insight | null {
  if (!velocityTrend || velocityTrend.length === 0) return null;
  const created = velocityTrend.reduce((sum, p) => sum + p.created, 0);
  const resolved = velocityTrend.reduce((sum, p) => sum + p.resolved, 0);
  if (created > resolved) {
    return {
      text: `Bugs are arriving faster than they're being resolved over this window (${created} created vs ${resolved} resolved) — the open queue is growing.`,
      action: "Flag this at the next status update before the backlog outpaces capacity.",
    };
  }
  if (resolved > created) {
    return {
      text: `Resolving faster than new bugs arrive over this window (${resolved} resolved vs ${created} created) — the open queue is shrinking.`,
      action: "Good trend to keep — no action needed unless it reverses.",
    };
  }
  return {
    text: `Created and resolved are roughly balanced over this window (${created} vs ${resolved}).`,
    action: "Steady state — watch for either side pulling ahead next period.",
  };
}

function velocityByTypeInsight(velocityTrend: VelocityTrendEntry[] | undefined): Insight | null {
  if (!velocityTrend || velocityTrend.length === 0) return null;
  const totals = velocityTrend.reduce(
    (sum, p) => ({
      bug: sum.bug + p.byType.bug,
      subtask: sum.subtask + p.byType.subtask,
      feature: sum.feature + p.byType.feature,
    }),
    { bug: 0, subtask: 0, feature: 0 }
  );
  const total = totals.bug + totals.subtask + totals.feature;
  if (total === 0) return null;
  const entries = [
    { label: "bug fixes", count: totals.bug },
    { label: "sub-tasks", count: totals.subtask },
    { label: "features", count: totals.feature },
  ].sort((a, b) => b.count - a.count);
  const top = entries[0];
  const pct = Math.round((top.count / total) * 100);
  return {
    text: `${top.label[0].toUpperCase()}${top.label.slice(1)} make up ${pct}% of completed work over this window (${top.count} of ${total}).`,
    action:
      top.label === "bug fixes" && pct >= 50
        ? "More than half of delivered work is bug fixes — worth flagging as a quality signal, not just throughput."
        : "Composition looks reasonable — recheck if one category starts dominating.",
  };
}

function rtmInsight(rtm: RequirementTraceabilityResult | undefined): Insight | null {
  if (!rtm?.hasData || rtm.requirements.length === 0) return null;
  const blocked = rtm.requirements.filter((r) => r.status === "blocked");
  const atRisk = rtm.requirements.filter((r) => r.status === "at_risk");
  if (blocked.length === 0 && atRisk.length === 0) {
    return {
      text: `All ${rtm.requirements.length} tracked requirements are clear of open high-priority defects.`,
      action: "Nothing blocking here — safe to sign off from a defect-linkage standpoint.",
    };
  }
  const worst = blocked[0] ?? atRisk[0];
  return {
    text: `${blocked.length} requirement(s) blocked and ${atRisk.length} at risk, out of ${rtm.requirements.length} tracked.`,
    action: `Start with "${worst.title}" (${worst.externalId ?? worst.id}) — it's the top of the list below.`,
  };
}

function testInsight(metrics: TestExecutionMetricsResult | undefined): Insight | null {
  if (!metrics?.hasData) return null;
  const trend = metrics.executionTrend;
  const last = trend[trend.length - 1];
  const prev = trend.length > 1 ? trend[trend.length - 2] : null;
  const direction = prev ? (last.passRate >= prev.passRate ? "holding steady or improving" : "declining") : null;
  return {
    text: `Pass rate is ${metrics.passRate}% (${metrics.passed}/${metrics.total} executions)${direction ? `, ${direction} vs the prior period` : ""}.`,
    action:
      metrics.automationRate < 50
        ? `Automation is only ${metrics.automationRate}% of runs — manual execution is the bottleneck if this needs to run more often.`
        : `${metrics.automationRate}% automated — investigate the ${metrics.failed} failing executions before the next release.`,
  };
}

function qoqInsight(qoq: QuarterOverQuarterVelocityResult | undefined): Insight | null {
  if (!qoq?.hasData || qoq.changePercent === null) return null;
  const up = qoq.changePercent >= 0;
  return {
    text: `Completed work is ${Math.abs(qoq.changePercent)}% ${up ? "up" : "down"} vs last quarter (${qoq.previous.total} → ${qoq.current.total}).`,
    action: up
      ? "Throughput is trending the right way — worth highlighting in the next leadership update."
      : "Worth understanding why before it shows up as a delivery-risk conversation.",
  };
}

function portfolioInsight(tenant: TenantAnalyticsResult | undefined): Insight | null {
  if (!tenant?.hasData || tenant.products.length === 0) return null;
  const withData = tenant.products.filter((p) => p.hasData);
  if (withData.length === 0) return null;
  const weakest = [...withData].sort((a, b) => a.healthScore - b.healthScore)[0];
  return {
    text: `${weakest.productName} has the lowest health score in the portfolio (${weakest.healthScore}/100).`,
    action: `Check in on ${weakest.productName} first — everything else is comparatively healthier right now.`,
  };
}

function Reports() {
  const { user, isLoading } = useAuth();
  const current = ROLES.find((r) => r.id === user?.role);
  const { currentProduct, isPortfolioView, isLoading: productsLoading } = useCurrentProduct();

  const productId = currentProduct?.id;
  const queryEnabled = !productsLoading && (!!productId || isPortfolioView);
  const { startDate, endDate } = useDateRange();

  // "My work" scoping (Developer only) — see analytics.controller.ts's
  // resolveRequestedAssigneeId for why this can't be spoofed to another
  // user's id from the client.
  const isDeveloper = current?.id === "developer";
  const assigneeId = isDeveloper ? (user?.id ?? undefined) : undefined;
  // Portfolio-wide by nature — the backend 403s this for anyone but
  // pm/executive (see analytics.controller.ts's getTenantAnalytics), so PO
  // doesn't get it even though PO shares most of PM's panel set below.
  const canViewPortfolio = current?.id === "pm" || current?.id === "executive";

  const testMetrics = useTestExecutionMetrics(productId, queryEnabled, startDate, endDate);
  const mttr = useMttr(productId, queryEnabled, startDate, endDate, assigneeId);
  const velocityTrend = useVelocityTrend(productId, queryEnabled, startDate, endDate);
  const tenantAnalytics = useTenantAnalytics(user?.tenantId ?? undefined, canViewPortfolio);
  const recentFixes = useRecentHighPriorityFixes(productId, queryEnabled, 10, assigneeId);
  const velocityQoQ = useQuarterOverQuarterVelocity(productId, queryEnabled);
  const requirementTraceability = useRequirementTraceability(productId, queryEnabled);

  if (isLoading || productsLoading) {
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
            Your account doesn't have a role yet. Ask your PM to assign one before you can see reports.
          </p>
        </GlassPanel>
      </AppShell>
    );
  }

  const role = current.id;
  const bugsFixedTitle = isDeveloper ? "Bugs you've fixed" : "High-priority bugs fixed";
  const mttrTitle = isDeveloper ? "Your resolution efficiency" : "Resolution efficiency";

  const datasets: ExportDataset[] = [
    { key: "test-execution", label: "Test execution outcomes", rows: testMetrics.data?.executionTrend ?? [] },
    { key: "mttr", label: mttrTitle, rows: mttr.data?.trend ?? [] },
    {
      key: "velocity",
      label: "Quality velocity",
      rows: (velocityTrend.data ?? []).map((v) => ({
        period: v.period, velocity: v.velocity, created: v.created, resolved: v.resolved,
        bugs: v.byType.bug, subtasks: v.byType.subtask, features: v.byType.feature,
      })),
    },
    {
      key: "rtm",
      label: "Requirements traceability",
      rows: (requirementTraceability.data?.requirements ?? []).map((r) => ({
        id: r.id, externalId: r.externalId, title: r.title, type: r.type, status: r.status, linkedBugsCount: r.linkedBugs.length,
      })),
    },
    {
      key: "recent-fixes",
      label: bugsFixedTitle,
      rows: (recentFixes.data?.bugs ?? []).map((b) => ({
        id: b.id, externalId: b.externalId, title: b.title, priority: b.priority, resolvedAt: b.resolvedAt, assigneeName: b.assigneeName,
      })),
    },
    {
      key: "portfolio",
      label: "Portfolio comparison",
      rows: (tenantAnalytics.data?.products ?? []).map((p) => ({
        productId: p.productId, productName: p.productName, healthScore: p.healthScore,
        hasData: p.hasData ? "yes" : "no", totalWorkItems: p.totalWorkItems,
      })),
    },
    {
      key: "velocity-qoq",
      label: "Velocity vs previous quarter",
      rows: velocityQoQ.data
        ? [
            { period: velocityQoQ.data.previous.label, total: velocityQoQ.data.previous.total },
            { period: velocityQoQ.data.current.label, total: velocityQoQ.data.current.total },
          ]
        : [],
    },
  ];

  const testExecInsight = testInsight(testMetrics.data);
  const mttrInsightValue = mttrInsight(mttr.data, isDeveloper);
  const velocityInsightValue = velocityInsight(velocityTrend.data);
  const velocityByTypeInsightValue = velocityByTypeInsight(velocityTrend.data);
  const qoqInsightValue = qoqInsight(velocityQoQ.data);
  const portfolioInsightValue = portfolioInsight(tenantAnalytics.data);
  const rtmInsightValue = rtmInsight(requirementTraceability.data);

  const panels = {
    testExecution: (
      <GlassPanel key="test-execution" title="Test execution outcomes" subtitle="Daily pass rate">
        {testExecInsight && <InsightBlock insight={testExecInsight} />}
        {testExecInsight ? (
          <ChartDisclosure>
            <ExecutionTrendChart data={testMetrics.data?.executionTrend} />
          </ChartDisclosure>
        ) : (
          <ExecutionTrendChart data={testMetrics.data?.executionTrend} />
        )}
      </GlassPanel>
    ),
    mttrPanel: (
      <GlassPanel key="mttr" title={mttrTitle} subtitle="MTTR trend">
        {mttrInsightValue && <InsightBlock insight={mttrInsightValue} />}
        {mttrInsightValue ? (
          <ChartDisclosure>
            <MttrChart data={mttr.data?.trend} />
          </ChartDisclosure>
        ) : (
          <MttrChart data={mttr.data?.trend} />
        )}
      </GlassPanel>
    ),
    qualityVelocity: (
      <GlassPanel key="quality-velocity" title="Quality velocity" subtitle="Issues completed vs defect flow">
        {velocityInsightValue && <InsightBlock insight={velocityInsightValue} />}
        {velocityInsightValue ? (
          <ChartDisclosure>
            <VelocityChart
              data={velocityTrend.data}
              emptyMessage={currentProduct ? `No completed work yet for ${currentProduct.name}.` : "No completed work yet across your portfolio."}
            />
          </ChartDisclosure>
        ) : (
          <VelocityChart
            data={velocityTrend.data}
            emptyMessage={currentProduct ? `No completed work yet for ${currentProduct.name}.` : "No completed work yet across your portfolio."}
          />
        )}
      </GlassPanel>
    ),
    velocityByType: (
      <GlassPanel key="velocity-by-type" title="Velocity by issue type" subtitle="Bugs vs features vs sub-tasks, per period">
        {velocityByTypeInsightValue && <InsightBlock insight={velocityByTypeInsightValue} />}
        {velocityByTypeInsightValue ? (
          <ChartDisclosure>
            <VelocityByTypeChart
              data={velocityTrend.data}
              emptyMessage={currentProduct ? `No completed work yet for ${currentProduct.name}.` : "No completed work yet across your portfolio."}
            />
          </ChartDisclosure>
        ) : (
          <VelocityByTypeChart
            data={velocityTrend.data}
            emptyMessage={currentProduct ? `No completed work yet for ${currentProduct.name}.` : "No completed work yet across your portfolio."}
          />
        )}
      </GlassPanel>
    ),
    highPriorityFixes: (
      <GlassPanel key="recent-fixes" title={bugsFixedTitle} subtitle={recentFixes.data ? recentFixes.data.periodLabel : "Most recent sprint"}>
        {recentFixes.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <RecentHighPriorityFixesList bugs={recentFixes.data?.bugs} hasData={recentFixes.data?.hasData} />
        )}
      </GlassPanel>
    ),
    velocityQoq: (
      <GlassPanel key="velocity-qoq" title="Velocity vs previous quarter" subtitle="Completed items, quarter over quarter">
        {velocityQoQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !velocityQoQ.data?.hasData ? (
          <p className="text-sm text-muted-foreground">No completed work yet to compare.</p>
        ) : (
          <>
            {qoqInsightValue && <InsightBlock insight={qoqInsightValue} />}
            <div className="mt-3 flex flex-wrap items-end gap-6">
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{velocityQoQ.data.previous.label}</p>
                <p className="mt-1 text-2xl font-semibold text-muted-foreground">{velocityQoQ.data.previous.total}</p>
              </div>
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{velocityQoQ.data.current.label}</p>
                <p className="mt-1 text-2xl font-semibold">{velocityQoQ.data.current.total}</p>
              </div>
              {velocityQoQ.data.changePercent !== null && (
                <span
                  className={
                    velocityQoQ.data.changePercent >= 0
                      ? "rounded-full bg-good/15 px-2.5 py-1 text-xs font-medium text-good"
                      : "rounded-full bg-critical/15 px-2.5 py-1 text-xs font-medium text-critical"
                  }
                >
                  {velocityQoQ.data.changePercent >= 0 ? "+" : ""}
                  {velocityQoQ.data.changePercent}%
                </span>
              )}
            </div>
          </>
        )}
      </GlassPanel>
    ),
    portfolioComparison: (
      <GlassPanel key="portfolio" title="Portfolio comparison" subtitle="Health score per active product">
        {portfolioInsightValue && <InsightBlock insight={portfolioInsightValue} />}
        <div className={portfolioInsightValue ? "mt-3" : undefined}>
          <ProductHealthList products={tenantAnalytics.data?.products ?? []} />
        </div>
      </GlassPanel>
    ),
    rtm: (
      <GlassPanel
        key="rtm"
        title="Requirements traceability matrix"
        subtitle="Requirement → linked defects → status, from real Jira/ADO issue links"
        className="xl:col-span-2"
        action={!requirementTraceability.data?.hasData ? <DemoDataBadge /> : undefined}
      >
        {rtmInsightValue && <InsightBlock insight={rtmInsightValue} />}
        <div className={rtmInsightValue ? "mt-3" : undefined}>
          <RtmTable requirements={requirementTraceability.data?.requirements} hasData={requirementTraceability.data?.hasData} />
        </div>
      </GlassPanel>
    ),
  };

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-sprint analytics across products, squads and releases.
          </p>
        </div>
        <ExportMenu datasets={datasets} />
      </header>
      <div className="mb-5">
        <FilterBar />
      </div>

      {/* Panels are paired by content shape, not by role-specific guesswork —
          fixed-height charts pair with other charts, compact stat/list panels
          pair with each other, and anything whose height scales with the
          data (product/requirement counts) gets the full row to itself. That
          keeps row heights matched regardless of how much data a tenant has,
          instead of two mismatched panels leaving a ragged gap next to a
          short one — same span convention already used for RTM. */}

      {role === "executive" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">{panels.portfolioComparison}</div>
          <div className="xl:col-span-2">{panels.qualityVelocity}</div>
          <div className="xl:col-span-2">{panels.velocityQoq}</div>
        </div>
      )}

      {role === "tester" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">{panels.testExecution}</div>
          <div className="xl:col-span-2">{panels.highPriorityFixes}</div>
          {panels.rtm}
        </div>
      )}

      {role === "developer" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {panels.mttrPanel}
          {panels.velocityByType}
          <div className="xl:col-span-2">{panels.highPriorityFixes}</div>
        </div>
      )}

      {(role === "pm" || role === "po") && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {panels.qualityVelocity}
          {panels.velocityByType}
          <div className="xl:col-span-2">{panels.mttrPanel}</div>
          {panels.highPriorityFixes}
          {panels.velocityQoq}
          {/* Portfolio-wide by nature (every product's health, not just
              this PO's own) — pm only, matching this app's consistent
              isPortfolioRole boundary everywhere else (getProjectsOverview,
              getQualityDashboard, getTenantAnalytics). A PO sees their own
              product's numbers, not every other team's. */}
          {role === "pm" && <div className="xl:col-span-2">{panels.portfolioComparison}</div>}
          {panels.rtm}
        </div>
      )}
    </AppShell>
  );
}
