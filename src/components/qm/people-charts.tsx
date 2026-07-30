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
import { ALLOCATION, CONSISTENCY_TREND } from "@/lib/qm-people";

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

export function AllocationChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={ALLOCATION}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
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

export function ConsistencyChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={CONSISTENCY_TREND}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="sprint" {...axis} />
        <YAxis yAxisId="left" {...axis} width={34} />
        <YAxis yAxisId="right" orientation="right" domain={[60, 100]} {...axis} width={34} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar
          yAxisId="left"
          dataKey="output"
          name="Team output (pts)"
          fill="color-mix(in oklab, var(--primary) 55%, transparent)"
          radius={[6, 6, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="quality"
          name="Quality score"
          stroke="var(--ops)"
          strokeWidth={2.2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
