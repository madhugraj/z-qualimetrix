import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { Prisma } from '@prisma/client';
import { isValidUUID, validationErrorResponse } from '../utils/validators';
import { canAccessProduct } from '../middleware/auth.middleware';
import { adfToPlainText } from '../utils/adf-to-text';

/**
 * Work Item Controller
 * Handles CRUD operations for work items (stories, tasks, bugs, etc.)
 */
export class WorkItemController extends BaseController {

  private isPortfolioRole(role?: string): boolean {
    return role === 'pm' || role === 'executive';
  }

  /**
   * Resolves the scope for the optional-productId work-item list endpoint —
   * same shape as analytics.controller.ts's resolveProductOrTenantScope.
   * A given productId is checked against the caller's real access; an
   * omitted one only falls back to a tenant-wide scope for pm/executive
   * (everyone else must pick a specific product), and the tenant is always
   * the caller's own — never a client-supplied query param/header, which is
   * exactly the trust bug this replaces (see getTenantId's doc comment).
   */
  private async resolveWorkItemScope(
    req: Request,
    res: Response
  ): Promise<{ productId?: string; tenantId?: string } | null> {
    const productId = req.query.productId as string | undefined;

    if (productId) {
      if (!req.user || !(await canAccessProduct(req.user, productId))) {
        this.error(res, 'Not scoped to this product', 403);
        return null;
      }
      return { productId };
    }

    if (!this.isPortfolioRole(req.user?.role)) {
      this.error(res, 'productId is required for this role', 400);
      return null;
    }

    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      this.error(res, 'No tenant associated with this account', 403);
      return null;
    }
    return { tenantId };
  }

  /**
   * Get all work items with pagination and filtering
   */
  getAllWorkItems = this.asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'createdAt', 'desc');

    const scope = await this.resolveWorkItemScope(req, res);
    if (!scope) return;

    // Build where clause
    const where: Prisma.WorkItemWhereInput = {};
    if (scope.productId) where.productId = scope.productId;
    else if (scope.tenantId) where.tenantId = scope.tenantId;

    // Add filters (productId already resolved above via resolveWorkItemScope)
    const filters = this.getFilters(req, ['type', 'priority', 'sprintId', 'assigneeId', 'parentId', 'externalAssigneeId']);
    Object.assign(where, filters);

    // getFilters only does plain equality, which can't express "no epic at
    // all" — the literal value "none" is a client-side convention for that,
    // not a real id, so it needs translating to an actual null check.
    if (req.query.parentId === 'none') {
      where.parentId = null;
    }

    // Same convention as parentId=none above — "unassigned" isn't a real
    // Jira accountId/ADO identity id, it's a client-side stand-in for null.
    if (req.query.externalAssigneeId === 'unassigned') {
      where.externalAssigneeId = null;
    }

    // Labels use Prisma's array-contains-any, not the plain-equality
    // semantics getFilters provides, so they're handled separately.
    const labelsParam = req.query.labels as string | undefined;
    const labels = labelsParam?.split(',').map((l) => l.trim()).filter(Boolean);
    if (labels?.length) {
      where.labels = { hasSome: labels };
    }

    // status supports a comma-separated list (e.g. "open,in_progress" for a
    // backlog view) as well as a single value — getFilters only does exact
    // equality, so this needs the same special-casing as labels above.
    const statusParam = req.query.status as string | undefined;
    const statuses = statusParam?.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses?.length) {
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }

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
          updater: { select: { id: true, name: true, email: true } },
          parent: { select: { id: true, title: true, externalId: true, type: true } }
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
    const id = this.paramString(req, 'id');

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
        updater: { select: { id: true, name: true, email: true } },
        parent: { select: { id: true, title: true, externalId: true, type: true } }
      }
    });

    if (!workItem) {
      return this.error(res, 'Work item not found', 404);
    }

    // 404, not 403 — a cross-tenant/cross-product lookup shouldn't reveal
    // that the id exists at all. canAccessProduct already re-derives the
    // product's real tenantId internally, so this one call covers both the
    // tenant-ownership check and the per-product membership check.
    if (!req.user || !(await canAccessProduct(req.user, workItem.productId))) {
      return this.error(res, 'Work item not found', 404);
    }

    const jiraIntegration = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId: workItem.tenantId, provider: 'jira' } },
      select: { externalMetadata: true }
    });
    const jiraSiteUrl = (jiraIntegration?.externalMetadata as any)?.siteUrl ?? null;

    return this.success(res, {
      ...workItem,
      descriptionText: adfToPlainText(workItem.description),
      jiraSiteUrl
    });
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
    const id = this.paramString(req, 'id');

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
    const id = this.paramString(req, 'id');

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
    const productId = this.paramString(req, 'productId');

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
    const sprintId = this.paramString(req, 'sprintId');

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