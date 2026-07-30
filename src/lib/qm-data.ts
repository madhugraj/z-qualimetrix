export type Role = "tester" | "developer" | "po" | "executive";

export const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "tester", label: "Tester", blurb: "Execution, leakage & deliverables" },
  { id: "developer", label: "Developer", blurb: "MTTR, fix rate & bottlenecks" },
  { id: "po", label: "Product Owner", blurb: "Readiness, RTM & heatmap" },
  { id: "executive", label: "Leadership", blurb: "Portfolio health & ROI" },
];

export const PRODUCTS = ["Atlas Core", "Nimbus Billing", "Orbit Mobile", "Vertex Analytics"];
export const SPRINTS = ["Sprint 12", "Sprint 11", "Sprint 10", "Sprint 9"];

export type Trend = "up" | "down" | "flat";
export type Tone = "good" | "warning" | "critical" | "ops" | "neutral";

export interface Kpi {
  label: string;
  value: string;
  delta: string;
  trend: Trend;
  tone: Tone;
  spark: number[];
}

export const KPIS: Record<Role, Kpi[]> = {
  tester: [
    {
      label: "Test Execution",
      value: "94%",
      delta: "+6.2%",
      trend: "up",
      tone: "good",
      spark: [61, 68, 72, 77, 83, 88, 94],
    },
    {
      label: "Defect Leakage Rate",
      value: "3.1%",
      delta: "-1.4%",
      trend: "down",
      tone: "good",
      spark: [7.2, 6.4, 5.8, 5.1, 4.5, 3.9, 3.1],
    },
    {
      label: "Bug Reopen Rate",
      value: "2.0%",
      delta: "-0.6%",
      trend: "down",
      tone: "good",
      spark: [4.1, 3.8, 3.4, 3.0, 2.7, 2.4, 2.0],
    },
    {
      label: "Automation Ratio",
      value: "68%",
      delta: "+4.0%",
      trend: "up",
      tone: "ops",
      spark: [48, 52, 55, 58, 61, 65, 68],
    },
  ],
  developer: [
    {
      label: "Bug MTTR",
      value: "3.2 hrs",
      delta: "-0.8 hrs",
      trend: "down",
      tone: "good",
      spark: [6.1, 5.7, 5.2, 4.6, 4.1, 3.7, 3.2],
    },
    {
      label: "First-Time Fix Rate",
      value: "88%",
      delta: "+3.5%",
      trend: "up",
      tone: "good",
      spark: [72, 75, 78, 81, 83, 86, 88],
    },
    {
      label: "Defect Density",
      value: "1.4 /KLOC",
      delta: "+0.2",
      trend: "up",
      tone: "warning",
      spark: [0.9, 1.0, 1.1, 1.1, 1.2, 1.3, 1.4],
    },
    {
      label: "QA Rejections",
      value: "6",
      delta: "-3",
      trend: "down",
      tone: "good",
      spark: [14, 12, 11, 10, 9, 8, 6],
    },
  ],
  po: [
    {
      label: "Release Readiness",
      value: "91%",
      delta: "+9.0%",
      trend: "up",
      tone: "good",
      spark: [62, 68, 73, 79, 84, 88, 91],
    },
    {
      label: "RTM Coverage",
      value: "87%",
      delta: "+5.0%",
      trend: "up",
      tone: "good",
      spark: [64, 69, 73, 77, 81, 84, 87],
    },
    {
      label: "Open P0 / P1",
      value: "4",
      delta: "+1",
      trend: "up",
      tone: "critical",
      spark: [2, 3, 3, 2, 3, 3, 4],
    },
    {
      label: "Regression Pass",
      value: "96%",
      delta: "+1.8%",
      trend: "up",
      tone: "good",
      spark: [88, 90, 91, 92, 94, 95, 96],
    },
  ],
  executive: [
    {
      label: "Quality Health Index",
      value: "8.6 /10",
      delta: "+0.7",
      trend: "up",
      tone: "good",
      spark: [7.1, 7.3, 7.6, 7.9, 8.1, 8.4, 8.6],
    },
    {
      label: "Cost of Quality",
      value: "$182k",
      delta: "-8.4%",
      trend: "down",
      tone: "good",
      spark: [246, 234, 221, 213, 201, 192, 182],
    },
    {
      label: "Automation ROI",
      value: "3.4x",
      delta: "+0.4x",
      trend: "up",
      tone: "ops",
      spark: [1.9, 2.2, 2.5, 2.7, 3.0, 3.2, 3.4],
    },
    {
      label: "Escaped Defects",
      value: "11",
      delta: "-5",
      trend: "down",
      tone: "good",
      spark: [28, 25, 22, 19, 16, 14, 11],
    },
  ],
};

export const EXECUTION_TREND = [
  { sprint: "S6", passed: 220, failed: 41, blocked: 12 },
  { sprint: "S7", passed: 268, failed: 38, blocked: 9 },
  { sprint: "S8", passed: 291, failed: 33, blocked: 14 },
  { sprint: "S9", passed: 324, failed: 28, blocked: 8 },
  { sprint: "S10", passed: 356, failed: 24, blocked: 6 },
  { sprint: "S11", passed: 388, failed: 21, blocked: 7 },
  { sprint: "S12", passed: 412, failed: 17, blocked: 4 },
];

export const VELOCITY_TREND = [
  { sprint: "S6", velocity: 42, created: 38, resolved: 30 },
  { sprint: "S7", velocity: 47, created: 35, resolved: 34 },
  { sprint: "S8", velocity: 44, created: 31, resolved: 33 },
  { sprint: "S9", velocity: 51, created: 29, resolved: 32 },
  { sprint: "S10", velocity: 55, created: 26, resolved: 31 },
  { sprint: "S11", velocity: 58, created: 22, resolved: 28 },
  { sprint: "S12", velocity: 61, created: 18, resolved: 25 },
];

export const MTTR_TREND = [
  { sprint: "S6", mttr: 6.1, fix: 72 },
  { sprint: "S7", mttr: 5.7, fix: 75 },
  { sprint: "S8", mttr: 5.2, fix: 78 },
  { sprint: "S9", mttr: 4.6, fix: 81 },
  { sprint: "S10", mttr: 4.1, fix: 83 },
  { sprint: "S11", mttr: 3.7, fix: 86 },
  { sprint: "S12", mttr: 3.2, fix: 88 },
];

export const RADAR_DATA = [
  { axis: "Quality", "Atlas Core": 88, "Nimbus Billing": 74, "Orbit Mobile": 62 },
  { axis: "Stability", "Atlas Core": 92, "Nimbus Billing": 69, "Orbit Mobile": 71 },
  { axis: "Velocity", "Atlas Core": 78, "Nimbus Billing": 84, "Orbit Mobile": 66 },
  { axis: "ROI", "Atlas Core": 71, "Nimbus Billing": 79, "Orbit Mobile": 58 },
  { axis: "Automation", "Atlas Core": 84, "Nimbus Billing": 61, "Orbit Mobile": 49 },
];

export const HEATMAP_MODULES = [
  "Auth",
  "Billing",
  "Search",
  "Reports",
  "Sync Engine",
  "Notifications",
  "Admin",
  "Mobile Shell",
  "Payments",
  "Exports",
  "Webhooks",
  "Settings",
];

export const HEATMAP: { module: string; defects: number }[] = HEATMAP_MODULES.map(
  (module, index) => ({
    module,
    defects: [2, 14, 5, 1, 21, 7, 0, 9, 17, 3, 11, 4][index],
  }),
);

export type DeliverableType = "DEMO" | "DOC" | "RCA" | "TEST";

export interface Deliverable {
  id: string;
  type: DeliverableType;
  title: string;
  author: string;
  meta: string;
  when: string;
}

export const DELIVERABLES: Deliverable[] = [
  {
    id: "d1",
    type: "DEMO",
    title: "Atlas Core — Sprint 12 stakeholder demo",
    author: "Priya N.",
    meta: "Rating 4.5 / 5",
    when: "2h ago",
  },
  {
    id: "d2",
    type: "DOC",
    title: "API v3 Swagger specification update",
    author: "Marcus L.",
    meta: "Reviewed by 2",
    when: "6h ago",
  },
  {
    id: "d3",
    type: "RCA",
    title: "RCA — Billing webhook duplication incident",
    author: "Sofia R.",
    meta: "P1 · closed",
    when: "Yesterday",
  },
  {
    id: "d4",
    type: "TEST",
    title: "Exploratory testing — Orbit Mobile onboarding",
    author: "Dan K.",
    meta: "3.5 hrs logged",
    when: "Yesterday",
  },
  {
    id: "d5",
    type: "DEMO",
    title: "Nimbus Billing — invoice redesign walkthrough",
    author: "Priya N.",
    meta: "Rating 4.8 / 5",
    when: "2 days ago",
  },
  {
    id: "d6",
    type: "DOC",
    title: "Regression test plan — release 24.7",
    author: "Ayo B.",
    meta: "Approved",
    when: "3 days ago",
  },
];

export interface RtmRow {
  story: string;
  title: string;
  cases: number;
  passed: number;
  bugs: number;
  status: "Ready" | "At risk" | "Blocked";
}

export const RTM: RtmRow[] = [
  {
    story: "ATL-1042",
    title: "SSO login with enterprise IdP",
    cases: 18,
    passed: 18,
    bugs: 0,
    status: "Ready",
  },
  {
    story: "ATL-1051",
    title: "Bulk export of audit trail",
    cases: 12,
    passed: 10,
    bugs: 2,
    status: "At risk",
  },
  {
    story: "NIM-338",
    title: "Proration on mid-cycle upgrade",
    cases: 22,
    passed: 15,
    bugs: 5,
    status: "Blocked",
  },
  {
    story: "NIM-341",
    title: "Invoice PDF localisation",
    cases: 9,
    passed: 9,
    bugs: 0,
    status: "Ready",
  },
  {
    story: "ORB-207",
    title: "Offline draft sync",
    cases: 16,
    passed: 13,
    bugs: 3,
    status: "At risk",
  },
];

export interface Bottleneck {
  item: string;
  title: string;
  waiting: string;
  severity: Tone;
}

export const BOTTLENECKS: Bottleneck[] = [
  {
    item: "NIM-338",
    title: "Awaiting QA verification",
    waiting: "62 hrs",
    severity: "critical",
  },
  { item: "ATL-1051", title: "Blocked on test data", waiting: "31 hrs", severity: "warning" },
  { item: "ORB-207", title: "Rejected — missing edge case", waiting: "18 hrs", severity: "warning" },
  { item: "ATL-1063", title: "Awaiting code review", waiting: "9 hrs", severity: "neutral" },
];

export const INTEGRATIONS = [
  {
    name: "Jira Cloud",
    detail: "OAuth 2.0 · REST API v3 · webhook ingestion",
    status: "Connected",
    synced: "4 min ago",
  },
  {
    name: "Azure DevOps",
    detail: "ADO REST API 7.0 · area path mapping",
    status: "Connected",
    synced: "11 min ago",
  },
  {
    name: "GitHub",
    detail: "Commit & PR linkage for defect density",
    status: "Connected",
    synced: "1 h ago",
  },
  {
    name: "CI Pipelines",
    detail: "Automated test result ingestion (JUnit XML)",
    status: "Not configured",
    synced: "—",
  },
];
