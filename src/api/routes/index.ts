import { Router } from 'express';
// Import controllers
import tenantController from '../controllers/tenant.controller';
import productController from '../controllers/product.controller';
import workItemController from '../controllers/workitem.controller';
import testCaseController from '../controllers/testcase.controller';
import userController from '../controllers/user.controller';
import analyticsController from '../controllers/analytics.controller';
import { healthCheck, databaseInfo } from '../controllers/health.controller';
import githubRoutes from './github.routes';
import productRepositoryRoutes from './product-repository.routes';
import {
  saveGitHubToken,
  validateGitHubToken,
  getGitHubStatus,
  deleteGitHubToken,
  testGitHubToken
} from '../controllers/github-token.controller';

const router = Router();

// Health & Info endpoints
router.get('/health', healthCheck);
router.get('/database-info', databaseInfo);

// Tenant routes
router.get('/tenants', tenantController.getAllTenants);
router.get('/tenants/:id', tenantController.getTenantById);
router.get('/tenants/slug/:slug', tenantController.getTenantBySlug);
router.post('/tenants', tenantController.createTenant);
router.put('/tenants/:id', tenantController.updateTenant);
router.delete('/tenants/:id', tenantController.deleteTenant);
router.get('/tenants/:id/stats', tenantController.getTenantStats);

// Product routes
router.get('/products', productController.getAllProducts);
router.get('/products/:id', productController.getProductById);
router.post('/products', productController.createProduct);
router.put('/products/:id', productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);
router.get('/products/:id/stats', productController.getProductStats);
router.get('/tenants/:tenantId/products', productController.getProductsByTenant);

// Work Item routes
router.get('/work-items', workItemController.getAllWorkItems);
router.get('/work-items/:id', workItemController.getWorkItemById);
router.post('/work-items', workItemController.createWorkItem);
router.put('/work-items/:id', workItemController.updateWorkItem);
router.delete('/work-items/:id', workItemController.deleteWorkItem);
router.get('/products/:productId/work-items', workItemController.getWorkItemsByProduct);
router.get('/sprints/:sprintId/work-items', workItemController.getWorkItemsBySprint);
router.post('/work-items/bulk-update-status', workItemController.bulkUpdateStatus);

// Test Case routes
router.get('/test-cases', testCaseController.getAllTestCases);
router.get('/test-cases/:id', testCaseController.getTestCaseById);
router.post('/test-cases', testCaseController.createTestCase);
router.put('/test-cases/:id', testCaseController.updateTestCase);
router.delete('/test-cases/:id', testCaseController.deleteTestCase);
router.get('/products/:productId/test-cases', testCaseController.getTestCasesByProduct);
router.post('/test-executions', testCaseController.createTestExecution);
router.get('/test-cases/:testCaseId/executions', testCaseController.getTestExecutions);

// User routes
router.get('/users', userController.getAllUsers);
router.get('/users/:id', userController.getUserById);
router.post('/users', userController.createUser);
router.put('/users/:id', userController.updateUser);
router.delete('/users/:id', userController.deleteUser);
router.put('/users/:id/last-login', userController.updateLastLogin);
router.get('/users/:id/activity', userController.getUserActivity);
router.get('/tenants/:tenantId/users', userController.getUsersByTenant);

// Analytics routes
router.get('/analytics/mttr', analyticsController.getMTTR);
router.get('/analytics/defect-leakage', analyticsController.getDefectLeakage);
router.get('/analytics/test-metrics', analyticsController.getTestExecutionMetrics);
router.get('/analytics/team-productivity', analyticsController.getTeamProductivity);
router.get('/analytics/dashboard', analyticsController.getQualityDashboard);
router.get('/analytics/trends', analyticsController.getQualityTrends);
router.get('/products/:productId/analytics', analyticsController.getProductAnalytics);
router.get('/products/:productId/release-readiness', analyticsController.getReleaseReadiness);
router.get('/tenants/:tenantId/analytics', analyticsController.getTenantAnalytics);

// GitHub integration routes
router.use('/github', githubRoutes);

// GitHub token management routes (directly defined)
router.post('/github-token/validate', validateGitHubToken);
router.post('/github-token/tokens', saveGitHubToken);
router.get('/github-token/status/:tenantId', getGitHubStatus);
router.get('/github-token/test/:tenantId', testGitHubToken);
router.delete('/github-token/tokens/:tenantId', deleteGitHubToken);

// Product repository routes
router.use('/product-repository', productRepositoryRoutes);

export default router;