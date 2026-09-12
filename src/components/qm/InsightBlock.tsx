import type { ReactNode } from "react";

export interface Insight {
  text: string;
  action: string;
}

// Pairs a plain-language read of a panel's numbers with a concrete next
// step ("Do this") — raw counts alone don't tell a reader what to do about
// them. This is the primary, lead content of a panel (not a caption below
// a chart) — shared across Epics, Compliance, and Reports.
export function InsightBlock({ insight }: { insight: Insight }) {
  return (
    <div className="mt-3 space-y-1 border-t border-glass-border/60 pt-2.5">
      <p className="text-sm text-foreground">{insight.text}</p>
      <p className="text-sm text-primary">
        <span className="font-medium">Do this — </span>
        {insight.action}
      </p>
    </div>
  );
}

// Collapses supporting chart/graphic evidence behind a closed-by-default
// toggle, so the InsightBlock above it is what a reader sees first — reuses
// the exact <details>/<summary> convention already shipped in
// dashboard.tsx's "Set hourly rates" section, rather than a new pattern.
export function ChartDisclosure({
  label = "Show chart",
  children,
  onToggle,
}: {
  label?: string;
  children: ReactNode;
  /** Fires with the new open state — lets a caller lazily fire a query only
   * once a reader actually opens the disclosure (e.g. Epic detail's
   * "Show suggested pages"), instead of on every page load. */
  onToggle?: (open: boolean) => void;
}) {
  return (
    <details className="mt-3" onToggle={onToggle ? (e) => onToggle(e.currentTarget.open) : undefined}>
      <summary className="cursor-pointer text-[11px] font-medium text-primary">{label}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
