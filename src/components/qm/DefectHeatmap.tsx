import { HEATMAP } from "@/lib/qm-data";

function tone(count: number) {
  if (count === 0) return { bg: "color-mix(in oklab, var(--good) 18%, transparent)", label: "None" };
  if (count <= 5)
    return { bg: "color-mix(in oklab, var(--good) 42%, transparent)", label: "Low" };
  if (count <= 12)
    return { bg: "color-mix(in oklab, var(--warning) 48%, transparent)", label: "Medium" };
  return { bg: "color-mix(in oklab, var(--critical) 58%, transparent)", label: "High" };
}

export function DefectHeatmap() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {HEATMAP.map((cell) => {
          const t = tone(cell.defects);
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
          <i className="h-2.5 w-2.5 rounded-full bg-good" /> Low (1–5)
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-full bg-warning" /> Medium (6–12)
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2.5 w-2.5 rounded-full bg-critical" /> High (13+)
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Each cell is a feature/module. The number is its currently open defect count; the shade is
        that count banded against the thresholds above, so hot cells flag where defects concentrate
        and regression effort should be aimed.
      </p>
    </div>
  );
}
