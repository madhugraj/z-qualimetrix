import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Drop into a GlassPanel's `action` slot for a panel that still renders
 * illustrative sample data rather than anything computed from synced Jira/
 * Azure DevOps/test-tool activity — so it's never visually indistinguishable
 * from a live panel sitting next to it.
 */
export function DemoDataBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-warning">
      <FlaskConical className="h-3 w-3" strokeWidth={2} />
      DEMO DATA
    </span>
  );
}

/**
 * Page-level equivalent for a route that's entirely sample data end to end.
 */
export function DemoDataBanner({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
      <FlaskConical className="h-4 w-4 shrink-0" strokeWidth={1.8} />
      {children ??
        "This page shows illustrative sample data — it isn't wired to your synced Jira/Azure DevOps activity yet."}
    </p>
  );
}
