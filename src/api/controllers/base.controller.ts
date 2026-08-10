import { Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';

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
   * Parse filter parameters
   */
  protected getFilters(req: Request, allowedFields: string[]) {
    const filters: any = {};

    for (const field of allowedFields) {
      if (req.query[field]) {
        filters[field] = req.query[field];
      }
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
   * Get tenant ID from request (would be from JWT in production)
   */
  protected getTenantId(req: Request): string {
    // For now, use query param or header
    // In production, this would come from JWT token
    return (req.query.tenantId as string) || (req.headers['x-tenant-id'] as string) || '';
  }
}