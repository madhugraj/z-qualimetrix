import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { BugDomainDonut } from "@/components/qm/BugDomainDonut";
import { SimilarBugs } from "@/components/qm/SimilarBugs";
import { BUGS, BUG_DOMAINS, DOMAIN_COLOR, type BugDomain } from "@/lib/qm-bugs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bugs")({
  head: () => ({
    meta: [
      { title: "Bug Intelligence — QualiMetrix" },
      {
        name: "description",
        content:
          "Automatic defect domain classification across UI/UX, Backend/API, AI/ML and Infrastructure, with duplicate detection for incoming bugs.",
      },
      { property: "og:title", content: "Bug Intelligence — QualiMetrix" },
      {
        property: "og:description",
        content: "Domain tagging and similar-bug detection to stop duplicate developer effort.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BugsPage,
});

function BugsPage() {
  const [filter, setFilter] = useState<BugDomain | "all">("all");
  const [selectedId, setSelectedId] = useState(BUGS[0].id);
  const list = filter === "all" ? BUGS : BUGS.filter((b) => b.domain === filter);
  const selected = BUGS.find((b) => b.id === selectedId) ?? BUGS[0];

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Bug Intelligence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every incoming defect is auto-tagged by domain and screened against history for duplicates.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassPanel title="Bug domain distribution" subtitle="Which layer is generating defects">
          <BugDomainDonut />
        </GlassPanel>

        <GlassPanel
          title="Classified defects"
          subtitle="Rule engine over title, description &amp; repo path"
          className="xl:col-span-2"
          action={
            <div className="flex flex-wrap gap-1">
              {(["all", ...BUG_DOMAINS] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFilter(d as BugDomain | "all")}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    filter === d
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d === "all" ? "All" : d}
                </button>
              ))}
            </div>
          }
        >
          <ul className="space-y-2">
            {list.map((bug) => (
              <li key={bug.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(bug.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    bug.id === selected.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-glass-border hover:bg-accent/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: DOMAIN_COLOR[bug.domain!] }}
                    />
                    <span className="truncate text-xs font-medium">
                      {bug.id} · {bug.title}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {bug.domain} · {Math.round((bug.confidence ?? 0) * 100)}% confidence ·{" "}
                    {bug.severity} · {bug.status} · {bug.assignee}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </GlassPanel>

        <GlassPanel
          title="Related / similar bugs"
          subtitle="Duplicate screening for the selected defect"
          className="xl:col-span-3"
        >
          <SimilarBugs bug={selected} limit={4} />
        </GlassPanel>
      </div>
    </AppShell>
  );
}
