import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Loader2, GitBranch, AlertTriangle } from "lucide-react";
import { getGitHubMetrics, getGitHubRepositories, type GitHubMetrics } from "@/lib/github-data.service";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { useState, useEffect } from "react";

/**
 * GitInsights Mini Widget - Compact version for dashboard
 * Shows repository health at a glance using real GitHub data
 */
export function GitInsightsMini() {
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [repoOwner, setRepoOwner] = useState<string>("");
  const [repoName, setRepoName] = useState<string>("");

  // Listen for repository changes from FilterBar
  useEffect(() => {
    const handleRepoChange = (event: CustomEvent) => {
      const { repo } = event.detail;
      setSelectedRepo(repo);

      // Parse owner and repo name
      const [owner, ...rest] = repo.split('/');
      setRepoOwner(owner);
      setRepoName(rest.join('/'));
    };

    window.addEventListener('githubRepoChanged', handleRepoChange as EventListener);

    // Load initial repo from localStorage
    const initialRepo = localStorage.getItem('selectedGitHubRepo');
    if (initialRepo) {
      const [owner, ...rest] = initialRepo.split('/');
      setSelectedRepo(initialRepo);
      setRepoOwner(owner);
      setRepoName(rest.join('/'));
    }

    return () => {
      window.removeEventListener('githubRepoChanged', handleRepoChange as EventListener);
    };
  }, []);

  // Fetch available repositories
  const { data: repositories } = useQuery({
    queryKey: ['github-repositories'],
    queryFn: getGitHubRepositories,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch metrics for selected repository
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['github-metrics-mini', repoOwner, repoName],
    queryFn: () => repoOwner && repoName ? getGitHubMetrics(repoOwner, repoName) : null,
    enabled: !!repoOwner && !!repoName,
    refetchInterval: 60000, // Refresh every minute
    refetchOnWindowFocus: true,
  });

  const connected = !!repoOwner && !!repoName;

  if (!selectedRepo) {
    return (
      <GlassPanel title="Repository Health" subtitle="No repository selected" className="glass glass-hover">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CircleDashed className="h-4 w-4" />
          Select a repository from the filter above
        </div>
      </GlassPanel>
    );
  }

  if (isLoading) {
    return (
      <GlassPanel title="Repository Health" subtitle={`Loading ${selectedRepo}...`} className="glass glass-hover">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </GlassPanel>
    );
  }

  if (error || !metrics) {
    return (
      <GlassPanel title="Repository Health" subtitle={selectedRepo} className="glass glass-hover">
        <div className="flex items-start gap-2 rounded-xl border border-dashed border-glass-border p-3 text-xs text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Unable to load repository insights</p>
            <p className="text-[10px] mt-1">Failed to fetch GitHub metrics</p>
          </div>
        </div>
      </GlassPanel>
    );
  }

  if (!data) {
    return (
      <GlassPanel title="Repository Health" subtitle={selectedRepo} className="glass glass-hover">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CircleDashed className="h-4 w-4" />
          No insights available
        </div>
      </GlassPanel>
    );
  }

  const healthScore = metrics.healthScore; // Use actual health score from API

  return (
    <GlassPanel
      title="Repository Health"
      subtitle={selectedRepo}
      className="glass glass-hover"
      action={
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            connected ? "bg-good/20 text-good" : "bg-muted text-muted-foreground"
          }`}
        >
          {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
          {connected ? "Connected" : "Not configured"}
        </div>
      }
    >
      <div className="space-y-3">
        {/* Health Score */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Health Score</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-good"
                style={{ width: `${healthScore}%` }}
              />
            </div>
            <span className="text-xs font-semibold">{healthScore}</span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-glass-border/60 p-2">
            <p className="text-[10px] text-muted-foreground">Total Commits</p>
            <p className="text-sm font-semibold">{metrics.commits}</p>
          </div>
          <div className="rounded-xl border border-glass-border/60 p-2">
            <p className="text-[10px] text-muted-foreground">Contributors</p>
            <p className="text-sm font-semibold">{metrics.contributors}</p>
          </div>
          <div className="rounded-xl border border-glass-border/60 p-2">
            <p className="text-[10px] text-muted-foreground">Pull Requests</p>
            <p className="text-sm font-semibold">{metrics.pullRequests}</p>
          </div>
          <div className="rounded-xl border border-glass-border/60 p-2">
            <p className="text-[10px] text-muted-foreground">Open Issues</p>
            <p className="text-sm font-semibold">{metrics.issues}</p>
          </div>
        </div>

        {/* Repository Selector */}
        {repositories && repositories.length > 1 && (
          <div className="pt-2 border-t border-glass-border/60">
            <label className="block text-[10px] text-muted-foreground mb-1">
              View another repository
            </label>
            <select
              className="w-full text-xs bg-muted/50 border border-glass-border rounded-md px-2 py-1 text-foreground"
              onChange={(e) => {
                const repo = e.target.value;
                setSelectedRepo(repo);
                localStorage.setItem('selectedGitHubRepo', repo);

                // Parse owner and repo name
                const [owner, ...rest] = repo.split('/');
                setRepoOwner(owner);
                setRepoName(rest.join('/'));

                // Dispatch event for other components
                window.dispatchEvent(new CustomEvent('githubRepoChanged', { detail: { repo } }));
              }}
              value={selectedRepo}
            >
              {repositories.map((repository) => (
                <option key={repository.full_name} value={repository.full_name}>
                  {repository.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Activity Indicator */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-glass-border/60">
          <span className="text-muted-foreground">Live data</span>
          <span className="flex items-center gap-1 font-medium">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Connected
          </span>
        </div>
      </div>
    </GlassPanel>
  );
}