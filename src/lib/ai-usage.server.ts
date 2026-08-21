/**
 * AI usage analytics — server-side domain + aggregation layer.
 *
 * This is the real API surface behind the "AI Usage & Tokens" tab. Telemetry
 * arrives as immutable usage EVENTS (one per LLM request) from IDE plugins /
 * gateway proxies via POST /api/public/ai-usage/events, and every dashboard
 * number is derived from those events at query time — nothing is hardcoded in
 * the UI.
 *
 * Every query in this file is scoped by tenantId, derived server-side from an
 * authenticated session or ingest token — never from a client-supplied value.
 * See docs/PARALLEL_WORK_COORDINATION.md for the current auth contract.
 */

export type AiVisibility = "self" | "team" | "org" | "finance";
export type AiActivity = "code" | "tests" | "docs" | "review";

import { PrismaClient } from '@prisma/client';
import { hashToken, generateSecureToken } from './encryption';

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
  sprint: string | null;
  userId: string | null;
  modelId: string;
  activity: AiActivity | null;
  tokensIn: number;
  tokensOut: number;
  cachedIn: number;
  latencyMs: number | null;
  /** suggestion kept in the final artefact */
  accepted: boolean | null;
  /** AI-assisted change later reopened / rejected in review */
  reworked: boolean | null;
  requestCount?: number;
  providerCostUsd?: number | null;
  estimatedCostUsd?: number | null;
  costSource?: string | null;
  /** 'claude_code' (default) for push-based per-request rows; a vendor sync adapter's own provider id otherwise */
  provider?: string;
  /** set only on pull-based aggregate rows written by a usage-sync adapter (e.g. OpenAI, Vertex) */
  bucketStart?: string;
  /** required alongside bucketStart — see AiUsageEvent's schema comment on why NULL would defeat the dedup index */
  groupKey?: string;
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

/**
 * A tenantId IS NULL row is a global default (published vendor list price);
 * a tenant only needs its own row if it negotiated a different rate. Ties
 * are broken in favour of the tenant-specific row.
 */
export async function getModelCatalog(tenantId: string): Promise<AiModelMeta[]> {
  try {
    const rows = await prisma.aiModelCatalog.findMany({
      where: { isActive: true, OR: [{ tenantId }, { tenantId: null }] },
    });

    const byModelId = new Map<string, typeof rows[number]>();
    for (const row of rows) {
      const existing = byModelId.get(row.modelId);
      if (!existing || (existing.tenantId === null && row.tenantId !== null)) {
        byModelId.set(row.modelId, row);
      }
    }

    return Array.from(byModelId.values()).map(m => ({
      id: m.modelId,
      name: m.name,
      vendor: m.vendor,
      purpose: m.purpose ?? "",
      priceIn: Number(m.priceIn),
      priceOut: Number(m.priceOut),
      cacheDiscount: Number(m.cacheDiscount ?? 0.9),
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

export const SPRINTS = ["S6", "S7", "S8", "S9", "S10", "S11", "S12"];
export const ORG_SPRINT_BUDGET_USD = 3200;

/**
 * Loaded fresh per call, scoped to one tenant — replaces a previous
 * module-level global cache that leaked across tenants (every visibility
 * computation read from a single process-wide directory shared by every
 * request) and raced under concurrent requests from different tenants.
 */
async function loadDirectory(tenantId: string): Promise<{ directory: AiMember[]; byId: Map<string, AiMember> }> {
  const users = await prisma.user.findMany({ where: { isActive: true, tenantId } });
  const directory: AiMember[] = users.map(user => ({
    id: user.id,
    name: user.name || user.email,
    role: user.role as AiMember["role"],
    squad: user.squad ?? "Unassigned",
    seatBudgetUsd: 400,
  }));
  return { directory, byId: new Map(directory.map((m) => [m.id, m])) };
}

/**
 * Issue a fresh personal ingest token for a user, invalidating any prior one.
 * Only the hash is persisted — the plaintext is returned once and never stored.
 */
export async function issueAiIngestToken(userId: string): Promise<string> {
  const rawToken = generateSecureToken();
  await prisma.user.update({
    where: { id: userId },
    data: {
      aiIngestTokenHash: hashToken(rawToken),
      aiIngestTokenCreatedAt: new Date(),
    },
  });
  return rawToken;
}

/** Resolve a user from a presented raw ingest token. Never trusts payload-supplied identity. */
export async function resolveUserByIngestToken(rawToken: string) {
  const user = await prisma.user.findUnique({
    where: { aiIngestTokenHash: hashToken(rawToken) },
  });
  return user && user.isActive ? user : null;
}

export interface ModelCatalogHint {
  vendor: string;
  priceIn: number;
  priceOut: number;
  purpose?: string;
}

/**
 * Auto-register a GLOBAL model catalog entry the first time an unrecognized
 * modelId is seen from live telemetry (e.g. non-Anthropic models routed
 * through a third-party-compatible proxy). Pricing is a placeholder until an
 * admin verifies it. Always global (tenantId: null), not tenant-scoped — an
 * unrecognized model is "nobody has told us the right price yet," not one
 * tenant's negotiated rate, so every tenant hitting the same unknown model
 * shares one placeholder rather than each minting their own.
 *
 * `hint` lets a vendor-specific caller (e.g. the OpenAI sync adapter) supply
 * its own vendor name and a reasonable default price instead of silently
 * falling back to Claude's $3/$15 — a real GPT model ending up catalogued at
 * Anthropic's rate was a known wart before this parameter existed.
 */
export async function ensureModelCatalogEntry(modelId: string, hint?: ModelCatalogHint): Promise<void> {
  try {
    const existing = await prisma.aiModelCatalog.findFirst({ where: { modelId, tenantId: null } });
    if (existing) return;
    await prisma.aiModelCatalog.create({
      data: {
        modelId,
        name: modelId,
        vendor: hint?.vendor ?? "Unverified (auto-detected via OTel)",
        purpose: hint?.purpose ?? "Auto-created placeholder — verify pricing before trusting cost figures.",
        priceIn: hint?.priceIn ?? 3,
        priceOut: hint?.priceOut ?? 15,
        cacheDiscount: 0.9,
        isActive: true,
        tenantId: null,
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2002") throw error; // ignore race on concurrent first-seen model
  }
}

export function eventCost(e: AiUsageEvent, modelById: Map<string, AiModelMeta>): number {
  if (e.providerCostUsd !== null && e.providerCostUsd !== undefined) return e.providerCostUsd;
  if (e.estimatedCostUsd !== null && e.estimatedCostUsd !== undefined) return e.estimatedCostUsd;
  const m = modelById.get(e.modelId);
  if (!m) return 0;
  const billableIn = e.tokensIn - e.cachedIn + e.cachedIn * (1 - m.cacheDiscount);
  return (billableIn / 1_000_000) * m.priceIn + (e.tokensOut / 1_000_000) * m.priceOut;
}

/* ------------------------------------------------------------------ database store */

export async function recordEvents(events: AiUsageEvent[], tenantId: string) {
  try {
    if (events.length === 0) {
      return { accepted: 0, total: await prisma.aiUsageEvent.count({ where: { tenantId } }) };
    }

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
        tenantId,
        provider: e.provider ?? 'claude_code',
        bucketStart: e.bucketStart ? new Date(e.bucketStart) : null,
        groupKey: e.groupKey ?? null,
      }))
    });

    const total = await prisma.aiUsageEvent.count({ where: { tenantId } });
    return { accepted: events.length, total };
  } catch (error) {
    console.error('Error recording AI usage events:', error);
    throw new Error('Failed to record events');
  }
}

export async function allEvents(tenantId: string): Promise<AiUsageEvent[]> {
  try {
    const dbEvents = await prisma.aiUsageEvent.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' }
    });

    return dbEvents.map(e => ({
      id: e.id,
      ts: (e.timestamp ?? new Date()).toISOString(),
      sprint: e.sprint,
      userId: e.userId,
      modelId: e.modelId,
      activity: e.activity as AiActivity | null,
      tokensIn: e.tokensIn,
      tokensOut: e.tokensOut,
      cachedIn: e.cachedIn ?? 0,
      latencyMs: e.latencyMs,
      accepted: e.accepted,
      reworked: e.reworked,
      requestCount: e.requestCount,
      providerCostUsd: e.providerCostUsd === null ? null : Number(e.providerCostUsd),
      estimatedCostUsd: e.estimatedCostUsd === null ? null : Number(e.estimatedCostUsd),
      costSource: e.costSource,
    }));
  } catch (error) {
    console.error('Error fetching AI usage events:', error);
    return [];
  }
}

/* ------------------------------------------------------------ aggregation */

export interface AiUsageQuery {
  visibility: AiVisibility;
  userId: string;
  tenantId: string;
  sprints?: number;
}

function scopeEvents(events: AiUsageEvent[], q: AiUsageQuery, byId: Map<string, AiMember>) {
  const viewer = byId.get(q.userId);
  if (q.visibility === "self") return events.filter((e) => e.userId === q.userId);
  if (q.visibility === "team" && viewer)
    return events.filter((e) => e.userId ? byId.get(e.userId)?.squad === viewer.squad : false);
  return events;
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function pct(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

export async function aggregate(q: AiUsageQuery) {
  const { directory, byId } = await loadDirectory(q.tenantId);

  const sprints = SPRINTS.slice(-(q.sprints ?? SPRINTS.length));
  const all = await allEvents(q.tenantId);
  const sprintFiltered = all.filter((e) => e.sprint !== null && sprints.includes(e.sprint));
  const scoped = scopeEvents(sprintFiltered, q, byId);
  const latest = sprints[sprints.length - 1];
  const previous = sprints[sprints.length - 2];

  const modelCatalog = await getModelCatalog(q.tenantId);
  const modelById = new Map(modelCatalog.map((m) => [m.id, m]));

  const costOf = (list: AiUsageEvent[]) => sum(list.map((e) => eventCost(e, modelById)));
  const tokensOf = (list: AiUsageEvent[]) => sum(list.map((e) => e.tokensIn + e.tokensOut));

  const inSprint = (list: AiUsageEvent[], s?: string) =>
    s ? list.filter((e) => e.sprint === s) : [];

  const current = inSprint(scoped, latest);
  const prior = inSprint(scoped, previous);

  /* models */
  const models = modelCatalog.map((m) => {
    const list = scoped.filter((e) => e.modelId === m.id);
    return {
      id: m.id,
      name: m.name,
      vendor: m.vendor,
      purpose: m.purpose,
      tokensIn: sum(list.map((e) => e.tokensIn)),
      tokensOut: sum(list.map((e) => e.tokensOut)),
      requests: sum(list.map((e) => e.requestCount ?? 1)),
      costUsd: Math.round(costOf(list) * 10) / 10,
      avgLatencyMs: (() => {
        const known = list.map((e) => e.latencyMs).filter((value): value is number => value !== null);
        return known.length ? Math.round(sum(known) / known.length) : 0;
      })(),
      acceptRate: (() => {
        const known = list.filter((e) => e.accepted !== null);
        return pct(known.filter((e) => e.accepted === true).length, known.length);
      })(),
    };
  }).filter((m) => m.requests > 0);

  /* trends */
  const spendTrend = sprints.map((s) => {
    const row: Record<string, string | number> = { sprint: s, budget: sprintBudget(q, directory, byId) };
    for (const m of modelCatalog) {
      const sprintCost = costOf(scoped.filter((e) => e.sprint === s && e.modelId === m.id));
      row[m.id] = Math.round(sprintCost);
    }
    return row;
  });

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

  const activityMix = (Object.keys(ACTIVITY_LABEL) as AiActivity[]).map((a) => {
    const list = scoped.filter((e) => e.activity === a);
    return {
      activity: ACTIVITY_LABEL[a],
      tokens: Math.round((tokensOf(list) / 1_000_000) * 10) / 10,
      costUsd: Math.round(costOf(list)),
    };
  });

  /* people — visibility controls who is listed and whether cost is exposed */
  const visibleMembers =
    q.visibility === "self"
      ? directory.filter((m) => m.id === q.userId)
      : q.visibility === "team"
        ? directory.filter((m) => m.squad === byId.get(q.userId)?.squad)
        : directory;

  const people = visibleMembers
    .map((member) => {
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
        costUsd: q.visibility === "self" ? null : Math.round(costOf(list)),
        requests: sum(list.map((e) => e.requestCount ?? 1)),
        acceptRate: pct(assisted.length, list.filter((e) => e.accepted !== null).length),
        aiAssistedOutput: pct(sum(assisted.map((e) => e.tokensOut)), sum(list.map((e) => e.tokensOut))),
        reworkRate: pct(list.filter((e) => e.reworked).length, assisted.length),
        topModel: topModel?.m.name ?? "—",
      };
    })
    .sort((a, b) => b.tokens - a.tokens);

  /* org-wide medians so "self" viewers get context without seeing colleagues */
  const orgPeople = directory.map((member) => {
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
  const budget = sprintBudget(q, directory, byId);
  const currentCost = costOf(current);
  const priorCost = costOf(prior);
  const costsBySprint = sprints.map((s) => costOf(scoped.filter((e) => e.sprint === s)));
  const totals = {
    costUsd: Math.round(costOf(scoped)),
    currentSprintCostUsd: Math.round(currentCost),
    tokens: tokensOf(scoped),
    requests: sum(scoped.map((e) => e.requestCount ?? 1)),
    budgetUsd: budget,
    budgetConsumedPct: pct(currentCost, budget),
    cachedPct: pct(sum(current.map((e) => e.cachedIn)), sum(current.map((e) => e.tokensIn))),
    activeUsers: new Set(current.map((e) => e.userId).filter((id): id is string => id !== null)).size,
    seats: visibleMembers.length,
    acceptRate: pct(scoped.filter((e) => e.accepted === true).length, scoped.filter((e) => e.accepted !== null).length),
  };

  const kpis = buildKpis(q.visibility, {
    sprints,
    scoped,
    current,
    prior,
    currentCost,
    priorCost,
    totals,
    costsBySprint,
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

function sprintBudget(q: AiUsageQuery, directory: AiMember[], byId: Map<string, AiMember>) {
  if (q.visibility === "self") return byId.get(q.userId)?.seatBudgetUsd ?? 400;
  if (q.visibility === "team") {
    const squad = byId.get(q.userId)?.squad;
    return sum(
      directory.filter((m) => m.squad === squad).map((m) => m.seatBudgetUsd),
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
    costsBySprint: number[];
    tokensOf: (l: AiUsageEvent[]) => number;
  },
): Kpi[] {
  const bySprint = (s: string) => ctx.scoped.filter((e) => e.sprint === s);
  const costSpark = ctx.costsBySprint.map((c) => Math.round(c));
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
    spark: ctx.sprints.map((s, i) => {
      const l = bySprint(s);
      return (
        Math.round((ctx.costsBySprint[i] / Math.max(1, l.filter((e) => e.accepted).length)) * 1000) / 1000
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
      spark: ctx.costsBySprint.map((c) => pct(c, ctx.totals.budgetUsd)),
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
      spark: ctx.sprints.map((s, i) => {
        const l = bySprint(s);
        const hrs = l.filter((e) => e.accepted && !e.reworked).length * 0.12;
        return Math.round((hrs * 65) / Math.max(1, ctx.costsBySprint[i]) * 10) / 10;
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

export async function parseIngestPayload(body: unknown, tenantId: string): Promise<AiUsageEvent[]> {
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: unknown[] })?.events)
      ? (body as { events: unknown[] }).events
      : null;
  if (!rows) throw new Error("Body must be an array of events or { events: [...] }.");
  if (rows.length > 1000) throw new Error("Max 1000 events per batch.");

  const { byId } = await loadDirectory(tenantId);
  const modelCatalog = await getModelCatalog(tenantId);
  const validModelIds = new Set(modelCatalog.map(m => m.id));

  return rows.map((raw, i) => {
    const e = raw as Partial<AiUsageEvent>;
    if (!e.userId || !byId.has(e.userId)) throw new Error(`events[${i}]: unknown userId.`);
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
