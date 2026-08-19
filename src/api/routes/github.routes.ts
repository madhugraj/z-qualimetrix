import { Router } from 'express';
import {
  getProjectStatus,
  getRepository,
  getRecentCommits,
  getIssues,
  getPullRequests,
  getBranches,
  getWorkflows,
  getTokenStatus,
  clearCache,
  validateToken,
  getUserRepositories,
  getMultiRepoStatus
} from '../controllers/github.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
router.use(requireAuth);

// Static routes must come before dynamic parameterized routes
router.post('/validate-token', validateToken);
router.post('/multi-repo/status', getMultiRepoStatus);
router.get('/user-repositories', getUserRepositories);
router.get('/token-status', getTokenStatus);
router.post('/clear-cache', clearCache);

// Dynamic routes with parameters
router.get('/:owner/:repo/repository', getRepository);
router.get('/:owner/:repo/status', getProjectStatus);
router.get('/:owner/:repo/commits', getRecentCommits);
router.get('/:owner/:repo/issues', getIssues);
router.get('/:owner/:repo/pull-requests', getPullRequests);
router.get('/:owner/:repo/branches', getBranches);
router.get('/:owner/:repo/workflows', getWorkflows);

export default router;