import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { useCurrentProduct } from "@/lib/product-context";
import { useProjectsOverview, useEpicRollups, type ProjectOverviewRow } from "@/lib/queries/analytics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Projects — QualiMetrix" },
      {
        name: "description",
        content: "Every project in one place — connection status, sync recency, bug resolution, and health score.",
      },
    ],
  }),
  component: ProjectsPage,
});

type SortKey = "name" | "health" | "resolutionRate" | "lastSynced" | "totalBugs";

const SYSTEM_LABEL: Record<string, string> = {
  jira: "Jira",
  azure_devops: "Azure DevOps",
  manual: "Manual",
};

function scoreTone(score: number): string {
  if (score >= 80) return "text-good";
  if (score >= 60) return "text-warning";
  return "text-critical";
}

function formatSyncedAt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function connectionLabel(row: ProjectOverviewRow): string {
  if (!row.isMapped) return "Not connected";
  if (!row.lastSyncedAt) return "Connected — not synced yet";
  return formatSyncedAt(row.lastSyncedAt);
}

function sortValue(row: ProjectOverviewRow, key: SortKey): number | string {
  switch (key) {
    case "name":
      return row.productName.toLowerCase();
    case "health":
      return row.hasData ? row.healthScore : -1;
    case "resolutionRate":
      return row.resolutionRate ?? -1;
    case "lastSynced":
      return row.lastSyncedAt ?? "";
    case "totalBugs":
      return row.totalBugs;
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

function ProjectsPage() {
  const navigate = useNavigate();
  const { setCurrentProductId } = useCurrentProduct();
  const overview = useProjectsOverview();
  const epicRollups = useEpicRollups(undefined, true, 5);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const allProjects = overview.data?.projects ?? [];
  // Overall totals are computed across ALL projects, not just the
  // filtered/visible rows below — "overall" should mean the whole tenant,
  // not whatever the search box currently narrows down to.
  const totalOpenBugs = allProjects.reduce((sum, p) => sum + p.openBugs, 0);
  const totalBugs = allProjects.reduce((sum, p) => sum + p.totalBugs, 0);

  const filtered = allProjects
    .filter((p) => p.productName.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((p) => !openOnly || p.openBugs > 0);

  const rows = [...filtered].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const openProject = (row: ProjectOverviewRow) => {
    setCurrentProductId(row.productId);
    // /backlog, not /bugs — the "Items" count above is every work item type
    // (task/story/epic/subtask/bug), but /bugs only ever shows bug-type
    // items. A project with a nonzero count and zero bugs would otherwise
    // land on a view that's always empty.
    navigate({ to: "/backlog" });
  };

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every project across your tenant — connection status, sync recency, and bug resolution, in one place.
        </p>
      </header>

      {overview.data && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <GlassPanel>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Open bugs — overall</p>
            <p className="mt-1 text-2xl font-semibold">{totalOpenBugs}</p>
          </GlassPanel>
          <GlassPanel>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total bugs — overall</p>
            <p className="mt-1 text-2xl font-semibold">{totalBugs}</p>
          </GlassPanel>
          <GlassPanel>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Projects</p>
            <p className="mt-1 text-2xl font-semibold">{allProjects.length}</p>
          </GlassPanel>
        </div>
      )}

      <GlassPanel
        title="All projects"
        subtitle={overview.data ? `${rows.length} of ${allProjects.length} projects` : undefined}
        action={
          overview.data ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="glass rounded-full px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
                Only with open bugs
              </label>
            </div>
          ) : undefined
        }
      >
        {overview.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : overview.isError ? (
          <div className="text-sm text-muted-foreground">
            Couldn't load projects.{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => overview.refetch()}>
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {allProjects.length === 0
              ? "No active projects yet."
              : "No projects match your search/filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  <Th label="Project" sortKey="name" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <Th label="Last synced" sortKey="lastSynced" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                  <th className="pb-2 pr-3 font-medium">Items</th>
                  <Th label="Bugs" sortKey="totalBugs" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                  <Th label="Resolution" sortKey="resolutionRate" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                  <Th label="Health" sortKey="health" activeSort={sortKey} activeDir={sortDir} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.productId}
                    onClick={() => openProject(row)}
                    className="cursor-pointer border-t border-glass-border/60 transition-colors hover:bg-accent/30"
                  >
                    <td className="py-2.5 pr-3 font-medium">{row.productName}</td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {row.connectedSystems.length > 0
                        ? row.connectedSystems.map((s) => SYSTEM_LABEL[s] ?? s).join(", ")
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">{connectionLabel(row)}</td>
                    <td className="py-2.5 pr-3 text-xs">{row.totalWorkItems}</td>
                    <td className="py-2.5 pr-3 text-xs">
                      {row.totalBugs > 0 ? `${row.openBugs} open / ${row.totalBugs}` : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.resolutionRate === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${row.resolutionRate}%` }}
                            />
                          </span>
                          <span className="text-xs text-muted-foreground">{row.resolutionRate}%</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.hasData ? (
                        <span className={cn("text-xs font-semibold", scoreTone(row.healthScore))}>
                          {row.healthScore}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      <GlassPanel title="Epic progress" subtitle="Most recently updated epics, across every project" className="mt-5">
        {epicRollups.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading epics…</p>
        ) : epicRollups.isError ? (
          <div className="text-sm text-muted-foreground">
            Couldn't load epic progress.{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => epicRollups.refetch()}>
              Retry
            </button>
          </div>
        ) : !epicRollups.data?.epics.length ? (
          <p className="text-sm text-muted-foreground">No epics synced yet.</p>
        ) : (
          <div className="space-y-3">
            {epicRollups.data.epics.map((epic) => (
              <div key={epic.id} className="flex items-center justify-between gap-4 border-t border-glass-border/60 pt-3 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {epic.externalId ?? epic.id} · {epic.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {epic.productName} · {epic.totalChildren} {epic.totalChildren === 1 ? "child item" : "child items"}
                  </p>
                </div>
                {epic.percentComplete === null ? (
                  <span className="shrink-0 text-xs text-muted-foreground">—</span>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${epic.percentComplete}%` }} />
                    </span>
                    <span className="text-xs text-muted-foreground">{epic.percentComplete}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </AppShell>
  );
}
