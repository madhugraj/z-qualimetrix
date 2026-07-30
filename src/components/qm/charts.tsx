import {
  Area,
  AreaChart,
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

export function ExecutionTrendChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={EXECUTION_TREND}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="sprint" {...axis} />
        <YAxis {...axis} width={32} />
        <Tooltip cursor={{ fill: "var(--accent)" }} {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="passed" stackId="a" fill="var(--good)" isAnimationActive={false} />
        <Bar dataKey="failed" stackId="a" fill="var(--critical)" isAnimationActive={false} />
        <Bar
          dataKey="blocked"
          stackId="a"
          fill="var(--warning)"
          radius={[6, 6, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MttrChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={MTTR_TREND}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="sprint" {...axis} />
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
        <Line
          type="monotone"
          dataKey="fix"
          name="First-time fix %"
          stroke="var(--ops)"
          strokeWidth={2.2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function VelocityChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={VELOCITY_TREND}>
        <defs>
          <linearGradient id="velFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="sprint" {...axis} />
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
        />
        <Line
          type="monotone"
          dataKey="created"
          name="Bugs created"
          stroke="var(--critical)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="resolved"
          name="Bugs resolved"
          stroke="var(--good)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

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
