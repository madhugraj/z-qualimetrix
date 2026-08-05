import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Download, GitBranch, Layers, User } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { SimilarBugs } from "@/components/qm/SimilarBugs";
import { BUGS, DOMAIN_COLOR, type Bug, type BugDomain } from "@/lib/qm-bugs";
import { exportJson } from "@/lib/qm-export";

export const Route = createFileRoute("/bugs/$bugId")({
  loader: ({ params }) => {
    const bug = BUGS.find((b) => b.id.toLowerCase() === params.bugId.toLowerCase());
    if (!bug) throw notFound();
    return { bug };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Bug not found — QualiMetrix" }, { name: "robots", content: "noindex" }],
      };
    }
    const { bug } = loaderData;
    const title = `${bug.id} · ${bug.title} — QualiMetrix`;
    return {
      meta: [
        { title },
        { name: "description", content: bug.description },
        { property: "og:title", content: title },
        { property: "og:description", content: bug.description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: BugNotFound,
  component: BugDetail,
});

function BugNotFound() {
  return (
    <AppShell>
      <div className="glass rounded-3xl p-8 text-center">
        <h1 className="text-xl font-semibold">Bug not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That defect ID isn&apos;t in the current workspace.
        </p>
        <Link to="/bugs" className="mt-4 inline-block text-sm text-primary underline">
          Back to Bug Intelligence
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

function BugDetail() {
  const { bug } = Route.useLoaderData() as { bug: Bug };
  const domain = bug.domain as BugDomain;
  const timeline = [
    { when: bug.reported, what: `Reported and auto-tagged as ${bug.domain}` },
    { when: bug.reported, what: `Duplicate screening run against ${BUGS.length - 1} historic defects` },
    { when: "Latest", what: `Assigned to ${bug.assignee} · status ${bug.status}` },
  ];

  return (
    <AppShell>
      <header className="mb-6">
        <Link
          to="/bugs"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Bug Intelligence
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-gradient text-2xl font-semibold md:text-3xl">
              {bug.id} · {bug.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-glass-border px-2 py-0.5 text-[11px]"
                style={{ color: DOMAIN_COLOR[domain] }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: DOMAIN_COLOR[domain] }}
                />
                {bug.domain} · {Math.round((bug.confidence ?? 0) * 100)}% confidence
              </span>
              <span>{bug.severity}</span>
              <span>·</span>
              <span>{bug.status}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportJson(`bug-${bug.id}`, bug)}
            className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" /> Export bug
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassPanel title="Defect summary" className="xl:col-span-2">
          <p className="text-sm leading-relaxed text-muted-foreground">{bug.description}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Module" value={bug.module} />
            <Field label="Assignee" value={bug.assignee} />
            <Field label="Severity" value={bug.severity} />
            <Field label="Reported" value={bug.reported} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" /> {bug.path}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" /> {bug.domain}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> {bug.assignee}
            </span>
          </div>
        </GlassPanel>

        <GlassPanel title="Activity" subtitle="Classification & triage trail">
          <ol className="space-y-3">
            {timeline.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="text-xs font-medium">{item.what}</p>
                  <p className="text-[11px] text-muted-foreground">{item.when}</p>
                </div>
              </li>
            ))}
          </ol>
        </GlassPanel>

        <GlassPanel
          title="Related / similar bugs"
          subtitle="tf-idf duplicate screening"
          className="xl:col-span-3"
        >
          <SimilarBugs bug={bug} limit={4} />
        </GlassPanel>
      </div>
    </AppShell>
  );
}
