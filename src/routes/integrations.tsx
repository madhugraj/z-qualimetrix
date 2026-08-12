import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { DocumentHub } from "@/components/qm/DocumentHub";
import { GitInsights } from "@/components/qm/GitInsights";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { INTEGRATIONS } from "@/lib/qm-data";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Jira, Azure DevOps & CI | QualiMetrix" },
      {
        name: "description",
        content:
          "Connect Jira Cloud, Azure DevOps, GitHub and CI pipelines to sync work items, test executions and sprint data into QualiMetrix.",
      },
      { property: "og:title", content: "QualiMetrix Integrations" },
      {
        property: "og:description",
        content: "OAuth and webhook ingestion for Jira Cloud, Azure DevOps, GitHub and CI.",
      },
    ],
  }),
  component: Integrations,
});

function Integrations() {
  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);

  // Check GitHub connection status from both localStorage and database
  useEffect(() => {
    const checkGitHubConnection = async () => {
      // First check localStorage
      const localToken = localStorage.getItem('github_token');
      if (localToken) {
        setIsGitHubConnected(true);
        const localUsername = localStorage.getItem('github_username');
        if (localUsername) {
          setGithubUsername(localUsername);
        }
        return;
      }

      // Then check database status
      try {
        const response = await fetch("http://localhost:3001/api/v1/github-token/status/11d0f8f8-fd2e-4e2c-8d01-8f9b0ae1e167");
        const data = await response.json();
        if (data.success && data.data.isConnected) {
          setIsGitHubConnected(true);
          setGithubUsername(data.data.username || null);
          // Sync to localStorage for consistency
          localStorage.setItem('github_username', data.data.username || '');
        }
      } catch (error) {
        console.error('Failed to check GitHub status:', error);
      }
    };

    checkGitHubConnection();
  }, []);

  // Update GitHub integration status dynamically
  const updatedIntegrations = INTEGRATIONS.map(integration => {
    if (integration.name === "GitHub") {
      return {
        ...integration,
        status: isGitHubConnected ? "Connected" : "Not configured",
        synced: isGitHubConnected ? "Just now" : "—"
      };
    }
    return integration;
  });

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Integrations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Automated ingestion sources. Dashboards fall back to sample data until a source is
            connected.
          </p>
        </div>
        <Link
          to="/settings"
          className="glass rounded-full px-4 py-2 text-xs font-medium transition-colors hover:text-primary"
        >
          {isGitHubConnected ? "Manage GitHub" : "Configure GitHub"}
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {updatedIntegrations.map((i) => {
          const connected = i.status === "Connected";
          return (
            <GlassPanel key={i.name} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{i.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{i.detail}</p>
                  {i.name === "GitHub" && githubUsername && (
                    <p className="mt-1 text-xs text-primary">Connected as {githubUsername}</p>
                  )}
                </div>
                <span
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    connected ? "bg-good/20 text-good" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {connected ? (
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5" strokeWidth={1.8} />
                  )}
                  {i.status}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-glass-border/60 pt-3 text-xs text-muted-foreground">
                <span>Last sync: {i.synced}</span>
                <button className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 font-medium text-primary transition-colors hover:bg-primary/25">
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {connected ? "Sync now" : "Connect"}
                </button>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      <GitInsights />

      <DocumentHub />

      <GlassPanel
        title="Sync pipeline"
        subtitle="Webhook ingestion → normalisation → aggregation"
        className="mt-4"
      >
        <ol className="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
          {[
            ["1 · Ingest", "Webhook payloads queued durably with retry + backoff"],
            ["2 · Normalise", "Jira & ADO payloads mapped to unified WorkItem model"],
            ["3 · Aggregate", "Daily & sprint QualityMetricsSnapshot rollups"],
            ["4 · Serve", "Cached dashboard aggregates under 200ms"],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl border border-glass-border/60 p-3">
              <p className="text-xs font-semibold text-foreground">{t}</p>
              <p className="mt-1">{d}</p>
            </li>
          ))}
        </ol>
      </GlassPanel>
    </AppShell>
  );
}
