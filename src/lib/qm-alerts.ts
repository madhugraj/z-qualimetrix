// ---------------------------------------------------------------------------
// Notifications & quality alerts. Rule-driven from the current sample data;
// swap the generator for a server feed (or realtime channel) once wired.
// ---------------------------------------------------------------------------
import { BUGS, findSimilarBugs } from "./qm-bugs";
import { DEVELOPERS, SILOS } from "./qm-people";
import { HEATMAP } from "./qm-data";

export type AlertSeverity = "critical" | "warning" | "info";

export interface QmAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  time: string;
  /** Route this alert links to. */
  to: string;
  params?: Record<string, string>;
}

function duplicateAlerts(): QmAlert[] {
  return BUGS.flatMap((bug) => {
    const [top] = findSimilarBugs(bug, BUGS, 1);
    if (!top || top.score < 0.35) return [];
    return [
      {
        id: `dup-${bug.id}`,
        severity: "warning" as const,
        title: `Possible duplicate: ${bug.id}`,
        detail: `${Math.round(top.score * 100)}% similar to ${top.bug.id} — ${top.bug.title}`,
        time: bug.reported,
        to: "/bugs/$bugId",
        params: { bugId: bug.id },
      },
    ];
  }).slice(0, 3);
}

function severityAlerts(): QmAlert[] {
  return BUGS.filter((b) => b.severity === "P0" && b.status !== "Resolved").map((bug) => ({
    id: `p0-${bug.id}`,
    severity: "critical" as const,
    title: `P0 open: ${bug.id}`,
    detail: `${bug.title} — owned by ${bug.assignee}`,
    time: bug.reported,
    to: "/bugs/$bugId",
    params: { bugId: bug.id },
  }));
}

function burnoutAlerts(): QmAlert[] {
  return DEVELOPERS.filter((d) => d.burnoutIndex >= 70).map((dev) => ({
    id: `burnout-${dev.id}`,
    severity: "warning" as const,
    title: `Workload strain: ${dev.name}`,
    detail: `${dev.afterHoursPct}% after-hours activity and ${dev.p0p1Load} P0/P1 items in flight.`,
    time: "Today",
    to: "/engineering-health",
  }));
}

function siloAlerts(): QmAlert[] {
  return SILOS.slice(0, 2).map((silo, i) => ({
    id: `silo-${i}`,
    severity: "info" as const,
    title: `Knowledge silo: ${silo.module}`,
    detail: `${silo.owner} resolves ${silo.share}% — ${silo.note}`,
    time: "This sprint",
    to: "/engineering-health",
  }));
}

function heatmapAlerts(): QmAlert[] {
  return HEATMAP.filter((cell) => cell.defects >= 13)
    .slice(0, 2)
    .map((cell) => ({
      id: `hot-${cell.module}`,
      severity: "warning" as const,
      title: `Defect cluster: ${cell.module}`,
      detail: `${cell.defects} open defects — aim regression effort here.`,
      time: "Today",
      to: "/reports",
    }));
}

export const ALERTS: QmAlert[] = [
  ...severityAlerts(),
  ...duplicateAlerts(),
  ...burnoutAlerts(),
  ...heatmapAlerts(),
  ...siloAlerts(),
];

export const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  critical: "text-critical",
  warning: "text-warning",
  info: "text-ops",
};
