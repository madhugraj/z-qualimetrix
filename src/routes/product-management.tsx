import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Settings, ChevronLeft, Loader2, Package } from "lucide-react";
import { AppShell } from "@/components/qm/AppShell";
import { CreateProductForm } from "@/components/qm/CreateProductForm";
import { EnhancedRepositorySelector } from "@/components/qm/EnhancedRepositorySelector";
import { TeamPerformanceMetrics } from "@/components/qm/TeamPerformanceMetrics";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  key: string;
  description?: string;
  color?: string;
}

const DEFAULT_TENANT_ID = '11d0f8f8-fd2e-4e2c-8d01-8f9b0ae1e167';

export const Route = createFileRoute("/product-management")({
  head: () => ({
    meta: [
      { title: "Product Management — QualiMetrix" },
      {
        name: "description",
        content: "Create products, manage GitHub repositories, and track team performance metrics in one unified dashboard.",
      },
      { property: "og:title", content: "QualiMetrix Product Management" },
      {
        property: "og:description",
        content: "Comprehensive product management with repository analytics and team performance tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductManagement,
});

function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'list' | 'create' | 'manage'>('list');
  const [tenantId] = useState(DEFAULT_TENANT_ID);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/v1/products?tenantId=${tenantId}`);
      const data = await response.json();
      if (data.success) {
        setProducts(data.data.products);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      toast.error('Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductCreated = (product: Product) => {
    loadProducts();
    setView('list');
    // Auto-select the newly created product
    setSelectedProduct(product);
    setView('manage');
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setView('manage');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedProduct(null);
  };

  return (
    <AppShell>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {view !== 'list' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToList}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Products
            </Button>
          )}
          <div>
            <h1 className="text-gradient text-2xl font-semibold md:text-3xl">
              {view === 'create' ? 'Create New Product' :
               view === 'manage' ? `Manage ${selectedProduct?.name}` :
               'Product Management'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {view === 'create' ? 'Set up a new product for repository management and quality tracking' :
               view === 'manage' ? `Manage repositories and track performance for ${selectedProduct?.name}` :
               'Create products and manage their repositories and team performance'}
            </p>
          </div>
        </div>

        {view === 'list' && (
          <Button
            onClick={() => setView('create')}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Product
          </Button>
        )}
      </header>

      {/* Product List View */}
      {view === 'list' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No products yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Get started by creating your first product to manage repositories and track team performance
              </p>
              <Button onClick={() => setView('create')} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Your First Product
              </Button>
            </div>
          ) : (
            products.map((product) => (
              <GlassPanel
                key={product.id}
                title={product.name}
                subtitle={product.key}
                className="cursor-pointer transition-all hover:shadow-lg"
                onClick={() => handleSelectProduct(product)}
              >
                <div className="space-y-3">
                  {product.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    {product.color && (
                      <div
                        className="h-4 w-4 rounded"
                        style={{ backgroundColor: product.color }}
                      />
                    )}
                    <span className="text-xs text-muted-foreground">
                      Product Key: {product.key}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectProduct(product);
                    }}
                  >
                    <Settings className="h-4 w-4" />
                    Manage
                  </Button>
                </div>
              </GlassPanel>
            ))
          )}
        </div>
      )}

      {/* Create Product View */}
      {view === 'create' && (
        <CreateProductForm
          tenantId={tenantId}
          onProductCreated={handleProductCreated}
          onCancel={() => setView('list')}
        />
      )}

      {/* Manage Product View */}
      {view === 'manage' && selectedProduct && (
        <div className="space-y-4">
          {/* Tabs for different management aspects */}
          <div className="flex gap-2 border-b border-glass-border/60">
            <button
              onClick={() => setView('manage')}
              className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary"
            >
              Repositories & Performance
            </button>
          </div>

          {/* Repository Management */}
          <EnhancedRepositorySelector
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            tenantId={tenantId}
            onRepositoriesUpdated={() => {
              // Optionally refresh other data
            }}
          />

          {/* Team Performance Metrics */}
          <TeamPerformanceMetrics
            productId={selectedProduct.id}
            tenantId={tenantId}
          />
        </div>
      )}
    </AppShell>
  );
}