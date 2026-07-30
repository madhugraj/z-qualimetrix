// ---------------------------------------------------------------------------
// HR / Engineering Health model — people-centric, support-oriented metrics.
// Sample data; swap for capacity-planning tables once a backend is wired.
// ---------------------------------------------------------------------------
import type { BugDomain } from "./qm-bugs";

export type HealthBand = "healthy" | "watch" | "at-risk";

export interface Developer {
  id: string;
  name: string;
  role: string;
  squad: string;
  avatarInitials: string;
  /** 0-100, higher = more strain signals */
  burnoutIndex: number;
  afterHoursPct: number;
  weekendCommits: number;
  p0p1Load: number;
  featurePct: number;
  fixPct: number;
  maintenancePct: number;
  /** sprint-over-sprint output variance, % */
  outputVariance: number;
  focusAreas: BugDomain[];
  sprintOutput: number[];
  support: string;
}

export const DEVELOPERS: Developer[] = [
  {
    id: "marcus",
    name: "Marcus L.",
    role: "Senior Backend Engineer",
    squad: "Squad Nova",
    avatarInitials: "ML",
    burnoutIndex: 78,
    afterHoursPct: 31,
    weekendCommits: 14,
    p0p1Load: 7,
    featurePct: 22,
    fixPct: 58,
    maintenancePct: 20,
    outputVariance: 34,
    focusAreas: ["Backend/API"],
    sprintOutput: [34, 41, 22, 39, 19, 42, 24],
    support: "Rebalance P0 load and protect two no-meeting days next sprint.",
  },
  {
    id: "sofia",
    name: "Sofia R.",
    role: "ML Engineer",
    squad: "Squad Vertex",
    avatarInitials: "SR",
    burnoutIndex: 64,
    afterHoursPct: 22,
    weekendCommits: 8,
    p0p1Load: 5,
    featurePct: 38,
    fixPct: 44,
    maintenancePct: 18,
    outputVariance: 21,
    focusAreas: ["AI/ML Team"],
    sprintOutput: [28, 31, 26, 33, 25, 30, 27],
    support: "Sole owner of AI Engine fixes — pair a second engineer into the rotation.",
  },
  {
    id: "priya",
    name: "Priya N.",
    role: "Frontend Engineer",
    squad: "Squad Orbit",
    avatarInitials: "PN",
    burnoutIndex: 32,
    afterHoursPct: 9,
    weekendCommits: 1,
    p0p1Load: 2,
    featurePct: 61,
    fixPct: 27,
    maintenancePct: 12,
    outputVariance: 8,
    focusAreas: ["UI/UX"],
    sprintOutput: [26, 28, 27, 29, 28, 30, 29],
    support: "Healthy cadence — good candidate to mentor on accessibility patterns.",
  },
  {
    id: "dan",
    name: "Dan K.",
    role: "Frontend Engineer",
    squad: "Squad Orbit",
    avatarInitials: "DK",
    burnoutIndex: 45,
    afterHoursPct: 14,
    weekendCommits: 3,
    p0p1Load: 3,
    featurePct: 48,
    fixPct: 36,
    maintenancePct: 16,
    outputVariance: 15,
    focusAreas: ["UI/UX"],
    sprintOutput: [22, 25, 21, 26, 23, 27, 24],
    support: "Recurring accessibility defects — enrol in the a11y workshop.",
  },
  {
    id: "ayo",
    name: "Ayo B.",
    role: "Platform Engineer",
    squad: "Squad Nova",
    avatarInitials: "AB",
    burnoutIndex: 57,
    afterHoursPct: 25,
    weekendCommits: 9,
    p0p1Load: 4,
    featurePct: 30,
    fixPct: 34,
    maintenancePct: 36,
    outputVariance: 27,
    focusAreas: ["Infrastructure"],
    sprintOutput: [18, 24, 16, 25, 17, 23, 19],
    support: "Heavy maintenance share — schedule a pipeline refactor slot.",
  },
];

export function healthBand(index: number): HealthBand {
  if (index >= 70) return "at-risk";
  if (index >= 50) return "watch";
  return "healthy";
}

export const BAND_LABEL: Record<HealthBand, string> = {
  healthy: "Sustainable",
  watch: "Needs attention",
  "at-risk": "Support needed",
};

export const ALLOCATION = DEVELOPERS.map((d) => ({
  name: d.name.split(" ")[0],
  Feature: d.featurePct,
  Fix: d.fixPct,
  Maintenance: d.maintenancePct,
}));

export interface SiloAlert {
  module: string;
  owner: string;
  share: number;
  note: string;
}

export const SILOS: SiloAlert[] = [
  {
    module: "AI Engine",
    owner: "Sofia R.",
    share: 85,
    note: "High bus-factor risk. Pair-review the next three AI defects to spread context.",
  },
  {
    module: "Payments",
    owner: "Marcus L.",
    share: 72,
    note: "Payment gateway fixes concentrate on one engineer. Rotate on-call ownership.",
  },
  {
    module: "CI / Deploy",
    owner: "Ayo B.",
    share: 68,
    note: "Pipeline knowledge is single-threaded. Document runbooks and cross-train.",
  },
];

export interface TrainingSuggestion {
  area: string;
  audience: string;
  signal: string;
}

export const TRAINING: TrainingSuggestion[] = [
  {
    area: "Frontend Accessibility",
    audience: "Squad Orbit",
    signal: "9 of 14 UI/UX defects this quarter were contrast or ARIA issues.",
  },
  {
    area: "Query Performance & Indexing",
    audience: "Squad Nova (backend)",
    signal: "Repeated timeout defects in payments and webhook endpoints.",
  },
  {
    area: "LLM Grounding & Eval Harnesses",
    audience: "Squad Vertex",
    signal: "Hallucination and embedding defects recur across two releases.",
  },
];

export const CONSISTENCY_TREND = [
  { sprint: "S6", output: 128, quality: 88 },
  { sprint: "S7", output: 149, quality: 90 },
  { sprint: "S8", output: 112, quality: 79 },
  { sprint: "S9", output: 152, quality: 91 },
  { sprint: "S10", output: 112, quality: 78 },
  { sprint: "S11", output: 152, quality: 92 },
  { sprint: "S12", output: 123, quality: 81 },
];

export const HR_KPIS = [
  {
    label: "Team Health Index",
    value: "7.4 /10",
    delta: "-0.3",
    trend: "down" as const,
    tone: "warning" as const,
    spark: [8.1, 8.0, 7.9, 7.8, 7.6, 7.5, 7.4],
  },
  {
    label: "After-hours Activity",
    value: "20%",
    delta: "+4.0%",
    trend: "up" as const,
    tone: "critical" as const,
    spark: [11, 13, 14, 16, 17, 18, 20],
  },
  {
    label: "Fix vs Feature Split",
    value: "40 / 60",
    delta: "+6 fix",
    trend: "up" as const,
    tone: "warning" as const,
    spark: [26, 29, 31, 33, 36, 38, 40],
  },
  {
    label: "Bus-factor Alerts",
    value: "3",
    delta: "+1",
    trend: "up" as const,
    tone: "critical" as const,
    spark: [1, 1, 2, 2, 2, 2, 3],
  },
];
