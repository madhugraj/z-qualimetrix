import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, RefreshCw, Loader2, Star } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { DocumentHub } from "@/components/qm/DocumentHub";
import { GitInsights } from "@/components/qm/GitInsights";
import { ProductRepositories } from "@/components/qm/ProductRepositories";
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

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string;
}

interface ProviderStatus {
  isConnected: boolean;
  connectedAccountLabel?: string | null;
  lastSyncedAt?: string | null;
}

const DEMO_USER_ID = '1f9c1029-80ed-48ef-8892-c9aa06092640';

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

function Integrations() {
  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [tenantId] = useState('11d0f8f8-fd2e-4e2c-8d01-8f9b0ae1e167');
  const [jiraStatus, setJiraStatus] = useState<ProviderStatus>({ isConnected: false });
  const [adoStatus, setAdoStatus] = useState<ProviderStatus>({ isConnected: false });
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);

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
        // Fetch repositories when connected
        fetchGitHubRepositories();
        return;
      }

      // Then check database status and sync token to localStorage
      try {
        const response = await fetch("http://localhost:3001/api/v1/github-token/status/11d0f8f8-fd2e-4e2c-8d01-8f9b0ae1e167");
        const data = await response.json();
        if (data.success && data.data.isConnected) {
          setIsGitHubConnected(true);
          setGithubUsername(data.data.username || null);
          // Sync to localStorage for consistency and GitInsights access
          localStorage.setItem('github_username', data.data.username || '');

          // Fetch the actual token and sync to localStorage for GitInsights
          try {
            const tokenResponse = await fetch("http://localhost:3001/api/v1/github-token/get/11d0f8f8-fd2e-4e2c-8d01-8f9b0ae1e167");
            const tokenData = await tokenResponse.json();
            if (tokenData.success && tokenData.data.token) {
              localStorage.setItem('github_token', tokenData.data.token);
            }
          } catch (tokenError) {
            console.error('Failed to sync GitHub token to localStorage:', tokenError);
          }

          // Fetch repositories when connected
          fetchGitHubRepositories();
        }
      } catch (error) {
        console.error('Failed to check GitHub status:', error);
      }
    };

    checkGitHubConnection();
  }, []);

  useEffect(() => {
    const fetchProviderStatus = async (provider: "jira" | "azure_devops", setter: (s: ProviderStatus) => void) => {
      try {
        const response = await fetch(`http://localhost:3001/api/v1/integrations/${provider}/status?tenantId=${tenantId}`);
        const data = await response.json();
        if (data.success) setter(data.data);
      } catch (error) {
        console.error(`Failed to check ${provider} status:`, error);
      }
    };

    fetchProviderStatus("jira", setJiraStatus);
    fetchProviderStatus("azure_devops", setAdoStatus);
  }, [tenantId]);

  async function handleProviderAction(provider: "jira" | "azure_devops", isConnected: boolean) {
    if (!isConnected) {
      try {
        const response = await fetch(`http://localhost:3001/api/v1/integrations/${provider}/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, userId: DEMO_USER_ID }),
        });
        const data = await response.json();
        if (data.success) window.location.href = data.data.authorizeUrl;
      } catch (error) {
        console.error(`Failed to start ${provider} connection:`, error);
      }
      return;
    }

    setSyncingProvider(provider);
    try {
      await fetch(`http://localhost:3001/api/v1/integrations/${provider}/sync?tenantId=${tenantId}`, { method: "POST" });
      setTimeout(() => {
        const setter = provider === "jira" ? setJiraStatus : setAdoStatus;
        fetch(`http://localhost:3001/api/v1/integrations/${provider}/status?tenantId=${tenantId}`)
          .then((r) => r.json())
          .then((d) => { if (d.success) setter(d.data); });
      }, 2000);
    } catch (error) {
      console.error(`Failed to sync ${provider}:`, error);
    } finally {
      setSyncingProvider(null);
    }
  }

  // Fetch GitHub repositories for the connected user
  const fetchGitHubRepositories = async () => {
    setIsLoadingRepos(true);
    try {
      const response = await fetch("http://localhost:3001/api/v1/github/user-repositories");
      const data = await response.json();
      if (data.success && data.data) {
        setGithubRepos(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch GitHub repositories:', error);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const refreshGitHubData = () => {
    fetchGitHubRepositories();
  };

  // Override mock status with live data for every provider we actually check
  const updatedIntegrations = INTEGRATIONS.map(integration => {
    if (integration.name === "GitHub") {
      return {
        ...integration,
        status: isGitHubConnected ? "Connected" : "Not configured",
        synced: isGitHubConnected ? "Just now" : "—"
      };
    }
    if (integration.name === "Jira Cloud") {
      return {
        ...integration,
        status: jiraStatus.isConnected ? "Connected" : "Not configured",
        synced: jiraStatus.isConnected ? timeAgo(jiraStatus.lastSyncedAt) : "—",
      };
    }
    if (integration.name === "Azure DevOps") {
      return {
        ...integration,
        status: adoStatus.isConnected ? "Connected" : "Not configured",
        synced: adoStatus.isConnected ? timeAgo(adoStatus.lastSyncedAt) : "—",
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
                  {i.name === "Jira Cloud" && jiraStatus.connectedAccountLabel && (
                    <p className="mt-1 text-xs text-primary">Connected as {jiraStatus.connectedAccountLabel}</p>
                  )}
                  {i.name === "Azure DevOps" && adoStatus.connectedAccountLabel && (
                    <p className="mt-1 text-xs text-primary">Connected as {adoStatus.connectedAccountLabel}</p>
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
                <button
                  onClick={
                    i.name === "GitHub"
                      ? refreshGitHubData
                      : i.name === "Jira Cloud"
                      ? () => handleProviderAction("jira", jiraStatus.isConnected)
                      : i.name === "Azure DevOps"
                      ? () => handleProviderAction("azure_devops", adoStatus.isConnected)
                      : undefined
                  }
                  className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 font-medium text-primary transition-colors hover:bg-primary/25"
                >
                  {(isLoadingRepos && i.name === "GitHub") ||
                  (syncingProvider === "jira" && i.name === "Jira Cloud") ||
                  (syncingProvider === "azure_devops" && i.name === "Azure DevOps") ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
                  )}
                  {connected ? "Sync now" : "Connect"}
                </button>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      {/* Connected GitHub Repositories */}
      {isGitHubConnected && githubRepos.length > 0 && (
        <GlassPanel
          title="Your GitHub Repositories"
          subtitle="Connected repositories from your GitHub account"
        >
          <div className="space-y-2">
            {isLoadingRepos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              githubRepos.slice(0, 8).map((repo) => (
                <div
                  key={repo.full_name}
                  className="flex items-center justify-between rounded-xl border border-glass-border/60 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {repo.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{repo.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-md">
                        {repo.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                    Connected
                  </span>
                </div>
              ))
            )}
          </div>
          {githubRepos.length > 8 && (
            <p className="text-xs text-center text-muted-foreground mt-2">
              +{githubRepos.length - 8} more repositories
            </p>
          )}
        </GlassPanel>
      )}

      {isGitHubConnected && githubRepos.length === 0 && !isLoadingRepos && (
        <GlassPanel
          title="No Repositories Found"
          subtitle="Could not fetch your GitHub repositories"
        >
          <p className="text-sm text-muted-foreground">
            Please ensure your GitHub token has the proper permissions and try refreshing.
          </p>
        </GlassPanel>
      )}

      <GitInsights />

      <ProductRepositories />

      <DocumentHub />

      <GlassPanel
        title="Sync pipeline"
        subtitle="OAuth connect → scheduled polling → normalisation → aggregation"
        className="mt-4"
      >
        <ol className="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
          {[
            ["1 · Poll", "Admin-configurable interval per integration (default every 5 min)"],
            ["2 · Normalise", "Jira & ADO payloads mapped to the unified WorkItem/Sprint model"],
            ["3 · Reconcile", "Items no longer at the source are soft-flagged, never deleted"],
            ["4 · Serve", "Existing analytics endpoints read the synced data directly"],
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
