import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { cn } from "@/lib/utils";

import readmeContent from "@/content/manual/README.md?raw";
import initialSetupContent from "@/content/manual/01-initial-setup.md?raw";
import connectingJiraContent from "@/content/manual/02-connecting-jira.md?raw";
import connectingAdoContent from "@/content/manual/03-connecting-azure-devops.md?raw";
import connectingGithubContent from "@/content/manual/04-connecting-github.md?raw";
import usersRolesContent from "@/content/manual/05-users-roles-teams.md?raw";
import dashboardContent from "@/content/manual/06-dashboard-and-analytics.md?raw";
import backlogBugsEpicsContent from "@/content/manual/07-backlog-bugs-epics.md?raw";
import engineeringHealthContent from "@/content/manual/08-engineering-health.md?raw";
import reportsContent from "@/content/manual/09-reports-and-manual-log.md?raw";
import limitationsContent from "@/content/manual/10-known-limitations-and-roadmap.md?raw";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & User Manual | QualiMetrix" },
      {
        name: "description",
        content: "Enterprise setup and user manual — connecting Jira and Azure DevOps, roles, dashboards and known limitations.",
      },
    ],
  }),
  component: Help,
});

interface ManualDoc {
  id: string;
  label: string;
  content: string;
}

// Order matches the README's recommended reading order.
const DOCS: ManualDoc[] = [
  { id: "README", label: "Overview", content: readmeContent },
  { id: "01-initial-setup", label: "1. Initial setup", content: initialSetupContent },
  { id: "02-connecting-jira", label: "2. Connecting Jira", content: connectingJiraContent },
  { id: "03-connecting-azure-devops", label: "3. Connecting Azure DevOps", content: connectingAdoContent },
  { id: "04-connecting-github", label: "4. Connecting GitHub", content: connectingGithubContent },
  { id: "05-users-roles-teams", label: "5. Users, roles & access", content: usersRolesContent },
  { id: "06-dashboard-and-analytics", label: "6. Dashboard & analytics", content: dashboardContent },
  { id: "07-backlog-bugs-epics", label: "7. Backlog, bugs & epics", content: backlogBugsEpicsContent },
  { id: "08-engineering-health", label: "8. Engineering Health", content: engineeringHealthContent },
  { id: "09-reports-and-manual-log", label: "9. Reports & manual log", content: reportsContent },
  { id: "10-known-limitations-and-roadmap", label: "10. Known limitations & roadmap", content: limitationsContent },
];

const MANUAL_MARKDOWN_COMPONENTS = {
  h1: (props: React.ComponentPropsWithoutRef<"h1">) => <h1 className="mb-3 text-xl font-semibold" {...props} />,
  h2: (props: React.ComponentPropsWithoutRef<"h2">) => <h2 className="mb-2 mt-6 text-base font-semibold first:mt-0" {...props} />,
  h3: (props: React.ComponentPropsWithoutRef<"h3">) => <h3 className="mb-2 mt-4 text-sm font-semibold" {...props} />,
  p: (props: React.ComponentPropsWithoutRef<"p">) => <p className="mb-3 text-sm leading-relaxed text-foreground/90 last:mb-0" {...props} />,
  ul: (props: React.ComponentPropsWithoutRef<"ul">) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-relaxed" {...props} />,
  ol: (props: React.ComponentPropsWithoutRef<"ol">) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed" {...props} />,
  li: (props: React.ComponentPropsWithoutRef<"li">) => <li {...props} />,
  strong: (props: React.ComponentPropsWithoutRef<"strong">) => <strong className="font-semibold" {...props} />,
  code: (props: React.ComponentPropsWithoutRef<"code">) => <code className="rounded bg-accent/20 px-1 py-0.5 font-mono text-[12px]" {...props} />,
  pre: (props: React.ComponentPropsWithoutRef<"pre">) => <pre className="mb-3 overflow-x-auto rounded-lg bg-accent/10 p-3 text-[12px]" {...props} />,
  hr: () => <hr className="my-6 border-glass-border/50" />,
  table: (props: React.ComponentPropsWithoutRef<"table">) => (
    <div className="mb-3 overflow-x-auto"><table className="w-full border-collapse text-left text-xs" {...props} /></div>
  ),
  thead: (props: React.ComponentPropsWithoutRef<"thead">) => <thead className="border-b border-glass-border/60 text-[11px] uppercase text-muted-foreground" {...props} />,
  th: (props: React.ComponentPropsWithoutRef<"th">) => <th className="py-2 pr-4 font-medium" {...props} />,
  td: (props: React.ComponentPropsWithoutRef<"td">) => <td className="border-b border-glass-border/30 py-2 pr-4 align-top" {...props} />,
};

function Help() {
  const [activeId, setActiveId] = useState<string>("README");

  function linkComponent(props: React.ComponentPropsWithoutRef<"a">) {
    const href = props.href ?? "";
    // Internal manual links point at a sibling .md file (e.g. "02-connecting-jira.md#some-heading")
    // — switch the in-page doc instead of trying to navigate the browser there.
    const mdMatch = href.match(/^(?:\.\/)?([\w-]+)\.md(?:#.*)?$/);
    if (mdMatch) {
      const targetId = mdMatch[1];
      return (
        <button
          type="button"
          className="text-primary underline underline-offset-2"
          onClick={() => setActiveId(targetId)}
        >
          {props.children}
        </button>
      );
    }
    return <a {...props} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2" />;
  }

  const active = DOCS.find((d) => d.id === activeId) ?? DOCS[0];

  return (
    <AppShell>
      <div className="p-4 md:p-6">
        <h1 className="mb-1 text-2xl font-semibold">Help & user manual</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Enterprise setup and feature reference — how to connect Jira/Azure DevOps/GitHub, what each dashboard means, and what's still on the roadmap.
        </p>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-4">
          <GlassPanel title="Contents" className="lg:col-span-1">
            <nav className="flex flex-col gap-1">
              {DOCS.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setActiveId(doc.id)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent/15",
                    activeId === doc.id ? "bg-accent/25 font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {doc.label}
                </button>
              ))}
            </nav>
          </GlassPanel>

          <GlassPanel className="lg:col-span-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ ...MANUAL_MARKDOWN_COMPONENTS, a: linkComponent }}
            >
              {active.content}
            </ReactMarkdown>
          </GlassPanel>
        </div>
      </div>
    </AppShell>
  );
}
