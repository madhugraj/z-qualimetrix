export interface ProductHealth {
  productId: string;
  productName: string;
  healthScore: number;
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

  const sorted = [...products].sort((a, b) => b.healthScore - a.healthScore);

  return (
    <ul className="space-y-2">
      {sorted.map((p) => (
        <li
          key={p.productId}
          className="flex items-center justify-between gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
        >
          <span className="truncate text-sm font-medium">{p.productName}</span>
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
        </li>
      ))}
    </ul>
  );
}
