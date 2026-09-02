import { Request, Response } from 'express';
import productRepositoryService from '../services/product-repository.service';
import { paramString } from '../utils/http-params';

/**
 * Product Repository Controller
 * Handles product-to-GitHub repository mapping and aggregation
 */

export async function addRepositoryToProduct(req: Request, res: Response): Promise<void> {
  try {
    // productId comes from the URL param (already verified by
    // requireProductScope), not the body — a body value could otherwise
    // disagree with the scoped :productId and add the repo to a different,
    // unchecked product.
    const productId = paramString(req.params.productId);
    const { githubRepo, isPrimary } = req.body;

    if (!productId || !githubRepo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'ProductId and githubRepo are required'
      });
      return;
    }

    console.log(`🔗 Adding repository ${githubRepo} to product ${productId}`);

    const result = await productRepositoryService.addRepository({
      productId,
      githubRepo,
      isPrimary
    });

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error adding repository to product:', error);
    res.status(500).json({
      error: 'Failed to add repository to product',
      message: error.message || 'Unknown error'
    });
  }
}

export async function getProductRepositories(req: Request, res: Response): Promise<void> {
  try {
    const productId = paramString(req.params.productId);

    if (!productId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'ProductId is required'
      });
      return;
    }

    console.log(`📋 Fetching repositories for product ${productId}`);

    const result = await productRepositoryService.getProductRepositories(productId);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        count: result.data?.length || 0
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error fetching product repositories:', error);
    res.status(500).json({
      error: 'Failed to fetch product repositories',
      message: error.message || 'Unknown error'
    });
  }
}

export async function removeRepositoryFromProduct(req: Request, res: Response): Promise<void> {
  try {
    const productId = paramString(req.params.productId);
    const githubRepo = paramString(req.params.githubRepo);

    if (!productId || !githubRepo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'ProductId and githubRepo are required'
      });
      return;
    }

    console.log(`🗑️  Removing repository ${githubRepo} from product ${productId}`);

    const result = await productRepositoryService.removeRepository(productId, githubRepo);

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error removing repository from product:', error);
    res.status(500).json({
      error: 'Failed to remove repository from product',
      message: error.message || 'Unknown error'
    });
  }
}

export async function setPrimaryRepository(req: Request, res: Response): Promise<void> {
  try {
    const productId = paramString(req.params.productId);
    const githubRepo = paramString(req.params.githubRepo);

    if (!productId || !githubRepo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'ProductId and githubRepo are required'
      });
      return;
    }

    console.log(`⭐ Setting ${githubRepo} as primary repository for product ${productId}`);

    const result = await productRepositoryService.setPrimaryRepository(productId, githubRepo);

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error setting primary repository:', error);
    res.status(500).json({
      error: 'Failed to set primary repository',
      message: error.message || 'Unknown error'
    });
  }
}

export async function getProductGitHubMetrics(req: Request, res: Response): Promise<void> {
  try {
    const productId = paramString(req.params.productId);
    const tenantId = req.user?.tenantId;

    if (!productId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'ProductId is required'
      });
      return;
    }
    if (!tenantId) {
      res.status(403).json({ error: 'Forbidden', message: 'Not assigned to an organization yet' });
      return;
    }

    console.log(`📊 Fetching GitHub metrics for product ${productId}`);

    const result = await productRepositoryService.getProductGitHubMetrics(productId, tenantId);

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error fetching product GitHub metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch product GitHub metrics',
      message: error.message || 'Unknown error'
    });
  }
}

export async function getProductsWithRepositories(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Forbidden', message: 'Not assigned to an organization yet' });
      return;
    }

    console.log(`📋 Fetching products with repositories for tenant ${tenantId}`);

    const result = await productRepositoryService.getProductsWithRepositories(tenantId);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        count: result.data?.length || 0
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error fetching products with repositories:', error);
    res.status(500).json({
      error: 'Failed to fetch products with repositories',
      message: error.message || 'Unknown error'
    });
  }
}