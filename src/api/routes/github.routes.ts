import { Router } from 'express';
import {
  getProjectStatus,
  getRepository,
  getRecentCommits,
  getCommitAttribution,
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
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

const router = Router();
router.use(requireAuth);

// Static routes must come before dynamic parameterized routes
// requireAdmin (not just requireAuth): this hits GitHub's API with an
// arbitrary caller-supplied token and no longer mutates any shared state
// (see github.controller.ts), but there's still no reason a non-admin
// tenant member should be able to probe it.
router.post('/validate-token', requireAdmin, validateToken);
router.post('/multi-repo/status', getMultiRepoStatus);
// Full list of repos in the org's connected GitHub account — integration
// setup detail (used to pick which repo to map to a product), only ever
// called from the PM-gated integrations.tsx UI. requireAdmin closes that
// gap rather than changing any real behavior.
router.get('/user-repositories', requireAdmin, getUserRepositories);
router.get('/token-status', requireAdmin, getTokenStatus);
router.post('/clear-cache', clearCache);

// Dynamic routes with parameters
router.get('/:owner/:repo/repository', getRepository);
router.get('/:owner/:repo/status', getProjectStatus);
router.get('/:owner/:repo/commits', getRecentCommits);
router.get('/:owner/:repo/commit-attribution', getCommitAttribution);
router.get('/:owner/:repo/issues', getIssues);
router.get('/:owner/:repo/pull-requests', getPullRequests);
router.get('/:owner/:repo/branches', getBranches);
router.get('/:owner/:repo/workflows', getWorkflows);

export default router;