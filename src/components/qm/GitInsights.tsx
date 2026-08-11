import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  GitBranch,
  GitPullRequest,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Input } from "@/components/ui/input";
import { getGitStatus, getRepoInsights } from "@/lib/git.functions";
import { cn } from "@/lib/utils";

type Provider = "github" | "gitlab";

const num = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${Math.round(v)}${suffix}`;

/**
 * Live GitHub / GitLab code-quality signals.
 * Polls every 30s through server functions (GitHub via the Lovable connector
 * gateway, GitLab via a project access token).
 */
export function GitInsights() {
  const [provider, setProvider] = useState<Provider>("github");
  const [input, setInput] = useState("facebook/react");
  const [repo, setRepo] = useState("facebook/react");

  const status = useQuery({ queryKey: ["git-status"], queryFn: () => getGitStatus() });

  const insights = useQuery({
    queryKey: ["git-insights", provider, repo],
    queryFn: () => getRepoInsights({ data: { provider, repo } }),
    enabled: repo.includes("/"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const connected = provider === "github" ? status.data?.github : status.data?.gitlab;
  const result = insights.data;
  const d = result?.ok ? result.data : null;

  return (
    <GlassPanel
      title="Git code quality — live"
      subtitle="Pull requests, code churn, CI pipelines and issues streamed from GitHub or GitLab (auto-refresh every 30s)."
      className="mt-4"
      action={
        <button
          type="button"
          onClick={() => insights.refetch()}
          className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:text-primary"
        >
          {insights.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.7} />
          )}
          Sync now
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {(["github", "gitlab"] as Provider[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setProvider(p)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              p === provider
                ? "bg-primary text-primary-foreground"
                : "glass text-muted-foreground hover:text-foreground",
            )}
          >
            {p}
          </button>
        ))}
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
            connected ? "bg-good/20 text-good" : "bg-muted text-muted-foreground",
          )}
        >
          {connected ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
          {connected ? "Credentials active" : "Not configured"}
        </span>
      </div>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setRepo(input.trim());
        }}
      >
        <div className="relative min-w-[16rem] flex-1">
          <GitBranch className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={provider === "github" ? "owner/repository" : "group/project"}
            className="h-9 pl-8 text-xs"
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
        >
          Track repository
        </button>
      </form>

      {result && !result.ok && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-dashed border-glass-border p-4 text-xs text-critical">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.error}
        </p>
      )}

      {insights.isLoading && (
        <p className="mt-4 text-xs text-muted-foreground">Fetching live repository signals…</p>
      )}

      {d && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Open PRs / MRs", String(d.pulls.open), `${d.pulls.stale} older than 7d`],
              ["Avg merge time", num(d.pulls.avgMergeHours, "h"), `${d.pulls.mergedLast30d} merged / 30d`],
              ["Commits (30d)", String(d.commits.last30d), `${d.commits.authors} authors`],
              [
                "CI success",
                `${d.ci.successRate}%`,
                `${d.ci.failed} failed · avg ${num(d.ci.avgDurationMin, "m")}`,
              ],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-2xl border border-glass-border/60 p-3">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-glass-border/60 p-3">
              <p className="text-xs font-semibold">Code churn</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                +{d.commits.additions.toLocaleString()} / -{d.commits.deletions.toLocaleString()} lines
              </p>
              <div className="mt-3 flex h-20 items-end gap-1">
                {d.commits.churnSeries.map((w) => {
                  const max = Math.max(
                    1,
                    ...d.commits.churnSeries.map((x) => x.additions + x.deletions),
                  );
                  return (
                    <div key={w.week} className="flex flex-1 flex-col justify-end gap-0.5">
                      <div
                        className="rounded-t bg-good/70"
                        style={{ height: `${(w.additions / max) * 60}px` }}
                        title={`+${w.additions}`}
                      />
                      <div
                        className="rounded-b bg-critical/60"
                        style={{ height: `${(w.deletions / max) * 60}px` }}
                        title={`-${w.deletions}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-glass-border/60 p-3">
              <p className="text-xs font-semibold">Open issues linked to defects</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {d.issues.open} open · {d.issues.bugs} tagged as bug/regression
              </p>
              <ul className="mt-2 divide-y divide-glass-border/60">
                {d.issues.list.slice(0, 4).map((i) => (
                  <li key={i.id} className="py-2">
                    <a
                      href={i.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-[11px] font-medium hover:text-primary"
                    >
                      {i.id} {i.title}
                    </a>
                    <p className="text-[10px] text-muted-foreground">
                      {Math.round(i.ageDays)}d old {i.labels.length ? `· ${i.labels.slice(0, 3).join(", ")}` : ""}
                    </p>
                  </li>
                ))}
                {d.issues.list.length === 0 && (
                  <li className="py-2 text-[11px] text-muted-foreground">No open issues.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-glass-border/60 p-3">
              <p className="text-xs font-semibold">Review queue</p>
              <ul className="mt-2 divide-y divide-glass-border/60">
                {d.pulls.list.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-2">
                    <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-[11px] hover:text-primary"
                    >
                      {p.id} {p.title}
                    </a>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {p.author} · {Math.round(p.ageHours)}h
                    </span>
                  </li>
                ))}
                {d.pulls.list.length === 0 && (
                  <li className="py-2 text-[11px] text-muted-foreground">Nothing waiting on review.</li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-glass-border/60 p-3">
              <p className="text-xs font-semibold">Recent pipelines</p>
              <ul className="mt-2 divide-y divide-glass-border/60">
                {d.ci.list.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        r.status === "success" ? "bg-good" : "bg-critical",
                      )}
                    />
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-[11px] hover:text-primary"
                    >
                      {r.id} {r.name}
                    </a>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {num(r.durationMin, "m")}
                    </span>
                  </li>
                ))}
                {d.ci.list.length === 0 && (
                  <li className="py-2 text-[11px] text-muted-foreground">No pipeline runs found.</li>
                )}
              </ul>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-muted-foreground">
            Last synced {new Date(d.fetchedAt).toLocaleTimeString()} · {d.provider} · {d.repo}
          </p>
        </>
      )}
    </GlassPanel>
  );
}
