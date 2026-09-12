import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { DemoDataBadge } from "@/components/qm/DemoDataNotice";
import { BacklogFlowChart, PriorityBreakdownChart, AgeDistributionChart } from "@/components/qm/charts";
import { useCurrentProduct } from "@/lib/product-context";
import { useDateRange } from "@/lib/date-range-context";
import { useBacklogList, useBacklogSummary, useBacklogFlow, useAgeDistribution } from "@/lib/queries/backlog";
import { useAssigneeWorkload } from "@/lib/queries/analytics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/backlog")({
  head: () => ({
    meta: [
      { title: "Backlog — QualiMetrix" },
      {
        name: "description",
        content: "Every open and in-progress work item across your synced projects, by priority and type.",
      },
    ],
  }),
  component: BacklogPage,
});

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
};

const TYPE_LABEL: Record<string, string> = {
  bug: "Bug",
  story: "Story",
  task: "Task",
  epic: "Epic",
  subtask: "Sub-task",
};

const PRIORITY_ORDER = ["critical", "high", "medium", "low"];
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
];

const PRIORITY_TONE: Record<string, string> = {
  critical: "text-critical",
  high: "text-warning",
  medium: "text-muted-foreground",
  low: "text-muted-foreground",
};

function formatAge(createdAt: string): string {
  const days = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function BacklogPage() {
  const { currentProduct, canViewPortfolio, isLoading: productsLoading } = useCurrentProduct();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const queryEnabled = !productsLoading && (!!currentProduct || canViewPortfolio);
  const { startDate, endDate } = useDateRange();

  const summary = useBacklogSummary(currentProduct?.id, queryEnabled);
  const flow = useBacklogFlow(currentProduct?.id, queryEnabled, startDate, endDate);
  const aging = useAgeDistribution(currentProduct?.id, queryEnabled);
  // Reused as the assignee picker's data source — same real per-assignee
  // counts Engineering Health's workload table uses, just narrowed to the
  // open/in-progress slice for this backlog view.
  const workload = useAssigneeWorkload(currentProduct?.id, queryEnabled);
  const assigneeOptions = useMemo(
    () =>
      (workload.data?.assignees ?? [])
        .map((a) => ({
          id: a.externalAssigneeId,
          name: a.displayName,
          openCount: (a.itemsByStatus.open ?? 0) + (a.itemsByStatus.in_progress ?? 0),
        }))
        .filter((a) => a.openCount > 0)
        .sort((a, b) => b.openCount - a.openCount),
    [workload.data]
  );
  const list = useBacklogList(
    {
      productId: currentProduct?.id,
      type: typeFilter ?? undefined,
      priority: priorityFilter ?? undefined,
      status: statusFilter ?? undefined,
      externalAssigneeId: assigneeFilter ?? undefined,
      page,
      limit: PAGE_SIZE,
    },
    { enabled: queryEnabled }
  );

  const rows = list.data?.workItems ?? [];
  const pagination = list.data?.pagination;
  const byType = summary.data?.byType ?? {};
  const byPriority = summary.data?.byPriority ?? {};
  const byStatus = summary.data?.byStatus ?? {};
  const typeKeys = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);

  const selectType = (t: string | null) => {
    setTypeFilter(t);
    setPage(1);
  };
  const selectPriority = (p: string | null) => {
    setPriorityFilter(p);
    setPage(1);
  };
  const selectStatus = (s: string | null) => {
    setStatusFilter(s);
    setPage(1);
  };
  const selectAssignee = (a: string | null) => {
    setAssigneeFilter(a);
    setPage(1);
  };

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Backlog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything not yet done — open and in-progress work items across every synced project. Derived
          from item status, not a board's ranked backlog order.
        </p>
      </header>

      <div className="mb-5">
        <FilterBar />
      </div>

      {productsLoading ? (
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      ) : (
        <>
          {summary.data && (
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <GlassPanel>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total backlog</p>
                <p className="mt-1 text-2xl font-semibold">{summary.data.total}</p>
              </GlassPanel>
              <GlassPanel>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Critical / High priority</p>
                <p className="mt-1 text-2xl font-semibold">
                  {(byPriority.critical ?? 0) + (byPriority.high ?? 0)}
                </p>
              </GlassPanel>
              <GlassPanel>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Oldest open item</p>
                <p className="mt-1 text-2xl font-semibold">
                  {summary.data.oldestCreatedAt ? formatAge(summary.data.oldestCreatedAt) : "—"}
                </p>
              </GlassPanel>
              <GlassPanel>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Unassigned critical/high</p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-semibold",
                    summary.data.unassignedCriticalHigh > 0 && "text-critical"
                  )}
                >
                  {summary.data.unassignedCriticalHigh}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Nobody's picked these up yet</p>
              </GlassPanel>
            </div>
          )}

          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <GlassPanel
              title="Backlog trend"
              subtitle="Created vs completed, with net change — is the backlog growing or shrinking"
              className="xl:col-span-2"
              action={!flow.data?.length ? <DemoDataBadge /> : undefined}
            >
              <BacklogFlowChart
                data={flow.data}
                emptyMessage={currentProduct ? `No backlog activity yet for ${currentProduct.name}.` : "No backlog activity recorded yet."}
              />
            </GlassPanel>

            <GlassPanel title="By priority" subtitle="Severity mix of the open backlog" action={!summary.data?.hasData ? <DemoDataBadge /> : undefined}>
              <PriorityBreakdownChart byPriority={byPriority} />
            </GlassPanel>

            <GlassPanel title="Backlog age" subtitle="Days since reported, for everything still open" className="xl:col-span-3" action={!aging.data?.hasData ? <DemoDataBadge /> : undefined}>
              <AgeDistributionChart data={aging.data?.buckets} />
            </GlassPanel>
          </div>

          <GlassPanel
            title="Open work items"
            subtitle={currentProduct?.name ?? "All products"}
            action={
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex flex-wrap justify-end gap-1">
                  <span className="self-center pr-1 text-[10px] text-muted-foreground">Type:</span>
                  <button
                    type="button"
                    onClick={() => selectType(null)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      typeFilter === null
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All
                  </button>
                  {typeKeys.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => selectType(t)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                        typeFilter === t
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {TYPE_LABEL[t] ?? t} ({byType[t]})
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <span className="self-center pr-1 text-[10px] text-muted-foreground">Priority:</span>
                  <button
                    type="button"
                    onClick={() => selectPriority(null)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      priorityFilter === null
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All
                  </button>
                  {PRIORITY_ORDER.filter((p) => byPriority[p] > 0).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => selectPriority(p)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                        priorityFilter === p
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p} ({byPriority[p]})
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <span className="self-center pr-1 text-[10px] text-muted-foreground">Status:</span>
                  <button
                    type="button"
                    onClick={() => selectStatus(null)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      statusFilter === null
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
                        statusFilter === s.key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s.label} ({byStatus[s.key] ?? 0})
                    </button>
                  ))}
                </div>
                {(assigneeOptions.length > 0 || (summary.data?.unassignedCriticalHigh ?? 0) > 0) && (
                  <div className="flex items-center gap-1.5">
                    <span className="pr-0.5 text-[10px] text-muted-foreground">Assignee:</span>
                    <select
                      value={assigneeFilter ?? ""}
                      onChange={(e) => selectAssignee(e.target.value || null)}
                      className="rounded-full border border-glass-border bg-transparent px-2 py-1 text-[11px]"
                    >
                      <option value="">All</option>
                      <option value="unassigned">Unassigned</option>
                      {assigneeOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.openCount})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            }
          >
            {list.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading backlog…</p>
            ) : list.isError ? (
              <div className="text-sm text-muted-foreground">
                Couldn't load the backlog.{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => list.refetch()}>
                  Retry
                </button>
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {typeFilter || priorityFilter || statusFilter || assigneeFilter
                  ? "No open items match the selected filters."
                  : "Nothing open right now — backlog is clear for this scope."}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
                        <th className="pb-2 pr-3 font-medium">Item</th>
                        <th className="pb-2 pr-3 font-medium">Type</th>
                        <th className="pb-2 pr-3 font-medium">Priority</th>
                        <th className="pb-2 pr-3 font-medium">Status</th>
                        <th className="pb-2 pr-3 font-medium">Assignee</th>
                        <th className="pb-2 pr-3 font-medium">Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item) => (
                        <tr key={item.id} className="border-t border-glass-border/60">
                          <td className="py-2.5 pr-3 font-medium">
                            {item.type === "bug" ? (
                              <Link to="/bugs/$bugId" params={{ bugId: item.id }} className="hover:underline">
                                {item.externalId ?? item.id} · {item.title}
                              </Link>
                            ) : (
                              <span>
                                {item.externalId ?? item.id} · {item.title}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                            {TYPE_LABEL[item.type] ?? item.type}
                          </td>
                          <td className={cn("py-2.5 pr-3 text-xs font-medium capitalize", PRIORITY_TONE[item.priority ?? ""])}>
                            {item.priority ?? "unset"}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                            {item.externalStatusName ?? STATUS_LABEL[item.status] ?? item.status}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                            {item.externalAssigneeName ?? item.externalMetadata?.assigneeName ?? "Unassigned"}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">{formatAge(item.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pagination && pagination.totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Page {pagination.page} of {pagination.totalPages} · {pagination.total} items
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
        </>
      )}
    </AppShell>
  );
}
