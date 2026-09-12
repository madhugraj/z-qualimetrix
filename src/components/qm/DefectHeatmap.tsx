import { HEATMAP } from "@/lib/qm-data";

// Same cap-and-bucket shape as BugDomainDonut — a PM scanning this needs the
// handful of labels actually carrying defect volume, not every distinct
// label string in the tracker (noise labels like severity-*/sprint-* are
// already filtered out server-side before this ever sees the data).
const MAX_CELLS = 8;

/**
 * Bands are relative to the MAX count actually shown, not fixed absolute
 * thresholds — this panel already shows a pre-filtered top-8-by-volume list
 * (see MAX_CELLS below), so a fixed "13+ = High" band made every real cell
 * paint the identical color once every shown label cleared that bar. Relative
 * banding guarantees the shown set always has visible spread, whatever the
 * absolute scale happens to be for this tenant/scope.
 */
function tone(count: number, maxCount: number) {
  if (count === 0) return { bg: "color-mix(in oklab, var(--good) 18%, transparent)", label: "Lowest" };
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio >= 0.66) return { bg: "color-mix(in oklab, var(--critical) 58%, transparent)", label: "Highest" };
  if (ratio >= 0.33) return { bg: "color-mix(in oklab, var(--warning) 48%, transparent)", label: "Moderate" };
  return { bg: "color-mix(in oklab, var(--good) 42%, transparent)", label: "Lower" };
}

interface DefectHeatmapProps {
  distribution?: Array<{ label: string; count: number }>;
  hasData?: boolean;
}

export function DefectHeatmap({ distribution, hasData }: DefectHeatmapProps = {}) {
  // Real data: this org's Jira projects don't use Components, only labels
  // (e.g. UI-BUG, FUNC-BUG) — so real cells are labels, not modules. Fall
  // back to the demo module list when nothing's synced yet.
  let cells = HEATMAP;
  if (hasData && distribution) {
    const sorted = [...distribution].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, MAX_CELLS);
    const rest = sorted.slice(MAX_CELLS);
    const otherCount = rest.reduce((sum, d) => sum + d.count, 0);
    const withOther = otherCount > 0 ? [...top, { label: "Other", count: otherCount }] : top;
    cells = withOther.map((d) => ({ module: d.label, defects: d.count }));
  }
  const axisLabel = hasData && distribution ? "label" : "feature/module";
  const maxCount = Math.max(...cells.map((c) => c.defects), 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {cells.map((cell) => {
          const t = tone(cell.defects, maxCount);
          return (
            <div
              key={cell.module}
              title={`${cell.module}: ${cell.defects} open defects (${t.label})`}
              className="rounded-xl border border-glass-border p-3 transition-transform hover:scale-[1.03]"
              style={{ background: t.bg }}
            >
              <p className="truncate text-[11px] text-foreground/80">{cell.module}</p>
              <p className="mt-1 text-lg leading-none font-semibold">{cell.defects}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-full bg-good" /> Lower
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-full bg-warning" /> Moderate
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-full bg-critical" /> Highest
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Each cell is a {axisLabel}. The number is its currently open defect count; the shade is
        relative to the busiest cell shown here (not a fixed count), so this always highlights where
        defects concentrate within this view, whatever the actual volume happens to be.
      </p>
    </div>
  );
}
