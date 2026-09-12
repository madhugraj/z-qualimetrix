import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { InsightBlock, ChartDisclosure, type Insight } from "@/components/qm/InsightBlock";
import { CategoryCountChart } from "@/components/qm/charts";
import { useCurrentProduct } from "@/lib/product-context";
import { useDateRange } from "@/lib/date-range-context";
import {
  useComplianceSignals,
  type ComplianceRow,
  type StaleComplianceRow,
  type ComplianceSignalsResult,
} from "@/lib/queries/compliance";
import { STALE_ITEM_THRESHOLD_DAYS } from "@/lib/qm-thresholds";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance — QualiMetrix" },
      {
        name: "description",
        content: "Jira Adoption Policy compliance signals — unlogged work, orphaned issues, and stale in-progress items.",
      },
    ],
  }),
  component: CompliancePage,
});

const COMPLIANCE_FETCH_LIMIT = 300;

const TYPE_LABEL: Record<string, string> = {
  story: "Story",
  task: "Task",
  subtask: "Sub-task",
  bug: "Bug",
};

function daysSince(dateStr: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

function pct(count: number, denominator: number): number {
  return denominator > 0 ? Math.round((count / denominator) * 100) : 0;
}

// Every insight below folds in three things a raw count can't tell a leader:
// what share of the real total this is, which product is driving it (from
// the full, uncapped byProduct groupby — never the capped preview rows,
// which are oldest-first and would bias a ranking), and — only where
// honestly reconstructable — how it's moving. See getComplianceSignals'
// return-type doc comments for why unloggedWork gets a real trend but the
// other two get a composition split instead, never a fabricated "trend".

function unloggedInsight(data: ComplianceSignalsResult): Insight {
  const { counts, denominators, byProduct, unloggedWorkTrend } = data;
  const percent = pct(counts.unloggedWork, denominators.unloggedWork);
  const worst = byProduct?.unloggedWork[0];
  const trendPhrase =
    unloggedWorkTrend && unloggedWorkTrend.changePercent !== null
      ? ` — ${Math.abs(unloggedWorkTrend.changePercent)}% ${unloggedWorkTrend.changePercent >= 0 ? "worse" : "better"} than the previous period`
      : "";
  const worstPhrase = worst ? ` ${worst.label} accounts for the most (${worst.count}).` : "";
  return {
    text: `${percent}% of completed work (${counts.unloggedWork} of ${denominators.unloggedWork}) has no logged time${trendPhrase}.${worstPhrase}`,
    action:
      counts.unloggedWork > 0
        ? `Spot-check a few${worst ? ` in ${worst.label}` : ""} with their assignee before trusting velocity or effort numbers built on this data.`
        : "All completed work has logged time — velocity numbers here are trustworthy.",
  };
}

function orphanedInsight(data: ComplianceSignalsResult): Insight {
  const { counts, denominators, byProduct, orphanedBreakdown } = data;
  const percent = pct(counts.orphanedIssues, denominators.orphanedIssues);
  const worst = byProduct?.orphanedIssues[0];
  const worstPhrase = worst ? ` ${worst.label} has the most (${worst.count}).` : "";
  const breakdownPhrase = orphanedBreakdown
    ? ` ${orphanedBreakdown.createdThisWindow} of these were created in the selected period; ${orphanedBreakdown.predatesWindow} predate it.`
    : "";
  return {
    text: `${percent}% of active work (${counts.orphanedIssues} of ${denominators.orphanedIssues}) has no parent epic or story.${worstPhrase}${breakdownPhrase}`,
    action:
      counts.orphanedIssues > 0
        ? `Link these to their epic/story${worst ? `, starting with ${worst.label}` : ""} — orphaned items break hierarchy rollups (policy §5.5) and understate epic progress.`
        : "No hierarchy violations — every item rolls up correctly.",
  };
}

function staleInsight(data: ComplianceSignalsResult): Insight {
  const { counts, denominators, byProduct, staleBreakdown } = data;
  const percent = pct(counts.staleInProgress, denominators.staleInProgress);
  const worst = byProduct?.staleInProgress[0];
  const worstPhrase = worst ? ` ${worst.label} has the most (${worst.count}).` : "";
  const breakdownPhrase = staleBreakdown
    ? ` ${staleBreakdown.justCrossedThreshold} just crossed the ${STALE_ITEM_THRESHOLD_DAYS}-day mark this period; ${staleBreakdown.longStanding} have been stale longer than that.`
    : "";
  return {
    text: `${percent}% of in-progress work (${counts.staleInProgress} of ${denominators.staleInProgress}) hasn't changed status in ${STALE_ITEM_THRESHOLD_DAYS}+ days.${worstPhrase}${breakdownPhrase}`,
    action:
      counts.staleInProgress > 0
        ? `Check with the assignee${worst ? `, starting with ${worst.label}` : ""} — either it's genuinely blocked (update the board) or it's stale and should move.`
        : "No stale in-progress items — the board reflects real status.",
  };
}

function ComplianceTable({
  rows,
  totalCount,
  showProduct,
}: {
  rows: (ComplianceRow | StaleComplianceRow)[];
  totalCount: number;
  showProduct: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing flagged right now.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="pb-2 pr-3 font-medium">Item</th>
            <th className="pb-2 pr-3 font-medium">Type</th>
            <th className="pb-2 pr-3 font-medium">Status</th>
            {showProduct && <th className="pb-2 pr-3 font-medium">Product</th>}
            <th className="pb-2 pr-3 font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-glass-border/60">
              <td className="py-2.5 pr-3 font-medium">
                {row.type === "bug" ? (
                  <Link to="/bugs/$bugId" params={{ bugId: row.id }} className="hover:underline">
                    {row.externalId ?? row.id} · {row.title}
                  </Link>
                ) : (
                  <span>
                    {row.externalId ?? row.id} · {row.title}
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-xs text-muted-foreground">{TYPE_LABEL[row.type] ?? row.type}</td>
              <td className="py-2.5 pr-3 text-xs text-muted-foreground">{row.externalStatusName ?? row.status}</td>
              {showProduct && <td className="py-2.5 pr-3 text-xs text-muted-foreground">{row.productName}</td>}
              <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                {"daysStale" in row ? `${row.daysStale}d stale` : `${daysSince(row.updatedAt)}d ago`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalCount > rows.length && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {rows.length} of {totalCount} shown.
        </p>
      )}
    </div>
  );
}

function CompliancePage() {
  const { currentProduct, canViewPortfolio, isLoading: productsLoading } = useCurrentProduct();
  const queryEnabled = !productsLoading && (!!currentProduct || canViewPortfolio);
  const { startDate, endDate } = useDateRange();
  const signals = useComplianceSignals(currentProduct?.id, queryEnabled, COMPLIANCE_FETCH_LIMIT, startDate, endDate);
  const data = signals.data;
  const showProduct = !currentProduct;

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Compliance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Jira Adoption Policy §9.2 signals — unlogged work, orphaned issues, and stale in-progress items, computed
          live from synced Jira/Azure DevOps data.
        </p>
      </header>

      <div className="mb-5">
        <FilterBar />
      </div>

      {productsLoading ? (
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      ) : signals.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading compliance signals…</p>
      ) : signals.isError ? (
        <div className="text-sm text-muted-foreground">
          Couldn't load compliance signals.{" "}
          <button type="button" className="text-primary hover:underline" onClick={() => signals.refetch()}>
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <GlassPanel>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Unlogged work</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-2xl font-semibold text-warning">{pct(data.counts.unloggedWork, data.denominators.unloggedWork)}%</p>
                {data.unloggedWorkTrend?.changePercent != null && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      data.unloggedWorkTrend.changePercent <= 0 ? "bg-good/15 text-good" : "bg-critical/15 text-critical"
                    )}
                  >
                    {data.unloggedWorkTrend.changePercent > 0 ? "+" : ""}
                    {data.unloggedWorkTrend.changePercent}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {data.counts.unloggedWork} of {data.denominators.unloggedWork} completed items
              </p>
            </GlassPanel>
            <GlassPanel>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Orphaned issues</p>
              <p className="mt-1 text-2xl font-semibold text-warning">{pct(data.counts.orphanedIssues, data.denominators.orphanedIssues)}%</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {data.counts.orphanedIssues} of {data.denominators.orphanedIssues} active items
              </p>
            </GlassPanel>
            <GlassPanel>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Stale in-progress</p>
              <p className="mt-1 text-2xl font-semibold text-warning">{pct(data.counts.staleInProgress, data.denominators.staleInProgress)}%</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {data.counts.staleInProgress} of {data.denominators.staleInProgress} in-progress items
              </p>
            </GlassPanel>
          </div>

          <GlassPanel title="Unlogged work" subtitle="Completed items with no time ever logged" className="mb-5">
            <InsightBlock insight={unloggedInsight(data)} />
            {showProduct && data.byProduct && data.byProduct.unloggedWork.length > 0 && (
              <div className="mt-3 border-t border-glass-border/60 pt-3">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">By product</p>
                <CategoryCountChart data={data.byProduct.unloggedWork} seriesName="Items" />
              </div>
            )}
            <ChartDisclosure label="Show flagged items">
              <ComplianceTable rows={data.unloggedWork} totalCount={data.counts.unloggedWork} showProduct={showProduct} />
            </ChartDisclosure>
          </GlassPanel>

          <GlassPanel title="Orphaned issues" subtitle="No parent epic or story linked (policy §5.5)" className="mb-5">
            <InsightBlock insight={orphanedInsight(data)} />
            {showProduct && data.byProduct && data.byProduct.orphanedIssues.length > 0 && (
              <div className="mt-3 border-t border-glass-border/60 pt-3">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">By product</p>
                <CategoryCountChart data={data.byProduct.orphanedIssues} seriesName="Items" />
              </div>
            )}
            <ChartDisclosure label="Show flagged items">
              <ComplianceTable rows={data.orphanedIssues} totalCount={data.counts.orphanedIssues} showProduct={showProduct} />
            </ChartDisclosure>
          </GlassPanel>

          <GlassPanel title="Stale in-progress" subtitle={`No status change in ${STALE_ITEM_THRESHOLD_DAYS}+ days`}>
            <InsightBlock insight={staleInsight(data)} />
            {showProduct && data.byProduct && data.byProduct.staleInProgress.length > 0 && (
              <div className="mt-3 border-t border-glass-border/60 pt-3">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">By product</p>
                <CategoryCountChart data={data.byProduct.staleInProgress} seriesName="Items" />
              </div>
            )}
            <ChartDisclosure label="Show flagged items">
              <ComplianceTable rows={data.staleInProgress} totalCount={data.counts.staleInProgress} showProduct={showProduct} />
            </ChartDisclosure>
          </GlassPanel>
        </>
      ) : null}
    </AppShell>
  );
}
