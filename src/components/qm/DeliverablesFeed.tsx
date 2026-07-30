import { DELIVERABLES, type DeliverableType } from "@/lib/qm-data";

const typeStyle: Record<DeliverableType, string> = {
  DEMO: "bg-ops/20 text-ops",
  DOC: "bg-primary/20 text-primary",
  RCA: "bg-warning/20 text-warning",
  TEST: "bg-accent/60 text-foreground",
};

export function DeliverablesFeed() {
  return (
    <ul className="space-y-2">
      {DELIVERABLES.map((d) => (
        <li
          key={d.id}
          className="flex items-start gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5 transition-colors hover:bg-accent/30"
        >
          <span
            className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${typeStyle[d.type]}`}
          >
            {d.type}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{d.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {d.author} · {d.meta}
            </p>
          </div>
          <span className="text-[11px] whitespace-nowrap text-muted-foreground">{d.when}</span>
        </li>
      ))}
    </ul>
  );
}
