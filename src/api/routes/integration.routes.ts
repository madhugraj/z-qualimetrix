import { Router } from 'express';
import {
  startConnect,
  handleCallback,
  getStatus,
  listAll,
  updateSyncFrequency,
  disconnect,
  triggerSync,
  listProjects,
  connectOpenAi,
  listKeyMappings,
  upsertKeyMapping,
  deleteKeyMapping,
} from '../controllers/integration.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, listAll);

// Deliberate exception to admin-gating: reached via browser redirect from the
// provider, no custom headers (or cookies from a different origin) survive
// the trip. See handleCallback's docstring — it self-authenticates via the
// signed OAuth `state` instead.
router.get('/:provider/callback', handleCallback);

// Pasted-credential connect (OpenAI/Vertex — no OAuth redirect). Registered
// before the /:provider/connect wildcard below, or Express would route
// POST /openai/connect to startConnect instead (which now correctly rejects
// non-OAuth providers, but never falls through to this route — Express
// doesn't retry the next match after a handler responds).
router.post('/openai/connect', requireAdmin, connectOpenAi);
router.get('/:provider/key-mappings', requireAdmin, listKeyMappings);
router.post('/:provider/key-mappings', requireAdmin, upsertKeyMapping);
router.delete('/key-mappings/:id', requireAdmin, deleteKeyMapping);

// Raw OAuth credentials are PM-only — a PO's delegation only ever reaches
// Product.jiraProjectKey/azureDevopsAreaPath (see membership.routes.ts), never
// the tenant-wide Integration record itself.
router.post('/:provider/connect', requireAdmin, startConnect);
router.get('/:provider/status', requireAuth, getStatus);
router.get('/:provider/projects', requireAuth, listProjects);
router.put('/:provider/sync-frequency', requireAdmin, updateSyncFrequency);
router.post('/:provider/sync', requireAdmin, triggerSync);
router.delete('/:provider', requireAdmin, disconnect);

export default router;
