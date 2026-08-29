import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { ExportMenu } from "@/components/qm/ExportMenu";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { ExecutionTrendChart, MttrChart, VelocityChart } from "@/components/qm/charts";
import { RtmTable } from "@/components/qm/tables";
import { ProductHealthList } from "@/components/qm/ProductHealthList";
import { useAuth } from "@/lib/auth-context";
import { useCurrentProduct } from "@/lib/product-context";
import { useMttr, useTestExecutionMetrics, useVelocityTrend, useTenantAnalytics } from "@/lib/queries/analytics";

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

  const testMetrics = useTestExecutionMetrics(productId, queryEnabled);
  const mttr = useMttr(productId, queryEnabled);
  const velocityTrend = useVelocityTrend(productId);
  const tenantAnalytics = useTenantAnalytics(user?.tenantId ?? undefined);

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
        <GlassPanel title="Quality velocity" subtitle="Velocity vs defect flow">
          <VelocityChart data={velocityTrend.data} />
        </GlassPanel>
        <GlassPanel title="Portfolio comparison" subtitle="Health score per active product">
          <ProductHealthList products={tenantAnalytics.data?.products ?? []} />
        </GlassPanel>
        <GlassPanel
          title="Requirements traceability matrix"
          subtitle="Story → test cases → bug status"
          className="xl:col-span-2"
        >
          <RtmTable />
        </GlassPanel>
      </div>
    </AppShell>
  );
}
