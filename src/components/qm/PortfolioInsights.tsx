import { cn } from "@/lib/utils";
import type { BacklogSummary } from "@/lib/queries/backlog";
import type { EpicRollupsSummary, CycleTimeByStageResult } from "@/lib/queries/analytics";

export interface PortfolioInsight {
  id: string;
  tone: "critical" | "warning" | "ops" | "good";
  headline: string;
  detail: string;
}

const TONE_DOT: Record<PortfolioInsight["tone"], string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  ops: "bg-ops",
  good: "bg-good",
};

/**
 * Turns real, already-computed portfolio aggregates (backlog + epic
 * rollups) into plain-language, prioritized findings for PM/Leadership —
 * critical first, ops/informational last. Deliberately a pure function
 * (no fetching) so it's directly unit-testable and reusable outside the
 * Dashboard if another page ever wants the same read.
 *
 * Every threshold here is a judgment call about what's worth surfacing,
 * not a measured fact — e.g. "20%+ orphan bugs" is a reasonable line, not
 * a discovered constant. Adjust freely; the underlying numbers are real
 * either way.
 */
export function buildPortfolioInsights(params: {
  backlogSummary?: BacklogSummary;
  epicSummary?: EpicRollupsSummary;
  cycleTime?: CycleTimeByStageResult;
}): PortfolioInsight[] {
  const { backlogSummary, epicSummary, cycleTime } = params;
  const insights: PortfolioInsight[] = [];

  if (backlogSummary && backlogSummary.unassignedCriticalHigh > 0) {
    const n = backlogSummary.unassignedCriticalHigh;
    insights.push({
      id: "unassigned-critical",
      tone: "critical",
      headline: `${n} critical/high-priority item${n === 1 ? "" : "s"} unassigned`,
      detail:
        "Nobody owns these yet. Worth triaging and assigning before the next sprint planning session, rather than letting severity slip through unnoticed.",
    });
  }

  if (epicSummary && epicSummary.byHealth.blocked > 0) {
    const n = epicSummary.byHealth.blocked;
    insights.push({
      id: "blocked-epics",
      tone: "critical",
      headline: `${n} epic${n === 1 ? "" : "s"} blocked by an open critical/high bug`,
      detail:
        "These won't move until their blocking defects clear — check the Epics page for which ones, and confirm the owning team is aware.",
    });
  }

  if (epicSummary && epicSummary.totalBugCount > 0) {
    const orphanPercent = Math.round((epicSummary.orphanBugCount / epicSummary.totalBugCount) * 100);
    if (orphanPercent >= 20) {
      insights.push({
        id: "orphan-bugs",
        tone: orphanPercent >= 50 ? "warning" : "ops",
        headline: `${orphanPercent}% of bugs (${epicSummary.orphanBugCount} of ${epicSummary.totalBugCount}) aren't linked to any epic`,
        detail:
          "Makes it hard to see which initiatives are actually carrying defect risk. Consider requiring an epic link at bug creation — or if that's just how this team tracks work, no action needed.",
      });
    }
  }

  if (epicSummary && epicSummary.byHealth.at_risk > 0) {
    const n = epicSummary.byHealth.at_risk;
    insights.push({
      id: "stale-epics",
      tone: "warning",
      headline: `${n} epic${n === 1 ? "" : "s"} stalled 14+ days with no blocker`,
      detail: "Not blocked, just not moving. Might be intentionally deprioritized — worth a quick status check if not.",
    });
  }

  if (cycleTime?.hasData && cycleTime.stages.length > 0) {
    const worst = cycleTime.stages[0];
    // Only worth a portfolio-level flag once it's a real multi-day drag —
    // a stage that averages under a day isn't a bottleneck worth a leader's
    // attention, even if it's technically the biggest total-time stage.
    if (worst.avgDays >= 2) {
      insights.push({
        id: "cycle-time-bottleneck",
        tone: worst.avgDays >= 5 ? "warning" : "ops",
        headline: `"${worst.status}" is the biggest systemic bottleneck — ${Math.round(worst.totalDays)} team-days lost there across ${worst.transitionCount} items`,
        detail: `Averages ${worst.avgDays} days per item in this stage. Ranked by total time lost, not just average, so a rare slow outlier can't outrank a stage that's actually dragging down the whole pipeline. Worth checking whether this is a capacity, ownership, or process gap.`,
      });
    }
  }

  return insights;
}

export function PortfolioInsights({ insights }: { insights: PortfolioInsight[] }) {
  if (insights.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No portfolio-level risks flagged from real data right now — unassigned critical work, blocked epics
        and orphaned bugs are all within a normal range for this scope.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-glass-border/40">
      {insights.map((i) => (
        <li key={i.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[i.tone])} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{i.headline}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{i.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
