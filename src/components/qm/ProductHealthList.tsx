export interface ProductHealth {
  productId: string;
  productName: string;
  healthScore: number;
  hasData: boolean;
  /** Real synced work items (stories/tasks/bugs) regardless of type — lets
   * "no bugs/tests reported yet" (real backlog, no quality signal) read
   * differently from "nothing synced for this product at all." */
  totalWorkItems: number;
}

function scoreTone(score: number): string {
  if (score >= 80) return "text-good";
  if (score >= 60) return "text-warning";
  return "text-critical";
}

/**
 * Ranked-list stand-in for the per-product portfolio panel until
 * PortfolioRadar supports a generic N-product shape (it currently hardcodes
 * 3 literal product names as Radar dataKeys).
 */
export function ProductHealthList({ products }: { products: ProductHealth[] }) {
  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground">No active products yet.</p>;
  }

  // Scored products first (highest health first), then products with real
  // backlog but no quality signal, then genuinely unsynced products last.
  const sorted = [...products].sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    if (!a.hasData && a.totalWorkItems > 0 !== b.totalWorkItems > 0) {
      return a.totalWorkItems > 0 ? -1 : 1;
    }
    return b.healthScore - a.healthScore;
  });

  return (
    <ul className="space-y-2">
      {sorted.map((p) => (
        <li
          key={p.productId}
          className="flex items-center justify-between gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
        >
          <span className="truncate text-sm font-medium">{p.productName}</span>
          {p.hasData ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, p.healthScore))}%` }}
                />
              </span>
              <span className={`w-10 text-right text-xs font-semibold ${scoreTone(p.healthScore)}`}>
                {p.healthScore}
              </span>
            </div>
          ) : p.totalWorkItems > 0 ? (
            <span className="text-xs text-muted-foreground">
              {p.totalWorkItems} items synced · no defects/tests logged yet
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Not synced yet</span>
          )}
        </li>
      ))}
    </ul>
  );
}
