import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeveloperHealthProfile } from "@/lib/queries/engineering-health";
import { cn } from "@/lib/utils";

/** Same bands as qm-people.ts's healthBand() — kept local since this card no longer imports from that mock module. */
type HealthBand = "healthy" | "watch" | "at-risk";
function healthBand(index: number): HealthBand {
  if (index >= 70) return "at-risk";
  if (index >= 50) return "watch";
  return "healthy";
}
const BAND_LABEL: Record<HealthBand, string> = { healthy: "Sustainable", watch: "Needs attention", "at-risk": "Support needed" };
const bandStyle: Record<HealthBand, string> = {
  healthy: "text-good border-good/40 bg-good/10",
  watch: "text-warning border-warning/40 bg-warning/10",
  "at-risk": "text-critical border-critical/40 bg-critical/10",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-glass-border px-3 py-2">
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

export function DeveloperProfileCard({ dev, burnoutFormula }: { dev: DeveloperHealthProfile; burnoutFormula: string }) {
  const band = dev.burnoutIndex !== null ? healthBand(dev.burnoutIndex) : null;

  return (
    <article className="glass glass-hover rounded-2xl p-4">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/50 text-xs font-semibold">
          {dev.avatarInitials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{dev.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {dev.role}
            {dev.squad && ` · ${dev.squad}`}
          </p>
        </div>
        {band && (
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", bandStyle[band])}>
            {BAND_LABEL[band]}
          </span>
        )}
      </header>

      {dev.hasActivityData ? (
        <>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                Workload strain
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 cursor-help" strokeWidth={1.7} />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56 text-[11px]">{burnoutFormula}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              <span>{dev.burnoutIndex}/100</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-accent/40">
              <div
                className={cn("h-full rounded-full", band === "at-risk" ? "bg-critical" : band === "watch" ? "bg-warning" : "bg-good")}
                style={{ width: `${dev.burnoutIndex}%` }}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="After hours" value={`${dev.afterHoursPct}%`} />
            <Stat label="P0/P1 held" value={String(dev.p0p1Load)} />
            <Stat label="Weekend activity" value={String(dev.weekendActivityCount)} />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Based on the last 30 days:{" "}
            {[
              dev.activityBreakdown.githubCommits > 0 && `${dev.activityBreakdown.githubCommits} GitHub commits`,
              dev.activityBreakdown.jiraTransitions > 0 && `${dev.activityBreakdown.jiraTransitions} Jira status changes`,
            ]
              .filter(Boolean)
              .join(" + ")}
            .
          </p>
        </>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 gap-2">
            <Stat label="P0/P1 held" value={String(dev.p0p1Load)} />
          </div>
          <p className="rounded-xl bg-accent/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            No activity data — this account's email doesn't match any GitHub commit author or Jira changelog entry in the last
            30 days, so after-hours/weekend activity and workload strain can't be measured yet.
          </p>
        </div>
      )}
    </article>
  );
}
