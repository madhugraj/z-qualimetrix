import { Router } from 'express';
import { listNotifications, markRead, markAllRead } from '../controllers/notification.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
router.use(requireAuth);

// Every role gets a response — visibility is scoped per-signal inside
// notification.service.ts (team-wide for pm/executive, self-only for
// everyone else), so no route-level role gate applies here.
router.get('/', listNotifications);
router.post('/:id/read', markRead);
router.post('/read-all', markAllRead);

export default router;
