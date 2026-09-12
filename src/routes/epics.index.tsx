import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { GlassPanel } from "@/components/qm/GlassPanel";
import {
  AgeDistributionChart,
  CategoryCountChart,
  EpicHealthChart,
  EpicProgressDistributionChart,
  type CategoryCount,
} from "@/components/qm/charts";
import { HEALTH_LABEL, HealthBadge } from "@/components/qm/EpicHealthBadge";
import { InsightBlock, ChartDisclosure, type Insight } from "@/components/qm/InsightBlock";
import { useCurrentProduct } from "@/lib/product-context";
import { useEpicRollups, type EpicHealth, type EpicRollupRow, type EpicRollupsSummary } from "@/lib/queries/analytics";
import { STALE_ITEM_THRESHOLD_DAYS } from "@/lib/qm-thresholds";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/epics/")({
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
const STALE_DAYS = STALE_ITEM_THRESHOLD_DAYS;

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  completed: "Completed",
  closed: "Closed",
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

const AGE_BUCKETS: Array<{ label: string; max: number }> = [
  { label: "0–7d", max: 7 },
  { label: "7–14d", max: 14 },
  { label: "14–30d", max: 30 },
  { label: "30–90d", max: 90 },
  { label: "90d+", max: Infinity },
];

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

// Derived from fields already on the rollup — a one-line hint for the
// "Needs attention" panel, not a new signal. on_track epics never reach
// this panel (filtered out before rendering), so no case for them here.
function suggestedAction(e: EpicRollupRow): string {
  if (e.health === "blocked") {
    return e.bugSummary.openBugs > 0
      ? `Blocked by ${e.bugSummary.openBugs} open critical/high bug${e.bugSummary.openBugs === 1 ? "" : "s"} — triage or reassign.`
      : "Blocked by an open critical/high-priority child — check its status.";
  }
  const owner = e.externalAssigneeName ?? "the owner";
  return `Stale ${daysSince(e.updatedAt)}d at ${e.percentComplete ?? 0}% — check in with ${owner}.`;
}

// Every insight below pairs a plain-language read of the numbers with a
// concrete next step — all derived from fields already present in
// `summary`/the per-epic rows, no new data fetched for this.
function healthInsight(summary: EpicRollupsSummary): Insight {
  const total = summary.totalEpics;
  const blocked = summary.byHealth.blocked;
  const atRisk = summary.byHealth.at_risk;
  const pctBlocked = total > 0 ? Math.round((blocked / total) * 100) : 0;
  return {
    text: `${blocked} of ${total} epics (${pctBlocked}%) are blocked${atRisk > 0 ? `, and ${atRisk} more ${atRisk === 1 ? "is" : "are"} stalling` : ""}.`,
    action:
      blocked > 0
        ? `Clear the ${blocked} blocked epic${blocked === 1 ? "" : "s"} first — see Needs attention below for specifics.`
        : "No blocked epics right now — keep watching the stale ones instead.",
  };
}

function progressInsight(summary: EpicRollupsSummary): Insight {
  const total = summary.totalEpics;
  const highProgress = summary.byProgressBucket["75-100"];
  const noData = summary.byProgressBucket.no_data;
  const pctHigh = total > 0 ? Math.round((highProgress / total) * 100) : 0;
  return {
    text: `${pctHigh}% of epics are 75%+ complete${noData > 0 ? `; ${noData} can't be measured (no children synced)` : ""}.`,
    action:
      noData > 0
        ? `Check the ${noData} epic${noData === 1 ? "" : "s"} with no children — likely a missing Jira/ADO link, not actually empty.`
        : "Progress data is complete across the portfolio.",
  };
}

function productInsight(data: CategoryCount[], totalEpics: number): Insight | null {
  if (data.length === 0) return null;
  const top = data[0];
  const pct = totalEpics > 0 ? Math.round((top.count / totalEpics) * 100) : 0;
  return {
    text: `${top.label} carries ${top.count} of ${totalEpics} epics (${pct}%)${data.length > 1 ? `, next is ${data[1].label} at ${data[1].count}` : ""}.`,
    action:
      pct >= 50
        ? `${top.label} dominates the portfolio — confirm its team has capacity before adding more epics there.`
        : "Epic load is reasonably spread across products.",
  };
}

function assigneeInsight(data: CategoryCount[], totalEpics: number): Insight {
  const unassigned = data.find((d) => d.label === "Unassigned")?.count ?? 0;
  const named = data.filter((d) => d.label !== "Unassigned" && !d.label.startsWith("Other ("));
  const top3 = named.slice(0, 3).reduce((sum, d) => sum + d.count, 0);
  const pctTop3 = totalEpics > 0 ? Math.round((top3 / totalEpics) * 100) : 0;
  return {
    text: `Top 3 owners hold ${pctTop3}% of all epics${unassigned > 0 ? `; ${unassigned} epic${unassigned === 1 ? "" : "s"} ${unassigned === 1 ? "has" : "have"} no assignee` : ""}.`,
    action:
      unassigned > 0
        ? `Assign an owner to the ${unassigned} unassigned epic${unassigned === 1 ? "" : "s"} — unowned work is easy to lose track of.`
        : pctTop3 >= 50
          ? "Ownership is concentrated in a few people — check they aren't overloaded."
          : "Ownership is reasonably distributed.",
  };
}

function ageInsight(data: CategoryCount[], totalEpics: number): Insight {
  const stale = data.filter((b) => b.label === "30–90d" || b.label === "90d+").reduce((sum, b) => sum + b.count, 0);
  const pct = totalEpics > 0 ? Math.round((stale / totalEpics) * 100) : 0;
  return {
    text: `${stale} epic${stale === 1 ? "" : "s"} (${pct}%) haven't been updated in 30+ days.`,
    action:
      stale > 0
        ? `Review the ${stale} stale epic${stale === 1 ? "" : "s"} — close finished ones, reprioritize or reassign the rest.`
        : "Everything's been touched recently — no stale backlog buildup.",
  };
}

// Owner-concentration read on the at-risk/blocked set as a whole, distinct
// from suggestedAction()'s per-epic hint below each card.
function attentionInsight(list: EpicRollupRow[]): Insight | null {
  if (list.length === 0) return null;
  const byOwner = new Map<string, number>();
  for (const e of list) {
    const owner = e.externalAssigneeName ?? "Unassigned";
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
  }
  const [topOwner, topCount] = [...byOwner.entries()].sort((a, b) => b[1] - a[1])[0];
  const concentrated = topCount > 1 && topCount / list.length >= 0.3;
  return {
    text: `${list.length} epic${list.length === 1 ? "" : "s"} need attention${concentrated ? ` — ${topCount} of them ${topOwner === "Unassigned" ? "have no assignee" : `are owned by ${topOwner}`}` : ""}.`,
    action: concentrated
      ? topOwner === "Unassigned"
        ? "Assign owners to these first — you can't escalate work nobody owns."
        : `Start with ${topOwner} — they own the largest cluster of at-risk work.`
      : "Work through these in order below, worst first.",
  };
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
  const [boardFilter, setBoardFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const epics = rollups.data?.epics ?? [];
  const summary = rollups.data?.summary;

  const statusKeys = useMemo(
    () => Object.keys(summary?.byStatus ?? {}).sort((a, b) => (summary?.byStatus[b] ?? 0) - (summary?.byStatus[a] ?? 0)),
    [summary]
  );

  // Board isn't in `summary` (unlike status/health) — it's derived per-epic
  // by analytics.service.ts from synced Jira sprint data, so the option list
  // comes straight from what's actually present on the fetched epics.
  const boardKeys = useMemo(
    () => Array.from(new Set(epics.flatMap((e) => e.boardNames))).sort(),
    [epics]
  );

  // Unsliced set drives the aggregate insight below; the panel itself only
  // ever shows the worst 6 (attentionList).
  const allAttention = useMemo(
    () =>
      epics
        .filter((e) => e.health !== "on_track")
        .sort((a, b) => {
          const sev = HEALTH_SEVERITY[b.health] - HEALTH_SEVERITY[a.health];
          if (sev !== 0) return sev;
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        }),
    [epics]
  );
  const attentionList = allAttention.slice(0, 6);

  // Only meaningful in portfolio scope — a single-product view would just be one bar.
  const byProductData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of epics) counts.set(e.productName, (counts.get(e.productName) ?? 0) + 1);
    return Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [epics]);

  // Mirrors getAssigneeWorkload's convention of tracking "unassigned" separately
  // rather than as a synthetic bucket lumped in with real people (analytics.service.ts).
  const byAssigneeData = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    let unassigned = 0;
    for (const e of epics) {
      if (!e.externalAssigneeId) {
        unassigned++;
        continue;
      }
      const existing = counts.get(e.externalAssigneeId);
      if (existing) existing.count++;
      else counts.set(e.externalAssigneeId, { label: e.externalAssigneeName ?? "Unknown", count: 1 });
    }
    const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    const TOP_N = 8;
    const top = sorted.slice(0, TOP_N);
    const restCount = sorted.slice(TOP_N).reduce((sum, r) => sum + r.count, 0);
    if (restCount > 0) top.push({ label: `Other (${sorted.length - TOP_N})`, count: restCount });
    if (unassigned > 0) top.push({ label: "Unassigned", count: unassigned });
    return top;
  }, [epics]);

  const byAgeData = useMemo(() => {
    const counts = AGE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
    for (const e of epics) {
      const age = daysSince(e.updatedAt);
      const idx = AGE_BUCKETS.findIndex((b) => age <= b.max);
      counts[idx === -1 ? counts.length - 1 : idx].count++;
    }
    return counts;
  }, [epics]);

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
    .filter((e) => progressFilter === null || progressBucketOf(e.percentComplete) === progressFilter)
    .filter((e) => boardFilter === null || e.boardNames.includes(boardFilter));

  const rows = [...filtered].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const hasActiveFilters =
    !!search || healthFilter !== null || statusFilter !== null || progressFilter !== null || boardFilter !== null;

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
            <>
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Health &amp; progress</h2>
              <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <GlassPanel title="Epic health" subtitle="Blocked = has an open critical/high child">
                  <InsightBlock insight={healthInsight(summary)} />
                  <ChartDisclosure>
                    <EpicHealthChart byHealth={summary.byHealth} />
                  </ChartDisclosure>
                </GlassPanel>
                <GlassPanel title="Progress distribution" subtitle="Epic count by % of direct children done">
                  <InsightBlock insight={progressInsight(summary)} />
                  <ChartDisclosure>
                    <EpicProgressDistributionChart data={progressChartData} />
                  </ChartDisclosure>
                </GlassPanel>
              </div>

              <GlassPanel title="Needs attention" subtitle={`Blocked or stale ${STALE_DAYS}+ days`} className="mb-5">
                {attentionList.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs attention right now.</p>
                ) : (
                  <>
                    <InsightBlock insight={attentionInsight(allAttention)!} />
                    <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {attentionList.map((e) => (
                        <li key={e.id} className="flex items-center gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <Link
                              to="/epics/$epicId"
                              params={{ epicId: e.id }}
                              className="block truncate text-sm font-medium hover:underline"
                            >
                              <span className="font-mono text-xs text-primary">{e.externalId ?? e.id}</span> {e.title}
                            </Link>
                            <p className="text-[11px] text-muted-foreground">
                              {!currentProduct && `${e.productName} · `}
                              Updated {daysSince(e.updatedAt)}d ago
                            </p>
                            <p className={cn("mt-1 text-[11px]", e.health === "blocked" ? "text-critical" : "text-warning")}>
                              {suggestedAction(e)}
                            </p>
                          </div>
                          <HealthBadge health={e.health} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </GlassPanel>

              <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Portfolio distribution</h2>
              <div className={cn("mb-5 grid grid-cols-1 gap-4", currentProduct ? "lg:grid-cols-2" : "lg:grid-cols-3")}>
                {!currentProduct &&
                  (() => {
                    const productInsightValue = productInsight(byProductData, summary.totalEpics);
                    return (
                      <GlassPanel title="By product" subtitle="Epic count per product">
                        {productInsightValue && <InsightBlock insight={productInsightValue} />}
                        {productInsightValue ? (
                          <ChartDisclosure>
                            <CategoryCountChart data={byProductData} />
                          </ChartDisclosure>
                        ) : (
                          <CategoryCountChart data={byProductData} />
                        )}
                      </GlassPanel>
                    );
                  })()}
                <GlassPanel title="By assignee" subtitle="Epic count per owner">
                  <InsightBlock insight={assigneeInsight(byAssigneeData, summary.totalEpics)} />
                  <ChartDisclosure>
                    <CategoryCountChart data={byAssigneeData} />
                  </ChartDisclosure>
                </GlassPanel>
                <GlassPanel title="By age" subtitle="Days since last update">
                  <InsightBlock insight={ageInsight(byAgeData, summary.totalEpics)} />
                  <ChartDisclosure>
                    <AgeDistributionChart data={byAgeData} emptyMessage="No epics for this scope yet." />
                  </ChartDisclosure>
                </GlassPanel>
              </div>
            </>
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
                  {boardKeys.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1">
                      <span className="self-center pr-1 text-[10px] text-muted-foreground">Board:</span>
                      <Pill active={boardFilter === null} onClick={() => setBoardFilter(null)}>
                        All
                      </Pill>
                      {boardKeys.map((b) => (
                        <Pill key={b} active={boardFilter === b} onClick={() => setBoardFilter(b)}>
                          {b}
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
                      <th className="pb-2 pr-3 font-medium">Open bugs</th>
                      <Th label="Children" sortKey="totalChildren" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                      <Th label="Progress" sortKey="percentComplete" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-glass-border/60">
                        <td className="py-2.5 pr-3 font-medium">
                          <Link to="/epics/$epicId" params={{ epicId: row.id }} className="hover:underline">
                            {row.externalId ?? row.id} · {row.title}
                          </Link>
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
                        <td className="py-2.5 pr-3 text-xs">
                          {row.bugSummary.totalBugs === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Link
                              to="/bugs"
                              className={cn(
                                "hover:underline",
                                row.bugSummary.openBugs > 0 ? "text-critical" : "text-muted-foreground"
                              )}
                            >
                              {row.bugSummary.openBugs} open / {row.bugSummary.totalBugs}
                            </Link>
                          )}
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
