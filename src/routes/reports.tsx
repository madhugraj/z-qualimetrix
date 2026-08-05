import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/qm/AppShell";
import { FilterBar } from "@/components/qm/FilterBar";
import { ExportMenu } from "@/components/qm/ExportMenu";
import { GlassPanel } from "@/components/qm/GlassPanel";
import {
  ExecutionTrendChart,
  MttrChart,
  PortfolioRadar,
  VelocityChart,
} from "@/components/qm/charts";
import { RtmTable } from "@/components/qm/tables";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — QualiMetrix Quality Analytics" },
      {
        name: "description",
        content:
          "Cross-sprint QA reports: execution outcomes, MTTR trends, velocity vs defect flow and requirements traceability.",
      },
      { property: "og:title", content: "QualiMetrix Reports" },
      {
        property: "og:description",
        content: "Cross-sprint quality reporting across products, squads and releases.",
      },
    ],
  }),
  component: Reports,
});

function Reports() {
  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-sprint analytics across products, squads and releases.
          </p>
        </div>
        <ExportMenu />
      </header>
      <div className="mb-5">
        <FilterBar />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GlassPanel title="Test execution outcomes" subtitle="Stacked by result">
          <ExecutionTrendChart />
        </GlassPanel>
        <GlassPanel title="Resolution efficiency" subtitle="MTTR & first-time fix">
          <MttrChart />
        </GlassPanel>
        <GlassPanel title="Quality velocity" subtitle="Velocity vs defect flow">
          <VelocityChart />
        </GlassPanel>
        <GlassPanel title="Portfolio comparison" subtitle="Radar across products">
          <PortfolioRadar />
        </GlassPanel>
        <GlassPanel
          title="Requirements traceability matrix"
          subtitle="Story → test cases → bug status"
          className="xl:col-span-2"
        >
          <RtmTable />
        </GlassPanel>
      </div>
    </AppShell>
  );
}
