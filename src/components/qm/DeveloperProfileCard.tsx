import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { BAND_LABEL, healthBand, type Developer } from "@/lib/qm-people";
import { cn } from "@/lib/utils";

const bandStyle = {
  healthy: "text-good border-good/40 bg-good/10",
  watch: "text-warning border-warning/40 bg-warning/10",
  "at-risk": "text-critical border-critical/40 bg-critical/10",
} as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-glass-border px-3 py-2">
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

export function DeveloperProfileCard({ dev }: { dev: Developer }) {
  const band = healthBand(dev.burnoutIndex);
  const spark = dev.sprintOutput.map((v, i) => ({ i, v }));

  return (
    <article className="glass glass-hover rounded-2xl p-4">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/50 text-xs font-semibold">
          {dev.avatarInitials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{dev.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {dev.role} · {dev.squad}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            bandStyle[band],
          )}
        >
          {BAND_LABEL[band]}
        </span>
      </header>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Workload strain</span>
          <span>{dev.burnoutIndex}/100</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-accent/40">
          <div
            className={cn(
              "h-full rounded-full",
              band === "at-risk" ? "bg-critical" : band === "watch" ? "bg-warning" : "bg-good",
            )}
            style={{ width: `${dev.burnoutIndex}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="After hours" value={`${dev.afterHoursPct}%`} />
        <Stat label="P0/P1 held" value={String(dev.p0p1Load)} />
        <Stat label="Fix share" value={`${dev.fixPct}%`} />
      </div>

      <div className="mt-3 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Area
              type="monotone"
              dataKey="v"
              stroke="var(--primary)"
              strokeWidth={1.75}
              fill="color-mix(in oklab, var(--primary) 18%, transparent)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 rounded-xl bg-accent/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Suggested support: </span>
        {dev.support}
      </p>
    </article>
  );
}
