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
}

const ProductContext = createContext<ProductContextValue>({
  products: [],
  currentProduct: null,
  setCurrentProductId: () => {},
  isLoading: true,
  isPortfolioView: false,
});

function isPortfolioRole(role?: string | null): boolean {
  return role === "pm" || role === "executive";
}

function storageKey(tenantId: string): string {
  return `qm_selected_product_${tenantId}`;
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? null;
  const role = user?.role ?? null;

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setProducts([]);
      setSelectedId(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`${API_V1_URL}/products?isActive=true`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success) return;
        const list: Product[] = data.data.products ?? [];
        setProducts(list);

        const stored = localStorage.getItem(storageKey(tenantId));
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
  }, [tenantId, role]);

  const setCurrentProductId = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!tenantId) return;
      if (id) localStorage.setItem(storageKey(tenantId), id);
      else localStorage.removeItem(storageKey(tenantId));
    },
    [tenantId]
  );

  const currentProduct = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId]
  );

  const isPortfolioView = isPortfolioRole(role) && !currentProduct;

  return (
    <ProductContext.Provider
      value={{ products, currentProduct, setCurrentProductId, isLoading, isPortfolioView }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useCurrentProduct() {
  return useContext(ProductContext);
}
