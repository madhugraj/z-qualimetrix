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
} from '../controllers/integration.controller';

const router = Router();

router.get('/', listAll);

// Deliberate exception to admin-gating: reached via browser redirect from the
// provider, no custom headers survive the trip. See handleCallback's docstring.
router.get('/:provider/callback', handleCallback);

router.post('/:provider/connect', startConnect);
router.get('/:provider/status', getStatus);
router.get('/:provider/projects', listProjects);
router.put('/:provider/sync-frequency', updateSyncFrequency);
router.post('/:provider/sync', triggerSync);
router.delete('/:provider', disconnect);

export default router;
