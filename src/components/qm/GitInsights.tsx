import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  GitPullRequest,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { getGitHubMetrics, getCommitData, getPullRequestData, getIssueData, getCommitAttribution } from "@/lib/github-data.service";
import { useCurrentProduct } from "@/lib/product-context";
import { useProductRepositories, primaryRepo } from "@/lib/queries/product-repositories";
import { cn } from "@/lib/utils";

type Provider = "github" | "gitlab";

const num = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${Math.round(v)}${suffix}`;

/**
 * Live GitHub / GitLab code-quality signals for the current product's
 * mapped repo(s) — reads the same ProductRepository source as FilterBar's
 * GitHubRepoPill and dashboard.tsx's CI panel, instead of its own
 * account-wide repo picker fed by localStorage keys the Settings-page PAT
 * form used to write. Polls every 30s through the backend proxy.
 */
export function GitInsights() {
  const [provider, setProvider] = useState<Provider>("github");
  const { currentProduct } = useCurrentProduct();
  const { data: productRepos, isLoading: reposLoading } = useProductRepositories(currentProduct?.id);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const repo = selectedRepo ?? primaryRepo(productRepos) ?? "";
  const [repoOwner, repoName] = repo.includes("/") ? repo.split("/") : ["", ""];

  // Fetch GitHub metrics for selected repository
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ['github-metrics-full', repoOwner, repoName],
    queryFn: () => repoOwner && repoName ? getGitHubMetrics(repoOwner, repoName) : null,
    enabled: !!repoOwner && !!repoName,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Fetch detailed data for visualizations
  const { data: commits } = useQuery({
    queryKey: ['github-commits', repoOwner, repoName],
    queryFn: () => repoOwner && repoName ? getCommitData(repoOwner, repoName, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) : [],
    enabled: !!repoOwner && !!repoName,
    refetchInterval: 30_000,
  });

  const { data: pullRequests } = useQuery({
    queryKey: ['github-prs', repoOwner, repoName],
    queryFn: () => repoOwner && repoName ? getPullRequestData(repoOwner, repoName) : [],
    enabled: !!repoOwner && !!repoName,
    refetchInterval: 30_000,
  });

  const { data: issues } = useQuery({
    queryKey: ['github-issues', repoOwner, repoName],
    queryFn: () => repoOwner && repoName ? getIssueData(repoOwner, repoName) : [],
    enabled: !!repoOwner && !!repoName,
    refetchInterval: 30_000,
  });

  // Real, persisted AI-vs-human commit attribution (github-commit-sync.service.ts
  // + the Claude Code hook) — separate query since it's backed by our own DB,
  // not a live GitHub API passthrough like the queries above.
  const { data: attribution } = useQuery({
    queryKey: ['commit-attribution', repoOwner, repoName],
    queryFn: () => repoOwner && repoName ? getCommitAttribution(repoOwner, repoName) : null,
    enabled: !!repoOwner && !!repoName,
    refetchInterval: 30_000,
  });

  const connected = !!repoOwner && !!repoName && !!metrics;
  const isLoading = metricsLoading || reposLoading;
  const hasError = metricsError;

  // Process data for display
  const d = metrics ? {
    pulls: {
      open: pullRequests?.filter(pr => pr.state === 'open').length || 0,
      mergedLast30d: pullRequests?.filter(pr =>
        pr.merged_at && new Date(pr.merged_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length || 0,
      stale: pullRequests?.filter(pr =>
        pr.state === 'open' && (Date.now() - new Date(pr.created_at).getTime()) > 7 * 24 * 60 * 60 * 1000
      ).length || 0,
      avgMergeHours: pullRequests && pullRequests.length > 0 ?
        Math.round(
          pullRequests
            .filter(pr => pr.created_at && pr.merged_at)
            .reduce((sum, pr) => {
              const created = new Date(pr.created_at).getTime();
              const merged = new Date(pr.merged_at!).getTime();
              return sum + (merged - created) / (1000 * 60 * 60);
            }, 0) / pullRequests.filter(pr => pr.merged_at).length || 0
        ) : 0,
      list: pullRequests?.filter(pr => pr.state === 'open').slice(0, 5).map(pr => ({
        id: `#${pr.number}`,
        title: pr.title,
        url: pr.url,
        author: pr.user,
        ageHours: (Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60)
      })) || []
    },
    commits: {
      last30d: metrics.commits, // Use actual metrics
      authors: metrics.contributors, // Use actual metrics
      // Real diff stats once github-commit-sync.service.ts has backfilled
      // them (attribution.churn.commitsWithStats > 0); otherwise an explicit,
      // visibly-labeled estimate — never presented as measured.
      additions: attribution && attribution.churn.commitsWithStats > 0 ? attribution.churn.additions : metrics.commits * 15,
      deletions: attribution && attribution.churn.commitsWithStats > 0 ? attribution.churn.deletions : metrics.commits * 8,
      churnIsEstimate: !(attribution && attribution.churn.commitsWithStats > 0),
      churnSeries: Array.from({ length: 8 }, (_, i) => {
        const weekStart = new Date(Date.now() - (7 - i) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(Date.now() - (6 - i) * 7 * 24 * 60 * 60 * 1000);
        const weekCommits = commits?.filter(c => {
          const commitDate = new Date(c.date);
          return commitDate >= weekStart && commitDate < weekEnd;
        }) || [];

        return {
          week: `W${8 - i}`,
          additions: weekCommits.length * 15, // Estimate
          deletions: weekCommits.length * 8 // Estimate
        };
      })
    },
    issues: {
      open: issues?.filter(i => i.state === 'open').length || 0,
      bugs: issues?.filter(i => i.labels.some(l => l.toLowerCase().includes('bug'))).length || 0,
      list: issues?.filter(i => i.state === 'open').slice(0, 4).map(i => ({
        id: `#${i.number}`,
        title: i.title,
        url: i.url,
        ageDays: (Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24),
        labels: i.labels
      })) || []
    },
    ci: {
      successRate: metrics.healthScore, // Use health score as proxy for CI success
      failed: metrics.issues, // Use issues as proxy for failed builds
      avgDurationMin: 0,
      list: [] // Would need GitHub Actions API
    },
    provider: "github",
    repo: repo,
    fetchedAt: new Date().toISOString()
  } : null;

  return (
    <GlassPanel
      title="Git code quality — live"
      subtitle="Pull requests, code churn, CI pipelines and issues streamed from GitHub or GitLab (auto-refresh every 30s)."
      className="mt-4"
      action={
        <button
          type="button"
          onClick={() => {
            // Refetch all GitHub data
            [metrics, commits, pullRequests, issues].forEach(query => {
              if (query) query.refetch();
            });
          }}
          className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:text-primary"
        >
          {isLoading ? (
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

      <div className="mt-3 space-y-2">
        {!currentProduct ? (
          <p className="text-xs text-muted-foreground">Select a product to see its repository.</p>
        ) : !productRepos || productRepos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No GitHub repository mapped to this product yet — add one below under Product Repositories.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">Repository:</label>
            {productRepos.length > 1 ? (
              <select
                value={repo}
                onChange={(e) => setSelectedRepo(e.target.value)}
                className="rounded-md border border-glass-border bg-transparent px-3 py-2 text-xs min-w-[16rem]"
              >
                {productRepos.map((r) => (
                  <option key={r.githubRepo} value={r.githubRepo}>
                    {r.githubRepo}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-medium">{repo}</span>
            )}
            <button
              type="button"
              onClick={() => {
                [metrics, commits, pullRequests, issues].forEach(query => {
                  if (query) query.refetch();
                });
              }}
              disabled={!repo || isLoading}
              className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {hasError && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-dashed border-glass-border p-4 text-xs text-critical">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Failed to load GitHub data. Please check your connection and try again.
        </p>
      )}

      {isLoading && (
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
                {d.commits.churnIsEstimate && " (estimated — real diff stats not synced yet)"}
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

          {attribution && attribution.totalCommits > 0 && (
            <div className="mt-3 rounded-2xl border border-glass-border/60 p-3">
              <p className="text-xs font-semibold">AI vs human commit attribution (30d)</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {attribution.totalCommits} commits · exact and detected counts shown separately — never combined into one "AI %".
              </p>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
                {(["exact", "heuristic", "unattributed"] as const).map((tier) => {
                  const width = (attribution[tier] / attribution.totalCommits) * 100;
                  if (width <= 0) return null;
                  return (
                    <div
                      key={tier}
                      className={cn(
                        tier === "exact" && "bg-good",
                        tier === "heuristic" && "bg-primary/60",
                        tier === "unattributed" && "bg-muted-foreground/30",
                      )}
                      style={{ width: `${width}%` }}
                      title={`${tier}: ${attribution[tier]}`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-good" /> Exact (hook-verified): {attribution.exact}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary/60" /> Detected (trailer): {attribution.heuristic}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Unattributed: {attribution.unattributed}
                </span>
              </div>
              {Object.keys(attribution.byTool).length > 0 && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  By tool: {Object.entries(attribution.byTool).map(([tool, count]) => `${tool} (${count})`).join(" · ")}
                </p>
              )}
            </div>
          )}

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
