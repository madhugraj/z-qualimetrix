import { BOTTLENECKS, RTM, type Tone } from "@/lib/qm-data";

const statusStyle: Record<string, string> = {
  Ready: "bg-good/20 text-good",
  "At risk": "bg-warning/20 text-warning",
  Blocked: "bg-critical/20 text-critical",
};

export function RtmTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="pb-2 font-medium">Story</th>
            <th className="pb-2 font-medium">Requirement</th>
            <th className="pb-2 font-medium">Coverage</th>
            <th className="pb-2 font-medium">Bugs</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {RTM.map((row) => {
            const pct = Math.round((row.passed / row.cases) * 100);
            return (
              <tr
                key={row.story}
                className="border-t border-glass-border/60 transition-colors hover:bg-accent/30"
              >
                <td className="py-2.5 pr-3 font-mono text-xs text-primary">{row.story}</td>
                <td className="py-2.5 pr-3">{row.title}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.passed}/{row.cases}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-xs">{row.bugs}</td>
                <td className="py-2.5">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${statusStyle[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const dot: Record<Tone, string> = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  ops: "bg-ops",
  neutral: "bg-muted-foreground",
};

export function BottleneckList() {
  return (
    <ul className="space-y-2">
      {BOTTLENECKS.map((b) => (
        <li
          key={b.item}
          className="flex items-center gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot[b.severity]}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              <span className="font-mono text-xs text-primary">{b.item}</span> — {b.title}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{b.waiting}</span>
        </li>
      ))}
    </ul>
  );
}
