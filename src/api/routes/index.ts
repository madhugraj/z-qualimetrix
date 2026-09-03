import { Router } from 'express';
// Import controllers
import tenantController from '../controllers/tenant.controller';
import productController from '../controllers/product.controller';
import workItemController from '../controllers/workitem.controller';
import testCaseController from '../controllers/testcase.controller';
import userController from '../controllers/user.controller';
import analyticsController from '../controllers/analytics.controller';
import assistantController from '../controllers/assistant.controller';
import assistantProviderConnectionController from '../controllers/assistant-provider-connection.controller';
import engineeringHealthController from '../controllers/engineering-health.controller';
import { getGpuSpendSummary, getGpuSpendTrend, getGpuSpendBySquad, getGpuSpendByType } from '../controllers/gpu-spend.controller';
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
  ingestOrganizationOtlpLogs,
  ingestOrganizationOtlpMetrics,
  ingestCommitAttribution,
  manualUsageEntry
} from '../controllers/ai-usage.controller';
import {
  listModelCatalog,
  createModelCatalogEntry,
  updateModelCatalogEntry,
  deactivateModelCatalogEntry
} from '../controllers/ai-model-catalog.controller';
import { requireAuth, requireAdmin, requireRole, requireProductWriteAccess, requireProductScope } from '../middleware/auth.middleware';
import { requireIngestToken } from '../middleware/ingest-token.middleware';
import { requireProviderConnectionToken } from '../middleware/provider-connection-token.middleware';
import { paramString } from '../utils/http-params';
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
router.get('/products/:productId/deliverables', requireAuth, requireProductScope((req) => paramString(req.params.productId)), productController.getProductDeliverables);
router.post('/products/:productId/deliverables', requireAuth, requireProductScope((req) => paramString(req.params.productId)), productController.createDeliverable);

// Work Item routes
router.get('/work-items', requireAuth, workItemController.getAllWorkItems);
router.get('/work-items/:id', requireAuth, workItemController.getWorkItemById);
router.post('/work-items', requireAuth, workItemController.createWorkItem);
router.put('/work-items/:id', requireAuth, workItemController.updateWorkItem);
router.delete('/work-items/:id', requireAuth, workItemController.deleteWorkItem);
router.get('/products/:productId/work-items', requireAuth, requireProductScope((req) => paramString(req.params.productId)), workItemController.getWorkItemsByProduct);
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
router.get('/tenants/:tenantId/users', requireAdmin, userController.getUsersByTenant);

// Analytics routes
router.get('/analytics/mttr', requireAuth, analyticsController.getMTTR);
router.get('/analytics/defect-leakage', requireAuth, analyticsController.getDefectLeakage);
router.get('/analytics/test-metrics', requireAuth, analyticsController.getTestExecutionMetrics);
router.get('/analytics/team-productivity', requireAuth, analyticsController.getTeamProductivity);
router.get('/analytics/dashboard', requireAuth, analyticsController.getQualityDashboard);
router.get('/analytics/trends', requireAuth, analyticsController.getQualityTrends);
router.get('/products/:productId/analytics', requireAuth, requireProductScope((req) => paramString(req.params.productId)), analyticsController.getProductAnalytics);
router.get('/products/:productId/release-readiness', requireAuth, requireProductScope((req) => paramString(req.params.productId)), analyticsController.getReleaseReadiness);
router.get('/analytics/velocity-trend', requireAuth, analyticsController.getVelocityTrend);
router.get('/tenants/:tenantId/analytics', requireAuth, analyticsController.getTenantAnalytics);
router.get('/analytics/bug-label-distribution', requireAuth, analyticsController.getBugLabelDistribution);
router.get('/analytics/open-p0-p1-count', requireAuth, analyticsController.getOpenP0P1Count);
router.get('/analytics/reopen-metrics', requireAuth, analyticsController.getReopenMetrics);
router.get('/analytics/qa-bottlenecks', requireAuth, analyticsController.getQaBottlenecks);
router.get('/products/:productId/work-items/:workItemId/similar-bugs', requireAuth, requireProductScope((req) => paramString(req.params.productId)), analyticsController.getSimilarBugs);
router.get('/analytics/projects-overview', requireAuth, analyticsController.getProjectsOverview);
router.get('/analytics/backlog-summary', requireAuth, analyticsController.getBacklogSummary);
router.get('/analytics/recent-high-priority-fixes', requireAuth, analyticsController.getRecentHighPriorityFixes);
router.get('/analytics/velocity-qoq', requireAuth, analyticsController.getQuarterOverQuarterVelocity);
router.get('/analytics/age-distribution', requireAuth, analyticsController.getAgeDistribution);
router.get('/analytics/backlog-flow', requireAuth, analyticsController.getBacklogFlow);
router.get('/analytics/requirement-traceability', requireAuth, analyticsController.getRequirementTraceability);
router.get('/analytics/epics', requireAuth, analyticsController.getEpicRollups);

// PM/Leadership analytics assistant — role-gated at the route layer, and
// independently re-scoped to req.user!.tenantId inside every service call
// (assistant-chat.service.ts / assistant-tools.service.ts never trust a
// client-supplied id either).
router.get('/assistant/conversations', requireRole('pm', 'executive'), assistantController.listConversations);
router.post('/assistant/conversations', requireRole('pm', 'executive'), assistantController.createConversation);
router.get('/assistant/conversations/:id', requireRole('pm', 'executive'), assistantController.getConversation);
router.post('/assistant/conversations/:id/messages', requireRole('pm', 'executive'), assistantController.sendMessage);

// PM-only: configuring the assistant's LLM connection is a Settings action,
// distinct from using the already-configured assistant (pm+executive above).
router.get('/assistant/provider-connection/status', requireRole('pm'), assistantProviderConnectionController.status);
router.post('/assistant/provider-connection', requireRole('pm'), assistantProviderConnectionController.save);
router.delete('/assistant/provider-connection', requireRole('pm'), assistantProviderConnectionController.remove);

router.get('/engineering-health/developers', requireRole('pm', 'executive'), engineeringHealthController.getDeveloperProfiles);
router.get('/gpu-spend/summary', requireAuth, getGpuSpendSummary);
router.get('/gpu-spend/trend', requireAuth, getGpuSpendTrend);
router.get('/gpu-spend/by-squad', requireAuth, getGpuSpendBySquad);
router.get('/gpu-spend/by-type', requireAuth, getGpuSpendByType);

// GitHub integration routes
router.use('/github', githubRoutes);

// GitHub token management routes (directly defined) — saving/deleting the
// token is PM-only, same as connecting Jira/ADO; status/validate/test are
// read-only checks against an already-stored token. Tenant always comes
// from req.user (see github-token.controller.ts), never a URL param — no
// :tenantId here, unlike the old routes, or one tenant could read/delete
// another's connection by guessing a UUID.
router.post('/github-token/validate', requireAuth, validateGitHubToken);
router.post('/github-token/tokens', requireAdmin, saveGitHubToken);
router.get('/github-token/status', requireAuth, getGitHubStatus);
router.get('/github-token/test', requireAuth, testGitHubToken);
router.delete('/github-token/tokens', requireAdmin, deleteGitHubToken);

// Product repository routes
router.use('/product-repository', productRepositoryRoutes);

// AI Usage Analytics routes
router.get('/ai-usage/analytics', requireAuth, getAiUsageAnalyticsHandler);
router.post('/public/ai-usage/events', requireIngestToken, ingestAiUsageEvents);
router.post('/ai-usage/otlp/:connectionId/logs', requireProviderConnectionToken, ingestOrganizationOtlpLogs);
router.post('/ai-usage/otlp/:connectionId/metrics', requireProviderConnectionToken, ingestOrganizationOtlpMetrics);
router.post('/ai-usage/commit-attribution/:connectionId', requireProviderConnectionToken, ingestCommitAttribution);
router.post('/ai-usage/manual-entry', requireAdmin, manualUsageEntry);

// AI model catalog (pricing per vendor/model, tenant-scoped) — the "add a
// new provider" surface for anything without a live sync adapter.
router.get('/ai-usage/model-catalog', requireAuth, listModelCatalog);
router.post('/ai-usage/model-catalog', requireAdmin, createModelCatalogEntry);
router.put('/ai-usage/model-catalog/:id', requireAdmin, updateModelCatalogEntry);
router.delete('/ai-usage/model-catalog/:id', requireAdmin, deactivateModelCatalogEntry);

// Admin configuration routes
router.use('/admin', adminRoutes);

// Jira / Azure DevOps integration routes
router.use('/integrations', integrationRoutes);

// Role/scope/delegation administration (PM-only)
router.use('/memberships', membershipRoutes);

export default router;
