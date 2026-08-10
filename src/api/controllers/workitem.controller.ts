import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { Prisma } from '@prisma/client';
import { isValidUUID, validationErrorResponse } from '../utils/validators';

/**
 * Work Item Controller
 * Handles CRUD operations for work items (stories, tasks, bugs, etc.)
 */
export class WorkItemController extends BaseController {

  /**
   * Get all work items with pagination and filtering
   */
  getAllWorkItems = this.asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'createdAt', 'desc');
    const tenantId = this.getTenantId(req);

    // Build where clause
    const where: Prisma.WorkItemWhereInput = {};
    if (tenantId) {
      where.tenantId = tenantId;
    }

    // Add filters
    const filters = this.getFilters(req, ['productId', 'type', 'status', 'priority', 'sprintId', 'assigneeId']);
    Object.assign(where, filters);

    // Add search
    if (req.query.search) {
      where.OR = [
        { title: { contains: req.query.search as string, mode: 'insensitive' } },
        { description: { contains: req.query.search as string, mode: 'insensitive' } },
        { externalId: { contains: req.query.search as string, mode: 'insensitive' } }
      ];
    }

    const [workItems, total] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          tenant: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, key: true } },
          sprint: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true, email: true } },
          updater: { select: { id: true, name: true, email: true } }
        }
      }),
      this.prisma.workItem.count({ where })
    ]);

    return this.success(res, {
      workItems,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get work item by ID
   */
  getWorkItemById = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const workItem = await this.prisma.workItem.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        product: {
          select: { id: true, name: true, key: true, color: true }
        },
        sprint: {
          select: { id: true, name: true, status: true, startDate: true, endDate: true }
        },
        creator: { select: { id: true, name: true, email: true } },
        updater: { select: { id: true, name: true, email: true } }
      }
    });

    if (!workItem) {
      return this.error(res, 'Work item not found', 404);
    }

    return this.success(res, workItem);
  });

  /**
   * Create new work item
   */
  createWorkItem = this.asyncHandler(async (req: Request, res: Response) => {
    const {
      tenantId, productId, externalId, type, status, priority,
      title, description, assigneeId, sprintId, storyPoints, createdBy
    } = req.body;

    // Validate required fields
    const error = this.validateRequired(req.body, ['tenantId', 'productId', 'type', 'title', 'createdBy']);
    if (error) {
      return this.error(res, error, 400);
    }

    try {
      const workItem = await this.prisma.workItem.create({
        data: {
          tenantId,
          productId,
          externalId,
          type,
          status: status || 'open',
          priority,
          title,
          description,
          assigneeId,
          sprintId,
          storyPoints,
          createdBy
        },
        include: {
          tenant: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, key: true } },
          sprint: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } }
        }
      });

      return this.success(res, workItem, 'Work item created successfully', 201);
    } catch (error: any) {
      if (error.code === 'P2003') {
        return this.error(res, 'Related entity not found (tenant, product, or user)', 404);
      }
      throw error;
    }
  });

  /**
   * Update work item
   */
  updateWorkItem = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const {
      externalId, status, priority, title, description, assigneeId, sprintId, storyPoints, updatedBy, resolvedAt, closedAt
    } = req.body;

    try {
      const workItem = await this.prisma.workItem.update({
        where: { id },
        data: {
          ...(externalId !== undefined && { externalId }),
          ...(status && { status }),
          ...(priority && { priority }),
          ...(title && { title }),
          ...(description !== undefined && { description }),
          ...(assigneeId !== undefined && { assigneeId }),
          ...(sprintId !== undefined && { sprintId }),
          ...(storyPoints !== undefined && { storyPoints }),
          ...(updatedBy && { updatedBy }),
          ...(resolvedAt && { resolvedAt }),
          ...(closedAt && { closedAt })
        },
        include: {
          tenant: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, key: true } },
          sprint: { select: { id: true, name: true } },
          updater: { select: { id: true, name: true } }
        }
      });

      return this.success(res, workItem, 'Work item updated successfully');
    } catch (error: any) {
      if (error.code === 'P2025') {
        return this.error(res, 'Work item not found', 404);
      }
      throw error;
    }
  });

  /**
   * Delete work item
   */
  deleteWorkItem = this.asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const workItem = await this.prisma.workItem.findUnique({
      where: { id }
    });

    if (!workItem) {
      return this.error(res, 'Work item not found', 404);
    }

    await this.prisma.workItem.delete({
      where: { id }
    });

    return this.success(res, {
      deletedWorkItem: workItem.title
    }, 'Work item deleted successfully');
  });

  /**
   * Get work items by product
   */
  getWorkItemsByProduct = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;

    // Validate UUID format
    if (!isValidUUID(productId)) {
      return validationErrorResponse(res);
    }

    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'createdAt', 'desc');

    // Build where clause
    const where: Prisma.WorkItemWhereInput = { productId };

    // Add filters
    const filters = this.getFilters(req, ['type', 'status', 'priority']);
    Object.assign(where, filters);

    const [workItems, total] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          sprint: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } }
        }
      }),
      this.prisma.workItem.count({ where })
    ]);

    return this.success(res, {
      workItems,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get work items by sprint
   */
  getWorkItemsBySprint = this.asyncHandler(async (req: Request, res: Response) => {
    const { sprintId } = req.params;

    const workItems = await this.prisma.workItem.findMany({
      where: { sprintId },
      include: {
        creator: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, key: true } }
      },
      orderBy: { priority: 'desc', createdAt: 'asc' }
    });

    // Group by type
    const byType = workItems.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    // Group by status
    const byStatus = workItems.reduce((acc, item) => {
      if (!acc[item.status]) acc[item.status] = [];
      acc[item.status].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    return this.success(res, {
      workItems,
      summary: {
        total: workItems.length,
        byType: Object.keys(byType).reduce((acc, type) => {
          acc[type] = byType[type].length;
          return acc;
        }, {} as Record<string, number>),
        byStatus: Object.keys(byStatus).reduce((acc, status) => {
          acc[status] = byStatus[status].length;
          return acc;
        }, {} as Record<string, number>)
      }
    });
  });

  /**
   * Bulk update work item status
   */
  bulkUpdateStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const { workItemIds, status, updatedBy } = req.body;

    const error = this.validateRequired(req.body, ['workItemIds', 'status', 'updatedBy']);
    if (error) {
      return this.error(res, error, 400);
    }

    const result = await this.prisma.workItem.updateMany({
      where: {
        id: { in: workItemIds }
      },
      data: {
        status,
        updatedBy
      }
    });

    return this.success(res, {
      updatedCount: result.count
    }, `Updated ${result.count} work items to ${status}`);
  });
}

// Export singleton instance
export default new WorkItemController();