import { SPRINTS } from "@/lib/qm-data";
import { useState, useEffect } from "react";
import { getGitHubRepositories, type GitHubRepository } from "@/lib/github-data.service";
import { useCurrentProduct } from "@/lib/product-context";

function Pill({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select className="cursor-pointer bg-transparent text-xs font-medium outline-none">
        {options.map((o) => (
          <option key={o} className="bg-popover text-popover-foreground">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function GitHubRepoPill() {
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadRepositories = async () => {
      setIsLoading(true);
      try {
        const repos = await getGitHubRepositories();
        setRepositories(repos);

        // Auto-select first repository or set to empty
        if (repos.length > 0) {
          setSelectedRepo(repos[0].full_name);
          // Store in localStorage for dashboard components to access
          localStorage.setItem('selectedGitHubRepo', repos[0].full_name);
        }
      } catch (error) {
        console.error('Failed to load GitHub repositories:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadRepositories();
  }, []);

  const handleRepoChange = (repoFullName: string) => {
    setSelectedRepo(repoFullName);
    localStorage.setItem('selectedGitHubRepo', repoFullName);

    // Dispatch custom event for dashboard components to listen to
    window.dispatchEvent(new CustomEvent('githubRepoChanged', { detail: { repo: repoFullName } }));
  };

  if (isLoading) {
    return (
      <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Repository</span>
        <span className="text-xs text-muted-foreground">Loading...</span>
      </label>
    );
  }

  if (repositories.length === 0) {
    return (
      <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Repository</span>
        <span className="text-xs text-muted-foreground">No repos</span>
      </label>
    );
  }

  return (
    <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">Repository</span>
      <select
        value={selectedRepo}
        onChange={(e) => handleRepoChange(e.target.value)}
        className="cursor-pointer bg-transparent text-xs font-medium outline-none min-w-[200px]"
      >
        {repositories.map((repo) => (
          <option key={repo.full_name} value={repo.full_name} className="bg-popover text-popover-foreground">
            {repo.full_name} {repo.description ? `- ${repo.description}` : ''}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-primary">{repositories.length} repos</span>
    </label>
  );
}

function ProductPill() {
  const { products, currentProduct, setCurrentProductId, isLoading, isPortfolioView } = useCurrentProduct();

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
        {isPortfolioView && (
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

export function FilterBar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GitHubRepoPill />
      <ProductPill />
      <Pill label="Sprint" options={SPRINTS} />
      <Pill label="Team" options={["All teams", "Squad Nova", "Squad Kite", "Squad Pulse"]} />
      <Pill label="Range" options={["Last 30 days", "Last 7 days", "This quarter", "YTD"]} />
    </div>
  );
}
