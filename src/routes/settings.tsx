import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { ROLES } from "@/lib/qm-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Workspace Settings — QualiMetrix" },
      {
        name: "description",
        content:
          "Manage tenant workspace preferences, roles and access control for the QualiMetrix quality intelligence platform.",
      },
      { property: "og:title", content: "QualiMetrix Workspace Settings" },
      {
        property: "og:description",
        content: "Tenant preferences, role-based access control and dashboard defaults.",
      },
    ],
  }),
  component: Settings,
});

const PERMISSIONS = [
  ["Admin", "Full workspace, integrations and billing control"],
  ["Lead", "Manage squads, sprints and dashboard layouts"],
  ["Tester", "Log executions, demos, docs and RCAs"],
  ["Developer", "View defect and resolution analytics"],
  ["Product Owner", "Release readiness, RTM and heatmaps"],
  ["Viewer", "Read-only access to shared dashboards"],
];

function Settings() {
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace preferences and role-based access control.
        </p>
      </header>

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
    </AppShell>
  );
}
