import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { KpiMetricCard } from "@/components/qm/KpiMetricCard";
import { FilterBar } from "@/components/qm/FilterBar";
import {
  AiActivityDonut,
  AiModelEfficiencyChart,
  AiSpendChart,
  AiTokenChart,
} from "@/components/qm/ai-usage-charts";
import {
  AI_CURRENT_USER_ID,
  AI_INSIGHTS,
  AI_KPIS,
  AI_MODELS,
  AI_PEOPLE,
  AI_TOTAL,
  AI_VISIBILITY_NOTE,
  formatTokens,
  type AiVisibility,
} from "@/lib/qm-ai-usage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ai-usage")({
  head: () => ({
    meta: [
      { title: "AI Usage & Token Analytics — QualiMetrix" },
      {
        name: "description",
        content:
          "Monitor LLM adoption across dev and QA: token consumption, model spend, budget pacing, suggestion acceptance and AI-assisted rework, with role-based visibility.",
      },
      { property: "og:title", content: "AI Usage & Token Analytics — QualiMetrix" },
      {
        property: "og:description",
        content:
          "Track Claude, Codex, Gemini and in-house model usage, cost per sprint and team efficiency in one glass dashboard.",
      },
    ],
  }),
  component: AiUsagePage,
});

const LEVELS: { id: AiVisibility; label: string }[] = [
  { id: "self", label: "My usage" },
  { id: "team", label: "Squad lead" },
  { id: "org", label: "Manager / HR" },
  { id: "finance", label: "Leadership" },
];

const toneBorder: Record<string, string> = {
  good: "border-l-good",
  warning: "border-l-warning",
  critical: "border-l-critical",
  ops: "border-l-ops",
  neutral: "border-l-muted-foreground",
};

function AiUsagePage() {
  const [level, setLevel] = useState<AiVisibility>("org");
  const seesPeople = level === "org" || level === "team";
  const seesCost = level !== "self";
  const budgetPct = Math.round((AI_TOTAL.costUsd / AI_TOTAL.budgetUsd) * 100);

  const people =
    level === "self"
      ? AI_PEOPLE.filter((p) => p.id === AI_CURRENT_USER_ID)
      : level === "team"
        ? AI_PEOPLE.filter(
            (p) => p.squad === AI_PEOPLE.find((x) => x.id === AI_CURRENT_USER_ID)!.squad,
          )
        : AI_PEOPLE;

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">AI Usage & Tokens</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            LLM adoption across dev and QA — Claude, Codex, Gemini and the in-house model — with
            token burn, spend against budget and how much AI output actually survives review.
          </p>
        </div>
        <div className="glass flex flex-wrap gap-1 rounded-full p-1">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLevel(l.id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                level === l.id
                  ? "bg-primary text-primary-foreground shadow-[0_0_18px_-4px_var(--primary)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <div className="glass mb-5 flex items-start gap-2 rounded-2xl px-4 py-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
        <span>{AI_VISIBILITY_NOTE[level]}</span>
      </div>

      <div className="mb-5">
        <FilterBar />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {AI_KPIS[level].map((kpi) => (
          <KpiMetricCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {seesCost && (
          <GlassPanel
            title="Spend by model per sprint"
            subtitle="Stacked vendor cost against the sprint cap"
            className="xl:col-span-2"
          >
            <AiSpendChart />
          </GlassPanel>
        )}

        <GlassPanel
          title="Budget pacing"
          subtitle={seesCost ? "Current sprint against cap" : "Your share of the squad allowance"}
        >
          <div className="py-2">
            <div className="flex items-end justify-between">
              <span className="text-2xl font-semibold tracking-tight">
                {seesCost ? `$${AI_TOTAL.costUsd.toFixed(0)}` : "$402"}
              </span>
              <span className="text-xs text-muted-foreground">
                of {seesCost ? `$${AI_TOTAL.budgetUsd}` : "$650"} cap
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(seesCost ? budgetPct : 62, 100)}%` }}
              />
            </div>
            <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <li className="flex justify-between">
                <span>Total tokens</span>
                <span className="font-medium text-foreground">{formatTokens(AI_TOTAL.tokens)}</span>
              </li>
              <li className="flex justify-between">
                <span>Requests</span>
                <span className="font-medium text-foreground">
                  {AI_TOTAL.requests.toLocaleString()}
                </span>
              </li>
              <li className="flex justify-between">
                <span>Cached input</span>
                <span className="font-medium text-good">46%</span>
              </li>
            </ul>
          </div>
        </GlassPanel>

        <GlassPanel
          title="Token consumption trend"
          subtitle="Input vs output volume with prompt-cache ratio"
          className="xl:col-span-2"
        >
          <AiTokenChart />
        </GlassPanel>

        <GlassPanel title="Where tokens go" subtitle="Activity mix across code, tests and docs">
          <AiActivityDonut />
        </GlassPanel>

        <GlassPanel
          title="Model efficiency"
          subtitle="Suggestion acceptance against unit cost"
          className="xl:col-span-2"
        >
          <AiModelEfficiencyChart />
        </GlassPanel>

        <GlassPanel title="Efficiency insights" subtitle="Rule-driven cost & quality signals">
          <ul className="space-y-2.5">
            {AI_INSIGHTS.filter((i) => seesCost || i.tone !== "ops").map((i) => (
              <li
                key={i.title}
                className={cn(
                  "rounded-xl border-l-2 bg-accent/25 px-3 py-2",
                  toneBorder[i.tone] ?? toneBorder.neutral,
                )}
              >
                <p className="text-xs font-semibold">{i.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {i.detail}
                </p>
              </li>
            ))}
          </ul>
        </GlassPanel>

        {seesCost && (
          <GlassPanel
            title="Model & vendor breakdown"
            subtitle="Tokens, spend and latency per model"
            className="xl:col-span-3"
            bodyClassName="overflow-x-auto"
          >
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-[var(--glass-border)]">
                  <th className="py-2 font-medium">Model</th>
                  <th className="py-2 font-medium">Vendor</th>
                  <th className="py-2 font-medium">Primary use</th>
                  <th className="py-2 text-right font-medium">Tokens</th>
                  <th className="py-2 text-right font-medium">Requests</th>
                  <th className="py-2 text-right font-medium">Cost</th>
                  <th className="py-2 text-right font-medium">Avg latency</th>
                  <th className="py-2 text-right font-medium">Accept</th>
                </tr>
              </thead>
              <tbody>
                {AI_MODELS.map((m) => (
                  <tr key={m.id} className="border-b border-[var(--glass-border)]/60 last:border-0">
                    <td className="py-2.5 font-medium">{m.name}</td>
                    <td className="py-2.5 text-muted-foreground">{m.vendor}</td>
                    <td className="py-2.5 text-muted-foreground">{m.purpose}</td>
                    <td className="py-2.5 text-right">{formatTokens(m.tokensIn + m.tokensOut)}</td>
                    <td className="py-2.5 text-right">{m.requests.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-medium">${m.costUsd.toFixed(0)}</td>
                    <td className="py-2.5 text-right text-muted-foreground">
                      {(m.avgLatencyMs / 1000).toFixed(1)}s
                    </td>
                    <td
                      className={cn(
                        "py-2.5 text-right font-medium",
                        m.acceptRate >= 70 ? "text-good" : "text-warning",
                      )}
                    >
                      {m.acceptRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>
        )}

        <GlassPanel
          title={seesPeople ? "Per-person AI usage" : "Your AI usage"}
          subtitle={
            seesPeople
              ? "Adoption, efficiency and rework — coaching signal, not a leaderboard"
              : "Only your own record is visible at this level"
          }
          className="xl:col-span-3"
          bodyClassName="overflow-x-auto"
        >
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-[var(--glass-border)]">
                <th className="py-2 font-medium">Person</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Squad</th>
                <th className="py-2 font-medium">Top model</th>
                <th className="py-2 text-right font-medium">Tokens</th>
                {seesCost && <th className="py-2 text-right font-medium">Cost</th>}
                <th className="py-2 text-right font-medium">Accept</th>
                <th className="py-2 text-right font-medium">AI-assisted output</th>
                <th className="py-2 text-right font-medium">Rework</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-[var(--glass-border)]/60 last:border-0">
                  <td className="py-2.5 font-medium">{p.name}</td>
                  <td className="py-2.5 text-muted-foreground">{p.role}</td>
                  <td className="py-2.5 text-muted-foreground">{p.squad}</td>
                  <td className="py-2.5 text-muted-foreground">{p.topModel}</td>
                  <td className="py-2.5 text-right">{p.tokens}M</td>
                  {seesCost && (
                    <td className="py-2.5 text-right font-medium">${p.costUsd}</td>
                  )}
                  <td
                    className={cn(
                      "py-2.5 text-right font-medium",
                      p.acceptRate >= 65 ? "text-good" : "text-warning",
                    )}
                  >
                    {p.acceptRate}%
                  </td>
                  <td className="py-2.5 text-right">{p.aiAssistedOutput}%</td>
                  <td
                    className={cn(
                      "py-2.5 text-right font-medium",
                      p.reworkRate >= 15
                        ? "text-critical"
                        : p.reworkRate >= 10
                          ? "text-warning"
                          : "text-good",
                    )}
                  >
                    {p.reworkRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!seesPeople && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Team medians: 66% accept rate · 55% AI-assisted output · 9% rework.
            </p>
          )}
        </GlassPanel>
      </div>
    </AppShell>
  );
}
