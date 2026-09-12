import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { useBugLabelDistribution, useSimilarBugs, useVelocityTrend, useEpicRollups } from "@/lib/queries/analytics";
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

const PRIORITY_TONE: Record<string, string> = {
  critical: "text-critical",
  high: "text-warning",
  medium: "text-muted-foreground",
  low: "text-muted-foreground",
};

const PAGE_SIZE = 20;
const EPIC_PICKER_LIMIT = 300;

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "completed", label: "Completed" },
];

type SortableField = "createdAt" | "updatedAt";
const SORT_OPTIONS: Array<{ key: SortableField; label: string }> = [
  { key: "createdAt", label: "Age" },
  { key: "updatedAt", label: "Last updated" },
];

function daysSince(dateStr: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

function BugsPage() {
  const { currentProduct, canViewPortfolio, isLoading: productsLoading } = useCurrentProduct();
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedEpicId, setSelectedEpicId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortableField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);

  const queryEnabled = !productsLoading && (!!currentProduct || canViewPortfolio);
  const { startDate, endDate } = useDateRange();

  const labelDist = useBugLabelDistribution(currentProduct?.id, queryEnabled, startDate, endDate);
  const chips = labelDist.data?.distribution.slice(0, 6) ?? [];

  // Reused for two things: the Epic filter picker, and the orphan-bug
  // callout below — both are "how does the bug backlog relate to epics"
  // questions, same real parent-child data getEpicRollups already computes.
  const epicRollups = useEpicRollups(currentProduct?.id, queryEnabled, EPIC_PICKER_LIMIT);
  const epicsWithBugs = useMemo(
    () => (epicRollups.data?.epics ?? []).filter((e) => e.bugSummary.totalBugs > 0)
      .sort((a, b) => b.bugSummary.openBugs - a.bugSummary.openBugs),
    [epicRollups.data]
  );

  const bugsList = useBugsList(
    {
      productId: currentProduct?.id,
      labels: selectedLabel ? [selectedLabel] : undefined,
      status: selectedStatus ? [selectedStatus] : undefined,
      parentId: selectedEpicId === "none" ? "none" : selectedEpicId ?? undefined,
      page,
      limit: PAGE_SIZE,
      sortBy,
      sortOrder,
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
  const orphanPercent =
    epicRollups.data?.summary.totalBugCount
      ? Math.round((epicRollups.data.summary.orphanBugCount / epicRollups.data.summary.totalBugCount) * 100)
      : null;

  const selectLabel = (label: string | null) => {
    setSelectedLabel(label);
    setPage(1);
  };

  const selectStatus = (status: string | null) => {
    setSelectedStatus(status);
    setPage(1);
  };

  const selectEpic = (epicId: string | null) => {
    setSelectedEpicId(epicId);
    setPage(1);
  };

  const toggleSort = (field: SortableField) => {
    if (sortBy === field) {
      setSortOrder((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Bug Intelligence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real synced defects grouped by Jira label, with duplicate screening for the selected bug.
        </p>
        {orphanPercent !== null && orphanPercent > 0 && (
          <p className="mt-3 rounded-xl border border-glass-border bg-accent/20 px-3 py-2 text-[11px] text-muted-foreground">
            {orphanPercent}% of synced bugs ({epicRollups.data!.summary.orphanBugCount} of{" "}
            {epicRollups.data!.summary.totalBugCount}) aren&apos;t linked to any epic in Jira/Azure DevOps —
            not an error here, just a real gap in how the backlog is organized upstream.
          </p>
        )}
      </header>

      <div className="mb-5">
        <FilterBar />
      </div>

      {productsLoading ? (
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
          <GlassPanel
            title="Bug label distribution"
            subtitle="Which label is generating defects"
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
                {epicsWithBugs.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="pr-0.5 text-[10px] text-muted-foreground">Epic:</span>
                    <select
                      value={selectedEpicId ?? ""}
                      onChange={(e) => selectEpic(e.target.value || null)}
                      className="rounded-full border border-glass-border bg-transparent px-2 py-1 text-[11px]"
                    >
                      <option value="">All</option>
                      <option value="none">No epic ({epicRollups.data?.summary.orphanBugCount ?? 0})</option>
                      {epicsWithBugs.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title} ({e.bugSummary.openBugs} open)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
                {selectedLabel || selectedStatus || selectedEpicId
                  ? "No bugs match the selected filters."
                  : "No bugs synced for this product yet."}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-glass-border/60 text-left text-[10px] text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Bug</th>
                        <th className="py-1.5 pr-3 font-medium">Priority</th>
                        <th className="py-1.5 pr-3 font-medium">Status</th>
                        <th className="py-1.5 pr-3 font-medium">Epic</th>
                        <th className="py-1.5 pr-3 font-medium">Assignee</th>
                        {SORT_OPTIONS.map((opt) => (
                          <th key={opt.key} className="py-1.5 pr-3 font-medium">
                            <button
                              type="button"
                              onClick={() => toggleSort(opt.key)}
                              className={cn("flex items-center gap-1 hover:text-foreground", sortBy === opt.key && "text-foreground")}
                            >
                              {opt.label}
                              {sortBy === opt.key && <span className="text-[9px]">{sortOrder === "asc" ? "▲" : "▼"}</span>}
                            </button>
                          </th>
                        ))}
                        <th className="py-1.5 pr-1 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((bug) => (
                        <tr
                          key={bug.id}
                          onClick={() => setSelectedBugId(bug.id)}
                          className={cn(
                            "cursor-pointer border-b border-glass-border/30 last:border-0 hover:bg-accent/20",
                            bug.id === effectiveSelectedId && "bg-primary/10"
                          )}
                        >
                          <td className="max-w-[220px] truncate py-2 pr-3 font-medium">
                            {bug.externalId ?? bug.id} · {bug.title}
                          </td>
                          <td className={cn("py-2 pr-3", PRIORITY_TONE[bug.priority ?? ""] ?? "text-muted-foreground")}>
                            {bug.priority ?? "unset"}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {bug.externalStatusName ?? STATUS_LABEL[bug.status]}
                          </td>
                          <td className="max-w-[160px] truncate py-2 pr-3 text-muted-foreground">
                            {bug.parent?.title ?? "—"}
                          </td>
                          <td className="max-w-[140px] truncate py-2 pr-3 text-muted-foreground">
                            {bug.externalAssigneeName ?? bug.externalMetadata?.assigneeName ?? "Unassigned"}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{daysSince(bug.createdAt)}d</td>
                          <td className="py-2 pr-3 text-muted-foreground">{daysSince(bug.updatedAt)}d ago</td>
                          <td className="py-2 pr-1 text-right">
                            <Link
                              to="/bugs/$bugId"
                              params={{ bugId: bug.id }}
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              Open →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

          {epicsWithBugs.length > 0 && (
            <GlassPanel
              title="Bugs by epic"
              subtitle="Which epics are carrying the most open defects, and for how long"
              className="xl:col-span-3"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-glass-border/60 text-left text-[10px] text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Epic</th>
                      <th className="py-1.5 pr-3 font-medium">Open bugs</th>
                      <th className="py-1.5 pr-3 font-medium">Total bugs</th>
                      <th className="py-1.5 pr-3 font-medium">Oldest open bug</th>
                    </tr>
                  </thead>
                  <tbody>
                    {epicsWithBugs.slice(0, 10).map((e) => (
                      <tr key={e.id} className="border-b border-glass-border/30 last:border-0">
                        <td className="max-w-[280px] truncate py-2 pr-3 font-medium">
                          {e.externalId ?? e.id} · {e.title}
                        </td>
                        <td className={cn("py-2 pr-3", e.bugSummary.openBugs > 0 ? "text-critical" : "text-muted-foreground")}>
                          {e.bugSummary.openBugs}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{e.bugSummary.totalBugs}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {e.bugSummary.oldestOpenBugAgeDays !== null ? `${e.bugSummary.oldestOpenBugAgeDays}d` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassPanel>
          )}

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
