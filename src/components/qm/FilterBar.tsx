import { useCurrentProduct } from "@/lib/product-context";
import { useProductRepositories, primaryRepo } from "@/lib/queries/product-repositories";
import { useDateRange, RANGE_OPTIONS, type RangeKey } from "@/lib/date-range-context";

// Sprint and Team pills used to live here as fixed dropdowns with no real
// data behind either option list on any page — removed rather than left as
// decoration. Reintroducing either should be a targeted pill on the specific
// page/role that actually has real data to filter (e.g. a Sprint pill once
// real Jira sprint sync exists, scoped to the pages that show sprint data —
// not a global, always-rendered fixture like this bar used to be).

/**
 * Read-only display of the current product's mapped GitHub repo — the same
 * ProductRepository row dashboard.tsx's CI panel reads via the identical
 * hook, so the two can never disagree. Replaces the old account-wide repo
 * picker (any repo the connected token could see, written to a
 * `selectedGitHubRepo` localStorage key + `githubRepoChanged` window event)
 * — that let a user pick repos unrelated to the current product, which the
 * backend now 403s on anyway since reads are scoped to mapped repos.
 */
export function GitHubRepoPill() {
  const { currentProduct } = useCurrentProduct();
  const { data: repos, isLoading } = useProductRepositories(currentProduct?.id);
  const repo = primaryRepo(repos);

  if (!currentProduct) return null;

  if (isLoading) {
    return (
      <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Repository</span>
        <span className="text-xs text-muted-foreground">Loading...</span>
      </label>
    );
  }

  if (!repo) {
    return (
      <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Repository</span>
        <span className="text-xs text-muted-foreground">Not mapped</span>
      </label>
    );
  }

  return (
    <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">Repository</span>
      <span className="text-xs font-medium">{repo}</span>
      {repos && repos.length > 1 && (
        <span className="text-[10px] text-primary">+{repos.length - 1} more</span>
      )}
    </label>
  );
}

export function ProductPill() {
  const { products, currentProduct, setCurrentProductId, isLoading, canViewPortfolio } = useCurrentProduct();

  if (isLoading) {
    return (
      <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Product</span>
        <span className="text-xs text-muted-foreground">Loading…</span>
      </label>
    );
  }

  if (products.length === 0) {
    return (
      <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Product</span>
        <span className="text-xs text-muted-foreground">No products</span>
      </label>
    );
  }

  return (
    <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">Product</span>
      <select
        value={currentProduct?.id ?? ""}
        onChange={(e) => setCurrentProductId(e.target.value || null)}
        className="cursor-pointer bg-transparent text-xs font-medium outline-none"
      >
        {canViewPortfolio && (
          <option value="" className="bg-popover text-popover-foreground">
            All products
          </option>
        )}
        {products.map((p) => (
          <option key={p.id} value={p.id} className="bg-popover text-popover-foreground">
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RangePill() {
  const { range, setRange } = useDateRange();
  return (
    <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">Range</span>
      <select
        value={range}
        onChange={(e) => setRange(e.target.value as RangeKey)}
        className="cursor-pointer bg-transparent text-xs font-medium outline-none"
      >
        {RANGE_OPTIONS.map((o) => (
          <option key={o.key} value={o.key} className="bg-popover text-popover-foreground">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Product + Range are the only pills with real data behind them on every
 * page that renders this — Repository is opt-in (`showRepository`) since
 * only the Dashboard's CI panel actually reads the selected repo; every
 * other page rendering it before was dead UI. Pages with nothing real to
 * filter by (AI Usage has its own visibility-level control instead) should
 * render their own pills directly rather than this bar, not just omit props.
 */
export function FilterBar({ showRepository = false }: { showRepository?: boolean } = {}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showRepository && <GitHubRepoPill />}
      <ProductPill />
      <RangePill />
    </div>
  );
}
