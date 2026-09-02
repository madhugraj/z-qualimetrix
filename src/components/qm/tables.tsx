import { BOTTLENECKS, RTM, type Tone } from "@/lib/qm-data";
import type { QaBottleneck, RecentHighPriorityFix, RequirementTraceRow } from "@/lib/queries/analytics";
import { cn } from "@/lib/utils";

const statusStyle: Record<string, string> = {
  Ready: "bg-good/20 text-good",
  "At risk": "bg-warning/20 text-warning",
  Blocked: "bg-critical/20 text-critical",
};

const REAL_STATUS_STYLE: Record<RequirementTraceRow["status"], string> = {
  ready: "bg-good/20 text-good",
  at_risk: "bg-warning/20 text-warning",
  blocked: "bg-critical/20 text-critical",
};
const REAL_STATUS_LABEL: Record<RequirementTraceRow["status"], string> = {
  ready: "Ready",
  at_risk: "At risk",
  blocked: "Blocked",
};
const TYPE_LABEL: Record<string, string> = { story: "Story", epic: "Epic" };

interface RtmTableProps {
  requirements?: RequirementTraceRow[];
  hasData?: boolean;
}

/**
 * Real branch traces requirements to bugs via WorkItemLink (native Jira/ADO
 * issue links) — there's no "test coverage %" here, since no test-management
 * tool is connected; "linked defects" is the honest equivalent. Falls back
 * to the illustrative RTM below when nothing's been linked yet.
 */
export function RtmTable({ requirements, hasData }: RtmTableProps = {}) {
  if (hasData && requirements) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="pb-2 font-medium">Requirement</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Linked defects</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((row) => {
              const openCount = row.linkedBugs.filter((b) => b.status === "open" || b.status === "in_progress").length;
              return (
                <tr key={row.id} className="border-t border-glass-border/60 transition-colors hover:bg-accent/30">
                  <td className="py-2.5 pr-3">
                    <span className="font-mono text-xs text-primary">{row.externalId ?? row.id}</span> {row.title}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{TYPE_LABEL[row.type] ?? row.type}</td>
                  <td className="py-2.5 pr-3 text-xs">
                    {row.linkedBugs.length} linked{openCount > 0 ? ` · ${openCount} open` : ""}
                  </td>
                  <td className="py-2.5">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${REAL_STATUS_STYLE[row.status]}`}>
                      {REAL_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="pb-2 font-medium">Story</th>
            <th className="pb-2 font-medium">Requirement</th>
            <th className="pb-2 font-medium">Coverage</th>
            <th className="pb-2 font-medium">Bugs</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {RTM.map((row) => {
            const pct = Math.round((row.passed / row.cases) * 100);
            return (
              <tr
                key={row.story}
                className="border-t border-glass-border/60 transition-colors hover:bg-accent/30"
              >
                <td className="py-2.5 pr-3 font-mono text-xs text-primary">{row.story}</td>
                <td className="py-2.5 pr-3">{row.title}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.passed}/{row.cases}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-xs">{row.bugs}</td>
                <td className="py-2.5">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${statusStyle[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const dot: Record<Tone, string> = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  ops: "bg-ops",
  neutral: "bg-muted-foreground",
};

// QA bottleneck severity comes back as this app's existing Tone-shaped subset
// (critical/warning/neutral), not an invented low/medium/high scale.
const qaDot: Record<QaBottleneck["severity"], string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  neutral: "bg-muted-foreground",
};

interface BottleneckListProps {
  bottlenecks?: QaBottleneck[];
  hasData?: boolean;
}

export function BottleneckList({ bottlenecks, hasData }: BottleneckListProps = {}) {
  if (hasData && bottlenecks) {
    return (
      <ul className="space-y-2">
        {bottlenecks.length === 0 ? (
          <li className="text-xs text-muted-foreground">Nothing waiting on QA/review past the threshold right now.</li>
        ) : (
          bottlenecks.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${qaDot[b.severity]}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <span className="font-mono text-xs text-primary">{b.externalId ?? b.id}</span> — {b.title}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{b.daysInStatus}d in {b.rawStatus}</span>
            </li>
          ))
        )}
      </ul>
    );
  }

  return (
    <ul className="space-y-2">
      {BOTTLENECKS.map((b) => (
        <li
          key={b.item}
          className="flex items-center gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot[b.severity]}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              <span className="font-mono text-xs text-primary">{b.item}</span> — {b.title}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{b.waiting}</span>
        </li>
      ))}
    </ul>
  );
}

const priorityDot: Record<string, string> = {
  critical: "bg-critical",
  high: "bg-warning",
};

function formatFixedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * No mock fallback — this feature has no legacy demo data to fall back to,
 * so an empty result just means "nothing to show," stated plainly.
 */
export function RecentHighPriorityFixesList({
  bugs,
  hasData,
}: {
  bugs?: RecentHighPriorityFix[];
  hasData?: boolean;
}) {
  if (!hasData || !bugs || bugs.length === 0) {
    return <p className="text-sm text-muted-foreground">No critical/high-priority bugs resolved in this period.</p>;
  }

  return (
    <ul className="space-y-2">
      {bugs.map((b) => (
        <li key={b.id} className="flex items-center gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot[b.priority] ?? "bg-muted-foreground")} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              <span className="font-mono text-xs text-primary">{b.externalId ?? b.id}</span> — {b.title}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {b.assigneeName ?? "Unassigned"} · fixed {formatFixedDate(b.resolvedAt)}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-medium capitalize text-muted-foreground">{b.priority}</span>
        </li>
      ))}
    </ul>
  );
}
