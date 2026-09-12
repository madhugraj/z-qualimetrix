import { cn } from "@/lib/utils";
import type { EpicHealth } from "@/lib/queries/analytics";

export const HEALTH_LABEL: Record<EpicHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};

const HEALTH_BADGE: Record<EpicHealth, string> = {
  on_track: "bg-good/20 text-good",
  at_risk: "bg-warning/20 text-warning",
  blocked: "bg-critical/20 text-critical",
};

export function HealthBadge({ health }: { health: EpicHealth }) {
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", HEALTH_BADGE[health])}>
      {HEALTH_LABEL[health]}
    </span>
  );
}
