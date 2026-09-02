import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, ExternalLink, Tag, User } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { DemoDataBadge } from "@/components/qm/DemoDataNotice";
import { SimilarBugs } from "@/components/qm/SimilarBugs";
import { exportJson } from "@/lib/qm-export";
import { useBugDetail } from "@/lib/queries/bugs";
import { useSimilarBugs } from "@/lib/queries/analytics";

export const Route = createFileRoute("/bugs/$bugId")({
  head: () => ({
    meta: [{ title: "Bug detail — QualiMetrix" }],
  }),
  component: BugDetail,
});

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  completed: "Completed",
};

const STATUS_TONE: Record<string, string> = {
  open: "text-muted-foreground",
  in_progress: "text-warning",
  resolved: "text-good",
  completed: "text-good",
};

function BugNotFound() {
  return (
    <AppShell>
      <div className="glass rounded-3xl p-8 text-center">
        <h1 className="text-xl font-semibold">Bug not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That defect ID isn&apos;t in your workspace, or you don&apos;t have access to it.
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function BugDetail() {
  const { bugId } = Route.useParams();
  const bugQuery = useBugDetail(bugId);
  const bug = bugQuery.data;

  const similarBugs = useSimilarBugs(bug?.productId, bugId, 4);

  if (bugQuery.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading bug…</p>
      </AppShell>
    );
  }

  if (bugQuery.isError || !bug) {
    return <BugNotFound />;
  }

  const daysInStatus = Math.round(
    (Date.now() - new Date(bug.statusChangedAt ?? bug.updatedAt).getTime()) / 86_400_000
  );
  const jiraKey = bug.externalMetadata?.jiraKey;
  const jiraUrl = bug.jiraSiteUrl && jiraKey ? `${bug.jiraSiteUrl}/browse/${jiraKey}` : null;
  const assignee = bug.externalMetadata?.assigneeName ?? bug.externalMetadata?.assigneeEmail ?? "Unassigned";

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
              {bug.externalId ?? bug.id} · {bug.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Priority: {bug.priority ?? "unset"}</span>
              <span className="text-muted-foreground">·</span>
              <span className={STATUS_TONE[bug.status]}>
                {bug.externalStatusName ?? STATUS_LABEL[bug.status]}
              </span>
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
              onClick={() => exportJson(`bug-${bug.externalId ?? bug.id}`, bug)}
              className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" /> Export bug
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassPanel title="Defect summary" className="xl:col-span-2">
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {bug.descriptionText || "No description."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Priority" value={bug.priority ?? "unset"} />
            <Field label="Assignee" value={assignee} />
            <Field label="Status" value={bug.externalStatusName ?? STATUS_LABEL[bug.status]} />
            <Field label="Reported" value={formatDate(bug.createdAt)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" /> {bug.labels.length > 0 ? bug.labels.join(", ") : "No labels"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> {assignee}
            </span>
          </div>
        </GlassPanel>

        <GlassPanel title="Activity" subtitle="Real sync history">
          <ol className="space-y-3">
            <li className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div>
                <p className="text-xs font-medium">Created</p>
                <p className="text-[11px] text-muted-foreground">{formatDate(bug.createdAt)}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div>
                <p className="text-xs font-medium">
                  Currently {bug.externalStatusName ?? STATUS_LABEL[bug.status]}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {daysInStatus <= 0 ? "Changed today" : `${daysInStatus} day(s) in this status`}
                </p>
              </div>
            </li>
            {bug.reopenCount > 0 && (
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" />
                <div>
                  <p className="text-xs font-medium">Reopened {bug.reopenCount} time(s)</p>
                </div>
              </li>
            )}
            {bug.resolvedAt && (
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-good" />
                <div>
                  <p className="text-xs font-medium">Resolved</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(bug.resolvedAt)}</p>
                </div>
              </li>
            )}
            <li className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
              <div>
                <p className="text-xs font-medium">Last synced</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(bug.lastSeenAtSourceAt ?? bug.updatedAt)}
                </p>
              </div>
            </li>
          </ol>
        </GlassPanel>

        <GlassPanel
          title="Related / similar bugs"
          subtitle="Duplicate screening for this defect"
          className="xl:col-span-3"
          action={!similarBugs.isLoading && !similarBugs.data?.hasData ? <DemoDataBadge /> : undefined}
        >
          {similarBugs.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SimilarBugs hasData={similarBugs.data?.hasData} matches={similarBugs.data?.similar} isLoading={similarBugs.isLoading} />
          )}
        </GlassPanel>
      </div>
    </AppShell>
  );
}
