import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ProductRepositoryData {
  productId: string;
  githubRepo: string;
  isPrimary?: boolean;
}

interface ProductGitHubMetrics {
  productId: string;
  productName: string;
  repositories: Array<{
    githubRepo: string;
    isPrimary: boolean;
    status: any; // GitHub project status
  }>;
  aggregated: {
    totalRepos: number;
    totalCommits: number;
    totalOpenIssues: number;
    totalOpenPRs: number;
    avgHealthScore: number;
  };
  lastUpdated: string;
}

export class ProductRepositoryService {
  /**
   * Add a GitHub repository to a product
   */
  async addRepository(data: ProductRepositoryData): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      // Check if product exists
      const product = await prisma.product.findUnique({
        where: { id: data.productId }
      });

      if (!product) {
        return {
          success: false,
          message: 'Product not found'
        };
      }

      // Check if repository is already added to this product
      const existing = await prisma.productRepository.findUnique({
        where: {
          productId_githubRepo: {
            productId: data.productId,
            githubRepo: data.githubRepo
          }
        }
      });

      if (existing) {
        // Update if it exists but is inactive
        if (!existing.isActive) {
          await prisma.productRepository.update({
            where: { id: existing.id },
            data: { isActive: true }
          });
          return {
            success: true,
            message: 'Repository reactivated for this product',
            data: existing
          };
        }
        return {
          success: false,
          message: 'Repository already exists for this product'
        };
      }

      // If this is set as primary, unset other primary repos for this product
      if (data.isPrimary) {
        await prisma.productRepository.updateMany({
          where: {
            productId: data.productId,
            isPrimary: true
          },
          data: {
            isPrimary: false
          }
        });
      }

      // Add the new repository
      const productRepository = await prisma.productRepository.create({
        data: {
          productId: data.productId,
          githubRepo: data.githubRepo,
          isPrimary: data.isPrimary || false
        }
      });

      return {
        success: true,
        message: 'Repository added to product successfully',
        data: productRepository
      };
    } catch (error: any) {
      console.error('Error adding repository to product:', error);
      return {
        success: false,
        message: `Failed to add repository: ${error.message}`
      };
    }
  }

  /**
   * Get all repositories for a product
   */
  async getProductRepositories(productId: string): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const repositories = await prisma.productRepository.findMany({
        where: {
          productId,
          isActive: true
        },
        orderBy: [
          { isPrimary: 'desc' },
          { createdAt: 'asc' }
        ]
      });

      return {
        success: true,
        data: repositories
      };
    } catch (error: any) {
      console.error('Error fetching product repositories:', error);
      return {
        success: false,
        message: `Failed to fetch repositories: ${error.message}`
      };
    }
  }

  /**
   * Remove a repository from a product
   */
  async removeRepository(productId: string, githubRepo: string): Promise<{ success: boolean; message: string }> {
    try {
      await prisma.productRepository.updateMany({
        where: {
          productId,
          githubRepo
        },
        data: {
          isActive: false
        }
      });

      return {
        success: true,
        message: 'Repository removed from product successfully'
      };
    } catch (error: any) {
      console.error('Error removing repository from product:', error);
      return {
        success: false,
        message: `Failed to remove repository: ${error.message}`
      };
    }
  }

  /**
   * Set a repository as primary for a product
   */
  async setPrimaryRepository(productId: string, githubRepo: string): Promise<{ success: boolean; message: string }> {
    try {
      // Unset current primary
      await prisma.productRepository.updateMany({
        where: {
          productId,
          isPrimary: true
        },
        data: {
          isPrimary: false
        }
      });

      // Set new primary
      await prisma.productRepository.updateMany({
        where: {
          productId,
          githubRepo
        },
        data: {
          isPrimary: true
        }
      });

      return {
        success: true,
        message: 'Primary repository set successfully'
      };
    } catch (error: any) {
      console.error('Error setting primary repository:', error);
      return {
        success: false,
        message: `Failed to set primary repository: ${error.message}`
      };
    }
  }

  /**
   * Get GitHub metrics for all repositories in a product
   */
  async getProductGitHubMetrics(productId: string, tenantId: string): Promise<{ success: boolean; data?: ProductGitHubMetrics; message?: string }> {
    try {
      // Get product info
      const product = await prisma.product.findUnique({
        where: { id: productId }
      });

      // tenantId was accepted but never checked here — any authenticated
      // user could read another tenant's GitHub metrics by guessing/passing
      // a foreign productId. "Product not found" for a real-but-foreign id
      // (not 403) so this doesn't confirm the id belongs to someone else.
      if (!product || product.tenantId !== tenantId) {
        return {
          success: false,
          message: 'Product not found'
        };
      }

      // Get all repositories for this product
      const repositories = await prisma.productRepository.findMany({
        where: {
          productId,
          isActive: true
        }
      });

      if (repositories.length === 0) {
        return {
          success: true,
          data: {
            productId,
            productName: product.name,
            repositories: [],
            aggregated: {
              totalRepos: 0,
              totalCommits: 0,
              totalOpenIssues: 0,
              totalOpenPRs: 0,
              avgHealthScore: 0
            },
            lastUpdated: new Date().toISOString()
          }
        };
      }

      // Fetch GitHub data for each repository
      const githubService = await import('../services/github.service');
      const githubTokenService = await import('../services/github-token.service');
      const token = await githubTokenService.default.getToken(tenantId);

      const repoData = await Promise.allSettled(
        repositories.map(async (repo) => {
          try {
            const [owner, repoName] = repo.githubRepo.split('/');
            if (!owner || !repoName) {
              throw new Error(`Invalid repo format: ${repo.githubRepo}`);
            }

            const status = await githubService.default.getProjectStatus(token, owner, repoName);
            return {
              githubRepo: repo.githubRepo,
              isPrimary: repo.isPrimary,
              status,
              success: true
            };
          } catch (error) {
            return {
              githubRepo: repo.githubRepo,
              isPrimary: repo.isPrimary,
              status: null,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      const successfulRepos = repoData.filter(r => r.status === 'fulfilled' && r.value.success).map((r: any) => r.value);

      // Calculate aggregated metrics
      const aggregated = {
        totalRepos: repositories.length,
        totalCommits: successfulRepos.reduce((sum, r) => sum + (r.status?.recent_commits?.length || 0), 0),
        totalOpenIssues: successfulRepos.reduce((sum, r) => sum + (r.status?.issues_summary?.open || 0), 0),
        totalOpenPRs: successfulRepos.reduce((sum, r) => sum + (r.status?.pull_requests_summary?.open || 0), 0),
        avgHealthScore: successfulRepos.length > 0
          ? successfulRepos.reduce((sum, r) => sum + (r.status?.health_score || 0), 0) / successfulRepos.length
          : 0
      };

      return {
        success: true,
        data: {
          productId,
          productName: product.name,
          repositories: successfulRepos,
          aggregated: {
            ...aggregated,
            avgHealthScore: Math.round(aggregated.avgHealthScore)
          },
          lastUpdated: new Date().toISOString()
        }
      };
    } catch (error: any) {
      console.error('Error fetching product GitHub metrics:', error);
      return {
        success: false,
        message: `Failed to fetch product metrics: ${error.message}`
      };
    }
  }

  /**
   * Whether `owner/repo` is mapped to any active product belonging to this
   * tenant — the access boundary for GitHub read endpoints, so an
   * authenticated tenant member can only query repos the org actually
   * tracks, not any repo their stored credential happens to reach.
   */
  async isRepoMappedForTenant(tenantId: string, owner: string, repo: string): Promise<boolean> {
    const githubRepo = `${owner}/${repo}`;
    const match = await prisma.productRepository.findFirst({
      where: {
        githubRepo,
        isActive: true,
        product: { tenantId, isActive: true },
      },
      select: { id: true },
    });
    return match !== null;
  }

  /**
   * Same access boundary as isRepoMappedForTenant, but returns the row itself
   * — used where a caller needs the ProductRepository id (e.g. to attach a
   * synced Commit to it), not just a yes/no check.
   */
  async findMappedRepo(tenantId: string, githubRepo: string) {
    return prisma.productRepository.findFirst({
      where: {
        githubRepo,
        isActive: true,
        product: { tenantId, isActive: true },
      },
    });
  }

  /**
   * Get all products with their repository information
   */
  async getProductsWithRepositories(tenantId: string): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const products = await prisma.product.findMany({
        where: {
          tenantId,
          isActive: true
        },
        include: {
          productRepositories: {
            where: {
              isActive: true
            },
            orderBy: [
              { isPrimary: 'desc' },
              { createdAt: 'asc' }
            ]
          }
        },
        orderBy: {
          name: 'asc'
        }
      });

      return {
        success: true,
        data: products
      };
    } catch (error: any) {
      console.error('Error fetching products with repositories:', error);
      return {
        success: false,
        message: `Failed to fetch products: ${error.message}`
      };
    }
  }
}

export const productRepositoryService = new ProductRepositoryService();
export default productRepositoryService;