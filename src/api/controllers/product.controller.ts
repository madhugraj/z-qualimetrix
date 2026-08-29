import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { Prisma } from '@prisma/client';
import { isValidUUID, validationErrorResponse } from '../utils/validators';

/**
 * Product Controller
 * Handles CRUD operations for products/projects
 */
export class ProductController extends BaseController {

  /**
   * Get all products with pagination and filtering
   */
  getAllProducts = this.asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'name', 'asc');
    const tenantId = this.getTenantId(req) || req.user?.tenantId || '';

    // Build where clause
    const where: Prisma.ProductWhereInput = {};
    if (tenantId) {
      where.tenantId = tenantId;
    }

    // po/developer/tester only see the products their TenantMembership scopes
    // them to; pm/executive see everything in the tenant (org-wide by design).
    if (req.user && req.user.role !== 'pm' && req.user.role !== 'executive') {
      const membership = await this.prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: req.user.tenantId ?? '', userId: req.user.id } },
      });
      where.id = { in: membership?.accessibleProducts ?? [] };
    }

    // Add filters
    const filters = this.getFilters(req, ['isActive', 'key']);
    Object.assign(where, filters);

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          tenant: {
            select: { id: true, name: true, slug: true }
          },
          _count: {
            select: {
              workItems: true,
              testCases: true,
              sprints: true
            }
          }
        }
      }),
      this.prisma.product.count({ where })
    ]);

    return this.success(res, {
      products,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get product by ID
   */
  getProductById = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true }
        },
        sprints: {
          where: { status: 'active' },
          orderBy: { startDate: 'desc' },
          take: 3
        },
        _count: {
          select: {
            workItems: true,
            testCases: true,
            manualDeliverables: true
          }
        }
      }
    });

    if (!product) {
      return this.error(res, 'Product not found', 404);
    }

    return this.success(res, product);
  });

  /**
   * Create new product
   */
  createProduct = this.asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, name, key, description, iconUrl, color, jiraProjectKey, jiraProjectId, azureDevopsAreaPath, settings } = req.body;

    // Validate required fields
    const error = this.validateRequired(req.body, ['tenantId', 'name', 'key']);
    if (error) {
      return this.error(res, error, 400);
    }

    try {
      const product = await this.prisma.product.create({
        data: {
          tenantId,
          name,
          key,
          description,
          iconUrl,
          color,
          jiraProjectKey,
          jiraProjectId,
          azureDevopsAreaPath,
          settings: settings || {}
        },
        include: {
          tenant: {
            select: { id: true, name: true, slug: true }
          },
          _count: {
            select: {
              workItems: true,
              testCases: true
            }
          }
        }
      });

      return this.success(res, product, 'Product created successfully', 201);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return this.error(res, 'Product key already exists for this tenant', 409);
      }
      if (error.code === 'P2003') {
        return this.error(res, 'Tenant not found', 404);
      }
      throw error;
    }
  });

  /**
   * Update product
   */
  updateProduct = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const { name, description, iconUrl, color, jiraProjectKey, jiraProjectId, azureDevopsAreaPath, settings, isActive } = req.body;

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(iconUrl && { iconUrl }),
          ...(color && { color }),
          ...(jiraProjectKey !== undefined && { jiraProjectKey }),
          ...(jiraProjectId !== undefined && { jiraProjectId }),
          ...(azureDevopsAreaPath !== undefined && { azureDevopsAreaPath }),
          ...(settings && { settings }),
          ...(isActive !== undefined && { isActive })
        },
        include: {
          tenant: {
            select: { id: true, name: true, slug: true }
          },
          _count: {
            select: {
              workItems: true,
              testCases: true
            }
          }
        }
      });

      return this.success(res, product, 'Product updated successfully');
    } catch (error: any) {
      if (error.code === 'P2025') {
        return this.error(res, 'Product not found', 404);
      }
      throw error;
    }
  });

  /**
   * Delete product
   */
  deleteProduct = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    // Check what will be deleted
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            workItems: true,
            testCases: true,
            manualDeliverables: true,
            sprints: true
          }
        }
      }
    });

    if (!product) {
      return this.error(res, 'Product not found', 404);
    }

    await this.prisma.product.delete({
      where: { id }
    });

    return this.success(res, {
      deletedProduct: product.name,
      affectedRecords: product._count
    }, 'Product deleted successfully');
  });

  /**
   * Get product statistics
   */
  getProductStats = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const product = await this.prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return this.error(res, 'Product not found', 404);
    }

    // Get work item stats
    const [workItemStats, testCaseStats, recentActivity] = await Promise.all([
      this.prisma.workItem.groupBy({
        by: ['type', 'status'],
        _count: { id: true },
        where: { productId: id }
      }),
      this.prisma.testCase.groupBy({
        by: ['status'],
        _count: { id: true },
        where: { productId: id }
      }),
      this.prisma.workItem.findMany({
        where: { productId: id },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
          updatedAt: true
        }
      })
    ]);

    return this.success(res, {
      product: {
        id: product.id,
        name: product.name,
        key: product.key
      },
      workItems: {
        byType: workItemStats.reduce((acc, item) => {
          const type = item.type;
          if (!acc[type]) acc[type] = {};
          acc[type][item.status] = item._count.id;
          return acc;
        }, {} as Record<string, any>)
      },
      testCases: {
        byStatus: testCaseStats.reduce((acc, item) => {
          acc[item.status] = item._count.id;
          return acc;
        }, {} as Record<string, number>)
      },
      recentActivity
    });
  });

  /**
   * Get products by tenant
   */
  getProductsByTenant = this.asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;

    const where: Prisma.ProductWhereInput = { tenantId };
    if (req.user && req.user.role !== 'pm' && req.user.role !== 'executive') {
      const membership = await this.prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: req.user.id } },
      });
      where.id = { in: membership?.accessibleProducts ?? [] };
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        _count: {
          select: {
            workItems: true,
            testCases: true,
            sprints: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return this.success(res, { products, count: products.length });
  });
}

// Export singleton instance
export default new ProductController();
