import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { Prisma } from '@prisma/client';
import { isValidUUID, validationErrorResponse } from '../utils/validators';

/**
 * User Controller
 * Handles CRUD operations for users
 */
export class UserController extends BaseController {

  /**
   * Get all users with pagination and filtering
   */
  getAllUsers = this.asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'name', 'asc');
    const tenantId = this.getTenantId(req);

    // Build where clause
    const where: Prisma.UserWhereInput = {};
    if (tenantId) {
      where.tenantId = tenantId;
    }

    // Add filters
    const filters = this.getFilters(req, ['role', 'isActive']);
    Object.assign(where, filters);

    // Add search
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search as string, mode: 'insensitive' } },
        { email: { contains: req.query.search as string, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          tenantId: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          tenant: {
            select: { id: true, name: true, slug: true }
          },
          _count: {
            select: {
              createdWorkItems: true,
              createdTestCases: true,
              createdDeliverables: true
            }
          }
        }
      }),
      this.prisma.user.count({ where })
    ]);

    return this.success(res, {
      users,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get user by ID
   */
  getUserById = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        tenant: {
          select: { id: true, name: true, slug: true }
        },
        tenantMemberships: {
          include: {
            tenant: {
              select: { id: true, name: true, slug: true }
            }
          }
        },
        _count: {
          select: {
            createdWorkItems: true,
            createdTestCases: true,
            createdDeliverables: true,
            refreshTokens: true
          }
        }
      }
    });

    if (!user) {
      return this.error(res, 'User not found', 404);
    }

    return this.success(res, user);
  });

  /**
   * Create new user
   */
  createUser = this.asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, email, name, avatarUrl, role, isActive } = req.body;

    // Validate required fields
    const error = this.validateRequired(req.body, ['email']);
    if (error) {
      return this.error(res, error, 400);
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId,
          email,
          name,
          avatarUrl,
          role: role || 'viewer',
          isActive: isActive !== undefined ? isActive : true
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          createdAt: true,
          tenant: {
            select: { id: true, name: true }
          }
        }
      });

      return this.success(res, user, 'User created successfully', 201);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return this.error(res, 'User with this email already exists', 409);
      }
      if (error.code === 'P2003') {
        return this.error(res, 'Tenant not found', 404);
      }
      throw error;
    }
  });

  /**
   * Update user
   */
  updateUser = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const { email, name, avatarUrl, role, isActive, lastLoginAt } = req.body;

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(email && { email }),
          ...(name !== undefined && { name }),
          ...(avatarUrl && { avatarUrl }),
          ...(role && { role }),
          ...(isActive !== undefined && { isActive }),
          ...(lastLoginAt && { lastLoginAt })
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          updatedAt: true,
          tenant: {
            select: { id: true, name: true }
          }
        }
      });

      return this.success(res, user, 'User updated successfully');
    } catch (error: any) {
      if (error.code === 'P2025') {
        return this.error(res, 'User not found', 404);
      }
      if (error.code === 'P2002') {
        return this.error(res, 'Email already in use', 409);
      }
      throw error;
    }
  });

  /**
   * Delete user
   */
  deleteUser = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            createdWorkItems: true,
            createdTestCases: true,
            createdDeliverables: true
          }
        }
      }
    });

    if (!user) {
      return this.error(res, 'User not found', 404);
    }

    await this.prisma.user.delete({
      where: { id }
    });

    return this.success(res, {
      deletedUser: user.email,
      affectedRecords: user._count
    }, 'User deleted successfully');
  });

  /**
   * Update last login
   */
  updateLastLogin = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { lastLoginAt: new Date() },
        select: {
          id: true,
          email: true,
          name: true,
          lastLoginAt: true
        }
      });

      return this.success(res, user, 'Last login updated successfully');
    } catch (error: any) {
      if (error.code === 'P2025') {
        return this.error(res, 'User not found', 404);
      }
      throw error;
    }
  });

  /**
   * Get user activity
   */
  getUserActivity = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate as string);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate as string);
    }

    const [createdWorkItems, createdTestCases, createdDeliverables] = await Promise.all([
      this.prisma.workItem.findMany({
        where: {
          createdBy: id,
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      this.prisma.testCase.findMany({
        where: {
          createdBy: id,
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      this.prisma.manualDeliverable.findMany({
        where: {
          createdBy: id,
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    return this.success(res, {
      userId: id,
      activity: {
        workItems: createdWorkItems,
        testCases: createdTestCases,
        deliverables: createdDeliverables
      },
      summary: {
        workItemsCount: createdWorkItems.length,
        testCasesCount: createdTestCases.length,
        deliverablesCount: createdDeliverables.length
      }
    });
  });

  /**
   * Get users by tenant
   */
  getUsersByTenant = this.asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;

    // Validate UUID format
    if (!isValidUUID(tenantId)) {
      return validationErrorResponse(res);
    }

    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'name', 'asc');

    // Build where clause
    const where: Prisma.UserWhereInput = { tenantId };

    // Add filters
    const filters = this.getFilters(req, ['role', 'isActive']);
    Object.assign(where, filters);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              createdWorkItems: true,
              createdTestCases: true
            }
          }
        }
      }),
      this.prisma.user.count({ where })
    ]);

    return this.success(res, {
      users,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  });
}

// Export singleton instance
export default new UserController();