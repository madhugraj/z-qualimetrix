import type { Role, Tone } from "@/lib/qm-data";

/**
 * AI / LLM usage analytics domain model.
 *
 * Visibility levels (RBAC provision — swap for real auth later):
 *  - "self"      : an engineer/tester sees only their own usage + team medians
 *  - "team"      : leads see every member of their squad, no cost contracts
 *  - "org"       : managers / HR see all squads, budgets, efficiency
 *  - "finance"   : leadership sees spend, forecast, ROI and vendor breakdown
 */
export type AiVisibility = "self" | "team" | "org" | "finance";

export const AI_VISIBILITY: Record<Role | "manager", AiVisibility> = {
  tester: "self",
  developer: "self",
  po: "team",
  manager: "org",
  executive: "finance",
};

export interface AiModel {
  id: string;
  name: string;
  vendor: string;
  purpose: string;
  tokensIn: number;
  tokensOut: number;
  requests: number;
  costUsd: number;
  avgLatencyMs: number;
  acceptRate: number; // % of AI suggestions kept in final code/doc
}

export const AI_MODELS: AiModel[] = [
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    vendor: "Anthropic",
    purpose: "Code generation & refactors",
    tokensIn: 41_200_000,
    tokensOut: 9_850_000,
    requests: 18_420,
    costUsd: 1284.4,
    avgLatencyMs: 2100,
    acceptRate: 71,
  },
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    purpose: "Inline completions & tests",
    tokensIn: 28_600_000,
    tokensOut: 6_100_000,
    requests: 32_760,
    costUsd: 742.9,
    avgLatencyMs: 850,
    acceptRate: 64,
  },
  {
    id: "yavar-inhouse",
    name: "YAVAR In-house 8B",
    vendor: "Self-hosted",
    purpose: "Test cases, RCA drafts, docs",
    tokensIn: 63_400_000,
    tokensOut: 14_200_000,
    requests: 24_130,
    costUsd: 318.0,
    avgLatencyMs: 1450,
    acceptRate: 58,
  },
  {
    id: "gemini",
    name: "Gemini Pro",
    vendor: "Google",
    purpose: "Spec analysis & summarisation",
    tokensIn: 12_900_000,
    tokensOut: 3_400_000,
    requests: 6_240,
    costUsd: 196.5,
    avgLatencyMs: 1750,
    acceptRate: 61,
  },
];

export const AI_TOTAL = {
  costUsd: AI_MODELS.reduce((s, m) => s + m.costUsd, 0),
  tokens: AI_MODELS.reduce((s, m) => s + m.tokensIn + m.tokensOut, 0),
  requests: AI_MODELS.reduce((s, m) => s + m.requests, 0),
  budgetUsd: 3200,
};

export const AI_SPEND_TREND = [
  { sprint: "S6", claude: 148, codex: 96, inhouse: 21, gemini: 18, budget: 400 },
  { sprint: "S7", claude: 162, codex: 104, inhouse: 26, gemini: 21, budget: 400 },
  { sprint: "S8", claude: 171, codex: 112, inhouse: 33, gemini: 24, budget: 400 },
  { sprint: "S9", claude: 186, codex: 106, inhouse: 41, gemini: 27, budget: 400 },
  { sprint: "S10", claude: 195, codex: 108, inhouse: 52, gemini: 31, budget: 400 },
  { sprint: "S11", claude: 208, codex: 113, inhouse: 66, gemini: 34, budget: 400 },
  { sprint: "S12", claude: 214, codex: 104, inhouse: 79, gemini: 41, budget: 400 },
];

export const AI_TOKEN_TREND = [
  { sprint: "S6", input: 18.2, output: 4.1, cachedPct: 12 },
  { sprint: "S7", input: 20.4, output: 4.6, cachedPct: 16 },
  { sprint: "S8", input: 22.1, output: 5.0, cachedPct: 21 },
  { sprint: "S9", input: 23.6, output: 5.4, cachedPct: 27 },
  { sprint: "S10", input: 25.0, output: 5.9, cachedPct: 34 },
  { sprint: "S11", input: 26.8, output: 6.2, cachedPct: 39 },
  { sprint: "S12", input: 28.1, output: 6.6, cachedPct: 46 },
];

export type AiActivity = "Code generation" | "Test authoring" | "Documentation" | "Review & RCA";

export const AI_ACTIVITY_MIX: { activity: AiActivity; tokens: number; costUsd: number }[] = [
  { activity: "Code generation", tokens: 71.2, costUsd: 1042 },
  { activity: "Test authoring", tokens: 44.6, costUsd: 612 },
  { activity: "Documentation", tokens: 38.1, costUsd: 481 },
  { activity: "Review & RCA", tokens: 25.7, costUsd: 407 },
];

export interface AiPersonUsage {
  id: string;
  name: string;
  role: "Developer" | "Tester" | "Tech writer";
  squad: string;
  tokens: number; // millions
  costUsd: number;
  requests: number;
  acceptRate: number;
  aiAssistedOutput: number; // % of merged output touched by AI
  reworkRate: number; // % of AI-assisted work later reopened / rejected
  topModel: string;
}

export const AI_PEOPLE: AiPersonUsage[] = [
  {
    id: "p1",
    name: "Sofia R.",
    role: "Developer",
    squad: "Squad Nova",
    tokens: 21.4,
    costUsd: 486,
    requests: 6120,
    acceptRate: 78,
    aiAssistedOutput: 64,
    reworkRate: 6,
    topModel: "Claude Sonnet",
  },
  {
    id: "p2",
    name: "Marcus L.",
    role: "Developer",
    squad: "Squad Nova",
    tokens: 17.9,
    costUsd: 402,
    requests: 7340,
    acceptRate: 69,
    aiAssistedOutput: 58,
    reworkRate: 11,
    topModel: "Codex",
  },
  {
    id: "p3",
    name: "Priya N.",
    role: "Tester",
    squad: "Squad Kite",
    tokens: 14.2,
    costUsd: 214,
    requests: 4980,
    acceptRate: 72,
    aiAssistedOutput: 51,
    reworkRate: 5,
    topModel: "YAVAR In-house 8B",
  },
  {
    id: "p4",
    name: "Dan K.",
    role: "Developer",
    squad: "Squad Pulse",
    tokens: 26.8,
    costUsd: 638,
    requests: 9110,
    acceptRate: 52,
    aiAssistedOutput: 73,
    reworkRate: 19,
    topModel: "Claude Sonnet",
  },
  {
    id: "p5",
    name: "Ayo B.",
    role: "Tester",
    squad: "Squad Kite",
    tokens: 9.6,
    costUsd: 143,
    requests: 3210,
    acceptRate: 66,
    aiAssistedOutput: 44,
    reworkRate: 8,
    topModel: "YAVAR In-house 8B",
  },
  {
    id: "p6",
    name: "Lena F.",
    role: "Tech writer",
    squad: "Squad Pulse",
    tokens: 7.3,
    costUsd: 118,
    requests: 1890,
    acceptRate: 74,
    aiAssistedOutput: 81,
    reworkRate: 4,
    topModel: "Gemini Pro",
  },
];

/** The signed-in user for the "self" visibility level (placeholder until auth). */
export const AI_CURRENT_USER_ID = "1f9c1029-80ed-48ef-8892-c9aa06092640";

export interface AiInsight {
  title: string;
  detail: string;
  tone: Tone;
}

export const AI_INSIGHTS: AiInsight[] = [
  {
    title: "Low acceptance, high spend",
    detail:
      "Dan K. spends $638 / sprint but keeps only 52% of suggestions and reworks 19% of AI-assisted changes — prompt coaching or a cheaper model tier would cut cost without slowing output.",
    tone: "critical",
  },
  {
    title: "In-house model is displacing paid tokens",
    detail:
      "Self-hosted usage grew 3.8x over 7 sprints and now carries 44% of all tokens at 12% of the cost. Shifting doc & test drafting fully in-house saves an estimated $210 / sprint.",
    tone: "good",
  },
  {
    title: "Prompt caching under-used",
    detail:
      "Cached input reached 46% this sprint. Squad Kite is at 21% — enabling cached system prompts there is worth roughly $60 / sprint.",
    tone: "warning",
  },
  {
    title: "Budget pacing",
    detail: `Sprint 12 spend is $${Math.round(
      AI_SPEND_TREND[AI_SPEND_TREND.length - 1].claude +
        AI_SPEND_TREND[AI_SPEND_TREND.length - 1].codex +
        AI_SPEND_TREND[AI_SPEND_TREND.length - 1].inhouse +
        AI_SPEND_TREND[AI_SPEND_TREND.length - 1].gemini,
    )} against a $400 cap — 90% consumed with 3 days left.`,
    tone: "ops",
  },
];

export const AI_KPIS: Record<AiVisibility, {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  tone: Tone;
  spark: number[];
}[]> = {
  self: [
    {
      label: "My AI spend",
      value: "$402",
      delta: "+8.1%",
      trend: "up",
      tone: "ops",
      spark: [288, 306, 324, 341, 358, 372, 402],
    },
    {
      label: "My tokens",
      value: "17.9M",
      delta: "+1.2M",
      trend: "up",
      tone: "neutral",
      spark: [11, 12.4, 13.6, 14.8, 15.9, 16.7, 17.9],
    },
    {
      label: "Suggestion accept rate",
      value: "69%",
      delta: "+4.0%",
      trend: "up",
      tone: "good",
      spark: [52, 55, 58, 61, 64, 66, 69],
    },
    {
      label: "AI rework rate",
      value: "11%",
      delta: "-2.0%",
      trend: "down",
      tone: "warning",
      spark: [19, 18, 16, 15, 14, 13, 11],
    },
  ],
  team: [
    {
      label: "Squad AI spend",
      value: "$1.1k",
      delta: "+6.4%",
      trend: "up",
      tone: "ops",
      spark: [740, 790, 842, 901, 962, 1024, 1102],
    },
    {
      label: "AI-assisted output",
      value: "59%",
      delta: "+7.0%",
      trend: "up",
      tone: "good",
      spark: [31, 36, 41, 46, 51, 55, 59],
    },
    {
      label: "Cost per story point",
      value: "$18.1",
      delta: "-2.3",
      trend: "down",
      tone: "good",
      spark: [28.4, 26.1, 24.5, 22.8, 21.2, 19.6, 18.1],
    },
    {
      label: "Rework on AI work",
      value: "9.4%",
      delta: "-1.1%",
      trend: "down",
      tone: "warning",
      spark: [15, 14, 13, 12.2, 11.3, 10.4, 9.4],
    },
  ],
  org: [
    {
      label: "Org AI spend",
      value: "$2.54k",
      delta: "+5.8%",
      trend: "up",
      tone: "ops",
      spark: [283, 313, 340, 360, 386, 421, 438],
    },
    {
      label: "Active AI users",
      value: "34 / 41",
      delta: "+3",
      trend: "up",
      tone: "neutral",
      spark: [21, 24, 26, 28, 30, 32, 34],
    },
    {
      label: "Avg accept rate",
      value: "67%",
      delta: "+3.2%",
      trend: "up",
      tone: "good",
      spark: [51, 54, 58, 60, 63, 65, 67],
    },
    {
      label: "Adoption skew",
      value: "2.8x",
      delta: "-0.4x",
      trend: "down",
      tone: "warning",
      spark: [4.4, 4.1, 3.8, 3.5, 3.2, 3.0, 2.8],
    },
  ],
  finance: [
    {
      label: "Total AI spend",
      value: "$2.54k",
      delta: "+5.8%",
      trend: "up",
      tone: "ops",
      spark: [283, 313, 340, 360, 386, 421, 438],
    },
    {
      label: "Budget consumed",
      value: "79%",
      delta: "+6.0%",
      trend: "up",
      tone: "warning",
      spark: [48, 54, 59, 64, 69, 74, 79],
    },
    {
      label: "Effort saved (est.)",
      value: "312 hrs",
      delta: "+38 hrs",
      trend: "up",
      tone: "good",
      spark: [141, 168, 194, 221, 249, 274, 312],
    },
    {
      label: "AI ROI",
      value: "4.1x",
      delta: "+0.5x",
      trend: "up",
      tone: "good",
      spark: [2.2, 2.6, 2.9, 3.2, 3.5, 3.8, 4.1],
    },
  ],
};

export const AI_VISIBILITY_NOTE: Record<AiVisibility, string> = {
  self: "You can see your own usage and anonymised team medians. Per-colleague cost is hidden at this level.",
  team: "Squad-level view: members of your squad, aggregated cost and efficiency. Vendor contracts are hidden.",
  org: "Organisation view: every squad, per-person usage, adoption gaps and coaching signals.",
  finance: "Finance view: full spend, vendor split, budget pacing, forecast and ROI.",
};

export function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
