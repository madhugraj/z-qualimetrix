import { GraduationCap, Users } from "lucide-react";
import { SILOS, TRAINING } from "@/lib/qm-people";

export function SiloAlerts() {
  return (
    <ul className="space-y-2">
      {SILOS.map((s) => (
        <li key={s.module} className="rounded-xl border border-glass-border p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-warning" strokeWidth={1.6} />
            <p className="text-xs font-medium">
              {s.share}% of {s.module} bugs are resolved by {s.owner}
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent/40">
            <div className="h-full rounded-full bg-warning" style={{ width: `${s.share}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{s.note}</p>
        </li>
      ))}
    </ul>
  );
}

export function TrainingList() {
  return (
    <ul className="space-y-2">
      {TRAINING.map((t) => (
        <li key={t.area} className="flex items-start gap-3 rounded-xl border border-glass-border p-3">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-ops" strokeWidth={1.6} />
          <div>
            <p className="text-xs font-medium">Recommended training: {t.area}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t.audience} · {t.signal}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
