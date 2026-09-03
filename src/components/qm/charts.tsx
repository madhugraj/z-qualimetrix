import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
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

// Hairline gridlines rather than the recharts default full-strength border —
// present enough to read a value off, recessive enough not to compete with
// the data itself.
const gridProps = { strokeOpacity: 0.35 };

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
            <stop offset="0%" stopColor="var(--good)" stopOpacity={0.08} />
            <stop offset="100%" stopColor="var(--good)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" {...gridProps} />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={32} domain={[0, 100]} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="passRate"
          name="Pass rate %"
          stroke="var(--good)"
          strokeWidth={2}
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
        <CartesianGrid vertical={false} stroke="var(--border)" {...gridProps} />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={32} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="mttr"
          name="MTTR (hrs)"
          stroke="var(--primary)"
          strokeWidth={2}
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
  byType?: { bug: number; subtask: number; feature: number };
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
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.08} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" {...gridProps} />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={32} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="velocity"
          name="Velocity"
          stroke="var(--primary)"
          strokeWidth={2}
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

/**
 * Stacked completed-item count by category (bug fix / feature work /
 * sub-task) per period — flattens VelocityTrendPoint.byType into recharts'
 * dataKey shape. Answers "what kind of work actually shipped," which the
 * combined `velocity` number in VelocityChart collapses away.
 */
export function VelocityByTypeChart({
  data,
  emptyMessage = "Select a product to see its velocity breakdown.",
}: {
  data?: VelocityTrendPoint[];
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return <EmptyChartState message={emptyMessage} />;
  }

  const rows = data.map((point) => ({
    period: point.period,
    Bugs: point.byType?.bug ?? 0,
    Features: point.byType?.feature ?? 0,
    "Sub-tasks": point.byType?.subtask ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows}>
        <CartesianGrid vertical={false} stroke="var(--border)" {...gridProps} />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={32} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Bugs" stackId="type" fill="var(--critical)" isAnimationActive={false} />
        <Bar dataKey="Features" stackId="type" fill="var(--primary)" isAnimationActive={false} />
        <Bar dataKey="Sub-tasks" stackId="type" fill="var(--ops)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface AgeBucket {
  label: string;
  count: number;
}

/**
 * How stale the currently-open queue is — a point-in-time count (e.g.
 * "510 open") can't show whether that's mostly fresh work or a pile of
 * items nobody's touched in months. Bucketed by days since createdAt.
 */
export function AgeDistributionChart({
  data,
  emptyMessage = "Nothing open right now.",
}: {
  data?: AgeBucket[];
  emptyMessage?: string;
}) {
  if (!data || data.every((d) => d.count === 0)) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke="var(--border)" {...gridProps} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={32} allowDecimals={false} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} />
        <Bar dataKey="count" name="Open items" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface PriorityBreakdownRow {
  priority: string;
  count: number;
}

const PRIORITY_ORDER = ["critical", "high", "medium", "low", "unset"];
const PRIORITY_COLOR: Record<string, string> = {
  critical: "var(--critical)",
  high: "var(--warning)",
  medium: "var(--primary)",
  low: "var(--good)",
  unset: "var(--muted-foreground)",
};

/** byPriority record (from getBacklogSummary) flattened into a fixed, ordered row set for a horizontal bar. */
export function PriorityBreakdownChart({
  byPriority,
  emptyMessage = "Nothing open right now.",
}: {
  byPriority?: Record<string, number>;
  emptyMessage?: string;
}) {
  const rows = PRIORITY_ORDER
    .filter((p) => (byPriority?.[p] ?? 0) > 0)
    .map((p) => ({ priority: p, count: byPriority![p] }));

  if (rows.length === 0) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" {...gridProps} />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="priority" {...axis} width={64} tickFormatter={(v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} />
        <Bar dataKey="count" name="Open items" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.priority} fill={PRIORITY_COLOR[r.priority] ?? "var(--primary)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const HEALTH_ORDER = ["on_track", "at_risk", "blocked"] as const;
const HEALTH_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};
const HEALTH_COLOR: Record<string, string> = {
  on_track: "var(--good)",
  at_risk: "var(--warning)",
  blocked: "var(--critical)",
};

/** Epic count by health signal (blocked > at_risk > on_track, see analytics.service.ts's getEpicRollups). */
export function EpicHealthChart({
  byHealth,
  emptyMessage = "No epics synced yet for this scope.",
}: {
  byHealth?: Record<string, number>;
  emptyMessage?: string;
}) {
  const rows = HEALTH_ORDER
    .filter((h) => (byHealth?.[h] ?? 0) > 0)
    .map((h) => ({ health: h, count: byHealth![h] }));

  if (rows.length === 0) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" {...gridProps} />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="health" {...axis} width={72} tickFormatter={(v) => HEALTH_LABEL[v] ?? v} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} labelFormatter={(v) => HEALTH_LABEL[v as string] ?? String(v)} />
        <Bar dataKey="count" name="Epics" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.health} fill={HEALTH_COLOR[r.health] ?? "var(--primary)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface EpicProgressBucket {
  label: string;
  count: number;
}

/** Epic count by % complete bucket — same bucketed-bar shape as AgeDistributionChart. */
export function EpicProgressDistributionChart({
  data,
  emptyMessage = "No epics synced yet for this scope.",
}: {
  data?: EpicProgressBucket[];
  emptyMessage?: string;
}) {
  if (!data || data.every((d) => d.count === 0)) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke="var(--border)" {...gridProps} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={32} allowDecimals={false} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} />
        <Bar dataKey="count" name="Epics" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface BacklogFlowPoint {
  period: string;
  created: number;
  completed: number;
  netChange: number;
}

/**
 * Items created vs. completed per period, all types — the backlog analogue
 * of VelocityChart's created/resolved bug overlay. `netChange` (created
 * minus completed) is what actually answers "is the backlog growing or
 * shrinking," which a single point-in-time total count can't.
 */
export function BacklogFlowChart({
  data,
  emptyMessage = "No backlog activity recorded yet for this scope.",
}: {
  data?: BacklogFlowPoint[];
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} stroke="var(--border)" {...gridProps} />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={32} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="created" name="Created" fill="var(--critical)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="completed" name="Completed" fill="var(--good)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="netChange"
          name="Net change"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface SpendTrendPoint {
  period: string;
  costUsd: number;
}

/** Weekly GPU-compute spend — same no-mock-fallback posture as ExecutionTrendChart. */
export function SpendTrendChart({
  data,
  emptyMessage = "No GPU-compute spend recorded yet.",
}: {
  data?: SpendTrendPoint[];
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return <EmptyChartState message={emptyMessage} />;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ops)" stopOpacity={0.08} />
            <stop offset="100%" stopColor="var(--ops)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" {...gridProps} />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={48} tickFormatter={(v) => `$${v}`} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} formatter={(v: number) => `$${v.toFixed(2)}`} />
        <Area type="monotone" dataKey="costUsd" name="Spend" stroke="var(--ops)" strokeWidth={2} fill="url(#spendFill)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface SpendBreakdownRow {
  label: string;
  costUsd: number;
}

/** Horizontal spend breakdown (by squad, by GPU type, ...) — generic label/$ bar. */
export function SpendBreakdownChart({
  data,
  emptyMessage = "No GPU-compute spend recorded yet.",
}: {
  data?: SpendBreakdownRow[];
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return <EmptyChartState message={emptyMessage} />;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" {...gridProps} />
        <XAxis type="number" {...axis} tickFormatter={(v) => `$${v}`} />
        <YAxis type="category" dataKey="label" {...axis} width={110} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} formatter={(v: number) => `$${v.toFixed(2)}`} />
        <Bar dataKey="costUsd" name="Spend" fill="var(--ops)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
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
