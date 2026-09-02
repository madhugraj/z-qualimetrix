import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--glass-border)",
    borderRadius: 12,
    color: "var(--popover-foreground)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--muted-foreground)" },
};

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function EmptyChartState({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>;
}

export interface AiModelSeries {
  id: string;
  name: string;
}

/**
 * Per-sprint spend, stacked by whichever real models actually have usage —
 * unlike the old fixed claude/codex/inhouse/gemini keys, real model IDs are
 * arbitrary catalog UUIDs, so the series list is driven by `models` (real
 * usage only, from AiUsageAnalytics.models) rather than hardcoded.
 */
export function AiSpendChart({
  data,
  models,
}: {
  data?: Array<Record<string, string | number>>;
  models?: AiModelSeries[];
}) {
  if (!data || data.length === 0 || !models || models.length === 0) {
    return <EmptyChartState message="No AI usage events recorded yet for this scope." />;
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="sprint" {...axis} />
          <YAxis {...axis} unit="$" />
          <Tooltip {...tooltipStyle} formatter={(v: number) => `$${v}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {models.map((m, i) => (
            <Bar
              key={m.id}
              dataKey={m.id}
              name={m.name}
              stackId="spend"
              fill={PALETTE[i % PALETTE.length]}
              isAnimationActive={false}
              radius={i === models.length - 1 ? [6, 6, 0, 0] : undefined}
            />
          ))}
          <Line
            type="monotone"
            dataKey="budget"
            name="Sprint cap"
            stroke="var(--critical)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TokenTrendPoint {
  sprint: string;
  input: number;
  output: number;
  cachedPct: number;
}

export function AiTokenChart({ data }: { data?: TokenTrendPoint[] }) {
  if (!data || data.every((d) => d.input === 0 && d.output === 0)) {
    return <EmptyChartState message="No AI usage events recorded yet for this scope." />;
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="tokIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="tokOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="sprint" {...axis} />
          <YAxis {...axis} unit="M" />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="input"
            name="Input tokens (M)"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#tokIn)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="output"
            name="Output tokens (M)"
            stroke="var(--chart-3)"
            strokeWidth={2}
            fill="url(#tokOut)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cachedPct"
            name="Cached input %"
            stroke="var(--good)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface ActivityMixPoint {
  activity: string;
  tokens: number;
}

export function AiActivityDonut({ data }: { data?: ActivityMixPoint[] }) {
  const withUsage = (data ?? []).filter((d) => d.tokens > 0);
  if (withUsage.length === 0) {
    return <EmptyChartState message="No AI usage events recorded yet for this scope." />;
  }

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={withUsage}
            dataKey="tokens"
            nameKey="activity"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={2}
            isAnimationActive={false}
          >
            {withUsage.map((entry, i) => (
              <Cell key={entry.activity} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v: number) => `${v}M tokens`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface ModelEfficiencyInput {
  name: string;
  acceptRate: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

export function AiModelEfficiencyChart({ models }: { models?: ModelEfficiencyInput[] }) {
  if (!models || models.length === 0) {
    return <EmptyChartState message="No AI usage events recorded yet for this scope." />;
  }

  const data = models.map((m) => {
    const totalMTok = (m.tokensIn + m.tokensOut) / 1_000_000;
    return {
      name: m.name,
      accept: m.acceptRate,
      costPerMTok: totalMTok > 0 ? Number((m.costUsd / totalMTok).toFixed(2)) : 0,
    };
  });

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="name" {...axis} interval={0} height={42} />
          <YAxis {...axis} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="accept"
            name="Accept rate %"
            fill="var(--chart-1)"
            radius={[6, 6, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="costPerMTok"
            name="$ / M tokens"
            fill="var(--chart-4)"
            radius={[6, 6, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
