import { GraduationCap, Users } from "lucide-react";
import { TRAINING } from "@/lib/qm-people";
import type { KnowledgeSiloRow } from "@/lib/queries/analytics";

const RISK_COLOR = { high: "bg-critical", medium: "bg-warning", low: "bg-good" } as const;
const RISK_NOTE = {
  high: "High bus-factor risk. Pair-review the next few of these to spread context.",
  medium: "Moderately concentrated. Worth rotating ownership before it hardens further.",
  low: "Reasonably spread across the team already.",
} as const;

/** Real bus-factor detection from analytics.service.ts's getKnowledgeSilo, built on Jira labels since this tenant's Jira sites have no Components configured on any project (confirmed live). */
export function SiloAlerts({
  labels,
  emptyMessage = "Not enough labeled, resolved bugs yet to detect a pattern for this scope.",
}: {
  labels?: KnowledgeSiloRow[];
  emptyMessage?: string;
}) {
  if (!labels?.length) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2">
      {labels.slice(0, 6).map((row) => (
        <li key={row.label} className="rounded-xl border border-glass-border p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-warning" strokeWidth={1.6} />
            <p className="text-xs font-medium">
              {row.topAssignee.percent}% of "{row.label}" bugs ({row.totalBugs} total) are resolved by {row.topAssignee.displayName}
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent/40">
            <div className={`h-full rounded-full ${RISK_COLOR[row.risk]}`} style={{ width: `${row.topAssignee.percent}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{RISK_NOTE[row.risk]}</p>
        </li>
      ))}
    </ul>
  );
}

export function TrainingList() {
  return (
    <ul className="space-y-2">
      {TRAINING.map((t) => (
        <li key={t.area} className="flex items-start gap-3 rounded-xl border border-glass-border p-3">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-ops" strokeWidth={1.6} />
          <div>
            <p className="text-xs font-medium">Recommended training: {t.area}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t.audience} · {t.signal}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
