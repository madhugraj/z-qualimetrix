import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { Prisma } from '@prisma/client';
import { isValidUUID, validationErrorResponse } from '../utils/validators';

/**
 * Tenant Controller
 * Handles CRUD operations for tenants (organizations)
 */
export class TenantController extends BaseController {

  /**
   * Get all tenants with pagination and filtering
   */
  getAllTenants = this.asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'name', 'asc');

    // Build where clause for filtering
    const where: Prisma.TenantWhereInput = {};
    const filters = this.getFilters(req, ['subscriptionTier', 'isActive']);

    Object.assign(where, filters);

    // Get tenants and total count
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              products: true,
              users: true,
              tenantMemberships: true
            }
          }
        }
      }),
      this.prisma.tenant.count({ where })
    ]);

    return this.success(res, {
      tenants,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get tenant by ID
   */
  getTenantById = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            key: true,
            isActive: true
          }
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true
          }
        },
        _count: {
          select: {
            products: true,
            users: true,
            workItems: true,
            testCases: true
          }
        }
      }
    });

    if (!tenant) {
      return this.error(res, 'Tenant not found', 404);
    }

    return this.success(res, tenant);
  });

  /**
   * Get tenant by slug
   */
  getTenantBySlug = this.asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: {
        products: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            color: true
          }
        },
        users: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!tenant) {
      return this.error(res, 'Tenant not found', 404);
    }

    return this.success(res, tenant);
  });

  /**
   * Create new tenant
   */
  createTenant = this.asyncHandler(async (req: Request, res: Response) => {
    const { name, slug, domain, logoUrl, subscriptionTier, maxUsers, maxProducts, settings } = req.body;

    // Validate required fields
    const error = this.validateRequired(req.body, ['name', 'slug']);
    if (error) {
      return this.error(res, error, 400);
    }

    try {
      const tenant = await this.prisma.tenant.create({
        data: {
          name,
          slug,
          domain,
          logoUrl,
          subscriptionTier: subscriptionTier || 'starter',
          maxUsers: maxUsers || 10,
          maxProducts: maxProducts || 3,
          settings: settings || {}
        },
        include: {
          _count: {
            select: {
              products: true,
              users: true
            }
          }
        }
      });

      return this.success(res, tenant, 'Tenant created successfully', 201);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return this.error(res, 'A tenant with this slug or domain already exists', 409);
      }
      throw error;
    }
  });

  /**
   * Update tenant
   */
  updateTenant = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, domain, logoUrl, subscriptionTier, maxUsers, maxProducts, settings } = req.body;

    try {
      const tenant = await this.prisma.tenant.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(domain && { domain }),
          ...(logoUrl && { logoUrl }),
          ...(subscriptionTier && { subscriptionTier }),
          ...(maxUsers && { maxUsers }),
          ...(maxProducts && { maxProducts }),
          ...(settings && { settings })
        },
        include: {
          _count: {
            select: {
              products: true,
              users: true
            }
          }
        }
      });

      return this.success(res, tenant, 'Tenant updated successfully');
    } catch (error: any) {
      if (error.code === 'P2025') {
        return this.error(res, 'Tenant not found', 404);
      }
      if (error.code === 'P2002') {
        return this.error(res, 'Domain already in use', 409);
      }
      throw error;
    }
  });

  /**
   * Delete tenant
   */
  deleteTenant = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      // First check what will be deleted
      const tenant = await this.prisma.tenant.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              products: true,
              users: true,
              workItems: true,
              testCases: true
            }
          }
        }
      });

      if (!tenant) {
        return this.error(res, 'Tenant not found', 404);
      }

      // Delete tenant (cascade will handle related records)
      await this.prisma.tenant.delete({
        where: { id }
      });

      return this.success(res, {
        deletedTenant: tenant.name,
        affectedRecords: tenant._count
      }, 'Tenant deleted successfully');
    } catch (error: any) {
      if (error.code === 'P2025') {
        return this.error(res, 'Tenant not found', 404);
      }
      throw error;
    }
  });

  /**
   * Get tenant statistics
   */
  getTenantStats = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            users: true,
            workItems: true,
            testCases: true
          }
        }
      }
    });

    if (!tenant) {
      return this.error(res, 'Tenant not found', 404);
    }

    // Get additional stats
    const [workItemStats, testCaseStats] = await Promise.all([
      this.prisma.workItem.groupBy({
        by: ['status'],
        _count: { id: true },
        where: { tenantId: id }
      }),
      this.prisma.testCase.groupBy({
        by: ['status'],
        _count: { id: true },
        where: { tenantId: id }
      })
    ]);

    return this.success(res, {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug
      },
      counts: tenant._count,
      workItemsByStatus: workItemStats.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
      testCasesByStatus: testCaseStats.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>)
    });
  });
}

// Export singleton instance
export default new TenantController();