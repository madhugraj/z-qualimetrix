import { DataTable, BarCell } from "@/components/qm/DataTable";

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
  if (score >= 60) return "bg-primary";
  return "bg-critical";
}

/**
 * Single sortable-key approximation of the intended default grouping
 * (scored products first by score, then real-but-unscored backlogs, then
 * genuinely unsynced products last) — lets DataTable's generic sort-by-
 * column still produce the right default order, and still re-sort
 * sensibly if a viewer clicks the header to flip it.
 */
function sortableScore(p: ProductHealth): number {
  if (p.hasData) return p.healthScore;
  return p.totalWorkItems > 0 ? -0.5 : -1;
}

export function ProductHealthList({ products }: { products: ProductHealth[] }) {
  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground">No active products yet.</p>;
  }

  return (
    <DataTable
      rows={products}
      rowKey={(p) => p.productId}
      defaultSortKey="health"
      defaultSortDir="desc"
      columns={[
        {
          key: "product",
          label: "Product",
          sortValue: (p) => p.productName.toLowerCase(),
          render: (p) => <span className="font-medium">{p.productName}</span>,
        },
        {
          key: "health",
          label: "Health",
          align: "right",
          sortValue: sortableScore,
          render: (p) =>
            p.hasData ? (
              <BarCell value={p.healthScore} max={100} label={String(p.healthScore)} tone={scoreTone(p.healthScore)} />
            ) : p.totalWorkItems > 0 ? (
              <span className="text-[11px] text-muted-foreground">{p.totalWorkItems} synced · no defects/tests yet</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">Not synced yet</span>
            ),
        },
      ]}
    />
  );
}
