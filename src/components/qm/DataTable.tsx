import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * One shared, sortable table used everywhere this app shows "ranked rows of
 * real data" — product health, cycle-time-by-stage, assignee workload, team
 * utilization, project portfolio. Before this, each panel built its own
 * ad-hoc <ul>/<table> with a slightly different row height, bar style and
 * border treatment, so panels showing the same *kind* of data (a ranked list
 * with a value bar) looked unrelated to each other. One component, one look.
 */
export interface DataTableColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Omit to make the column display-only (e.g. a rendered bar with no single sortable scalar). */
  sortValue?: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
  /** Widens/narrows the column; Tailwind width class, e.g. "w-32". */
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  defaultSortKey,
  defaultSortDir = "desc",
  onRowClick,
  dense = false,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  onRowClick?: (row: T) => void;
  dense?: boolean;
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-glass-border/50 text-[10px] text-muted-foreground uppercase">
            {columns.map((col) => (
              <th key={col.key} className={cn("py-2 pr-3 font-medium", col.align === "right" && "text-right", col.className)}>
                {col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-foreground",
                      col.align === "right" && "flex-row-reverse",
                      sortKey === col.key && "text-foreground"
                    )}
                  >
                    {col.label}
                    {sortKey === col.key && <span className="text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("hover:bg-accent/10", onRowClick && "cursor-pointer")}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(dense ? "py-1.5 pr-3" : "py-2.5 pr-3", col.align === "right" && "text-right", col.className)}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The recurring "thin bar + right-aligned label" cell used by every ranked
 * metric table (health score, utilization %, cycle-time days) — one place
 * to keep bar height/track color/label width consistent instead of each
 * panel re-implementing it slightly differently.
 */
export function BarCell({
  value,
  max,
  label,
  tone = "bg-primary",
  labelClassName,
}: {
  value: number;
  max: number;
  label: string;
  tone?: string;
  labelClassName?: string;
}) {
  const width = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-border">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${width}%` }} />
      </span>
      <span className={cn("w-20 shrink-0 text-right text-[11px] text-muted-foreground", labelClassName)}>{label}</span>
    </div>
  );
}
