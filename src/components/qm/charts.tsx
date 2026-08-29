import {
  Area,
  AreaChart,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RADAR_DATA } from "@/lib/qm-data";

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
    backdropFilter: "blur(20px)",
  },
  labelStyle: { color: "var(--muted-foreground)" },
} as const;

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export interface ExecutionTrendPoint {
  period: string;
  passRate: number;
}

/**
 * Pass-rate line over time — matches calculateTestExecutionMetrics().
 * executionTrend from the API (no per-period pass/fail/blocked breakdown
 * exists server-side, only aggregate totals + a daily pass rate). No mock
 * fallback: showing an empty state when there's genuinely no data is more
 * honest than silently rendering an old illustrative trend as if it were live.
 */
export function ExecutionTrendChart({ data }: { data?: ExecutionTrendPoint[] }) {
  if (!data || data.length === 0) {
    return <EmptyChartState message="No test execution data yet for this scope." />;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="passRateFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--good)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--good)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={32} domain={[0, 100]} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="passRate"
          name="Pass rate %"
          stroke="var(--good)"
          strokeWidth={2.2}
          fill="url(#passRateFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface MttrTrendPoint {
  period: string;
  mttr: number;
}

/**
 * MTTR only — matches calculateMTTR().trend. The mock's "first-time fix %"
 * line has no backend source and is dropped rather than faked. No mock
 * fallback — see ExecutionTrendChart.
 */
export function MttrChart({ data }: { data?: MttrTrendPoint[] }) {
  if (!data || data.length === 0) {
    return <EmptyChartState message="No resolved bugs yet for this scope." />;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={32} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="mttr"
          name="MTTR (hrs)"
          stroke="var(--primary)"
          strokeWidth={2.2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface VelocityTrendPoint {
  period: string;
  velocity: number;
  created: number;
  resolved: number;
}

/**
 * No mock fallback — see ExecutionTrendChart. `emptyMessage` is caller-
 * supplied rather than hardcoded: an empty result means either "no product
 * selected" or "this product has no sprints synced" — those are different
 * facts and the wrong one read as an instruction to do something already done.
 */
export function VelocityChart({
  data,
  emptyMessage = "Select a product to see its velocity trend.",
}: {
  data?: VelocityTrendPoint[];
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <defs>
          <linearGradient id="velFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={32} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="velocity"
          name="Velocity"
          stroke="var(--primary)"
          strokeWidth={2.2}
          fill="url(#velFill)"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="created"
          name="Bugs created"
          stroke="var(--critical)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="resolved"
          name="Bugs resolved"
          stroke="var(--good)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// PortfolioRadar stays mock-only for now — it hardcodes 3 literal product
// names as JSX Radar dataKeys and needs a generic N-product redesign before
// it can plot real per-product data (see ProductHealthList for the interim
// real-data stand-in used on the PM/Executive dashboard). Always render it
// with a DemoDataBadge at the call site — this component has no live mode.
export function PortfolioRadar() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={RADAR_DATA} outerRadius="72%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Radar
          name="Atlas Core"
          dataKey="Atlas Core"
          stroke="var(--primary)"
          fill="var(--primary)"
          fillOpacity={0.22}
        />
        <Radar
          name="Nimbus Billing"
          dataKey="Nimbus Billing"
          stroke="var(--ops)"
          fill="var(--ops)"
          fillOpacity={0.18}
        />
        <Radar
          name="Orbit Mobile"
          dataKey="Orbit Mobile"
          stroke="var(--warning)"
          fill="var(--warning)"
          fillOpacity={0.15}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
