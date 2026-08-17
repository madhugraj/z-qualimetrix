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
