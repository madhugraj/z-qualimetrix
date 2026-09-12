import { CheckCircle2, Download, ExternalLink, FileText, FolderSync, Link2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Input } from "@/components/ui/input";
import { PRODUCTS } from "@/lib/qm-data";
import {
  DOC_SOURCES,
  DOC_SOURCE_NAME,
  PROJECT_DOCUMENTS,
  documentFileContent,
  type DocSourceId,
} from "@/lib/qm-documents";
import { exportText } from "@/lib/qm-export";
import { useConfluencePages } from "@/lib/queries/confluence";
import { cn } from "@/lib/utils";

/**
 * Document download system.
 * Step 1 — identify the project. Step 2 — connect the repositories that hold
 * its documentation. Step 3 — browse and download.
 *
 * gdrive/sharepoint/onedrive connections here are session state only — mock,
 * visibly badged as such, never presented as equal-trust peers of the real
 * source below. Confluence is a real integration (see
 * src/api/services/confluence-sync.service.ts); its connect/sync/space-
 * selection controls live on the Confluence status card on the Integrations
 * page (src/routes/integrations.tsx), not here — this panel only browses
 * what's already been synced.
 */
export function DocumentHub() {
  const [project, setProject] = useState(PRODUCTS[0]);
  const [connected, setConnected] = useState<Record<string, DocSourceId[]>>({
    [PRODUCTS[0]]: ["gdrive"],
  });
  const [query, setQuery] = useState("");

  const active = connected[project] ?? [];
  const confluencePages = useConfluencePages();

  const mockDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROJECT_DOCUMENTS.filter(
      (d) =>
        d.project === project &&
        active.includes(d.source) &&
        (q === "" || `${d.title} ${d.kind} ${d.owner}`.toLowerCase().includes(q)),
    );
  }, [project, active, query]);

  // Confluence pages aren't scoped by QualiMetrix product — a synced space
  // can span several products at once, or none — so they always show here
  // regardless of which project tab is selected, filtered only by search.
  const matchedConfluencePages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (confluencePages.data ?? []).filter(
      (p) => q === "" || `${p.title} ${p.space.name}`.toLowerCase().includes(q),
    );
  }, [confluencePages.data, query]);

  const toggleSource = (id: DocSourceId, name: string) => {
    setConnected((prev) => {
      const list = prev[project] ?? [];
      const next = list.includes(id) ? list.filter((s) => s !== id) : [...list, id];
      return { ...prev, [project]: next };
    });
    toast.success(
      active.includes(id) ? `${name} disconnected from ${project}` : `${name} connected to ${project}`,
      { description: "Mock connection — no external OAuth is performed." },
    );
  };

  const downloadOne = (id: string) => {
    const doc = PROJECT_DOCUMENTS.find((d) => d.id === id);
    if (!doc) return;
    exportText(`${doc.id}-${doc.title.replace(/[^\w]+/g, "-").toLowerCase()}.md`, documentFileContent(doc));
    toast.success(`Downloading ${doc.title}`);
  };

  const downloadAll = () => {
    if (mockDocs.length === 0) return;
    exportText(
      `${project.replace(/\s+/g, "-").toLowerCase()}-documents.md`,
      mockDocs.map(documentFileContent).join("\n\n---\n\n"),
    );
    toast.success(`${mockDocs.length} documents bundled for ${project}`);
  };

  const hasAnyResults = mockDocs.length > 0 || matchedConfluencePages.length > 0;

  return (
    <GlassPanel
      title="Document repositories"
      subtitle="Pick the project, connect its document sources, then browse and download."
      className="mt-4"
      action={
        <button
          type="button"
          onClick={downloadAll}
          disabled={mockDocs.length === 0}
          className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:text-primary disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.7} /> Download all
        </button>
      }
    >
      {/* Step 1 — project */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Project</span>
        {PRODUCTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setProject(p)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              p === project
                ? "bg-primary text-primary-foreground"
                : "glass text-muted-foreground hover:text-foreground",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Step 2 — sources */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-2xl border border-glass-border/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold">Atlassian Confluence</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Synced pages from spaces you've selected — connect and choose spaces on the Integrations page above.
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-good/20 px-2 py-1 text-[10px] font-medium text-good">
              <CheckCircle2 className="h-3 w-3" /> Real · synced
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{confluencePages.data?.length ?? 0} page(s) synced</p>
        </div>

        {DOC_SOURCES.map((s) => {
          const on = active.includes(s.id);
          return (
            <div key={s.id} className="flex flex-col gap-2 rounded-2xl border border-glass-border/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{s.name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{s.detail}</p>
                </div>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
                    on ? "bg-good/20 text-good" : "bg-muted text-muted-foreground",
                  )}
                >
                  {on ? <CheckCircle2 className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                  {on ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-medium text-warning">Mock</span>
                  {s.scope}
                </span>
                <button
                  type="button"
                  onClick={() => toggleSource(s.id, s.name)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 font-medium text-primary transition-colors hover:bg-primary/25"
                >
                  <FolderSync className="h-3 w-3" strokeWidth={1.8} />
                  {on ? "Disconnect" : "Connect"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 3 — documents */}
      <div className="mt-5">
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents"
            className="h-9 pl-8 text-xs"
          />
        </div>

        {!hasAnyResults ? (
          <p className="mt-4 rounded-2xl border border-dashed border-glass-border p-6 text-center text-xs text-muted-foreground">
            {active.length === 0 && !matchedConfluencePages.length
              ? `Connect a document source to list ${project} documentation.`
              : "No documents match this filter."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-glass-border/60">
            {matchedConfluencePages.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <FileText className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.6} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{p.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    Confluence · {p.space.name} · Updated {new Date(p.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={p.webUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" strokeWidth={1.8} /> Open
                </a>
              </li>
            ))}
            {mockDocs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <FileText className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.6} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{d.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {d.kind} · {DOC_SOURCE_NAME[d.source]} · {d.owner} · {d.updated} · {d.size}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadOne(d.id)}
                  className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors hover:text-primary"
                >
                  <Download className="h-3 w-3" strokeWidth={1.8} /> Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GlassPanel>
  );
}
