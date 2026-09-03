import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { EpicHealthChart, EpicProgressDistributionChart } from "@/components/qm/charts";
import { useCurrentProduct } from "@/lib/product-context";
import { useEpicRollups, type EpicHealth, type EpicRollupRow } from "@/lib/queries/analytics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/epics")({
  head: () => ({
    meta: [
      { title: "Epics — QualiMetrix" },
      {
        name: "description",
        content: "Epic-wise tracking for PM/leadership — health, progress distribution, and filterable per-epic drill-down.",
      },
    ],
  }),
  component: EpicsPage,
});

// Generous enough to cover a single product's entire epic backlog today
// (largest real tenant is ~140) with headroom — the table/filters below need
// the (near-)full set client-side, not just a recency-capped page. Portfolio
// KPIs/charts come from `summary`, which analytics.service.ts computes over
// the truly unbounded set regardless of this number.
const EPIC_FETCH_LIMIT = 500;
const STALE_DAYS = 14;

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  completed: "Completed",
  closed: "Closed",
};

const HEALTH_LABEL: Record<EpicHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};

const HEALTH_BADGE: Record<EpicHealth, string> = {
  on_track: "bg-good/20 text-good",
  at_risk: "bg-warning/20 text-warning",
  blocked: "bg-critical/20 text-critical",
};

// Severity order for sorting "worst first" — mirrors the blocked > at_risk >
// on_track precedence analytics.service.ts's getEpicRollups uses to assign health.
const HEALTH_SEVERITY: Record<EpicHealth, number> = { blocked: 2, at_risk: 1, on_track: 0 };

type ProgressBucketKey = "no_data" | "0-25" | "25-50" | "50-75" | "75-100";
const PROGRESS_BUCKET_LABEL: Record<ProgressBucketKey, string> = {
  no_data: "No data",
  "0-25": "0–25%",
  "25-50": "25–50%",
  "50-75": "50–75%",
  "75-100": "75–100%",
};
const PROGRESS_BUCKET_ORDER: ProgressBucketKey[] = ["no_data", "0-25", "25-50", "50-75", "75-100"];

// Mirrors the exact bucketing analytics.service.ts's getEpicRollups uses to
// build `summary.byProgressBucket`, so filtering a bucket in the table always
// agrees with what the distribution chart shows.
function progressBucketOf(percentComplete: number | null): ProgressBucketKey {
  if (percentComplete === null) return "no_data";
  if (percentComplete < 25) return "0-25";
  if (percentComplete < 50) return "25-50";
  if (percentComplete < 75) return "50-75";
  return "75-100";
}

function daysSince(dateStr: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

// Decimal hours, not Jira's "Xw Yd Zh" — that depends on a per-site
// work-week-hours config this app doesn't have.
function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

function childCountsSummary(row: EpicRollupRow): string {
  if (row.totalChildren === 0) return "No children synced yet";
  return Object.entries(row.childCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${count} ${STATUS_LABEL[status] ?? status}`)
    .join(" · ");
}

function ProgressCell({ row }: { row: EpicRollupRow }) {
  if (row.percentComplete === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${row.percentComplete}%` }} />
        </span>
        <span className="text-xs text-muted-foreground">{row.percentComplete}%</span>
      </div>
      {row.pointsComplete && (
        <span className="text-[10px] text-muted-foreground">
          {row.pointsComplete.done}/{row.pointsComplete.total} pts ({row.pointsComplete.percent}%)
        </span>
      )}
      {row.timeComplete && (
        <span className="text-[10px] text-muted-foreground">
          {formatHours(row.timeComplete.spentSeconds)}/{formatHours(row.timeComplete.estimateSeconds)} logged ({row.timeComplete.percent}%)
        </span>
      )}
    </div>
  );
}

function HealthBadge({ health }: { health: EpicHealth }) {
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", HEALTH_BADGE[health])}>
      {HEALTH_LABEL[health]}
    </span>
  );
}

type SortKey = "title" | "status" | "health" | "totalChildren" | "percentComplete";

function sortValue(row: EpicRollupRow, key: SortKey): number | string {
  switch (key) {
    case "title":
      return row.title.toLowerCase();
    case "status":
      return row.status;
    case "health":
      return HEALTH_SEVERITY[row.health];
    case "totalChildren":
      return row.totalChildren;
    case "percentComplete":
      return row.percentComplete ?? -1;
  }
}

function Th({
  label,
  sortKey,
  activeSort,
  activeDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  activeDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = activeSort === sortKey;
  return (
    <th className="pb-2 pr-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        {active && <span className="text-[9px]">{activeDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function EpicsPage() {
  const { currentProduct, canViewPortfolio, isLoading: productsLoading } = useCurrentProduct();
  const queryEnabled = !productsLoading && (!!currentProduct || canViewPortfolio);
  const rollups = useEpicRollups(currentProduct?.id, queryEnabled, EPIC_FETCH_LIMIT);

  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<EpicHealth | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [progressFilter, setProgressFilter] = useState<ProgressBucketKey | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const epics = rollups.data?.epics ?? [];
  const summary = rollups.data?.summary;

  const statusKeys = useMemo(
    () => Object.keys(summary?.byStatus ?? {}).sort((a, b) => (summary?.byStatus[b] ?? 0) - (summary?.byStatus[a] ?? 0)),
    [summary]
  );

  const attentionList = useMemo(
    () =>
      epics
        .filter((e) => e.health !== "on_track")
        .sort((a, b) => {
          const sev = HEALTH_SEVERITY[b.health] - HEALTH_SEVERITY[a.health];
          if (sev !== 0) return sev;
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        })
        .slice(0, 6),
    [epics]
  );

  const progressChartData = PROGRESS_BUCKET_ORDER.map((key) => ({
    label: PROGRESS_BUCKET_LABEL[key],
    count: summary?.byProgressBucket[key] ?? 0,
  }));

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "health" ? "desc" : "asc");
    }
  };

  const filtered = epics
    .filter((e) => {
      const q = search.trim().toLowerCase();
      return !q || e.title.toLowerCase().includes(q) || (e.externalId ?? "").toLowerCase().includes(q);
    })
    .filter((e) => healthFilter === null || e.health === healthFilter)
    .filter((e) => statusFilter === null || e.status === statusFilter)
    .filter((e) => progressFilter === null || progressBucketOf(e.percentComplete) === progressFilter);

  const rows = [...filtered].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const hasActiveFilters = !!search || healthFilter !== null || statusFilter !== null || progressFilter !== null;

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Epics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Epic-wise tracking — health, progress, and direct child item counts, from real Jira/Azure DevOps parent-child data.
        </p>
      </header>

      <div className="mb-5">
        <FilterBar />
      </div>

      {productsLoading ? (
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      ) : (
        <>
          {summary && (
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <GlassPanel>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Epics</p>
                <p className="mt-1 text-2xl font-semibold">{summary.totalEpics}</p>
              </GlassPanel>
              <GlassPanel>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg % complete</p>
                <p className="mt-1 text-2xl font-semibold">
                  {summary.avgPercentComplete === null ? "—" : `${summary.avgPercentComplete}%`}
                </p>
              </GlassPanel>
              <GlassPanel>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Needs attention</p>
                <p className="mt-1 text-2xl font-semibold text-warning">
                  {summary.byHealth.at_risk + summary.byHealth.blocked}
                </p>
              </GlassPanel>
              <GlassPanel>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">No children yet</p>
                <p className="mt-1 text-2xl font-semibold">{summary.epicsWithNoChildren}</p>
              </GlassPanel>
            </div>
          )}

          {summary && summary.totalEpics > 0 && (
            <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <GlassPanel title="Epic health" subtitle="Blocked = has an open critical/high child" className="xl:col-span-1">
                <EpicHealthChart byHealth={summary.byHealth} />
              </GlassPanel>
              <GlassPanel title="Progress distribution" subtitle="Epic count by % of direct children done" className="xl:col-span-1">
                <EpicProgressDistributionChart data={progressChartData} />
              </GlassPanel>
              <GlassPanel title="Needs attention" subtitle={`Blocked or stale ${STALE_DAYS}+ days`} className="xl:col-span-1">
                {attentionList.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs attention right now.</p>
                ) : (
                  <ul className="space-y-2">
                    {attentionList.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            <span className="font-mono text-xs text-primary">{e.externalId ?? e.id}</span> {e.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {!currentProduct && `${e.productName} · `}
                            Updated {daysSince(e.updatedAt)}d ago
                          </p>
                        </div>
                        <HealthBadge health={e.health} />
                      </li>
                    ))}
                  </ul>
                )}
              </GlassPanel>
            </div>
          )}

          <GlassPanel
            title="All epics"
            subtitle={rollups.data ? `${rows.length} of ${epics.length} epics` : currentProduct?.name ?? "All products"}
            action={
              rollups.data ? (
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search epics…"
                      className="glass rounded-full px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
                    />
                    <select
                      value={progressFilter ?? ""}
                      onChange={(e) => setProgressFilter((e.target.value || null) as ProgressBucketKey | null)}
                      className="glass rounded-full px-2.5 py-1.5 text-[11px] outline-none"
                    >
                      <option value="">All progress</option>
                      {PROGRESS_BUCKET_ORDER.map((key) => (
                        <option key={key} value={key}>
                          {PROGRESS_BUCKET_LABEL[key]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    <span className="self-center pr-1 text-[10px] text-muted-foreground">Health:</span>
                    <Pill active={healthFilter === null} onClick={() => setHealthFilter(null)}>
                      All
                    </Pill>
                    {(Object.keys(HEALTH_LABEL) as EpicHealth[]).map((h) => (
                      <Pill key={h} active={healthFilter === h} onClick={() => setHealthFilter(h)}>
                        {HEALTH_LABEL[h]} ({summary?.byHealth[h] ?? 0})
                      </Pill>
                    ))}
                  </div>
                  {statusKeys.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1">
                      <span className="self-center pr-1 text-[10px] text-muted-foreground">Status:</span>
                      <Pill active={statusFilter === null} onClick={() => setStatusFilter(null)}>
                        All
                      </Pill>
                      {statusKeys.map((s) => (
                        <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                          {STATUS_LABEL[s] ?? s} ({summary?.byStatus[s] ?? 0})
                        </Pill>
                      ))}
                    </div>
                  )}
                </div>
              ) : undefined
            }
          >
            {rollups.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading epics…</p>
            ) : rollups.isError ? (
              <div className="text-sm text-muted-foreground">
                Couldn't load epics.{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => rollups.refetch()}>
                  Retry
                </button>
              </div>
            ) : epics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No epics synced for this scope yet — epics appear here once Jira/Azure DevOps sync brings them in.
              </p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters ? "No epics match the selected filters." : "No epics for this scope."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      <Th label="Epic" sortKey="title" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                      {!currentProduct && <th className="pb-2 pr-3 font-medium">Project</th>}
                      <Th label="Status" sortKey="status" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                      <Th label="Health" sortKey="health" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                      <Th label="Children" sortKey="totalChildren" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                      <Th label="Progress" sortKey="percentComplete" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-glass-border/60">
                        <td className="py-2.5 pr-3 font-medium">
                          {row.externalId ?? row.id} · {row.title}
                        </td>
                        {!currentProduct && (
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">{row.productName}</td>
                        )}
                        <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                          {row.externalStatusName ?? row.status}
                        </td>
                        <td className="py-2.5 pr-3">
                          <HealthBadge health={row.health} />
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                          {childCountsSummary(row)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <ProgressCell row={row} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassPanel>
        </>
      )}
    </AppShell>
  );
}
