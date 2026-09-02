import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { isValidUUID, validationErrorResponse } from '../utils/validators';

/**
 * TenantMembership Controller
 * PM-only administration of a user's role, product scope (accessibleProducts),
 * default landing role/product, and per-product integration-mapping
 * delegations to a PO. Everything here is gated `requireRole('pm')` at the
 * route level.
 */
export class MembershipController extends BaseController {

  getAllMemberships = this.asyncHandler(async (req: Request, res: Response) => {
    const tenantId = this.getTenantId(req);
    if (!tenantId) {
      return this.error(res, 'tenantId is required', 400);
    }

    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    return this.success(res, { memberships, count: memberships.length });
  });

  /**
   * Assigns or updates a user's role/scope within the calling PM's tenant.
   * Upsert on the (tenantId, userId) unique constraint — a PM re-assigning an
   * existing member's role/products doesn't need a separate PATCH call.
   */
  upsertMembership = this.asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return this.error(res, 'PM has no tenant', 400);
    }

    const { userId, role, accessibleProducts, defaultRole, defaultProductId } = req.body;
    const error = this.validateRequired(req.body, ['userId', 'role']);
    if (error) {
      return this.error(res, error, 400);
    }
    if (!isValidUUID(userId)) {
      return validationErrorResponse(res, 'Invalid userId');
    }

    const membership = await this.prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        role,
        accessibleProducts: accessibleProducts ?? [],
        defaultRole: defaultRole ?? role,
        defaultProductId: defaultProductId ?? null,
        invitedBy: req.user!.id,
      },
      update: {
        role,
        ...(accessibleProducts !== undefined && { accessibleProducts }),
        ...(defaultRole !== undefined && { defaultRole }),
        ...(defaultProductId !== undefined && { defaultProductId }),
      },
    });

    // Keep User.role in sync — it's what requireRole/requireAdmin actually
    // check on every request; TenantMembership.role is the per-tenant record
    // of that same assignment (a user only ever belongs to one tenant today).
    await this.prisma.user.update({ where: { id: userId }, data: { role } });

    return this.success(res, membership, 'Membership updated', 200);
  });

  /** PM grants a PO the right to edit one product's Jira/ADO mapping. */
  grantDelegation = this.asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return this.error(res, 'PM has no tenant', 400);
    }

    const { productId, granteeId, capability } = req.body;
    const error = this.validateRequired(req.body, ['productId', 'granteeId']);
    if (error) {
      return this.error(res, error, 400);
    }
    if (!isValidUUID(productId) || !isValidUUID(granteeId)) {
      return validationErrorResponse(res);
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.tenantId !== tenantId) {
      return this.error(res, 'Product not found in this tenant', 404);
    }

    const delegation = await this.prisma.integrationDelegation.create({
      data: {
        tenantId,
        productId,
        granteeId,
        grantedBy: req.user!.id,
        capability: capability || 'manage_product_mapping',
      },
    });

    return this.success(res, delegation, 'Delegation granted', 201);
  });

  /** Revokes a delegation without deleting it — keeps the grant/revoke audit trail. */
  revokeDelegation = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.paramString(req, 'id');
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const delegation = await this.prisma.integrationDelegation.findUnique({ where: { id } });
    if (!delegation || delegation.tenantId !== req.user?.tenantId) {
      return this.error(res, 'Delegation not found in this tenant', 404);
    }
    if (delegation.revokedAt) {
      return this.success(res, delegation, 'Already revoked');
    }

    const revoked = await this.prisma.integrationDelegation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return this.success(res, revoked, 'Delegation revoked');
  });

  listDelegationsForProduct = this.asyncHandler(async (req: Request, res: Response) => {
    const productId = this.paramString(req, 'productId');
    if (!isValidUUID(productId)) {
      return validationErrorResponse(res);
    }

    const delegations = await this.prisma.integrationDelegation.findMany({
      where: { productId, tenantId: req.user?.tenantId, revokedAt: null },
      include: { grantee: { select: { id: true, email: true, name: true } } },
    });

    return this.success(res, { delegations, count: delegations.length });
  });

  /** Every active delegation in the tenant, for the team-management screen's single table. */
  listAllDelegations = this.asyncHandler(async (req: Request, res: Response) => {
    const delegations = await this.prisma.integrationDelegation.findMany({
      where: { tenantId: req.user?.tenantId, revokedAt: null },
      include: {
        product: { select: { id: true, name: true } },
        grantee: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.success(res, { delegations, count: delegations.length });
  });
}

export default new MembershipController();
