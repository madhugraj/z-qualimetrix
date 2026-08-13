import { useState, useEffect } from 'react';
import { CheckCircle2, CircleDashed, Plus, Trash2, Star, Loader2 } from 'lucide-react';
import { GlassPanel } from '@/components/qm/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  key: string;
  description?: string;
  color?: string;
}

interface ProductRepository {
  id: string;
  productId: string;
  githubRepo: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
}

interface AggregatedMetrics {
  totalRepos: number;
  totalCommits: number;
  totalOpenIssues: number;
  totalOpenPRs: number;
  avgHealthScore: number;
}

export function ProductRepositories() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [repositories, setRepositories] = useState<ProductRepository[]>([]);
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingRepo, setIsAddingRepo] = useState(false);
  const [newRepoInput, setNewRepoInput] = useState('');
  const [tenantId] = useState('11d0f8f8-fd2e-4e2c-8d01-8f9b0ae1e167');

  // Load products on mount
  useEffect(() => {
    loadProducts();
  }, []);

  // Load repositories when product is selected
  useEffect(() => {
    if (selectedProduct) {
      loadProductRepositories();
      loadProductMetrics();
    } else {
      setRepositories([]);
      setMetrics(null);
    }
  }, [selectedProduct]);

  const loadProducts = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/v1/products?tenantId=${tenantId}`);
      const data = await response.json();
      if (data.success) {
        setProducts(data.data.products);
        // Auto-select first product if available
        if (data.data.products.length > 0 && !selectedProduct) {
          setSelectedProduct(data.data.products[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      toast.error('Failed to load products');
    }
  };

  const loadProductRepositories = async () => {
    if (!selectedProduct) return;

    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/v1/product-repository/products/${selectedProduct.id}/repositories`);
      const data = await response.json();
      if (data.success) {
        setRepositories(data.data);
      }
    } catch (error) {
      console.error('Failed to load repositories:', error);
      toast.error('Failed to load repositories');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProductMetrics = async () => {
    if (!selectedProduct) return;

    try {
      const response = await fetch(`http://localhost:3001/api/v1/product-repository/products/${selectedProduct.id}/github-metrics?tenantId=${tenantId}`);
      const data = await response.json();
      if (data.success) {
        setMetrics(data.data.aggregated);
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const addRepository = async () => {
    if (!selectedProduct || !newRepoInput.trim()) return;

    const repoFormat = newRepoInput.trim();
    if (!repoFormat.includes('/')) {
      toast.error('Invalid repository format', {
        description: 'Use format: owner/repository'
      });
      return;
    }

    setIsAddingRepo(true);
    try {
      const response = await fetch(`http://localhost:3001/api/v1/product-repository/products/${selectedProduct.id}/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          githubRepo: repoFormat,
          isPrimary: repositories.length === 0 // First repo becomes primary
        })
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Repository added to product');
        setNewRepoInput('');
        loadProductRepositories();
        loadProductMetrics();
      } else {
        toast.error(data.message || 'Failed to add repository');
      }
    } catch (error) {
      console.error('Failed to add repository:', error);
      toast.error('Failed to add repository');
    } finally {
      setIsAddingRepo(false);
    }
  };

  const removeRepository = async (githubRepo: string) => {
    if (!selectedProduct) return;

    try {
      const response = await fetch(`http://localhost:3001/api/v1/product-repository/products/${selectedProduct.id}/repositories/${encodeURIComponent(githubRepo)}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Repository removed from product');
        loadProductRepositories();
        loadProductMetrics();
      } else {
        toast.error(data.message || 'Failed to remove repository');
      }
    } catch (error) {
      console.error('Failed to remove repository:', error);
      toast.error('Failed to remove repository');
    }
  };

  const setAsPrimary = async (githubRepo: string) => {
    if (!selectedProduct) return;

    try {
      const response = await fetch(`http://localhost:3001/api/v1/product-repository/products/${selectedProduct.id}/repositories/${encodeURIComponent(githubRepo)}/primary`, {
        method: 'PUT'
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Primary repository updated');
        loadProductRepositories();
      } else {
        toast.error(data.message || 'Failed to set primary repository');
      }
    } catch (error) {
      console.error('Failed to set primary repository:', error);
      toast.error('Failed to set primary repository');
    }
  };

  return (
    <div className="space-y-4">
      {/* Product Selection */}
      <GlassPanel title="Product Management" subtitle="Group and manage GitHub repositories by product">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Product</Label>
            <select
              value={selectedProduct?.id || ''}
              onChange={(e) => {
                const product = products.find(p => p.id === e.target.value);
                setSelectedProduct(product || null);
              }}
              className="w-full rounded-md border border-glass-border bg-transparent px-3 py-2 text-sm"
              disabled={isLoading}
            >
              <option value="">Choose a product...</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.key})
                </option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <div className="rounded-xl border border-glass-border/60 p-3">
              <p className="text-sm font-medium">{selectedProduct.name}</p>
              {selectedProduct.description && (
                <p className="text-xs text-muted-foreground mt-1">{selectedProduct.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Key: {selectedProduct.key}</span>
                {selectedProduct.color && (
                  <span
                    className="h-4 w-4 rounded"
                    style={{ backgroundColor: selectedProduct.color }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Aggregated Metrics */}
      {selectedProduct && metrics && (
        <GlassPanel title="Product Metrics" subtitle="Aggregated data across all repositories">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{metrics.totalRepos}</p>
              <p className="text-xs text-muted-foreground">Repositories</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{metrics.totalCommits}</p>
              <p className="text-xs text-muted-foreground">Total Commits</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{metrics.totalOpenIssues}</p>
              <p className="text-xs text-muted-foreground">Open Issues</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{metrics.totalOpenPRs}</p>
              <p className="text-xs text-muted-foreground">Open PRs</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{metrics.avgHealthScore}%</p>
              <p className="text-xs text-muted-foreground">Avg Health</p>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Repository Management */}
      {selectedProduct && (
        <GlassPanel title="Product Repositories" subtitle="Manage GitHub repositories for this product">
          <div className="space-y-4">
            {/* Add Repository Form */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="owner/repository (e.g., facebook/react)"
                  value={newRepoInput}
                  onChange={(e) => setNewRepoInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addRepository()}
                  disabled={isAddingRepo}
                />
              </div>
              <Button
                onClick={addRepository}
                disabled={isAddingRepo || !newRepoInput.trim()}
                size="sm"
              >
                {isAddingRepo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Repository
              </Button>
            </div>

            {/* Repository List */}
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : repositories.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No repositories linked to this product yet. Add your first repository above.
              </div>
            ) : (
              <ul className="space-y-2">
                {repositories.map((repo) => (
                  <li
                    key={repo.id}
                    className="flex items-center justify-between rounded-xl border border-glass-border/60 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      {repo.isPrimary && (
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{repo.githubRepo}</p>
                        <p className="text-xs text-muted-foreground">
                          {repo.isPrimary ? 'Primary repository' : 'Secondary repository'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!repo.isPrimary && (
                        <Button
                          onClick={() => setAsPrimary(repo.githubRepo)}
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Set Primary
                        </Button>
                      )}
                      <Button
                        onClick={() => removeRepository(repo.githubRepo)}
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-critical hover:text-critical"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}