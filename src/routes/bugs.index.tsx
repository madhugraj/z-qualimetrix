import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { DemoDataBadge } from "@/components/qm/DemoDataNotice";
import { BugDomainDonut } from "@/components/qm/BugDomainDonut";
import { SimilarBugs } from "@/components/qm/SimilarBugs";
import { BacklogFlowChart, PriorityBreakdownChart, AgeDistributionChart } from "@/components/qm/charts";
import { cn } from "@/lib/utils";
import { useCurrentProduct } from "@/lib/product-context";
import { useDateRange } from "@/lib/date-range-context";
import { useBugLabelDistribution, useSimilarBugs, useVelocityTrend } from "@/lib/queries/analytics";
import { useBugsList } from "@/lib/queries/bugs";
import { useBacklogSummary, useAgeDistribution } from "@/lib/queries/backlog";

export const Route = createFileRoute("/bugs/")({
  head: () => ({
    meta: [
      { title: "Bug Intelligence — QualiMetrix" },
      {
        name: "description",
        content: "Real synced defects grouped by Jira label, with duplicate screening for the selected bug.",
      },
      { property: "og:title", content: "Bug Intelligence — QualiMetrix" },
      {
        property: "og:description",
        content: "Label-based defect breakdown and similar-bug detection over your synced Jira bugs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BugsPage,
});

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  completed: "Completed",
};

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "completed", label: "Completed" },
];

function BugsPage() {
  const { currentProduct, canViewPortfolio, isLoading: productsLoading } = useCurrentProduct();
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);

  const queryEnabled = !productsLoading && (!!currentProduct || canViewPortfolio);
  const { startDate, endDate } = useDateRange();

  const labelDist = useBugLabelDistribution(currentProduct?.id, queryEnabled, startDate, endDate);
  const chips = labelDist.data?.distribution.slice(0, 6) ?? [];

  const bugsList = useBugsList(
    {
      productId: currentProduct?.id,
      labels: selectedLabel ? [selectedLabel] : undefined,
      status: selectedStatus ? [selectedStatus] : undefined,
      page,
      limit: PAGE_SIZE,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
    { enabled: queryEnabled }
  );

  const rows = bugsList.data?.workItems ?? [];
  const effectiveSelectedId =
    selectedBugId && rows.some((r) => r.id === selectedBugId) ? selectedBugId : rows[0]?.id;
  const selectedBug = rows.find((b) => b.id === effectiveSelectedId);

  const similarBugs = useSimilarBugs(selectedBug?.productId, effectiveSelectedId, 4);

  // PM/leadership analytics — trend, severity mix and staleness of the open
  // bug queue, not just the current label/status filters above.
  const bugFlow = useVelocityTrend(currentProduct?.id, queryEnabled, startDate, endDate);
  const priorityBreakdown = useBacklogSummary(currentProduct?.id, queryEnabled, "bug");
  const bugAging = useAgeDistribution(currentProduct?.id, queryEnabled, "bug");
  const bugFlowData = bugFlow.data?.map((p) => ({
    period: p.period,
    created: p.created,
    completed: p.resolved,
    netChange: p.created - p.resolved,
  }));

  const pagination = bugsList.data?.pagination;

  const selectLabel = (label: string | null) => {
    setSelectedLabel(label);
    setPage(1);
  };

  const selectStatus = (status: string | null) => {
    setSelectedStatus(status);
    setPage(1);
  };

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Bug Intelligence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real synced defects grouped by Jira label, with duplicate screening for the selected bug.
        </p>
      </header>

      <div className="mb-5">
        <FilterBar />
      </div>

      {productsLoading ? (
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <GlassPanel
            title="Bug label distribution"
            subtitle="Which Jira label is generating defects"
            action={!labelDist.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <BugDomainDonut distribution={labelDist.data?.distribution} hasData={labelDist.data?.hasData} />
          </GlassPanel>

          <GlassPanel
            title="Synced defects"
            subtitle={currentProduct?.name ?? "All products"}
            className="xl:col-span-2"
            action={
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex flex-wrap justify-end gap-1">
                  <span className="self-center pr-1 text-[10px] text-muted-foreground">Status:</span>
                  <button
                    type="button"
                    onClick={() => selectStatus(null)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      selectedStatus === null
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All
                  </button>
                  {STATUS_FILTERS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => selectStatus(s.key)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                        selectedStatus === s.key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <span className="self-center pr-1 text-[10px] text-muted-foreground">Label:</span>
                  <button
                    type="button"
                    onClick={() => selectLabel(null)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      selectedLabel === null
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All
                  </button>
                  {chips.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => selectLabel(c.label)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                        selectedLabel === c.label
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            }
          >
            {bugsList.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading bugs…</p>
            ) : bugsList.isError ? (
              <div className="text-sm text-muted-foreground">
                Couldn't load bugs.{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => bugsList.refetch()}>
                  Retry
                </button>
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {selectedLabel || selectedStatus
                  ? "No bugs match the selected filters."
                  : "No bugs synced for this product yet."}
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {rows.map((bug) => (
                    <li key={bug.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedBugId(bug.id)}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-colors",
                          bug.id === effectiveSelectedId
                            ? "border-primary/50 bg-primary/10"
                            : "border-glass-border hover:bg-accent/30"
                        )}
                      >
                        <span className="truncate text-xs font-medium">
                          {bug.externalId ?? bug.id} · {bug.title}
                        </span>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {bug.labels.length > 0 ? bug.labels.join(", ") : "No labels"} ·{" "}
                          {bug.priority ?? "unset"} · {bug.externalStatusName ?? STATUS_LABEL[bug.status]} ·{" "}
                          {bug.externalMetadata?.assigneeName ?? "Unassigned"}
                        </p>
                      </button>
                      <Link
                        to="/bugs/$bugId"
                        params={{ bugId: bug.id }}
                        className="mt-1 ml-3 inline-block text-[11px] text-primary hover:underline"
                      >
                        Open bug detail →
                      </Link>
                    </li>
                  ))}
                </ul>
                {pagination && pagination.totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Page {pagination.page} of {pagination.totalPages} · {pagination.total} bugs
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="rounded-full border border-glass-border px-2.5 py-1 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        disabled={page >= pagination.totalPages}
                        onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                        className="rounded-full border border-glass-border px-2.5 py-1 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </GlassPanel>

          <GlassPanel
            title="Bug trend"
            subtitle="Created vs resolved, with net change — is the queue growing or shrinking"
            className="xl:col-span-2"
            action={!bugFlowData?.length ? <DemoDataBadge /> : undefined}
          >
            <BacklogFlowChart
              data={bugFlowData}
              emptyMessage={currentProduct ? `No bug activity yet for ${currentProduct.name}.` : "No bug activity recorded yet."}
            />
          </GlassPanel>

          <GlassPanel
            title="Open bugs by priority"
            subtitle="Severity mix of what's currently unresolved"
            action={!priorityBreakdown.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <PriorityBreakdownChart byPriority={priorityBreakdown.data?.byPriority} />
          </GlassPanel>

          <GlassPanel
            title="Bug age"
            subtitle="Days since reported, for everything still open"
            className="xl:col-span-3"
            action={!bugAging.data?.hasData ? <DemoDataBadge /> : undefined}
          >
            <AgeDistributionChart data={bugAging.data?.buckets} />
          </GlassPanel>

          <GlassPanel
            title="Related / similar bugs"
            subtitle="Duplicate screening for the selected defect"
            className="xl:col-span-3"
            action={
              !bugsList.isLoading && !similarBugs.isLoading && !similarBugs.data?.hasData ? (
                <DemoDataBadge />
              ) : undefined
            }
          >
            {bugsList.isLoading || similarBugs.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <SimilarBugs hasData={similarBugs.data?.hasData} matches={similarBugs.data?.similar} isLoading={similarBugs.isLoading} />
            )}
          </GlassPanel>
        </div>
      )}
    </AppShell>
  );
}
