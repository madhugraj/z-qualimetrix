/**
 * Machine-to-machine auth for AI-usage event ingestion (OTLP export, the
 * public events endpoint) — a bearer header, not a browser session cookie.
 * See auth.middleware.ts for the cookie-based counterpart used by the
 * frontend.
 */

import { Request, Response, NextFunction } from 'express';
import { resolveUserByIngestToken } from '../../lib/ai-usage.server';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ingestUser?: { id: string; tenantId: string };
    }
  }
}

export async function requireIngestToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.header('x-qualimetrix-token');
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing x-qualimetrix-token header' });
    }

    const user = await resolveUserByIngestToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or revoked ingest token' });
    }

    // A tenant-less ingest identity would recreate the exact orphan-data bug
    // this pass is fixing — reject rather than let events land with no tenant.
    if (!user.tenantId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to an organization yet. Contact an administrator.',
      });
    }

    req.ingestUser = { id: user.id, tenantId: user.tenantId };
    next();
  } catch (error) {
    console.error('Error in requireIngestToken:', error);
    res.status(500).json({ success: false, error: 'Ingest authentication check failed' });
  }
}
