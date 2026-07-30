import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DOMAIN_COLOR, DOMAIN_DISTRIBUTION, type BugDomain } from "@/lib/qm-bugs";

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--glass-border)",
    borderRadius: 12,
    color: "var(--popover-foreground)",
    fontSize: 12,
  },
} as const;

export function BugDomainDonut() {
  const total = DOMAIN_DISTRIBUTION.reduce((acc, d) => acc + d.count, 0);
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={DOMAIN_DISTRIBUTION}
            dataKey="count"
            nameKey="domain"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={3}
            isAnimationActive={false}
            stroke="var(--glass-border)"
          >
            {DOMAIN_DISTRIBUTION.map((entry) => (
              <Cell key={entry.domain} fill={DOMAIN_COLOR[entry.domain as BugDomain]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-muted-foreground">
        {total} classified defects · auto-tagged from title, description &amp; repo path
      </p>
    </div>
  );
}
