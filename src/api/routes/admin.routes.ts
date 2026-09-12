import { Router } from 'express';
import {
  setupOrganization,
  bulkImportUsers,
  configureTeams,
  getConfigurationStatus,
  updateBudgetConfiguration
} from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// One-time organization setup — deliberately unauthenticated: this is what
// creates the tenant and its first PM, so no session can exist yet.
router.post('/setup-organization', setupOrganization);

// Everything below manages an existing org and is PM-only.
router.post('/users/bulk-import', requireAdmin, bulkImportUsers);
router.post('/teams', requireAdmin, configureTeams);
router.get('/configuration-status', requireAdmin, getConfigurationStatus);
router.put('/budget-configuration', requireAdmin, updateBudgetConfiguration);

export default router;