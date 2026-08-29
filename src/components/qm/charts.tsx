import {
  Area,
  AreaChart,
  ComposedChart,
  Bar,
  BarChart,
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
import { EXECUTION_TREND, MTTR_TREND, RADAR_DATA, VELOCITY_TREND } from "@/lib/qm-data";

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

const DEFAULT_EXECUTION_TREND = EXECUTION_TREND.map((d) => ({
  period: d.sprint,
  passRate: (d.passed / (d.passed + d.failed + d.blocked)) * 100,
}));

export interface ExecutionTrendPoint {
  period: string;
  passRate: number;
}

/**
 * Pass-rate line over time — matches calculateTestExecutionMetrics().
 * executionTrend from the API (no per-period pass/fail/blocked breakdown
 * exists server-side, only aggregate totals + a daily pass rate).
 */
export function ExecutionTrendChart({ data = DEFAULT_EXECUTION_TREND }: { data?: ExecutionTrendPoint[] }) {
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

const DEFAULT_MTTR_TREND = MTTR_TREND.map((d) => ({ period: d.sprint, mttr: d.mttr }));

export interface MttrTrendPoint {
  period: string;
  mttr: number;
}

/**
 * MTTR only — matches calculateMTTR().trend. The mock's "first-time fix %"
 * line has no backend source and is dropped rather than faked.
 */
export function MttrChart({ data = DEFAULT_MTTR_TREND }: { data?: MttrTrendPoint[] }) {
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

const DEFAULT_VELOCITY_TREND = VELOCITY_TREND.map((d) => ({
  period: d.sprint,
  velocity: d.velocity,
  created: d.created,
  resolved: d.resolved,
}));

export interface VelocityTrendPoint {
  period: string;
  velocity: number;
  created: number;
  resolved: number;
}

export function VelocityChart({ data = DEFAULT_VELOCITY_TREND }: { data?: VelocityTrendPoint[] }) {
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
// real-data stand-in used on the PM/Executive dashboard).
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
