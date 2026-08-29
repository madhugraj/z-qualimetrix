import { DELIVERABLES } from "@/lib/qm-data";

const typeStyle: Record<string, string> = {
  DEMO: "bg-ops/20 text-ops",
  DOC: "bg-primary/20 text-primary",
  RCA: "bg-warning/20 text-warning",
  TEST: "bg-accent/60 text-foreground",
};

export interface DeliverableItem {
  id: string;
  type: string;
  title: string;
  author: string;
  meta: string;
  when: string;
}

const DEFAULT_DELIVERABLES: DeliverableItem[] = DELIVERABLES;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export function deliverableRecordToItem(record: {
  id: string;
  type: string;
  title: string;
  description: string | null;
  rating: number | null;
  createdAt: string;
  creator: { name: string | null };
}): DeliverableItem {
  const meta = record.rating != null ? `Rating ${record.rating.toFixed(1)} / 5` : record.description ?? "";
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    author: record.creator.name ?? "Unknown",
    meta,
    when: timeAgo(record.createdAt),
  };
}

export function DeliverablesFeed({ data = DEFAULT_DELIVERABLES }: { data?: DeliverableItem[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No deliverables logged yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li
          key={d.id}
          className="flex items-start gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5 transition-colors hover:bg-accent/30"
        >
          <span
            className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${typeStyle[d.type] ?? "bg-accent/60 text-foreground"}`}
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
