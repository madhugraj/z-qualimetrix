import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { ExportMenu } from "@/components/qm/ExportMenu";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { ExecutionTrendChart, MttrChart, VelocityChart, VelocityByTypeChart } from "@/components/qm/charts";
import { RtmTable, RecentHighPriorityFixesList } from "@/components/qm/tables";
import { ProductHealthList } from "@/components/qm/ProductHealthList";
import { DemoDataBadge } from "@/components/qm/DemoDataNotice";
import { useAuth } from "@/lib/auth-context";
import { useCurrentProduct } from "@/lib/product-context";
import { useDateRange } from "@/lib/date-range-context";
import {
  useMttr,
  useTestExecutionMetrics,
  useVelocityTrend,
  useTenantAnalytics,
  useRecentHighPriorityFixes,
  useQuarterOverQuarterVelocity,
  useRequirementTraceability,
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

function Reports() {
  const { user } = useAuth();
  const { currentProduct, isPortfolioView, isLoading: productsLoading } = useCurrentProduct();

  const productId = currentProduct?.id;
  const queryEnabled = !productsLoading && (!!productId || isPortfolioView);
  const { startDate, endDate } = useDateRange();

  const testMetrics = useTestExecutionMetrics(productId, queryEnabled, startDate, endDate);
  const mttr = useMttr(productId, queryEnabled, startDate, endDate);
  const velocityTrend = useVelocityTrend(productId, queryEnabled, startDate, endDate);
  const tenantAnalytics = useTenantAnalytics(user?.tenantId ?? undefined);
  const recentFixes = useRecentHighPriorityFixes(productId, queryEnabled, 10);
  const velocityQoQ = useQuarterOverQuarterVelocity(productId, queryEnabled);
  const requirementTraceability = useRequirementTraceability(productId, queryEnabled);

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-sprint analytics across products, squads and releases.
          </p>
        </div>
        <ExportMenu />
      </header>
      <div className="mb-5">
        <FilterBar />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GlassPanel title="Test execution outcomes" subtitle="Daily pass rate">
          <ExecutionTrendChart data={testMetrics.data?.executionTrend} />
        </GlassPanel>
        <GlassPanel title="Resolution efficiency" subtitle="MTTR trend">
          <MttrChart data={mttr.data?.trend} />
        </GlassPanel>
        <GlassPanel title="Quality velocity" subtitle="Issues completed vs defect flow">
          <VelocityChart
            data={velocityTrend.data}
            emptyMessage={
              currentProduct
                ? `No completed work yet for ${currentProduct.name}.`
                : "No completed work yet across your portfolio."
            }
          />
        </GlassPanel>
        <GlassPanel title="Velocity by issue type" subtitle="Bugs vs features vs sub-tasks, per period">
          <VelocityByTypeChart
            data={velocityTrend.data}
            emptyMessage={
              currentProduct
                ? `No completed work yet for ${currentProduct.name}.`
                : "No completed work yet across your portfolio."
            }
          />
        </GlassPanel>
        <GlassPanel
          title="High-priority bugs fixed"
          subtitle={recentFixes.data ? recentFixes.data.periodLabel : "Most recent sprint"}
        >
          {recentFixes.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <RecentHighPriorityFixesList bugs={recentFixes.data?.bugs} hasData={recentFixes.data?.hasData} />
          )}
        </GlassPanel>
        <GlassPanel title="Velocity vs previous quarter" subtitle="Completed items, quarter over quarter">
          {velocityQoQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !velocityQoQ.data?.hasData ? (
            <p className="text-sm text-muted-foreground">No completed work yet to compare.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {velocityQoQ.data.previous.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-muted-foreground">{velocityQoQ.data.previous.total}</p>
              </div>
              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {velocityQoQ.data.current.label}
                </p>
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
          )}
        </GlassPanel>
        <GlassPanel title="Portfolio comparison" subtitle="Health score per active product">
          <ProductHealthList products={tenantAnalytics.data?.products ?? []} />
        </GlassPanel>
        <GlassPanel
          title="Requirements traceability matrix"
          subtitle="Requirement → linked defects → status, from real Jira/ADO issue links"
          className="xl:col-span-2"
          action={!requirementTraceability.data?.hasData ? <DemoDataBadge /> : undefined}
        >
          <RtmTable requirements={requirementTraceability.data?.requirements} hasData={requirementTraceability.data?.hasData} />
        </GlassPanel>
      </div>
    </AppShell>
  );
}
