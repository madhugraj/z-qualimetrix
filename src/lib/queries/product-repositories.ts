import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data as T;
}

export interface ProductRepository {
  id: string;
  productId: string;
  githubRepo: string;
  isPrimary: boolean;
}

/**
 * The mapped repo(s) for a product — the single source of truth for "which
 * GitHub repo does this product's code live in," replacing the old
 * localStorage-based selectedGitHubRepo/github_repo(s) mechanisms that had
 * no relationship to what a product's Jira project actually maps to.
 */
export function useProductRepositories(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["product-repositories", productId],
    queryFn: () => fetchApi<ProductRepository[]>(`/product-repository/products/${productId}/repositories`),
    enabled: !!productId,
  });
}

export function primaryRepo(repos: ProductRepository[] | undefined): string | null {
  if (!repos || repos.length === 0) return null;
  return repos.find((r) => r.isPrimary)?.githubRepo ?? repos[0].githubRepo;
}
