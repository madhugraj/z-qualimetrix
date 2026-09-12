import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, RefreshCw, Loader2, Star, FolderKanban, Users } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { DocumentHub } from "@/components/qm/DocumentHub";
import { GitInsights } from "@/components/qm/GitInsights";
import { ProductRepositories } from "@/components/qm/ProductRepositories";
import { GpuComputeConnect } from "@/components/qm/GpuComputeConnect";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { RequireRole } from "@/components/qm/RequireRole";
import { INTEGRATIONS } from "@/lib/qm-data";
import { API_V1_URL } from "@/lib/api-config";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  status?: string;
  connectedAccountLabel?: string | null;
  lastSyncedAt?: string | null;
  externalMetadata?: {
    selectedProjectIds?: string[];
    selectedUserAccountIds?: string[];
  };
  scopes?: string[];
}

// Confluence rides Jira's OAuth consent screen (jira-oauth.service.ts's
// SCOPES comment) — a Jira connection made before Confluence's scopes were
// added simply won't have any of these in its stored `scopes`, which is the
// only way to tell "needs one more re-auth" apart from "never connected".
const CONFLUENCE_SCOPE_MARKER = "read:page:confluence";

interface JiraProject { id: string; key: string; name: string }
interface JiraUser { accountId: string; displayName: string; emailAddress: string | null; avatarUrl: string | null }
interface AdoProject { id: string; key: string; name: string }

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
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [connectingGithub, setConnectingGithub] = useState(false);
  const [jiraStatus, setJiraStatus] = useState<ProviderStatus>({ isConnected: false });
  const [adoStatus, setAdoStatus] = useState<ProviderStatus>({ isConnected: false });
  const [confluenceStatus, setConfluenceStatus] = useState<ProviderStatus>({ isConnected: false });
  const [syncingConfluence, setSyncingConfluence] = useState(false);
  const [confluenceSpaces, setConfluenceSpaces] = useState<Array<{ key: string; name: string; spaceType: string | null; isSelected: boolean }>>([]);
  const [selectedConfluenceSpaces, setSelectedConfluenceSpaces] = useState<string[]>([]);
  const [loadingConfluenceSpaces, setLoadingConfluenceSpaces] = useState(false);
  const [savingConfluenceSelection, setSavingConfluenceSelection] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [jiraUsers, setJiraUsers] = useState<JiraUser[]>([]);
  const [selectedJiraProjects, setSelectedJiraProjects] = useState<string[]>([]);
  const [selectedJiraUsers, setSelectedJiraUsers] = useState<string[]>([]);
  const [loadingJiraDiscovery, setLoadingJiraDiscovery] = useState(false);
  const [savingJiraSelection, setSavingJiraSelection] = useState(false);
  const [adoProjects, setAdoProjects] = useState<AdoProject[]>([]);
  const [selectedAdoProjects, setSelectedAdoProjects] = useState<string[]>([]);
  const [loadingAdoDiscovery, setLoadingAdoDiscovery] = useState(false);
  const [savingAdoSelection, setSavingAdoSelection] = useState(false);

  // GitHub credential lives server-side only now — never synced into
  // localStorage or read directly from the browser (see github.controller.ts
  // and settings.tsx's now-removed PAT form). Just check status and, if
  // connected, fetch the repo list through the backend proxy.
  const checkGitHubConnection = async () => {
    try {
      const response = await fetch(`${API_V1_URL}/github-token/status`, { credentials: "include" });
      const data = await response.json();
      if (data.success && data.data.isConnected) {
        setIsGitHubConnected(true);
        setGithubUsername(data.data.username || null);
        fetchGitHubRepositories();
      } else {
        setIsGitHubConnected(false);
        setGithubUsername(null);
      }
    } catch (error) {
      console.error('Failed to check GitHub status:', error);
    }
  };

  useEffect(() => {
    if (tenantId) checkGitHubConnection();
  }, [tenantId]);

  useEffect(() => {
    if (!jiraStatus.isConnected) {
      setJiraProjects([]);
      setJiraUsers([]);
      return;
    }

    setSelectedJiraProjects(jiraStatus.externalMetadata?.selectedProjectIds ?? []);
    setSelectedJiraUsers(jiraStatus.externalMetadata?.selectedUserAccountIds ?? []);
    setLoadingJiraDiscovery(true);
    Promise.all([
      fetch(`${API_V1_URL}/integrations/jira/projects`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_V1_URL}/integrations/jira/users`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([projectsData, usersData]) => {
        if (projectsData.success) setJiraProjects(projectsData.data);
        if (usersData.success) setJiraUsers(usersData.data);
        if (!projectsData.success || !usersData.success) {
          toast.error("Some Jira data could not be loaded");
        }
      })
      .catch((error) => {
        console.error("Failed to discover Jira data:", error);
        toast.error("Couldn't load Jira projects and users");
      })
      .finally(() => setLoadingJiraDiscovery(false));
  }, [jiraStatus.isConnected, tenantId]);

  useEffect(() => {
    if (!adoStatus.isConnected) {
      setAdoProjects([]);
      return;
    }

    setSelectedAdoProjects(adoStatus.externalMetadata?.selectedProjectIds ?? []);
    setLoadingAdoDiscovery(true);
    fetch(`${API_V1_URL}/integrations/azure_devops/projects`, { credentials: "include" })
      .then((r) => r.json())
      .then((projectsData) => {
        if (projectsData.success) setAdoProjects(projectsData.data);
        else toast.error("Azure DevOps projects could not be loaded");
      })
      .catch((error) => {
        console.error("Failed to discover Azure DevOps projects:", error);
        toast.error("Couldn't load Azure DevOps projects");
      })
      .finally(() => setLoadingAdoDiscovery(false));
  }, [adoStatus.isConnected, tenantId]);

  function toggleSelection(id: string, selected: string[], setter: (value: string[]) => void) {
    setter(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  const confluenceScopesReady = jiraStatus.isConnected && !!jiraStatus.scopes?.includes(CONFLUENCE_SCOPE_MARKER);

  useEffect(() => {
    if (!confluenceScopesReady) {
      setConfluenceSpaces([]);
      return;
    }

    setLoadingConfluenceSpaces(true);
    fetch(`${API_V1_URL}/integrations/confluence/spaces`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setConfluenceSpaces(data.data);
          setSelectedConfluenceSpaces(data.data.filter((s: { isSelected: boolean }) => s.isSelected).map((s: { key: string }) => s.key));
        } else {
          toast.error("Confluence spaces could not be loaded");
        }
      })
      .catch((error) => {
        console.error("Failed to discover Confluence spaces:", error);
        toast.error("Couldn't load Confluence spaces");
      })
      .finally(() => setLoadingConfluenceSpaces(false));
  }, [confluenceScopesReady]);

  async function saveConfluenceSpaceSelection() {
    setSavingConfluenceSelection(true);
    try {
      const response = await fetch(`${API_V1_URL}/integrations/confluence/selection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ spaceKeys: selectedConfluenceSpaces }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "Failed to save Confluence space selection");
      toast.success("Confluence spaces saved — the next sync will pick up their pages");
    } catch (error) {
      toast.error("Couldn't save Confluence space selection", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingConfluenceSelection(false);
    }
  }

  async function saveJiraConfiguration() {
    setSavingJiraSelection(true);
    try {
      const response = await fetch(`${API_V1_URL}/integrations/jira/selection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectIds: selectedJiraProjects, userAccountIds: selectedJiraUsers }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "Failed to save Jira selection");
      setJiraStatus((current) => ({
        ...current,
        externalMetadata: {
          ...current.externalMetadata,
          selectedProjectIds: selectedJiraProjects,
          selectedUserAccountIds: selectedJiraUsers,
        },
      }));
      const unresolved = data.data?.unresolvedUsers as Array<{ accountId: string; displayName: string }> | undefined;
      if (unresolved?.length) {
        // Not a transient failure — that person's Jira account has email
        // visibility set to private, which Jira's API has no way to
        // override, so retrying or reselecting won't change this.
        toast.warning(`Saved, but ${unresolved.length} selected user${unresolved.length === 1 ? "" : "s"} won't appear in analytics`, {
          description: `${unresolved.map((u) => u.displayName).join(", ")} — their email is hidden by Jira's privacy setting, not an error on this end.`,
        });
      } else {
        toast.success("Jira analytics scope saved");
      }
    } catch (error) {
      toast.error("Couldn't save Jira analytics scope", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingJiraSelection(false);
    }
  }

  async function saveAdoConfiguration() {
    setSavingAdoSelection(true);
    try {
      const response = await fetch(`${API_V1_URL}/integrations/azure_devops/selection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectIds: selectedAdoProjects }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "Failed to save Azure DevOps selection");
      setAdoStatus((current) => ({
        ...current,
        externalMetadata: { ...current.externalMetadata, selectedProjectIds: selectedAdoProjects },
      }));
      toast.success("Azure DevOps projects saved");
    } catch (error) {
      toast.error("Couldn't save Azure DevOps projects", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingAdoSelection(false);
    }
  }

  useEffect(() => {
    const fetchProviderStatus = async (provider: "jira" | "azure_devops" | "confluence", setter: (s: ProviderStatus) => void) => {
      try {
        const response = await fetch(`${API_V1_URL}/integrations/${provider}/status`, { credentials: "include" });
        const data = await response.json();
        if (data.success) setter(data.data);
      } catch (error) {
        console.error(`Failed to check ${provider} status:`, error);
      }
    };

    fetchProviderStatus("jira", setJiraStatus);
    fetchProviderStatus("azure_devops", setAdoStatus);
    fetchProviderStatus("confluence", setConfluenceStatus);
  }, [tenantId]);

  // Connect opens the OAuth flow in a separate tab (see handleProviderAction) —
  // refresh status when the user switches back here, since that's the only
  // signal we get about what happened in the other tab.
  useEffect(() => {
    function onFocus() {
      const refetch = (provider: "jira" | "azure_devops" | "confluence", setter: (s: ProviderStatus) => void) =>
        fetch(`${API_V1_URL}/integrations/${provider}/status`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => { if (d.success) setter(d.data); })
          .catch((error) => console.error(`Failed to check ${provider} status:`, error));
      refetch("jira", setJiraStatus);
      refetch("azure_devops", setAdoStatus);
      refetch("confluence", setConfluenceStatus);
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tenantId]);

  async function handleConfluenceSync() {
    setSyncingConfluence(true);
    try {
      const response = await fetch(`${API_V1_URL}/integrations/confluence/sync`, { method: "POST", credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "Sync failed to start");
      toast.success("Confluence sync started");
      setTimeout(() => {
        fetch(`${API_V1_URL}/integrations/confluence/status`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => { if (d.success) setConfluenceStatus(d.data); });
      }, 2000);
    } catch (error) {
      toast.error("Couldn't sync Confluence", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSyncingConfluence(false);
    }
  }

  async function handleConfluenceDisconnect() {
    try {
      const response = await fetch(`${API_V1_URL}/integrations/confluence`, { method: "DELETE", credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "Failed to disconnect");
      setConfluenceStatus({ isConnected: false });
      toast.success("Confluence disconnected");
    } catch (error) {
      toast.error("Couldn't disconnect Confluence", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleProviderAction(provider: "jira" | "azure_devops", isConnected: boolean) {
    const providerLabel = provider === "jira" ? "Jira" : "Azure DevOps";

    if (!isConnected) {
      // Opened synchronously, before the await below, so browsers still treat this
      // as a direct result of the click — doing it after would get popup-blocked.
      // Redirecting this separate tab (rather than the current page) means a
      // provider-side failure never stranded the user away from the app.
      const oauthTab = window.open('', '_blank');
      try {
        const response = await fetch(`${API_V1_URL}/integrations/${provider}/connect`, {
          method: "POST",
          credentials: "include",
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error ?? "Failed to start connection");
        }
        if (oauthTab) {
          oauthTab.location.href = data.data.authorizeUrl;
        } else {
          window.location.href = data.data.authorizeUrl;
        }
      } catch (error) {
        oauthTab?.close();
        console.error(`Failed to start ${provider} connection:`, error);
        toast.error(`Couldn't connect ${providerLabel}`, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
      return;
    }

    setSyncingProvider(provider);
    try {
      const response = await fetch(`${API_V1_URL}/integrations/${provider}/sync`, { method: "POST", credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Sync failed to start");
      }
      toast.success(`${providerLabel} sync started`);
      setTimeout(() => {
        const setter = provider === "jira" ? setJiraStatus : setAdoStatus;
        fetch(`${API_V1_URL}/integrations/${provider}/status`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => { if (d.success) setter(d.data); });
      }, 2000);
    } catch (error) {
      console.error(`Failed to sync ${provider}:`, error);
      toast.error(`Couldn't sync ${providerLabel}`, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSyncingProvider(null);
    }
  }

  // Fetch GitHub repositories for the connected user
  const fetchGitHubRepositories = async () => {
    setIsLoadingRepos(true);
    try {
      const response = await fetch(`${API_V1_URL}/github/user-repositories`, { credentials: "include" });
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

  const connectGitHub = async () => {
    if (!githubToken.trim()) {
      toast.error("Enter a GitHub personal access token");
      return;
    }
    setConnectingGithub(true);
    try {
      const response = await fetch(`${API_V1_URL}/github-token/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: githubToken.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message ?? "Failed to connect GitHub");
      toast.success(`GitHub connected${data.data?.username ? ` as ${data.data.username}` : ""}`);
      setGithubToken("");
      checkGitHubConnection();
    } catch (error) {
      toast.error("Couldn't connect GitHub", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setConnectingGithub(false);
    }
  };

  const disconnectGitHub = async () => {
    try {
      const response = await fetch(`${API_V1_URL}/github-token/tokens`, { method: "DELETE", credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message ?? "Failed to disconnect GitHub");
      setIsGitHubConnected(false);
      setGithubUsername(null);
      setGithubRepos([]);
      toast.success("GitHub disconnected");
    } catch (error) {
      toast.error("Couldn't disconnect GitHub", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
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
        detail: "OAuth 2.0 · REST API v3 · scheduled sync · also connects Confluence Cloud read access",
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
    <RequireRole roles={["pm"]}>
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Automated ingestion sources. Dashboards fall back to sample data until a source is
          connected.
        </p>
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
                {i.name === "GitHub" ? (
                  connected ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={refreshGitHubData}
                        className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 font-medium text-primary transition-colors hover:bg-primary/25"
                      >
                        {isLoadingRepos ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
                        )}
                        Sync now
                      </button>
                      <button onClick={disconnectGitHub} className="rounded-full px-3 py-1.5 font-medium text-critical transition-colors hover:bg-critical/10">
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px]">Connect below ↓</span>
                  )
                ) : (
                  <button
                    onClick={
                      i.name === "Jira Cloud"
                        ? () => handleProviderAction("jira", jiraStatus.isConnected)
                        : i.name === "Azure DevOps"
                        ? () => handleProviderAction("azure_devops", adoStatus.isConnected)
                        : undefined
                    }
                    className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 font-medium text-primary transition-colors hover:bg-primary/25"
                  >
                    {(syncingProvider === "jira" && i.name === "Jira Cloud") ||
                    (syncingProvider === "azure_devops" && i.name === "Azure DevOps") ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
                    )}
                    {connected ? "Sync now" : "Connect"}
                  </button>
                )}
              </div>
            </GlassPanel>
          );
        })}
      </div>

      {!isGitHubConnected && (
        <GlassPanel
          title="Connect GitHub"
          subtitle="Personal access token with repo, read:org scopes — stored encrypted server-side, never exposed to the browser"
          className="mt-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_..."
              className="glass flex-1 rounded-xl px-3 py-2 text-sm font-mono outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={connectGitHub}
              disabled={connectingGithub}
              className="glass shrink-0 rounded-full px-4 py-2 text-xs font-medium disabled:opacity-50"
            >
              {connectingGithub ? "Connecting…" : "Connect GitHub"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Generate one at{" "}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              github.com/settings/tokens
            </a>
            . An org-owned "machine user" token is recommended over a personal account's, so access
            survives personnel changes.
          </p>
        </GlassPanel>
      )}

      {jiraStatus.isConnected && (
        <GlassPanel
          title="Choose Jira analytics scope"
          subtitle="Projects and people are discovered automatically from the connected Jira site. Choose what the PM dashboard should include."
          className="mt-4"
        >
          {loadingJiraDiscovery ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Jira projects and users…
            </div>
          ) : (
            <div className="space-y-5">
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><FolderKanban className="h-4 w-4 text-primary" /> Projects</div>
                  <button type="button" className="text-xs text-primary" onClick={() => setSelectedJiraProjects(selectedJiraProjects.length === jiraProjects.length ? [] : jiraProjects.map((p) => p.id))}>
                    {selectedJiraProjects.length === jiraProjects.length && jiraProjects.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                  {jiraProjects.map((project) => (
                    <label key={project.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-glass-border/60 p-3 text-sm">
                      <input type="checkbox" checked={selectedJiraProjects.includes(project.id)} onChange={() => toggleSelection(project.id, selectedJiraProjects, setSelectedJiraProjects)} className="accent-primary" />
                      <span><span className="font-medium">{project.name}</span><span className="ml-2 text-xs text-muted-foreground">{project.key}</span></span>
                    </label>
                  ))}
                  {!jiraProjects.length && <p className="text-sm text-muted-foreground">No accessible Jira projects found.</p>}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Users</div>
                  <button type="button" className="text-xs text-primary" onClick={() => setSelectedJiraUsers(selectedJiraUsers.length === jiraUsers.length ? [] : jiraUsers.map((u) => u.accountId))}>
                    {selectedJiraUsers.length === jiraUsers.length && jiraUsers.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Selected users' activity is included in per-person analytics like Engineering Health — deselecting
                  someone doesn't remove their synced work items anywhere else.
                </p>
                <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                  {jiraUsers.map((jiraUser) => (
                    <label key={jiraUser.accountId} className="flex cursor-pointer items-center gap-3 rounded-xl border border-glass-border/60 p-3 text-sm">
                      <input type="checkbox" checked={selectedJiraUsers.includes(jiraUser.accountId)} onChange={() => toggleSelection(jiraUser.accountId, selectedJiraUsers, setSelectedJiraUsers)} className="accent-primary" />
                      {jiraUser.avatarUrl && <img src={jiraUser.avatarUrl} alt="" className="h-8 w-8 rounded-full" />}
                      <span className="min-w-0"><span className="block truncate font-medium">{jiraUser.displayName}</span><span className="block truncate text-xs text-muted-foreground">{jiraUser.emailAddress ?? "Email hidden by Jira"}</span></span>
                    </label>
                  ))}
                  {!jiraUsers.length && <p className="text-sm text-muted-foreground">No accessible Jira users found.</p>}
                </div>
              </section>

              <div className="flex items-center justify-between border-t border-glass-border/60 pt-4">
                <p className="text-xs text-muted-foreground">{selectedJiraProjects.length} projects · {selectedJiraUsers.length} users selected</p>
                <button type="button" onClick={saveJiraConfiguration} disabled={savingJiraSelection} className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">
                  {savingJiraSelection && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save analytics scope
                </button>
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      {adoStatus.isConnected && (
        <GlassPanel
          title="Choose Azure DevOps projects to sync"
          subtitle="Projects are discovered automatically from the connected organization. Each selected project becomes a product, synced in full by default."
          className="mt-4"
        >
          {loadingAdoDiscovery ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Azure DevOps projects…
            </div>
          ) : (
            <div className="space-y-5">
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><FolderKanban className="h-4 w-4 text-primary" /> Projects</div>
                  <button type="button" className="text-xs text-primary" onClick={() => setSelectedAdoProjects(selectedAdoProjects.length === adoProjects.length ? [] : adoProjects.map((p) => p.id))}>
                    {selectedAdoProjects.length === adoProjects.length && adoProjects.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  A selected project syncs its entire work-item tree (all area paths) by default. To scope a product
                  to one specific team's area path instead, edit that product's Azure DevOps mapping afterward.
                </p>
                <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                  {adoProjects.map((project) => (
                    <label key={project.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-glass-border/60 p-3 text-sm">
                      <input type="checkbox" checked={selectedAdoProjects.includes(project.id)} onChange={() => toggleSelection(project.id, selectedAdoProjects, setSelectedAdoProjects)} className="accent-primary" />
                      <span className="font-medium">{project.name}</span>
                    </label>
                  ))}
                  {!adoProjects.length && <p className="text-sm text-muted-foreground">No accessible Azure DevOps projects found.</p>}
                </div>
              </section>

              <p className="text-xs text-muted-foreground">
                Azure DevOps doesn't expose a per-person time-log API like Jira's, so per-person cost and utilization
                tracking isn't available for projects synced from here — everything else (backlog, bugs, epics, cycle
                time) works the same as Jira.
              </p>

              <div className="flex items-center justify-between border-t border-glass-border/60 pt-4">
                <p className="text-xs text-muted-foreground">{selectedAdoProjects.length} projects selected</p>
                <button type="button" onClick={saveAdoConfiguration} disabled={savingAdoSelection} className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">
                  {savingAdoSelection && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save selection
                </button>
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      <GlassPanel
        title="Confluence Cloud"
        subtitle="Connects via your Jira sign-in — no separate OAuth step"
        className="mt-4"
      >
        {!jiraStatus.isConnected ? (
          <p className="text-sm text-muted-foreground">Connect Jira above to enable Confluence.</p>
        ) : !jiraStatus.scopes?.includes(CONFLUENCE_SCOPE_MARKER) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
            <p>
              Confluence sync isn&apos;t enabled yet — your Jira connection predates it. Re-authorize to add
              Confluence (no data is lost).
            </p>
            <button
              type="button"
              onClick={() => handleProviderAction("jira", false)}
              className="shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
            >
              Re-authorize Jira
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">
                  Status: <span className="font-medium text-foreground">{confluenceStatus.isConnected ? "Connected" : "Not yet synced"}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Last sync: {timeAgo(confluenceStatus.lastSyncedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfluenceSync}
                  className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
                >
                  {syncingConfluence ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />}
                  Sync now
                </button>
                <button
                  type="button"
                  onClick={handleConfluenceDisconnect}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-critical transition-colors hover:bg-critical/10"
                >
                  Disconnect
                </button>
              </div>
            </div>

            <div className="border-t border-glass-border/60 pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold">Spaces to sync</p>
                {confluenceSpaces.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary"
                    onClick={() => setSelectedConfluenceSpaces(selectedConfluenceSpaces.length === confluenceSpaces.length ? [] : confluenceSpaces.map((s) => s.key))}
                  >
                    {selectedConfluenceSpaces.length === confluenceSpaces.length ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>
              {loadingConfluenceSpaces ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading Confluence spaces…
                </div>
              ) : (
                <>
                  <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                    {confluenceSpaces.map((space) => (
                      <label key={space.key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-glass-border/60 p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedConfluenceSpaces.includes(space.key)}
                          onChange={() => toggleSelection(space.key, selectedConfluenceSpaces, setSelectedConfluenceSpaces)}
                          className="accent-primary"
                        />
                        <span>
                          <span className="font-medium">{space.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{space.key}</span>
                        </span>
                      </label>
                    ))}
                    {!confluenceSpaces.length && <p className="text-sm text-muted-foreground">No accessible Confluence spaces found.</p>}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{selectedConfluenceSpaces.length} space(s) selected</p>
                    <button
                      type="button"
                      onClick={saveConfluenceSpaceSelection}
                      disabled={savingConfluenceSelection}
                      className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {savingConfluenceSelection && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save selection
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </GlassPanel>

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

      <ProductRepositories />

      <GitInsights />

      <GpuComputeConnect />

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
    </RequireRole>
  );
}
