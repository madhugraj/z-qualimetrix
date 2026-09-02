import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { API_V1_URL } from "@/lib/api-config";
import { useAuth } from "@/lib/auth-context";

export interface Product {
  id: string;
  name: string;
  key: string;
  jiraProjectId?: string | null;
}

interface ProductContextValue {
  products: Product[];
  currentProduct: Product | null;
  setCurrentProductId: (id: string | null) => void;
  isLoading: boolean;
  /** pm/executive viewing the tenant-wide portfolio rather than one product. */
  isPortfolioView: boolean;
  /** pm/executive's role permits an "All products" view at all — true regardless of
   * whether a specific product happens to be selected right now. Unlike `isPortfolioView`,
   * this doesn't flip to false just because a product is currently picked, so the UI can
   * always offer a way back to the portfolio view instead of a one-way dead end. */
  canViewPortfolio: boolean;
}

const ProductContext = createContext<ProductContextValue>({
  products: [],
  currentProduct: null,
  setCurrentProductId: () => {},
  isLoading: true,
  isPortfolioView: false,
  canViewPortfolio: false,
});

function isPortfolioRole(role?: string | null): boolean {
  return role === "pm" || role === "executive";
}

// Keyed by user, not just tenant — otherwise one teammate's product pick
// (e.g. a PO drilling into their own product) leaks into a PM/executive's
// next login on a shared browser, silently pinning their "portfolio" view
// to someone else's single product.
function storageKey(tenantId: string, userId: string): string {
  return `qm_selected_product_${tenantId}_${userId}`;
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? null;
  const userId = user?.id ?? null;
  const role = user?.role ?? null;

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !userId) {
      setProducts([]);
      setSelectedId(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    // limit=100 matches getPagination's own hard cap (base.controller.ts) —
    // this picker needs every accessible product, not one page of a table,
    // and silently dropped anything past the default limit=10 otherwise.
    fetch(`${API_V1_URL}/products?isActive=true&limit=100`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success) return;
        const list: Product[] = data.data.products ?? [];
        setProducts(list);

        const stored = localStorage.getItem(storageKey(tenantId, userId));
        const storedIsValid = !!stored && list.some((p) => p.id === stored);

        if (storedIsValid) {
          setSelectedId(stored);
        } else if (!isPortfolioRole(role) && list.length > 0) {
          setSelectedId(list[0].id);
        } else {
          setSelectedId(null);
        }
      })
      .catch((error) => console.error("Failed to load products:", error))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, userId, role]);

  const setCurrentProductId = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!tenantId || !userId) return;
      if (id) localStorage.setItem(storageKey(tenantId, userId), id);
      else localStorage.removeItem(storageKey(tenantId, userId));
    },
    [tenantId, userId]
  );

  const currentProduct = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId]
  );

  const isPortfolioView = isPortfolioRole(role) && !currentProduct;

  return (
    <ProductContext.Provider
      value={{
        products,
        currentProduct,
        setCurrentProductId,
        isLoading,
        isPortfolioView,
        canViewPortfolio: isPortfolioRole(role),
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useCurrentProduct() {
  return useContext(ProductContext);
}
