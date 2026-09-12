import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Download, ExternalLink, Layers } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { HealthBadge } from "@/components/qm/EpicHealthBadge";
import { InsightBlock, ChartDisclosure } from "@/components/qm/InsightBlock";
import { exportJson } from "@/lib/qm-export";
import {
  useEpicDetail,
  useEpicChildren,
  useLinkedDocuments,
  useSuggestedDocuments,
  useLinkDocument,
  useUnlinkDocument,
} from "@/lib/queries/epics";
import { useEpicRollups } from "@/lib/queries/analytics";
import { useConfluencePageSearch } from "@/lib/queries/confluence";

// Matches epics.tsx's EPIC_FETCH_LIMIT — large enough to cover a single
// product's entire epic backlog so the matching rollup row is always present.
const EPIC_FETCH_LIMIT = 500;

export const Route = createFileRoute("/epics/$epicId")({
  head: () => ({
    meta: [{ title: "Epic detail — QualiMetrix" }],
  }),
  component: EpicDetail,
});

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  completed: "Completed",
  closed: "Closed",
};

function EpicNotFound() {
  return (
    <AppShell>
      <div className="glass rounded-3xl p-8 text-center">
        <h1 className="text-xl font-semibold">Epic not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That epic ID isn&apos;t in your workspace, or you don&apos;t have access to it.
        </p>
        <Link to="/epics" className="mt-4 inline-block text-sm text-primary underline">
          Back to Epics
        </Link>
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-glass-border p-3">
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-xs font-medium">{value}</p>
    </div>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function LinkedDocumentationPanel({ epicId }: { epicId: string }) {
  const linked = useLinkedDocuments(epicId);
  const linkMutation = useLinkDocument(epicId);
  const unlinkMutation = useUnlinkDocument(epicId);
  const [search, setSearch] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const searchResults = useConfluencePageSearch(search, search.trim().length > 1);
  const suggested = useSuggestedDocuments(epicId, suggestionsOpen);

  const linkedPageIds = new Set((linked.data ?? []).map((l) => l.page.id));

  return (
    <GlassPanel
      title="Linked documentation"
      subtitle="Confluence pages attached to this epic"
      className="xl:col-span-3"
    >
      <div className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Confluence pages to attach…"
            className="glass w-full rounded-full px-3 py-2 text-xs outline-none placeholder:text-muted-foreground"
          />
          {search.trim().length > 1 && (
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-glass-border/60 p-2">
              {searchResults.isLoading ? (
                <p className="p-2 text-xs text-muted-foreground">Searching…</p>
              ) : !searchResults.data?.results.length ? (
                <p className="p-2 text-xs text-muted-foreground">
                  {searchResults.data?.hasData === false ? "No Confluence pages synced yet." : "No matching pages."}
                </p>
              ) : (
                searchResults.data.results.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-accent/20">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{r.spaceName}</p>
                    </div>
                    <button
                      type="button"
                      disabled={linkedPageIds.has(r.id) || linkMutation.isPending}
                      onClick={() => linkMutation.mutate(r.id)}
                      className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary disabled:opacity-40"
                    >
                      {linkedPageIds.has(r.id) ? "Attached" : "Attach"}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {linked.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading linked pages…</p>
        ) : !linked.data?.length ? (
          <p className="text-sm text-muted-foreground">No Confluence pages linked yet.</p>
        ) : (
          <ul className="space-y-2">
            {linked.data.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <a
                    href={l.page.webUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-medium hover:underline"
                  >
                    {l.page.title}
                  </a>
                  <p className="text-[11px] text-muted-foreground">
                    {l.page.space.name} · Updated {new Date(l.page.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => unlinkMutation.mutate(l.id)}
                  disabled={unlinkMutation.isPending}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium text-critical hover:bg-critical/10"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}

        <ChartDisclosure label="Show suggested pages" onToggle={setSuggestionsOpen}>
          {suggested.isLoading ? (
            <p className="text-sm text-muted-foreground">Looking for related pages…</p>
          ) : !suggested.data?.results.length ? (
            <p className="text-sm text-muted-foreground">
              {suggested.data?.hasData ? "No closely-matching pages found." : "No Confluence pages synced yet."}
            </p>
          ) : (
            <>
              <InsightBlock
                insight={{
                  text: `${suggested.data.results.length} page${suggested.data.results.length === 1 ? "" : "s"} closely match this epic's content.`,
                  action: "Linking them keeps requirements traceable to their source spec.",
                }}
              />
              <ul className="mt-3 space-y-2">
                {suggested.data.results.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {r.spaceName} · {r.snippet}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => linkMutation.mutate(r.id)}
                      disabled={linkMutation.isPending}
                      className="shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary"
                    >
                      Link
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartDisclosure>
      </div>
    </GlassPanel>
  );
}

function EpicDetail() {
  const { epicId } = Route.useParams();
  const epicQuery = useEpicDetail(epicId);
  const epic = epicQuery.data;

  const rollups = useEpicRollups(epic?.productId, !!epic?.productId, EPIC_FETCH_LIMIT);
  const rollup = rollups.data?.epics.find((e) => e.id === epicId);

  const children = useEpicChildren(epicId);

  if (epicQuery.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading epic…</p>
      </AppShell>
    );
  }

  if (epicQuery.isError || !epic) {
    return <EpicNotFound />;
  }

  const jiraKey = epic.externalMetadata?.jiraKey;
  const jiraUrl = epic.jiraSiteUrl && jiraKey ? `${epic.jiraSiteUrl}/browse/${jiraKey}` : null;

  return (
    <AppShell>
      <header className="mb-6">
        <Link
          to="/epics"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Epics
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-gradient text-2xl font-semibold md:text-3xl">
              {epic.externalId ?? epic.id} · {epic.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {epic.externalStatusName ?? STATUS_LABEL[epic.status] ?? epic.status}
              </span>
              {rollup && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <HealthBadge health={rollup.health} />
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {jiraUrl && (
              <a
                href={jiraUrl}
                target="_blank"
                rel="noreferrer"
                className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View in Jira
              </a>
            )}
            <button
              type="button"
              onClick={() => exportJson(`epic-${epic.externalId ?? epic.id}`, epic)}
              className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" /> Export epic
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassPanel title="Epic summary" className="xl:col-span-2">
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {epic.descriptionText || "No description."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Status" value={epic.externalStatusName ?? STATUS_LABEL[epic.status] ?? epic.status} />
            <Field label="Progress" value={rollup?.percentComplete != null ? `${rollup.percentComplete}%` : "—"} />
            <Field label="Reported" value={formatDate(epic.createdAt)} />
            <Field label="Last synced" value={formatDate(epic.lastSeenAtSourceAt ?? epic.updatedAt)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {rollup?.boardNames.length ? `Board: ${rollup.boardNames.join(", ")}` : "No board data synced yet"}
            </span>
          </div>
        </GlassPanel>

        <GlassPanel title="Bugs under this epic" subtitle="Direct bug children only">
          {!rollup || rollup.bugSummary.totalBugs === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No bugs linked to this epic.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-2xl font-semibold">
                {rollup.bugSummary.openBugs}{" "}
                <span className="text-sm font-normal text-muted-foreground">open of {rollup.bugSummary.totalBugs}</span>
              </p>
              {rollup.bugSummary.oldestOpenBugAgeDays !== null && (
                <p className="text-xs text-muted-foreground">
                  Oldest open bug: {rollup.bugSummary.oldestOpenBugAgeDays}d old
                </p>
              )}
              <Link to="/bugs" className="inline-block text-xs text-primary hover:underline">
                View bugs →
              </Link>
            </div>
          )}
        </GlassPanel>

        <GlassPanel
          title="Children"
          subtitle={children.data ? `${children.data.workItems.length} direct child item(s)` : "Direct children"}
          className="xl:col-span-3"
        >
          {children.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading children…</p>
          ) : !children.data || children.data.workItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No children synced for this epic yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    <th className="pb-2 pr-3 font-medium">Item</th>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Priority</th>
                    <th className="pb-2 pr-3 font-medium">Assignee</th>
                  </tr>
                </thead>
                <tbody>
                  {children.data.workItems.map((child) => (
                    <tr key={child.id} className="border-t border-glass-border/60">
                      <td className="py-2.5 pr-3 font-medium">
                        {child.type === "bug" ? (
                          <Link to="/bugs/$bugId" params={{ bugId: child.id }} className="hover:underline">
                            {child.externalId ?? child.id} · {child.title}
                          </Link>
                        ) : (
                          <span>
                            {child.externalId ?? child.id} · {child.title}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground capitalize">{child.type}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {child.externalStatusName ?? STATUS_LABEL[child.status] ?? child.status}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{child.priority ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {child.externalAssigneeName ?? "Unassigned"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassPanel>

        <LinkedDocumentationPanel epicId={epic.id} />
      </div>
    </AppShell>
  );
}
