import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Plus, Trash2, Github } from "lucide-react";
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
import { AiToolPicker } from "@/components/qm/AiToolPicker";
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
/**
 * GitHub connect + per-product repo mapping now live on the Integrations
 * page (GpuComputeConnect-style card + ProductRepositories), matching where
 * every other provider connection lives. The old PAT form here called
 * api.github.com directly from the browser and cached the raw token in
 * localStorage — removed rather than kept as a second, insecure connect
 * path.
 */
function GitHubConfig() {
  return (
    <GlassPanel title="GitHub" subtitle="Repository insights for CI/PR/issue data">
      <div className="flex items-center gap-3 rounded-xl border border-glass-border p-4">
        <Github className="h-5 w-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Connect GitHub and map repositories to products from the{" "}
          <a href="/integrations" className="text-primary hover:underline">
            Integrations page
          </a>
          .
        </p>
      </div>
    </GlassPanel>
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
          <TabsTrigger value="ai-providers">AI Providers</TabsTrigger>
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

        <TabsContent value="ai-providers">
          <AiToolPicker />
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