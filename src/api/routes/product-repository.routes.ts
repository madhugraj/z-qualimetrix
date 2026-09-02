import { Router } from 'express';
import {
  addRepositoryToProduct,
  getProductRepositories,
  removeRepositoryFromProduct,
  setPrimaryRepository,
  getProductGitHubMetrics,
  getProductsWithRepositories
} from '../controllers/product-repository.controller';
import { requireAuth, requireProductScope } from '../middleware/auth.middleware';
import { paramString } from '../utils/http-params';

const router = Router();
router.use(requireAuth);

// Every :productId route below is gated by requireProductScope — none of
// these controllers checked tenant/membership ownership of productId
// themselves (addRepositoryToProduct could even ADD/REMOVE a repo mapping
// on another tenant's product), so the check has to live here instead.
const scopeToProductParam = requireProductScope((req) => paramString(req.params.productId));

// Add a GitHub repository to a product
router.post('/products/:productId/repositories', scopeToProductParam, addRepositoryToProduct);

// Get all repositories for a product
router.get('/products/:productId/repositories', scopeToProductParam, getProductRepositories);

// Get GitHub metrics for all repositories in a product
router.get('/products/:productId/github-metrics', scopeToProductParam, getProductGitHubMetrics);

// Set a repository as primary for a product
router.put('/products/:productId/repositories/:githubRepo/primary', scopeToProductParam, setPrimaryRepository);

// Remove a repository from a product
router.delete('/products/:productId/repositories/:githubRepo', scopeToProductParam, removeRepositoryFromProduct);

// Get all products with their repositories
router.get('/products-with-repositories', getProductsWithRepositories);

export default router;