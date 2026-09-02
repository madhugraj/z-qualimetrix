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

// Real Jira labels are an arbitrary, unbounded string set (unlike the 4
// fixed demo domains) — cycle through the app's existing semantic tones by
// rank instead of a per-label color map, and collapse the long tail.
const REAL_PALETTE = ["var(--primary)", "var(--ops)", "var(--critical)", "var(--warning)", "var(--good)"];
const OTHER_COLOR = "var(--muted-foreground)";
const MAX_SLICES = 5;

interface BugDomainDonutProps {
  distribution?: Array<{ label: string; count: number }>;
  hasData?: boolean;
}

export function BugDomainDonut({ distribution, hasData }: BugDomainDonutProps = {}) {
  if (hasData && distribution && distribution.length > 0) {
    const sorted = [...distribution].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES);
    const otherCount = rest.reduce((acc, d) => acc + d.count, 0);
    const slices = otherCount > 0 ? [...top, { label: "Other", count: otherCount }] : top;
    const total = slices.reduce((acc, d) => acc + d.count, 0);

    return (
      <div>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="label"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={3}
              isAnimationActive={false}
              stroke="var(--glass-border)"
            >
              {slices.map((entry, i) => (
                <Cell key={entry.label} fill={entry.label === "Other" ? OTHER_COLOR : REAL_PALETTE[i % REAL_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
        <p className="text-center text-xs text-muted-foreground">
          {total} classified defects · grouped by Jira label
        </p>
      </div>
    );
  }

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
