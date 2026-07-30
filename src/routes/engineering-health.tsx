import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { KpiMetricCard } from "@/components/qm/KpiMetricCard";
import { DeveloperProfileCard } from "@/components/qm/DeveloperProfileCard";
import { AllocationChart, ConsistencyChart } from "@/components/qm/people-charts";
import { SiloAlerts, TrainingList } from "@/components/qm/people-panels";
import { DEVELOPERS, HR_KPIS } from "@/lib/qm-people";

export const Route = createFileRoute("/engineering-health")({
  head: () => ({
    meta: [
      { title: "Engineering Health — People & Workload | QualiMetrix" },
      {
        name: "description",
        content:
          "Workload balance, burnout signals, feature-vs-fix allocation, knowledge silos and training opportunities for engineering managers and HR partners.",
      },
      { property: "og:title", content: "Engineering Health — QualiMetrix" },
      {
        property: "og:description",
        content: "Sustainable performance metrics focused on support, not surveillance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EngineeringHealth,
});

function EngineeringHealth() {
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Engineering Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manager / HR perspective · workload balance, knowledge spread and growth areas
        </p>
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-glass-border bg-accent/20 px-3 py-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-ops" strokeWidth={1.6} />
          Restricted to Managers, Leads and HR partners. Metrics are aggregated to guide support and
          resourcing decisions — never used for individual performance ranking.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {HR_KPIS.map((kpi) => (
          <KpiMetricCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassPanel
          title="Feature vs fix allocation"
          subtitle="Sprint capacity split per engineer — high fix ratios flag refactor needs"
          className="xl:col-span-2"
        >
          <AllocationChart />
        </GlassPanel>

        <GlassPanel title="Knowledge silo detection" subtitle="Bus-factor risk by module">
          <SiloAlerts />
        </GlassPanel>

        <GlassPanel
          title="Quality-to-effort consistency"
          subtitle="Output swings against quality score — watch the every-third-sprint dip"
          className="xl:col-span-2"
        >
          <ConsistencyChart />
        </GlassPanel>

        <GlassPanel title="Skill gap & training" subtitle="Derived from recurring defect categories">
          <TrainingList />
        </GlassPanel>

        <GlassPanel
          title="Developer health profiles"
          subtitle="Workload strain, after-hours activity and suggested support"
          className="xl:col-span-3"
          bodyClassName="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {DEVELOPERS.map((dev) => (
            <DeveloperProfileCard key={dev.id} dev={dev} />
          ))}
        </GlassPanel>
      </div>
    </AppShell>
  );
}
