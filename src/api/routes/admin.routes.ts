import { Router } from 'express';
import {
  setupOrganization,
  bulkImportUsers,
  configureTeams,
  getConfigurationStatus,
  updateBudgetConfiguration
} from '../controllers/admin.controller';

const router = Router();

// One-time organization setup
router.post('/setup-organization', setupOrganization);

// Bulk user import
router.post('/users/bulk-import', bulkImportUsers);

// Team configuration
router.post('/teams', configureTeams);

// Get configuration status
router.get('/configuration-status', getConfigurationStatus);

// Update budget configuration
router.put('/budget-configuration', updateBudgetConfiguration);

export default router;