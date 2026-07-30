import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { Kpi, Tone } from "@/lib/qm-data";
import { cn } from "@/lib/utils";

const toneText: Record<Tone, string> = {
  good: "text-good",
  warning: "text-warning",
  critical: "text-critical",
  ops: "text-ops",
  neutral: "text-muted-foreground",
};

const toneVar: Record<Tone, string> = {
  good: "var(--good)",
  warning: "var(--warning)",
  critical: "var(--critical)",
  ops: "var(--ops)",
  neutral: "var(--muted-foreground)",
};

export function KpiMetricCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.trend === "up" ? ArrowUpRight : kpi.trend === "down" ? ArrowDownRight : Minus;
  const data = kpi.spark.map((v, i) => ({ i, v }));
  const gradientId = `spark-${kpi.label.replace(/\W/g, "")}`;

  return (
    <article className="glass glass-hover relative overflow-hidden rounded-2xl p-4">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {kpi.label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight">{kpi.value}</span>
        <span className={cn("flex items-center gap-0.5 text-xs font-medium", toneText[kpi.tone])}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          {kpi.delta}
        </span>
      </div>
      <div className="mt-3 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={toneVar[kpi.tone]} stopOpacity={0.45} />
                <stop offset="100%" stopColor={toneVar[kpi.tone]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={toneVar[kpi.tone]}
              strokeWidth={1.75}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
