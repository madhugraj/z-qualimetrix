import { Router } from 'express';
import membershipController from '../controllers/membership.controller';
import { requireRole } from '../middleware/auth.middleware';

const router = Router();

// Everything here is PM-only: assigning roles/product-scope and
// granting/revoking a PO's per-product integration-mapping delegation.
router.use(requireRole('pm'));

router.get('/', membershipController.getAllMemberships);
router.post('/', membershipController.upsertMembership);
router.get('/delegations', membershipController.listAllDelegations);
router.post('/delegations', membershipController.grantDelegation);
router.delete('/delegations/:id', membershipController.revokeDelegation);
router.get('/products/:productId/delegations', membershipController.listDelegationsForProduct);

export default router;
