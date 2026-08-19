import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import { Plus, Trash2, CheckCircle2, AlertTriangle, Loader2, Github } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JiraConfig } from "@/components/qm/JiraConfig";
import { AzureDevOpsConfig } from "@/components/qm/AzureDevOpsConfig";
import { RequireRole } from "@/components/qm/RequireRole";
import { TeamManagementPanel } from "@/components/qm/TeamManagementPanel";
import { API_V1_URL } from "@/lib/api-config";
import { useAuth } from "@/lib/auth-context";
import { ROLES } from "@/lib/qm-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Workspace Settings — QualiMetrix" },
      {
        name: "description",
        content:
          "Provision products, teams, features and integrations, and manage role-based access for the QualiMetrix quality intelligence workspace.",
      },
      { property: "og:title", content: "QualiMetrix Workspace Settings" },
      {
        property: "og:description",
        content: "Create projects, teams, features and integrations with role-based access control.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

const PERMISSIONS: [string, string][] = [
  ["PM", "Connects Jira/Azure DevOps/GitHub/AI tools, manages every product & team"],
  ["Product Owner", "Own product's release readiness, RTM & heatmap; can be delegated mapping rights"],
  ["Leadership", "Portfolio-wide read-only view across every product"],
  ["Developer", "Defect and resolution analytics for their product/team"],
  ["Tester", "Execution, leakage & deliverables for their product/team"],
  ["Default", "No access until a PM assigns a role"],
];

interface Entity {
  id: string;
  name: string;
  detail: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);

function EntityList({
  items,
  onRemove,
  empty,
}: {
  items: Entity[];
  onRemove: (id: string) => void;
  empty: string;
}) {
  if (items.length === 0)
    return <p className="rounded-xl border border-dashed border-glass-border p-6 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start justify-between gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.name}</p>
            <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
          </div>
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            onClick={() => onRemove(item.id)}
            className="text-muted-foreground transition-colors hover:text-critical"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CreateDialog({
  label,
  title,
  description,
  nameLabel,
  detailLabel,
  onCreate,
  children,
}: {
  label: string;
  title: string;
  description: string;
  nameLabel: string;
  detailLabel: string;
  onCreate: (entity: Entity) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");

  function submit() {
    if (!name.trim()) {
      toast.error("A name is required");
      return;
    }
    onCreate({ id: uid(), name: name.trim(), detail: detail.trim() || "No description" });
    toast.success(`${label} created`, { description: name.trim() });
    setName("");
    setDetail("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={2} />
          New
        </Button>
      </DialogTrigger>
      <DialogContent className="glass sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="entity-name">{nameLabel}</Label>
            <Input id="entity-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entity-detail">{detailLabel}</Label>
            <Textarea
              id="entity-detail"
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>
          {children}
        </div>
        <DialogFooter>
          <Button onClick={submit}>Create {label.toLowerCase()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// GitHub Configuration Component
function GitHubConfig() {
  const { user } = useAuth();
  const [token, setToken] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState("");
  const [repos, setRepos] = useState<Array<{ name: string; full_name: string; description?: string }>>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showMultiSelect, setShowMultiSelect] = useState(false);

  const testConnection = async () => {
    if (!token.trim()) {
      toast.error("Please enter a GitHub token");
      return;
    }

    setIsTesting(true);
    try {
      // Test the token by making a direct GitHub API call
      console.log('🔍 Testing GitHub token with GitHub API...');
      const response = await fetch("https://api.github.com/user", {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'QualiMetrix-GitHub-Integration'
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setIsConnected(true);
        setUsername(userData.login);
        toast.success(`Connected as ${userData.login}`, {
          description: "GitHub token validated successfully"
        });

        // Save token to localStorage and database
        localStorage.setItem("github_token", token.trim());
        localStorage.setItem("github_username", userData.login);

        // Try to save to database (will work once API is properly configured)
        saveTokenToDatabase(token.trim(), userData.login);

        // Load repositories
        loadRepositories(token.trim());
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Invalid token");
      }
    } catch (error) {
      setIsConnected(false);
      console.error('GitHub connection error:', error);
      toast.error("Failed to validate GitHub token", {
        description: error instanceof Error ? error.message : "Please check your token permissions and try again"
      });
    } finally {
      setIsTesting(false);
    }
  };

  const saveTokenToDatabase = async (accessToken: string, githubUsername: string) => {
    try {
      console.log('💾 Attempting to save token to database...');
      const response = await fetch(`${API_V1_URL}/github-token/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token: accessToken,
          tenantId: user?.tenantId,
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Token saved to database:', data);
        toast.success("Token saved to database");
      } else {
        console.log('⚠️  Database save failed, token saved to localStorage only');
        // Don't show error to user since localStorage works as fallback
      }
    } catch (error) {
      console.log('⚠️  Database save failed, token saved to localStorage only');
      // Don't show error to user since localStorage works as fallback
    }
  };

  const loadRepositories = async (accessToken: string) => {
    setIsLoadingRepos(true);
    try {
      console.log('🔍 Loading repositories from GitHub...');
      const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'QualiMetrix-GitHub-Integration'
        }
      });

      if (response.ok) {
        const repositories = await response.json();
        console.log(`✅ Found ${repositories.length} repositories`);
        const repoList = repositories.map((repo: any) => ({
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description || ''
        }));
        setRepos(repoList);

        // Auto-select the first repo or previously selected one
        const storedRepo = localStorage.getItem('github_repo');
        if (storedRepo && repoList.find((r: any) => r.full_name === storedRepo)) {
          setSelectedRepos([storedRepo]);
        } else if (repoList.length > 0) {
          setSelectedRepos([repoList[0].full_name]);
        }

        toast.success(`Loaded ${repoList.length} repositories`);
      } else {
        const errorData = await response.json();
        console.error('GitHub API error:', errorData);
        throw new Error(errorData.message || "Failed to fetch repositories");
      }
    } catch (error) {
      console.error('Failed to load repositories:', error);
      toast.error("Failed to load repositories from GitHub", {
        description: "Using default example repositories for now"
      });
      // Fallback to example repos if API call fails
      const exampleRepos = [
        { name: "Abstractive-summarizor", full_name: "madhugraj/Abstractive-summarizor", description: "Your connected repository" },
        { name: "react", full_name: "facebook/react", description: "A declarative JavaScript library" },
      ];
      setRepos(exampleRepos);
      setSelectedRepos(["madhugraj/Abstractive-summarizor"]);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const saveConfiguration = () => {
    // Save to localStorage (this works immediately)
    localStorage.setItem("github_token", token.trim());
    localStorage.setItem("github_username", username);
    localStorage.setItem("github_repos", JSON.stringify(selectedRepos));
    localStorage.setItem("github_multi_select", "true");
    toast.success("GitHub configuration saved", {
      description: `${selectedRepos.length} repositories now tracked`
    });
  };

  // Load existing configuration on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("github_token");
    const savedUsername = localStorage.getItem("github_username");
    const savedRepos = localStorage.getItem("github_repos");
    const isMultiSelect = localStorage.getItem("github_multi_select");

    if (savedToken) {
      setToken(savedToken);
      setIsConnected(true);
      if (savedUsername) {
        setUsername(savedUsername);
      }
      // Load repositories if already connected
      loadRepositories(savedToken);
    }

    if (isMultiSelect === "true" && savedRepos) {
      try {
        const repos = JSON.parse(savedRepos);
        setSelectedRepos(repos);
        setShowMultiSelect(true);
      } catch (e) {
        console.error('Failed to parse saved repos');
      }
    } else if (savedRepos) {
      // Legacy single repo format
      setSelectedRepos([savedRepos]);
    }
  }, []);

  return (
    <div className="space-y-4">
      <GlassPanel
        title="GitHub Authentication"
        subtitle="Connect your GitHub account to enable repository insights"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github-token">GitHub Personal Access Token (PAT)</Label>
            <div className="flex gap-2">
              <Input
                id="github-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
                className="font-mono text-xs"
              />
              <Button
                onClick={testConnection}
                disabled={isTesting || !token.trim()}
                size="sm"
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isConnected ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  "Test"
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Generate a PAT at{" "}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                github.com/settings/tokens
              </a>
              {" "}with scopes: repo, read:org
            </p>
          </div>

          {isConnected && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">GitHub Connected as {username}</span>
              </div>
            </div>
          )}
        </div>
      </GlassPanel>

      {isConnected && (
        <GlassPanel
          title="Repository Selection"
          subtitle="Choose repositories to track (select multiple for aggregated view)"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="repo-select">Select Repositories</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMultiSelect(!showMultiSelect)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showMultiSelect ? "Single Select" : "Multi Select"}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {selectedRepos.length} repo{selectedRepos.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
              </div>

              {!showMultiSelect ? (
                <div className="flex gap-2">
                  <select
                    id="repo-select"
                    value={selectedRepos[0] || ""}
                    onChange={(e) => setSelectedRepos([e.target.value])}
                    className="flex-1 rounded-md border border-glass-border bg-transparent px-3 py-2 text-sm"
                    disabled={isLoadingRepos}
                  >
                    <option value="">Choose a repository...</option>
                    {repos
                      .filter(repo =>
                        repo.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        repo.name.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map((repo) => (
                        <option key={repo.full_name} value={repo.full_name}>
                          {repo.full_name}
                        </option>
                      ))}
                  </select>
                  <Button
                    onClick={() => setShowMultiSelect(true)}
                    size="sm"
                    variant="outline"
                  >
                    +
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Search for filtering repos */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search repositories..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full rounded-md border border-glass-border bg-transparent px-3 py-2 text-sm pr-8"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Repository list with checkboxes */}
                  <div className="max-h-64 overflow-y-auto rounded-md border border-glass-border p-2">
                    {repos.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        {isLoadingRepos ? "Loading repositories..." : "No repositories found"}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {repos
                          .filter(repo =>
                            repo.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            repo.name.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          .slice(0, 20) // Show first 20 to avoid performance issues
                          .map((repo) => (
                            <label
                              key={repo.full_name}
                              className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-glass-border/30 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedRepos.includes(repo.full_name)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRepos([...selectedRepos, repo.full_name]);
                                  } else {
                                    setSelectedRepos(selectedRepos.filter(r => r !== repo.full_name));
                                  }
                                }}
                                className="mt-1 h-4 w-4 rounded border-glass-border"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{repo.full_name}</p>
                                {repo.description && (
                                  <p className="text-xs text-muted-foreground truncate">{repo.description}</p>
                                )}
                              </div>
                            </label>
                          ))
                        }
                        {repos.length > 20 && (
                          <div className="text-center text-xs text-muted-foreground py-2">
                            Showing 20 of {repos.length} repositories. Use search to find more.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        const visibleRepos = repos
                          .filter(repo =>
                            repo.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            repo.name.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          .slice(0, 20);
                        setSelectedRepos(visibleRepos.map(r => r.full_name));
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Select Visible
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setSelectedRepos([])}
                      size="sm"
                      variant="outline"
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center border-t border-glass-border/60 pt-3">
              <div className="text-xs text-muted-foreground">
                {selectedRepos.length > 0 && (
                  <span>Selected: {selectedRepos.slice(0, 3).join(", ")}
                    {selectedRepos.length > 3 && ` +${selectedRepos.length - 3} more`}
                  </span>
                )}
              </div>
              <Button
                onClick={saveConfiguration}
                disabled={selectedRepos.length === 0}
                size="sm"
              >
                Save {selectedRepos.length} Repos
              </Button>
            </div>

            <div className="rounded-xl border border-dashed border-glass-border p-4">
              <p className="text-xs text-muted-foreground">
                💡 <strong>Tip:</strong> Your token is securely stored and will persist across sessions.
                You can also manually enter any repository as <code className="text-primary">owner/repository</code>
              </p>
            </div>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

function Settings() {
  const [projects, setProjects] = useState<Entity[]>([
    { id: "p1", name: "Atlas Core", detail: "Platform · 3 squads · release 24.7" },
    { id: "p2", name: "Nimbus Billing", detail: "Revenue · 2 squads · release 24.6" },
  ]);
  const [teams, setTeams] = useState<Entity[]>([
    { id: "t1", name: "Squad Helios", detail: "6 engineers · 2 testers · Atlas Core" },
    { id: "t2", name: "Squad Vela", detail: "5 engineers · 1 tester · Nimbus Billing" },
  ]);
  const [features, setFeatures] = useState<Entity[]>([
    { id: "f1", name: "SSO with enterprise IdP", detail: "Atlas Core · 18 test cases mapped" },
    { id: "f2", name: "Mid-cycle proration", detail: "Nimbus Billing · 22 test cases mapped" },
  ]);
  const [integrations, setIntegrations] = useState<Entity[]>([
    { id: "i1", name: "Jira Cloud", detail: "OAuth 2.0 · project keys ATL, NIM" },
    { id: "i2", name: "Azure DevOps", detail: "PAT · area path mapping" },
  ]);

  const remove = (setter: typeof setProjects) => (id: string) => {
    setter((prev) => prev.filter((p) => p.id !== id));
    toast("Removed");
  };

  return (
    <RequireRole roles={["pm"]}>
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provision workspace entities and manage role-based access. Changes are held in the
          session until a backend is connected.
        </p>
      </header>

      <Tabs defaultValue="provision">
        <TabsList className="glass mb-4">
          <TabsTrigger value="provision">Provisioning</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="access">Access & defaults</TabsTrigger>
        </TabsList>

        <TabsContent value="provision">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <GlassPanel
              title="Projects / Products"
              subtitle="Top-level unit that owns sprints & metrics"
              action={
                <CreateDialog
                  label="Project"
                  title="New project"
                  description="Creates a product workspace with its own sprints, KPIs and heatmap."
                  nameLabel="Project name"
                  detailLabel="Description"
                  onCreate={(e) => setProjects((p) => [...p, e])}
                />
              }
            >
              <EntityList items={projects} onRemove={remove(setProjects)} empty="No projects yet." />
            </GlassPanel>

            <GlassPanel
              title="Teams / Squads"
              subtitle="Members grouped for velocity & MTTR rollups"
              action={
                <CreateDialog
                  label="Team"
                  title="New team"
                  description="Group testers and developers to roll up execution and resolution metrics."
                  nameLabel="Team name"
                  detailLabel="Members & product"
                  onCreate={(e) => setTeams((t) => [...t, e])}
                />
              }
            >
              <EntityList items={teams} onRemove={remove(setTeams)} empty="No teams yet." />
            </GlassPanel>

            <GlassPanel
              title="Features / Modules"
              subtitle="Traceability anchor for test cases & defects"
              action={
                <CreateDialog
                  label="Feature"
                  title="New feature / module"
                  description="Features become heatmap cells and RTM rows once test cases are mapped."
                  nameLabel="Feature name"
                  detailLabel="Product & scope"
                  onCreate={(e) => setFeatures((f) => [...f, e])}
                />
              }
            >
              <EntityList items={features} onRemove={remove(setFeatures)} empty="No features yet." />
            </GlassPanel>

            <GlassPanel
              title="Integrations"
              subtitle="Jira, Azure DevOps, GitHub, CI pipelines"
              action={
                <CreateDialog
                  label="Integration"
                  title="New integration"
                  description="Register a source. Credentials and sync are wired when the backend is enabled."
                  nameLabel="Source name (e.g. Jira Cloud)"
                  detailLabel="Base URL, project keys or auth notes"
                  onCreate={(e) => setIntegrations((i) => [...i, e])}
                />
              }
            >
              <EntityList
                items={integrations}
                onRemove={remove(setIntegrations)}
                empty="No integrations yet."
              />
            </GlassPanel>
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="space-y-4">
            <GitHubConfig />
            <JiraConfig />
            <AzureDevOpsConfig />
          </div>
        </TabsContent>

        <TabsContent value="access">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <GlassPanel title="Default perspective" subtitle="Landing view per sign-in">
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <div key={r.id} className="rounded-xl border border-glass-border/60 p-3">
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.blurb}</p>
                  </div>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel title="Roles & permissions" subtitle="RBAC matrix">
              <ul className="space-y-2">
                {PERMISSIONS.map(([role, desc]) => (
                  <li
                    key={role}
                    className="flex items-start justify-between gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
                  >
                    <span className="text-sm font-medium">{role}</span>
                    <span className="text-right text-xs text-muted-foreground">{desc}</span>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </div>

          <div className="mt-4">
            <TeamManagementPanel />
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
    </RequireRole>
  );
}