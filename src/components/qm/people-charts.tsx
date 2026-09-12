import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyChartState } from "@/components/qm/charts";
import type { FeatureFixAllocationRow } from "@/lib/queries/analytics";

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
} as const;

/** Real per-assignee feature/fix/maintenance split, from analytics.service.ts's getFeatureFixAllocation — stacked as a % of each assignee's own resolved work, not a shared 100 total. */
export function AllocationChart({
  assignees,
  emptyMessage = "No resolved work items with a real assignee yet for this scope.",
}: {
  assignees?: FeatureFixAllocationRow[];
  emptyMessage?: string;
}) {
  if (!assignees?.length) {
    return <EmptyChartState message={emptyMessage} />;
  }

  // Already sorted by total desc from the API — capped here purely for
  // chart readability, not because anyone past the top 10 lacks real data.
  const data = assignees.slice(0, 10).map((a) => ({
    name: a.displayName,
    Feature: a.total > 0 ? Math.round((a.feature / a.total) * 1000) / 10 : 0,
    Fix: a.total > 0 ? Math.round((a.fix / a.total) * 1000) / 10 : 0,
    Maintenance: a.total > 0 ? Math.round((a.maintenance / a.total) * 1000) / 10 : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.35} />
        <XAxis dataKey="name" {...axis} />
        <YAxis {...axis} width={34} unit="%" />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Feature" stackId="a" fill="var(--good)" isAnimationActive={false} />
        <Bar dataKey="Fix" stackId="a" fill="var(--critical)" isAnimationActive={false} />
        <Bar
          dataKey="Maintenance"
          stackId="a"
          fill="var(--warning)"
          radius={[6, 6, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface ConsistencyPoint {
  period: string;
  velocity: number;
  /** Null when no bugs were tracked in that sprint — "never measured," not "zero leakage" (see calculateDefectLeakage's own hasData caveat). */
  leakageRate: number | null;
}

/**
 * Real output-vs-quality comparison: velocity (items resolved per sprint,
 * from calculateVelocityTrend) plotted against defect leakage rate (% of
 * that sprint's bugs that were critical/high priority, from
 * calculateDefectLeakageTrend) — two real, independently-computed series,
 * not a single composite "quality score." Deliberately doesn't editorialize
 * about what counts as a concerning dip; a manager reading this chart draws
 * that conclusion themselves from the two real lines.
 */
export function ConsistencyChart({
  data,
  emptyMessage = "Not enough sprint history yet to compare output against defect leakage for this scope.",
}: {
  data?: ConsistencyPoint[];
  emptyMessage?: string;
}) {
  if (!data?.length) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.35} />
        <XAxis dataKey="period" {...axis} />
        <YAxis yAxisId="left" {...axis} width={34} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} {...axis} width={34} unit="%" />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar
          yAxisId="left"
          dataKey="velocity"
          name="Items resolved (velocity)"
          fill="color-mix(in oklab, var(--primary) 55%, transparent)"
          radius={[6, 6, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="leakageRate"
          name="Defect leakage rate"
          stroke="var(--critical)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
