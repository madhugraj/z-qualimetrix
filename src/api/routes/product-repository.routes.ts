import { Router } from 'express';
import {
  addRepositoryToProduct,
  getProductRepositories,
  removeRepositoryFromProduct,
  setPrimaryRepository,
  getProductGitHubMetrics,
  getProductsWithRepositories
} from '../controllers/product-repository.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
router.use(requireAuth);

// Add a GitHub repository to a product
router.post('/products/:productId/repositories', addRepositoryToProduct);

// Get all repositories for a product
router.get('/products/:productId/repositories', getProductRepositories);

// Get GitHub metrics for all repositories in a product
router.get('/products/:productId/github-metrics', getProductGitHubMetrics);

// Set a repository as primary for a product
router.put('/products/:productId/repositories/:githubRepo/primary', setPrimaryRepository);

// Remove a repository from a product
router.delete('/products/:productId/repositories/:githubRepo', removeRepositoryFromProduct);

// Get all products with their repositories
router.get('/products-with-repositories', getProductsWithRepositories);

export default router;