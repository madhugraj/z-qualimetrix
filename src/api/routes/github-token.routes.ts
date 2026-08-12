import { Router } from 'express';
import {
  saveGitHubToken,
  getGitHubToken,
  getGitHubStatus,
  validateGitHubToken,
  deleteGitHubToken,
  testGitHubToken
} from '../controllers/github-token.controller';

const router = Router();

// Save/update GitHub token (encrypted in database)
router.post('/tokens', saveGitHubToken);

// Validate a GitHub token before saving
router.post('/validate', validateGitHubToken);

// Get GitHub token (decrypted) - use carefully
router.get('/tokens/:tenantId', getGitHubToken);

// Get GitHub integration status (without exposing token)
router.get('/status/:tenantId', getGitHubStatus);

// Test stored GitHub token
router.get('/test/:tenantId', testGitHubToken);

// Delete GitHub integration
router.delete('/tokens/:tenantId', deleteGitHubToken);

export default router;