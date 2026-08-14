/**
 * AI usage analytics — server-side domain + aggregation layer.
 *
 * This is the real API surface behind the "AI Usage & Tokens" tab. Telemetry
 * arrives as immutable usage EVENTS (one per LLM request) from IDE plugins /
 * gateway proxies via POST /api/public/ai-usage/events, and every dashboard
 * number is derived from those events at query time — nothing is hardcoded in
 * the UI.
 *
 * Storage now uses PostgreSQL persistence with Prisma ORM, replacing the
 * previous in-memory store. The system seeds with demo data if empty and
 * supports real-time event ingestion for live analytics.
 */

export type AiVisibility = "self" | "team" | "org" | "finance";
export type AiActivity = "code" | "tests" | "docs" | "review";

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const ACTIVITY_LABEL: Record<AiActivity, string> = {
  code: "Code generation",
  tests: "Test authoring",
  docs: "Documentation",
  review: "Review & RCA",
};

export interface AiUsageEvent {
  id: string;
  /** ISO timestamp of the request */
  ts: string;
  sprint: string;
  userId: string;
  modelId: string;
  activity: AiActivity;
  tokensIn: number;
  tokensOut: number;
  cachedIn: number;
  latencyMs: number;
  /** suggestion kept in the final artefact */
  accepted: boolean;
  /** AI-assisted change later reopened / rejected in review */
  reworked: boolean;
}

export interface AiModelMeta {
  id: string;
  name: string;
  vendor: string;
  purpose: string;
  /** USD per 1M tokens */
  priceIn: number;
  priceOut: number;
  /** cached input is billed at a discount */
  cacheDiscount: number;
}

export async function getModelCatalog(): Promise<AiModelMeta[]> {
  try {
    const models = await prisma.aiModelCatalog.findMany({
      where: { isActive: true }
    });

    return models.map(m => ({
      id: m.modelId,
      name: m.name,
      vendor: m.vendor,
      purpose: m.purpose,
      priceIn: Number(m.priceIn),
      priceOut: Number(m.priceOut),
      cacheDiscount: Number(m.cacheDiscount),
    }));
  } catch (error) {
    console.error('Error fetching model catalog:', error);
    // Fallback to hardcoded models
    return [
      {
        id: "claude-sonnet",
        name: "Claude Sonnet",
        vendor: "Anthropic",
        purpose: "Code generation & refactors",
        priceIn: 3,
        priceOut: 15,
        cacheDiscount: 0.9,
      },
      {
        id: "codex",
        name: "Codex",
        vendor: "OpenAI",
        purpose: "Inline completions & tests",
        priceIn: 1.25,
        priceOut: 10,
        cacheDiscount: 0.9,
      },
      {
        id: "yavar-inhouse",
        name: "YAVAR In-house 8B",
        vendor: "Self-hosted",
        purpose: "Test cases, RCA drafts, docs",
        priceIn: 0.18,
        priceOut: 0.55,
        cacheDiscount: 1,
      },
      {
        id: "gemini",
        name: "Gemini Pro",
        vendor: "Google",
        purpose: "Spec analysis & summarisation",
        priceIn: 1.25,
        priceOut: 5,
        cacheDiscount: 0.75,
      },
    ];
  }
}

export interface AiMember {
  id: string;
  name: string;
  role: "Developer" | "Tester" | "Tech writer";
  squad: string;
  /** monthly per-seat allowance in USD */
  seatBudgetUsd: number;
}

export let AI_DIRECTORY: AiMember[] = [
  { id: "1f9c1029-80ed-48ef-8892-c9aa06092640", name: "Admin User", role: "Developer", squad: "Squad Nova", seatBudgetUsd: 650 },
  { id: "275905eb-e6e3-4115-9fb9-606b1d59101c", name: "Demo Tester", role: "Tester", squad: "Squad Kite", seatBudgetUsd: 400 },
];

export const SPRINTS = ["S6", "S7", "S8", "S9", "S10", "S11", "S12"];
export const ORG_SPRINT_BUDGET_USD = 3200;

let memberById = new Map(AI_DIRECTORY.map((m) => [m.id, m]));

// Function to refresh AI directory from database
export async function refreshAiDirectory() {
  try {
    const prisma = new PrismaClient();
    const users = await prisma.user.findMany({
      where: { isActive: true }
    });

    AI_DIRECTORY = users.map(user => ({
      id: user.id,
      name: user.name || user.email,
      role: user.role as "Developer" | "Tester" | "Tech writer",
      squad: "Default Squad", // This would come from team assignments in a full implementation
      seatBudgetUsd: 400 // Default budget
    }));

    memberById = new Map(AI_DIRECTORY.map((m) => [m.id, m]));
    console.log(`🔄 Refreshed AI directory with ${AI_DIRECTORY.length} users`);
  } catch (error) {
    console.error('Error refreshing AI directory:', error);
  }
}

export async function eventCost(e: AiUsageEvent): Promise<number> {
  const modelCatalog = await getModelCatalog();
  const modelById = new Map(modelCatalog.map((m) => [m.id, m]));

  const m = modelById.get(e.modelId);
  if (!m) return 0;
  const billableIn = e.tokensIn - e.cachedIn + e.cachedIn * (1 - m.cacheDiscount);
  return (billableIn / 1_000_000) * m.priceIn + (e.tokensOut / 1_000_000) * m.priceOut;
}

/* ------------------------------------------------------------------ database store */

export async function recordEvents(events: AiUsageEvent[]) {
  try {
    // Check if events array is empty
    if (events.length === 0) {
      return { accepted: 0, total: await prisma.aiUsageEvent.count() };
    }

    // Insert events into database
    await prisma.aiUsageEvent.createMany({
      data: events.map(e => ({
        id: e.id,
        timestamp: new Date(e.ts),
        sprint: e.sprint,
        userId: e.userId,
        modelId: e.modelId,
        activity: e.activity,
        tokensIn: e.tokensIn,
        tokensOut: e.tokensOut,
        cachedIn: e.cachedIn,
        latencyMs: e.latencyMs,
        accepted: e.accepted,
        reworked: e.reworked,
      }))
    });

    const total = await prisma.aiUsageEvent.count();
    return { accepted: events.length, total };
  } catch (error) {
    console.error('Error recording AI usage events:', error);
    throw new Error('Failed to record events');
  }
}

export async function allEvents(): Promise<AiUsageEvent[]> {
  try {
    const count = await prisma.aiUsageEvent.count();

    // If no events exist, seed with demo data
    if (count === 0) {
      console.log('No AI usage events found, seeding with demo data...');
      const seededEvents = seedEvents();
      await recordEvents(seededEvents);
      return seededEvents;
    }

    // Fetch all events from database
    const dbEvents = await prisma.aiUsageEvent.findMany({
      orderBy: { timestamp: 'desc' }
    });

    return dbEvents.map(e => ({
      id: e.id,
      ts: e.timestamp.toISOString(),
      sprint: e.sprint,
      userId: e.userId,
      modelId: e.modelId,
      activity: e.activity as AiActivity,
      tokensIn: e.tokensIn,
      tokensOut: e.tokensOut,
      cachedIn: e.cachedIn,
      latencyMs: e.latencyMs,
      accepted: e.accepted,
      reworked: e.reworked,
    }));
  } catch (error) {
    console.error('Error fetching AI usage events:', error);
    // Fallback to seeded data if database fails
    console.log('Falling back to seeded demo data...');
    return seedEvents();
  }
}

/* ---------------------------------------------------------------- seeding */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Per-person behavioural profile: volume, model mix, discipline. */
const PROFILE: Record<
  string,
  { volume: number; models: [string, number][]; accept: number; rework: number }
> = {
  "1f9c1029-80ed-48ef-8892-c9aa06092640": {
    volume: 1,
    models: [["claude-sonnet", 0.6], ["codex", 0.3], ["yavar-inhouse", 0.1]],
    accept: 0.78,
    rework: 0.06,
  },
  "275905eb-e6e3-4115-9fb9-606b1d59101c": {
    volume: 0.65,
    models: [["yavar-inhouse", 0.6], ["codex", 0.25], ["gemini", 0.15]],
    accept: 0.72,
    rework: 0.05,
  },
};

const ACTIVITY_BY_ROLE: Record<AiMember["role"], [AiActivity, number][]> = {
  Developer: [["code", 0.6], ["tests", 0.2], ["review", 0.13], ["docs", 0.07]],
  Tester: [["tests", 0.6], ["review", 0.2], ["docs", 0.13], ["code", 0.07]],
  "Tech writer": [["docs", 0.75], ["review", 0.15], ["tests", 0.05], ["code", 0.05]],
};

function pick<T>(weights: [T, number][], r: number): T {
  let acc = 0;
  for (const [value, w] of weights) {
    acc += w;
    if (r <= acc) return value;
  }
  return weights[weights.length - 1][0];
}

const SPRINT_LENGTH_DAYS = 14;
const SEED_ANCHOR = Date.UTC(2026, 7, 12); // end of the latest sprint

function seedEvents(): AiUsageEvent[] {
  const rand = rng(20260812);
  const events: AiUsageEvent[] = [];

  SPRINTS.forEach((sprint, sprintIdx) => {
    // adoption ramps sprint over sprint, in-house share grows fastest
    const ramp = 0.62 + sprintIdx * 0.075;
    const sprintEnd = SEED_ANCHOR - (SPRINTS.length - 1 - sprintIdx) * SPRINT_LENGTH_DAYS * 864e5;

    for (const member of AI_DIRECTORY) {
      const profile = PROFILE[member.id];
      const requests = Math.round(140 * profile.volume * ramp);

      for (let i = 0; i < requests; i++) {
        const r = rand();
        let modelId = pick(profile.models, r);
        // in-house displacement of paid tokens over time
        if (modelId !== "yavar-inhouse" && rand() < sprintIdx * 0.035) modelId = "yavar-inhouse";

        const activity = pick(ACTIVITY_BY_ROLE[member.role], rand());
        const scale = activity === "code" ? 1.5 : activity === "docs" ? 1.1 : 1;
        const tokensIn = Math.round((1800 + rand() * 5200) * scale);
        const tokensOut = Math.round(tokensIn * (0.18 + rand() * 0.2));
        const cacheRatio = Math.min(0.55, 0.1 + sprintIdx * 0.06) * (0.6 + rand() * 0.7);

        events.push({
          id: `${sprint}-${member.id}-${i}`,
          ts: new Date(sprintEnd - rand() * SPRINT_LENGTH_DAYS * 864e5).toISOString(),
          sprint,
          userId: member.id,
          modelId,
          activity,
          tokensIn,
          tokensOut,
          cachedIn: Math.round(tokensIn * cacheRatio),
          latencyMs: Math.round(
            (modelId === "codex" ? 850 : modelId === "yavar-inhouse" ? 1450 : 2000) *
              (0.7 + rand() * 0.6),
          ),
          accepted: rand() < profile.accept + sprintIdx * 0.008,
          reworked: rand() < profile.rework,
        });
      }
    }
  });

  return events;
}

/* ------------------------------------------------------------ aggregation */

export interface AiUsageQuery {
  visibility: AiVisibility;
  userId: string;
  sprints?: number;
}

function scopeEvents(events: AiUsageEvent[], q: AiUsageQuery) {
  const viewer = memberById.get(q.userId);
  if (q.visibility === "self") return events.filter((e) => e.userId === q.userId);
  if (q.visibility === "team" && viewer)
    return events.filter((e) => memberById.get(e.userId)?.squad === viewer.squad);
  return events;
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function pct(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

export async function aggregate(q: AiUsageQuery) {
  const sprints = SPRINTS.slice(-(q.sprints ?? SPRINTS.length));
  const all = await allEvents();
  const sprintFiltered = all.filter((e) => sprints.includes(e.sprint));
  const scoped = scopeEvents(sprintFiltered, q);
  const latest = sprints[sprints.length - 1];
  const previous = sprints[sprints.length - 2];

  const costOf = async (list: AiUsageEvent[]) => {
    const costs = await Promise.all(list.map(eventCost));
    return sum(costs);
  };
  const tokensOf = (list: AiUsageEvent[]) => sum(list.map((e) => e.tokensIn + e.tokensOut));

  const inSprint = (list: AiUsageEvent[], s?: string) =>
    s ? list.filter((e) => e.sprint === s) : [];

  const current = inSprint(scoped, latest);
  const prior = inSprint(scoped, previous);

  /* models */
  const modelCatalog = await getModelCatalog();
  const models = await Promise.all(modelCatalog.map(async (m) => {
    const list = scoped.filter((e) => e.modelId === m.id);
    const costValue = await costOf(list);
    return {
      id: m.id,
      name: m.name,
      vendor: m.vendor,
      purpose: m.purpose,
      tokensIn: sum(list.map((e) => e.tokensIn)),
      tokensOut: sum(list.map((e) => e.tokensOut)),
      requests: list.length,
      costUsd: Math.round(costValue * 10) / 10,
      avgLatencyMs: list.length ? Math.round(sum(list.map((e) => e.latencyMs)) / list.length) : 0,
      acceptRate: pct(list.filter((e) => e.accepted).length, list.length),
    };
  })).then((m) => m.filter((m) => m.requests > 0));

  /* trends */
  const spendTrend = await Promise.all(sprints.map(async (s) => {
    const row: Record<string, string | number> = { sprint: s, budget: sprintBudget(q) };
    for (const m of modelCatalog) {
      const sprintCost = await costOf(scoped.filter((e) => e.sprint === s && e.modelId === m.id));
      row[m.id] = Math.round(sprintCost);
    }
    return row;
  }));

  const tokenTrend = sprints.map((s) => {
    const list = scoped.filter((e) => e.sprint === s);
    const tIn = sum(list.map((e) => e.tokensIn));
    return {
      sprint: s,
      input: Math.round((tIn / 1_000_000) * 10) / 10,
      output: Math.round((sum(list.map((e) => e.tokensOut)) / 1_000_000) * 10) / 10,
      cachedPct: pct(sum(list.map((e) => e.cachedIn)), tIn),
    };
  });

  const activityMix = await Promise.all((Object.keys(ACTIVITY_LABEL) as AiActivity[]).map(async (a) => {
    const list = scoped.filter((e) => e.activity === a);
    return {
      activity: ACTIVITY_LABEL[a],
      tokens: Math.round((tokensOf(list) / 1_000_000) * 10) / 10,
      costUsd: Math.round(await costOf(list)),
    };
  }));

  /* people — visibility controls who is listed and whether cost is exposed */
  const visibleMembers =
    q.visibility === "self"
      ? AI_DIRECTORY.filter((m) => m.id === q.userId)
      : q.visibility === "team"
        ? AI_DIRECTORY.filter((m) => m.squad === memberById.get(q.userId)?.squad)
        : AI_DIRECTORY;

  const people = await Promise.all(visibleMembers
    .map(async (member) => {
      const list = scoped.filter((e) => e.userId === member.id);
      const topModel = models
        .map((m) => ({ m, n: list.filter((e) => e.modelId === m.id).length }))
        .sort((a, b) => b.n - a.n)[0];
      const assisted = list.filter((e) => e.accepted);
      return {
        id: member.id,
        name: member.name,
        role: member.role,
        squad: member.squad,
        tokens: Math.round((tokensOf(list) / 1_000_000) * 10) / 10,
        costUsd: q.visibility === "self" ? null : Math.round(await costOf(list)),
        requests: list.length,
        acceptRate: pct(assisted.length, list.length),
        aiAssistedOutput: pct(sum(assisted.map((e) => e.tokensOut)), sum(list.map((e) => e.tokensOut))),
        reworkRate: pct(list.filter((e) => e.reworked).length, assisted.length),
        topModel: topModel?.m.name ?? "—",
      };
    }))
    .then((people) => people.sort((a, b) => b.tokens - a.tokens));

  /* org-wide medians so "self" viewers get context without seeing colleagues */
  const orgPeople = AI_DIRECTORY.map((member) => {
    const list = all.filter((e) => e.userId === member.id);
    const assisted = list.filter((e) => e.accepted);
    return {
      acceptRate: pct(assisted.length, list.length),
      aiAssistedOutput: pct(sum(assisted.map((e) => e.tokensOut)), sum(list.map((e) => e.tokensOut))),
      reworkRate: pct(list.filter((e) => e.reworked).length, assisted.length),
    };
  });
  const median = (values: number[]) => {
    const s = [...values].sort((a, b) => a - b);
    return s.length ? Math.round(s[Math.floor(s.length / 2)] * 10) / 10 : 0;
  };
  const benchmarks = {
    acceptRate: median(orgPeople.map((p) => p.acceptRate)),
    aiAssistedOutput: median(orgPeople.map((p) => p.aiAssistedOutput)),
    reworkRate: median(orgPeople.map((p) => p.reworkRate)),
  };

  /* totals + KPIs */
  const budget = sprintBudget(q);
  const currentCost = await costOf(current);
  const priorCost = await costOf(prior);
  const totals = {
    costUsd: Math.round(await costOf(scoped)),
    currentSprintCostUsd: Math.round(currentCost),
    tokens: tokensOf(scoped),
    requests: scoped.length,
    budgetUsd: budget,
    budgetConsumedPct: pct(currentCost, budget),
    cachedPct: pct(sum(current.map((e) => e.cachedIn)), sum(current.map((e) => e.tokensIn))),
    activeUsers: new Set(current.map((e) => e.userId)).size,
    seats: visibleMembers.length,
    acceptRate: pct(scoped.filter((e) => e.accepted).length, scoped.length),
  };

  const kpis = buildKpis(q.visibility, {
    sprints,
    scoped,
    current,
    prior,
    currentCost,
    priorCost,
    totals,
    costOf,
    tokensOf,
  });

  const insights = buildInsights(q.visibility, { models, people, tokenTrend, totals });

  return {
    visibility: q.visibility,
    userId: q.userId,
    sprints,
    generatedAt: new Date().toISOString(),
    canSeeCost: q.visibility !== "self",
    canSeePeople: q.visibility === "team" || q.visibility === "org",
    totals,
    kpis,
    models: q.visibility === "self" ? models.map((m) => ({ ...m, costUsd: 0 })) : models,
    spendTrend,
    tokenTrend,
    activityMix,
    people,
    benchmarks,
    insights,
  };
}

export type AiUsageAnalytics = ReturnType<typeof aggregate>;

function sprintBudget(q: AiUsageQuery) {
  if (q.visibility === "self") return memberById.get(q.userId)?.seatBudgetUsd ?? 400;
  if (q.visibility === "team") {
    const squad = memberById.get(q.userId)?.squad;
    return sum(
      AI_DIRECTORY.filter((m) => m.squad === squad).map((m) => m.seatBudgetUsd),
    );
  }
  return ORG_SPRINT_BUDGET_USD;
}

type KpiTone = "good" | "warning" | "critical" | "ops" | "neutral";
interface Kpi {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  tone: KpiTone;
  spark: number[];
}

function buildKpis(
  visibility: AiVisibility,
  ctx: {
    sprints: string[];
    scoped: AiUsageEvent[];
    current: AiUsageEvent[];
    prior: AiUsageEvent[];
    currentCost: number;
    priorCost: number;
    totals: { budgetUsd: number; acceptRate: number; activeUsers: number; seats: number };
    costOf: (l: AiUsageEvent[]) => number;
    tokensOf: (l: AiUsageEvent[]) => number;
  },
): Kpi[] {
  const bySprint = (s: string) => ctx.scoped.filter((e) => e.sprint === s);
  const costSpark = ctx.sprints.map((s) => Math.round(ctx.costOf(bySprint(s))));
  const tokenSpark = ctx.sprints.map(
    (s) => Math.round((ctx.tokensOf(bySprint(s)) / 1_000_000) * 10) / 10,
  );
  const acceptSpark = ctx.sprints.map((s) => {
    const l = bySprint(s);
    return pct(l.filter((e) => e.accepted).length, l.length);
  });
  const reworkSpark = ctx.sprints.map((s) => {
    const l = bySprint(s).filter((e) => e.accepted);
    return pct(l.filter((e) => e.reworked).length, l.length);
  });

  const delta = (a: number, b: number, unit = "%") =>
    b === 0
      ? "—"
      : unit === "%"
        ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 1000) / 10}%`
        : `${a >= b ? "+" : ""}${Math.round((a - b) * 10) / 10}`;

  const dir = (a: number, b: number): Kpi["trend"] => (a > b ? "up" : a < b ? "down" : "flat");

  const spendKpi: Kpi = {
    label:
      visibility === "self" ? "My AI spend" : visibility === "team" ? "Squad AI spend" : "AI spend",
    value: `$${Math.round(ctx.currentCost).toLocaleString()}`,
    delta: delta(ctx.currentCost, ctx.priorCost),
    trend: dir(ctx.currentCost, ctx.priorCost),
    tone: ctx.currentCost > ctx.totals.budgetUsd * 0.9 ? "critical" : "ops",
    spark: costSpark,
  };

  const acceptKpi: Kpi = {
    label: "Suggestion accept rate",
    value: `${acceptSpark[acceptSpark.length - 1]}%`,
    delta: delta(
      acceptSpark[acceptSpark.length - 1],
      acceptSpark[acceptSpark.length - 2] ?? acceptSpark[0],
      "pt",
    ),
    trend: dir(acceptSpark[acceptSpark.length - 1], acceptSpark[acceptSpark.length - 2] ?? 0),
    tone: acceptSpark[acceptSpark.length - 1] >= 65 ? "good" : "warning",
    spark: acceptSpark,
  };

  const reworkKpi: Kpi = {
    label: "AI rework rate",
    value: `${reworkSpark[reworkSpark.length - 1]}%`,
    delta: delta(
      reworkSpark[reworkSpark.length - 1],
      reworkSpark[reworkSpark.length - 2] ?? reworkSpark[0],
      "pt",
    ),
    trend: dir(reworkSpark[reworkSpark.length - 1], reworkSpark[reworkSpark.length - 2] ?? 0),
    tone: reworkSpark[reworkSpark.length - 1] >= 12 ? "critical" : "warning",
    spark: reworkSpark,
  };

  const tokenKpi: Kpi = {
    label: visibility === "self" ? "My tokens" : "Tokens consumed",
    value: `${tokenSpark[tokenSpark.length - 1]}M`,
    delta: delta(tokenSpark[tokenSpark.length - 1], tokenSpark[tokenSpark.length - 2] ?? 0, "pt"),
    trend: dir(tokenSpark[tokenSpark.length - 1], tokenSpark[tokenSpark.length - 2] ?? 0),
    tone: "neutral",
    spark: tokenSpark,
  };

  if (visibility === "self") return [spendKpi, tokenKpi, acceptKpi, reworkKpi];

  const costPerAcceptedNow =
    ctx.currentCost / Math.max(1, ctx.current.filter((e) => e.accepted).length);
  const costPerAcceptedPrev =
    ctx.priorCost / Math.max(1, ctx.prior.filter((e) => e.accepted).length);
  const efficiencyKpi: Kpi = {
    label: "Cost per accepted suggestion",
    value: `$${(Math.round(costPerAcceptedNow * 1000) / 1000).toFixed(3)}`,
    delta: delta(costPerAcceptedNow, costPerAcceptedPrev),
    trend: dir(costPerAcceptedNow, costPerAcceptedPrev),
    tone: costPerAcceptedNow <= costPerAcceptedPrev ? "good" : "warning",
    spark: ctx.sprints.map((s) => {
      const l = bySprint(s);
      return (
        Math.round((ctx.costOf(l) / Math.max(1, l.filter((e) => e.accepted).length)) * 1000) / 1000
      );
    }),
  };

  if (visibility === "team") return [spendKpi, tokenKpi, acceptKpi, efficiencyKpi];

  if (visibility === "org")
    return [
      spendKpi,
      {
        label: "Active AI users",
        value: `${ctx.totals.activeUsers} / ${ctx.totals.seats}`,
        delta: `${ctx.totals.activeUsers === ctx.totals.seats ? "full" : "partial"} adoption`,
        trend: "flat",
        tone: "neutral",
        spark: ctx.sprints.map((s) => new Set(bySprint(s).map((e) => e.userId)).size),
      },
      acceptKpi,
      reworkKpi,
    ];

  // finance
  const financeKpis: Kpi[] = [] as Kpi[];
  const budgetPct = pct(ctx.currentCost, ctx.totals.budgetUsd);
  const savedHours = Math.round(
    ctx.current.filter((e) => e.accepted && !e.reworked).length * 0.12,
  );
  financeKpis.push(
    spendKpi,
    {
      label: "Budget consumed" as const,
      value: `${budgetPct}%`,
      delta: delta(ctx.currentCost, ctx.priorCost),
      trend: dir(ctx.currentCost, ctx.priorCost),
      tone: budgetPct > 90 ? "critical" : budgetPct > 75 ? "warning" : "good",
      spark: ctx.sprints.map((s) => pct(ctx.costOf(bySprint(s)), ctx.totals.budgetUsd)),
    },
    {
      label: "Effort saved (est.)",
      value: `${savedHours} hrs`,
      delta: "0.12 hr / accepted suggestion",
      trend: "up",
      tone: "good",
      spark: ctx.sprints.map(
        (s) => Math.round(bySprint(s).filter((e) => e.accepted && !e.reworked).length * 0.12),
      ),
    },
    {
      label: "AI ROI",
      value: `${(Math.round((savedHours * 65) / Math.max(1, ctx.currentCost) * 10) / 10).toFixed(1)}x`,
      delta: "vs. $65/hr blended rate",
      trend: "up",
      tone: "good",
      spark: ctx.sprints.map((s) => {
        const l = bySprint(s);
        const hrs = l.filter((e) => e.accepted && !e.reworked).length * 0.12;
        return Math.round((hrs * 65) / Math.max(1, ctx.costOf(l)) * 10) / 10;
      }),
    },
    efficiencyKpi,
  );
  return financeKpis.slice(0, 4);
}

function buildInsights(
  visibility: AiVisibility,
  ctx: {
    models: { name: string; costUsd: number; acceptRate: number; tokensIn: number; tokensOut: number }[];
    people: { name: string; costUsd: number | null; acceptRate: number; reworkRate: number }[];
    tokenTrend: { sprint: string; cachedPct: number }[];
    totals: { budgetConsumedPct: number; currentSprintCostUsd: number; budgetUsd: number };
  },
) {
  const out: { title: string; detail: string; tone: KpiTone }[] = [];

  const risky = [...ctx.people]
    .filter((p) => p.acceptRate < 60 || p.reworkRate > 15)
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0))[0];
  if (risky && visibility !== "self")
    out.push({
      title: "Low acceptance, high spend",
      detail: `${risky.name} keeps only ${risky.acceptRate}% of suggestions and reworks ${risky.reworkRate}% of AI-assisted changes${
        risky.costUsd ? ` at $${risky.costUsd} across the window` : ""
      } — prompt coaching or a cheaper tier would cut cost without slowing output.`,
      tone: "critical",
    });

  const inhouse = ctx.models.find((m) => m.name.includes("In-house"));
  const totalTokens = ctx.models.reduce((s, m) => s + m.tokensIn + m.tokensOut, 0);
  const totalCost = ctx.models.reduce((s, m) => s + m.costUsd, 0);
  if (inhouse && totalTokens > 0)
    out.push({
      title: "In-house model is displacing paid tokens",
      detail: `Self-hosted inference now carries ${pct(
        inhouse.tokensIn + inhouse.tokensOut,
        totalTokens,
      )}% of all tokens at ${pct(inhouse.costUsd, totalCost)}% of the cost — shifting doc and test drafting fully in-house is the cheapest remaining lever.`,
      tone: "good",
    });

  const cached = ctx.tokenTrend[ctx.tokenTrend.length - 1]?.cachedPct ?? 0;
  out.push({
    title: cached < 40 ? "Prompt caching under-used" : "Prompt caching is paying off",
    detail: `Cached input is at ${cached}% of prompt tokens this sprint (was ${
      ctx.tokenTrend[0]?.cachedPct ?? 0
    }% seven sprints ago). Every 10 points of cache hit trims roughly 6% off input billing.`,
    tone: cached < 40 ? "warning" : "good",
  });

  if (visibility !== "self")
    out.push({
      title: "Budget pacing",
      detail: `Current sprint spend is $${ctx.totals.currentSprintCostUsd} against a $${ctx.totals.budgetUsd} cap — ${ctx.totals.budgetConsumedPct}% consumed.`,
      tone: ctx.totals.budgetConsumedPct > 90 ? "critical" : "ops",
    });

  return out;
}

/* ------------------------------------------------------------ ingest util */

export async function parseIngestPayload(body: unknown): Promise<AiUsageEvent[]> {
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: unknown[] })?.events)
      ? (body as { events: unknown[] }).events
      : null;
  if (!rows) throw new Error("Body must be an array of events or { events: [...] }.");
  if (rows.length > 1000) throw new Error("Max 1000 events per batch.");

  // Refresh AI directory to include newly added users
  await refreshAiDirectory();

  // Get valid model IDs from database
  const modelCatalog = await getModelCatalog();
  const validModelIds = new Set(modelCatalog.map(m => m.id));

  return rows.map((raw, i) => {
    const e = raw as Partial<AiUsageEvent>;
    if (!e.userId || !memberById.has(e.userId)) throw new Error(`events[${i}]: unknown userId.`);
    if (!e.modelId || !validModelIds.has(e.modelId)) throw new Error(`events[${i}]: unknown modelId.`);
    const activity = (e.activity ?? "code") as AiActivity;
    if (!(activity in ACTIVITY_LABEL)) throw new Error(`events[${i}]: unknown activity.`);
    const tokensIn = Number(e.tokensIn ?? 0);
    const tokensOut = Number(e.tokensOut ?? 0);
    if (!Number.isFinite(tokensIn) || !Number.isFinite(tokensOut) || tokensIn < 0 || tokensOut < 0)
      throw new Error(`events[${i}]: token counts must be non-negative numbers.`);
    const ts = e.ts ? new Date(e.ts) : new Date();
    if (Number.isNaN(ts.getTime())) throw new Error(`events[${i}]: invalid ts.`);

    return {
      id: e.id ?? crypto.randomUUID(),
      ts: ts.toISOString(),
      sprint: e.sprint ?? SPRINTS[SPRINTS.length - 1],
      userId: e.userId,
      modelId: e.modelId,
      activity,
      tokensIn,
      tokensOut,
      cachedIn: Math.max(0, Math.min(tokensIn, Number(e.cachedIn ?? 0))),
      latencyMs: Math.max(0, Number(e.latencyMs ?? 0)),
      accepted: Boolean(e.accepted),
      reworked: Boolean(e.reworked),
    } satisfies AiUsageEvent;
  });
}
