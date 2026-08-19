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
import integrationRoutes from './integration.routes';
import authRoutes from './auth.routes';
import membershipRoutes from './membership.routes';
import {
  saveGitHubToken,
  validateGitHubToken,
  getGitHubStatus,
  deleteGitHubToken,
  testGitHubToken
} from '../controllers/github-token.controller';
import {
  getAiUsageAnalyticsHandler,
  ingestAiUsageEvents,
  connectAiUsage,
  ingestOtlpLogs
} from '../controllers/ai-usage.controller';
import { requireAuth, requireAdmin, requireProductWriteAccess } from '../middleware/auth.middleware';
import { requireIngestToken } from '../middleware/ingest-token.middleware';
import adminRoutes from './admin.routes';

const router = Router();

// Health & Info endpoints
router.get('/health', healthCheck);
router.get('/database-info', databaseInfo);

// Session auth routes
router.use('/auth', authRoutes);

// Tenant routes
router.get('/tenants', requireAuth, tenantController.getAllTenants);
router.get('/tenants/:id', requireAuth, tenantController.getTenantById);
router.get('/tenants/slug/:slug', requireAuth, tenantController.getTenantBySlug);
router.post('/tenants', tenantController.createTenant); // tenant bootstrap — no tenant/session exists yet
router.put('/tenants/:id', requireAdmin, tenantController.updateTenant);
router.delete('/tenants/:id', requireAdmin, tenantController.deleteTenant);
router.get('/tenants/:id/stats', requireAuth, tenantController.getTenantStats);

// Product routes — create/delete are PM-only; update allows a delegated PO to
// edit just the Jira/ADO mapping fields (see requireProductWriteAccess).
router.get('/products', requireAuth, productController.getAllProducts);
router.get('/products/:id', requireAuth, productController.getProductById);
router.post('/products', requireAdmin, productController.createProduct);
router.put('/products/:id', requireAuth, requireProductWriteAccess, productController.updateProduct);
router.delete('/products/:id', requireAdmin, productController.deleteProduct);
router.get('/products/:id/stats', requireAuth, productController.getProductStats);
router.get('/tenants/:tenantId/products', requireAuth, productController.getProductsByTenant);

// Work Item routes
router.get('/work-items', requireAuth, workItemController.getAllWorkItems);
router.get('/work-items/:id', requireAuth, workItemController.getWorkItemById);
router.post('/work-items', requireAuth, workItemController.createWorkItem);
router.put('/work-items/:id', requireAuth, workItemController.updateWorkItem);
router.delete('/work-items/:id', requireAuth, workItemController.deleteWorkItem);
router.get('/products/:productId/work-items', requireAuth, workItemController.getWorkItemsByProduct);
router.get('/sprints/:sprintId/work-items', requireAuth, workItemController.getWorkItemsBySprint);
router.post('/work-items/bulk-update-status', requireAuth, workItemController.bulkUpdateStatus);

// Test Case routes
router.get('/test-cases', requireAuth, testCaseController.getAllTestCases);
router.get('/test-cases/:id', requireAuth, testCaseController.getTestCaseById);
router.post('/test-cases', requireAuth, testCaseController.createTestCase);
router.put('/test-cases/:id', requireAuth, testCaseController.updateTestCase);
router.delete('/test-cases/:id', requireAuth, testCaseController.deleteTestCase);
router.get('/products/:productId/test-cases', requireAuth, testCaseController.getTestCasesByProduct);
router.post('/test-executions', requireAuth, testCaseController.createTestExecution);
router.get('/test-cases/:testCaseId/executions', requireAuth, testCaseController.getTestExecutions);

// User routes — creating/deleting/updating other users' accounts is PM-only;
// a user reading/updating their own activity trail is not exposed separately
// today, so these stay requireAuth (any signed-in tenant member).
router.get('/users', requireAuth, userController.getAllUsers);
router.get('/users/:id', requireAuth, userController.getUserById);
router.post('/users', requireAdmin, userController.createUser);
router.put('/users/:id', requireAdmin, userController.updateUser);
router.delete('/users/:id', requireAdmin, userController.deleteUser);
router.put('/users/:id/last-login', requireAuth, userController.updateLastLogin);
router.get('/users/:id/activity', requireAuth, userController.getUserActivity);
router.get('/tenants/:tenantId/users', requireAuth, userController.getUsersByTenant);

// Analytics routes
router.get('/analytics/mttr', requireAuth, analyticsController.getMTTR);
router.get('/analytics/defect-leakage', requireAuth, analyticsController.getDefectLeakage);
router.get('/analytics/test-metrics', requireAuth, analyticsController.getTestExecutionMetrics);
router.get('/analytics/team-productivity', requireAuth, analyticsController.getTeamProductivity);
router.get('/analytics/dashboard', requireAuth, analyticsController.getQualityDashboard);
router.get('/analytics/trends', requireAuth, analyticsController.getQualityTrends);
router.get('/products/:productId/analytics', requireAuth, analyticsController.getProductAnalytics);
router.get('/products/:productId/release-readiness', requireAuth, analyticsController.getReleaseReadiness);
router.get('/tenants/:tenantId/analytics', requireAuth, analyticsController.getTenantAnalytics);

// GitHub integration routes
router.use('/github', githubRoutes);

// GitHub token management routes (directly defined) — saving/deleting the
// token is PM-only, same as connecting Jira/ADO; status/validate/test are
// read-only checks against an already-stored token.
router.post('/github-token/validate', requireAuth, validateGitHubToken);
router.post('/github-token/tokens', requireAdmin, saveGitHubToken);
router.get('/github-token/status/:tenantId', requireAuth, getGitHubStatus);
router.get('/github-token/test/:tenantId', requireAuth, testGitHubToken);
router.delete('/github-token/tokens/:tenantId', requireAdmin, deleteGitHubToken);

// Product repository routes
router.use('/product-repository', productRepositoryRoutes);

// AI Usage Analytics routes
router.get('/ai-usage/analytics', requireAuth, getAiUsageAnalyticsHandler);
router.post('/public/ai-usage/events', requireIngestToken, ingestAiUsageEvents);
router.post('/ai-usage/connect', requireAuth, connectAiUsage);
router.post('/ai-usage/otlp/logs', requireIngestToken, ingestOtlpLogs);

// Admin configuration routes
router.use('/admin', adminRoutes);

// Jira / Azure DevOps integration routes
router.use('/integrations', integrationRoutes);

// Role/scope/delegation administration (PM-only)
router.use('/memberships', membershipRoutes);

export default router;