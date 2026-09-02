import { Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';
import { paramString as toParamString, queryString as toQueryString } from '../utils/http-params';

/**
 * Base Controller with common CRUD operations
 * Provides standard responses and error handling
 */
export abstract class BaseController {
  protected prisma = prisma;

  /**
   * Success response helper
   */
  protected success(res: Response, data: any, message?: string, statusCode: number = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Error response helper
   */
  protected error(res: Response, message: string, statusCode: number = 500, details?: any) {
    return res.status(statusCode).json({
      success: false,
      error: message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Parse pagination parameters
   */
  protected getPagination(req: Request) {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    return { page, limit, skip };
  }

  /**
   * Parse sort parameters
   */
  protected getSort(req: Request, defaultField: string = 'createdAt', defaultOrder: 'asc' | 'desc' = 'desc') {
    const sortBy = (req.query.sortBy as string) || defaultField;
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

    return { sortBy, sortOrder };
  }

  /**
   * Parse filter parameters. Query values are always strings — coerce the
   * literal "true"/"false" so a field like isActive reaches Prisma as a real
   * boolean instead of failing validation (BoolFilter expects boolean, not
   * the string "true").
   */
  protected getFilters(req: Request, allowedFields: string[]) {
    const filters: any = {};

    for (const field of allowedFields) {
      const raw = req.query[field];
      if (raw === undefined) continue;
      if (raw === 'true') filters[field] = true;
      else if (raw === 'false') filters[field] = false;
      else filters[field] = raw;
    }

    return filters;
  }

  /**
   * Validate required fields
   */
  protected validateRequired(body: any, requiredFields: string[]): string | null {
    const missing = requiredFields.filter(field => !body[field]);

    if (missing.length > 0) {
      return `Missing required fields: ${missing.join(', ')}`;
    }

    return null;
  }

  /**
   * Async handler wrapper to catch errors
   */
  protected asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Get the authenticated caller's own tenant id — always from the session
   * (req.user, populated by requireAuth), never a client-supplied query
   * param or header. Those used to be trusted here directly, which let any
   * signed-in user read (or in a couple of call sites, silently see
   * everyone's data when the param was just omitted) another tenant's rows
   * by passing/omitting ?tenantId=. A caller needing a *different* tenant's
   * data (superadmin views) should use an explicit :tenantId route param
   * checked against requireAdmin, not this helper.
   */
  protected getTenantId(req: Request): string {
    return req.user?.tenantId || '';
  }

  /** A route param (e.g. req.params.id) — see utils/http-params.ts for why this is needed over a plain `req.params.id`. */
  protected paramString(req: Request, key: string): string {
    return toParamString(req.params[key]);
  }

  /** A query param (e.g. req.query.search) — see utils/http-params.ts. */
  protected queryString(req: Request, key: string): string | undefined {
    return toQueryString(req.query[key]);
  }
}