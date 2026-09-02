/**
 * Session auth middleware for browser requests (cookie-based). Distinct from
 * ingest-token.middleware.ts, which authenticates machine-to-machine OTLP/event
 * ingestion via a bearer header — a session cookie doesn't make sense there,
 * and a long-lived ingest token doesn't make sense here.
 *
 * Deliberately generic (no AI-usage-specific assumptions) so it's a drop-in
 * for other controllers later — see docs/PARALLEL_WORK_COORDINATION.md for
 * the current scope decision (AI Usage module only, for now) and the
 * `req.user` contract other in-progress work can build against.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedUser {
  id: string;
  tenantId: string | null;
  role: string;
  email: string;
  isActive: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.qm_access_token;
    if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured');

    let payload: jwt.JwtPayload | string;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    // Re-fetched fresh on every request rather than embedded in the token, so
    // deactivating a user or changing their role takes effect immediately
    // instead of waiting out the access token's TTL.
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'Account not found or deactivated' });
    }

    req.user = { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email, isActive: user.isActive };
    next();
  } catch (error) {
    console.error('Error in requireAuth:', error);
    res.status(500).json({ success: false, error: 'Authentication check failed' });
  }
}

/**
 * `role` is free-text (`'pm' | 'po' | 'executive' | 'developer' | 'tester' |
 * 'unassigned'` in practice, not a DB enum) per the same contract requireAuth
 * documents. `pm` is the org-wide super-admin role — connects Jira/Azure
 * DevOps/GitHub/AI tools and manages every product/team in the tenant.
 */
export const requireRole = (...roles: string[]) => [
  requireAuth,
  (req: Request, res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ success: false, error: `Requires role: ${roles.join(' or ')}` }),
];

export const requireAdmin = requireRole('pm');

/**
 * True if `user` may read data for `productId`: the product must belong to
 * their own tenant (checked for every role — `pm`/`executive` are exempt
 * from the finer per-product membership check below, but never from tenant
 * ownership, or a pm/executive from tenant A could read tenant B's product
 * just by knowing its id). Everyone else additionally needs an explicit
 * TenantMembership.accessibleProducts grant.
 */
export async function canAccessProduct(user: AuthenticatedUser, productId: string): Promise<boolean> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { tenantId: true } });
  if (!product || product.tenantId !== user.tenantId) return false;
  if (user.role === 'pm' || user.role === 'executive') return true;

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: user.tenantId ?? '', userId: user.id } },
  });
  return !!membership?.accessibleProducts.includes(productId);
}

/**
 * Route-level wrapper around canAccessProduct. Mount after requireAuth (or
 * requireRole).
 */
export const requireProductScope = (getProductId: (req: Request) => string | undefined) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });

      const productId = getProductId(req);
      if (!productId) return res.status(400).json({ success: false, error: 'Product id required' });

      if (!(await canAccessProduct(req.user, productId))) {
        return res.status(403).json({ success: false, error: 'Not scoped to this product' });
      }
      next();
    } catch (error) {
      console.error('Error in requireProductScope:', error);
      res.status(500).json({ success: false, error: 'Scope check failed' });
    }
  };

export function isPortfolioRole(role?: string): boolean {
  return role === 'pm' || role === 'executive';
}

export class ScopeError extends Error {}

export type ResolvedScope = { productId?: string; tenantId?: string };

/**
 * Pure (no `res` coupling) version of the productId-or-tenant-wide scope rule
 * `AnalyticsController.resolveProductOrTenantScope` enforces at the route
 * layer: an explicit productId is checked via canAccessProduct; omitting it
 * only resolves to a tenant-wide scope for pm/executive — never substitutes
 * another tenant's id. Callers that aren't Express handlers (e.g. the chat
 * assistant's tool dispatcher, which must never trust a model-supplied
 * tenantId) throw/catch ScopeError instead of writing an HTTP response.
 */
export async function resolveProductOrTenantScope(
  user: AuthenticatedUser,
  productId?: string
): Promise<ResolvedScope> {
  if (productId) {
    if (!(await canAccessProduct(user, productId))) {
      throw new ScopeError('Not scoped to this product');
    }
    return { productId };
  }
  if (!isPortfolioRole(user.role)) {
    throw new ScopeError('productId is required for this role');
  }
  if (!user.tenantId) {
    throw new ScopeError('No tenant associated with this account');
  }
  return { tenantId: user.tenantId };
}

const PRODUCT_MAPPING_FIELDS = ['jiraProjectKey', 'jiraProjectId', 'azureDevopsAreaPath'];

/**
 * Gate for PUT /products/:id. `pm` can edit anything. A `po` may edit ONLY
 * if they hold an active IntegrationDelegation for this product AND the
 * request body touches nothing but the Jira/ADO mapping fields — never
 * name/description/settings/etc. This is the concrete enforcement of "PM
 * delegates connection-setup to the PO for their product."
 */
export async function requireProductWriteAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (req.user.role === 'pm') return next();

    const productId = req.params.id;
    const bodyFields = Object.keys(req.body ?? {});
    const onlyMappingFields = bodyFields.length > 0 && bodyFields.every((f) => PRODUCT_MAPPING_FIELDS.includes(f));

    if (req.user.role !== 'po' || !onlyMappingFields) {
      return res.status(403).json({
        success: false,
        error: 'Requires PM, or a PO with a mapping delegation editing only jiraProjectKey/jiraProjectId/azureDevopsAreaPath',
      });
    }

    const delegation = await prisma.integrationDelegation.findFirst({
      where: { productId, granteeId: req.user.id, revokedAt: null },
    });
    if (!delegation) {
      return res.status(403).json({ success: false, error: 'No active mapping delegation for this product' });
    }
    next();
  } catch (error) {
    console.error('Error in requireProductWriteAccess:', error);
    res.status(500).json({ success: false, error: 'Access check failed' });
  }
}
