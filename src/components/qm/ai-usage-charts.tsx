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
import { AI_ACTIVITY_MIX, AI_MODELS, AI_SPEND_TREND, AI_TOKEN_TREND } from "@/lib/qm-ai-usage";

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

const SERIES = [
  { key: "claude", label: "Claude", color: "var(--chart-1)" },
  { key: "codex", label: "Codex", color: "var(--chart-2)" },
  { key: "inhouse", label: "In-house", color: "var(--chart-3)" },
  { key: "gemini", label: "Gemini", color: "var(--chart-4)" },
] as const;

export function AiSpendChart() {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={AI_SPEND_TREND} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
          <XAxis dataKey="sprint" {...axis} />
          <YAxis {...axis} unit="$" />
          <Tooltip {...tooltipStyle} formatter={(v: number) => `$${v}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="spend"
              fill={s.color}
              isAnimationActive={false}
              radius={s.key === "gemini" ? [6, 6, 0, 0] : undefined}
            />
          ))}
          <Line
            type="monotone"
            dataKey="budget"
            name="Sprint cap"
            stroke="var(--critical)"
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AiTokenChart() {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={AI_TOKEN_TREND} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="tokIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="tokOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
          <XAxis dataKey="sprint" {...axis} />
          <YAxis {...axis} unit="M" />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="input"
            name="Input tokens (M)"
            stroke="var(--chart-1)"
            fill="url(#tokIn)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="output"
            name="Output tokens (M)"
            stroke="var(--chart-3)"
            fill="url(#tokOut)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cachedPct"
            name="Cached input %"
            stroke="var(--good)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const MIX_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export function AiActivityDonut() {
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={AI_ACTIVITY_MIX}
            dataKey="tokens"
            nameKey="activity"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={2}
            isAnimationActive={false}
          >
            {AI_ACTIVITY_MIX.map((entry, i) => (
              <Cell key={entry.activity} fill={MIX_COLORS[i % MIX_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v: number) => `${v}M tokens`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AiModelEfficiencyChart() {
  const data = AI_MODELS.map((m) => ({
    name: m.name,
    accept: m.acceptRate,
    costPerMTok: Number((m.costUsd / ((m.tokensIn + m.tokensOut) / 1_000_000)).toFixed(2)),
  }));
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
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
