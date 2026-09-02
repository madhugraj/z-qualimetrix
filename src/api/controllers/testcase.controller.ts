import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { Prisma } from '@prisma/client';
import { isValidUUID, validationErrorResponse } from '../utils/validators';

/**
 * Test Case Controller
 * Handles CRUD operations for test cases
 */
export class TestCaseController extends BaseController {

  /**
   * Get all test cases with pagination and filtering
   */
  getAllTestCases = this.asyncHandler(async (req: Request, res: Response) => {
    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'name', 'asc');
    const tenantId = this.getTenantId(req);
    if (!tenantId) {
      return this.error(res, 'No tenant associated with this account', 403);
    }

    // Build where clause
    const where: Prisma.TestCaseWhereInput = { tenantId };

    // Add filters
    const filters = this.getFilters(req, ['productId', 'type', 'status', 'priority', 'automationStatus']);
    Object.assign(where, filters);

    // Add search
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search as string, mode: 'insensitive' } },
        { description: { contains: req.query.search as string, mode: 'insensitive' } },
        { externalId: { contains: req.query.search as string, mode: 'insensitive' } }
      ];
    }

    const [testCases, total] = await Promise.all([
      this.prisma.testCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          tenant: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, key: true } },
          creator: { select: { id: true, name: true, email: true } },
          updater: { select: { id: true, name: true, email: true } },
          _count: {
            select: { executions: true }
          }
        }
      }),
      this.prisma.testCase.count({ where })
    ]);

    return this.success(res, {
      testCases,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get test case by ID with executions
   */
  getTestCaseById = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.paramString(req, 'id');

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const testCase = await this.prisma.testCase.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        product: {
          select: { id: true, name: true, key: true, color: true }
        },
        creator: { select: { id: true, name: true, email: true } },
        updater: { select: { id: true, name: true, email: true } },
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 10
        }
      }
    });

    if (!testCase) {
      return this.error(res, 'Test case not found', 404);
    }

    // Calculate execution statistics
    const executionStats = testCase.executions.reduce((stats, execution) => {
      stats.total++;

      switch (execution.status) {
        case 'passed':
          stats.passed++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'skipped':
          stats.skipped++;
          break;
        case 'blocked':
          stats.blocked++;
          break;
      }

      return stats;
    }, { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0 });

    const passRate = executionStats.total > 0
      ? (executionStats.passed / executionStats.total * 100).toFixed(1)
      : '0.0';

    return this.success(res, {
      ...testCase,
      executionStats,
      passRate
    });
  });

  /**
   * Create new test case
   */
  createTestCase = this.asyncHandler(async (req: Request, res: Response) => {
    const {
      tenantId, productId, externalId, name, description, type, status, priority, automationStatus, createdBy
    } = req.body;

    // Validate required fields
    const error = this.validateRequired(req.body, ['tenantId', 'productId', 'name', 'createdBy']);
    if (error) {
      return this.error(res, error, 400);
    }

    try {
      const testCase = await this.prisma.testCase.create({
        data: {
          tenantId,
          productId,
          externalId,
          name,
          description,
          type: type || 'functional',
          status: status || 'draft',
          priority,
          automationStatus,
          createdBy
        },
        include: {
          tenant: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, key: true } },
          creator: { select: { id: true, name: true } }
        }
      });

      return this.success(res, testCase, 'Test case created successfully', 201);
    } catch (error: any) {
      if (error.code === 'P2003') {
        return this.error(res, 'Related entity not found (tenant, product, or user)', 404);
      }
      throw error;
    }
  });

  /**
   * Update test case
   */
  updateTestCase = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.paramString(req, 'id');

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const {
      externalId, name, description, type, status, priority, automationStatus, updatedBy
    } = req.body;

    try {
      const testCase = await this.prisma.testCase.update({
        where: { id },
        data: {
          ...(externalId !== undefined && { externalId }),
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(type && { type }),
          ...(status && { status }),
          ...(priority && { priority }),
          ...(automationStatus && { automationStatus }),
          ...(updatedBy && { updatedBy })
        },
        include: {
          tenant: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, key: true } },
          updater: { select: { id: true, name: true } },
          _count: {
            select: { executions: true }
          }
        }
      });

      return this.success(res, testCase, 'Test case updated successfully');
    } catch (error: any) {
      if (error.code === 'P2025') {
        return this.error(res, 'Test case not found', 404);
      }
      throw error;
    }
  });

  /**
   * Delete test case
   */
  deleteTestCase = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.paramString(req, 'id');

    // Validate UUID format
    if (!isValidUUID(id)) {
      return validationErrorResponse(res);
    }

    const testCase = await this.prisma.testCase.findUnique({
      where: { id },
      include: {
        _count: {
          select: { executions: true }
        }
      }
    });

    if (!testCase) {
      return this.error(res, 'Test case not found', 404);
    }

    await this.prisma.testCase.delete({
      where: { id }
    });

    return this.success(res, {
      deletedTestCase: testCase.name,
      executionsDeleted: testCase._count.executions
    }, 'Test case deleted successfully');
  });

  /**
   * Create test execution
   */
  createTestExecution = this.asyncHandler(async (req: Request, res: Response) => {
    const { testCaseId, status, executedBy, notes, duration, buildUrl } = req.body;

    // Validate required fields
    const error = this.validateRequired(req.body, ['testCaseId', 'status', 'executedBy']);
    if (error) {
      return this.error(res, error, 400);
    }

    try {
      const execution = await this.prisma.testExecution.create({
        data: {
          testCaseId,
          status,
          executedBy,
          notes,
          duration,
          buildUrl
        },
        include: {
          testCase: {
            select: { id: true, name: true, externalId: true }
          }
        }
      });

      return this.success(res, execution, 'Test execution created successfully', 201);
    } catch (error: any) {
      if (error.code === 'P2003') {
        return this.error(res, 'Test case not found', 404);
      }
      throw error;
    }
  });

  /**
   * Get test executions for a test case
   */
  getTestExecutions = this.asyncHandler(async (req: Request, res: Response) => {
    const testCaseId = this.paramString(req, 'testCaseId');

    // Validate UUID format
    if (!isValidUUID(testCaseId)) {
      return validationErrorResponse(res);
    }

    const { skip, limit } = this.getPagination(req);

    const [executions, total] = await Promise.all([
      this.prisma.testExecution.findMany({
        where: { testCaseId },
        skip,
        take: limit,
        orderBy: { executedAt: 'desc' }
      }),
      this.prisma.testExecution.count({ where: { testCaseId } })
    ]);

    // Calculate statistics
    const stats = executions.reduce((acc, execution) => {
      acc.total++;
      switch (execution.status) {
        case 'passed': acc.passed++; break;
        case 'failed': acc.failed++; break;
        case 'skipped': acc.skipped++; break;
        case 'blocked': acc.blocked++; break;
      }
      return acc;
    }, { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0 });

    return this.success(res, {
      executions,
      stats,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get test cases by product
   */
  getTestCasesByProduct = this.asyncHandler(async (req: Request, res: Response) => {
    const productId = this.paramString(req, 'productId');

    // Validate UUID format
    if (!isValidUUID(productId)) {
      return validationErrorResponse(res);
    }

    const { skip, limit } = this.getPagination(req);
    const { sortBy, sortOrder } = this.getSort(req, 'name', 'asc');

    // Build where clause
    const where: Prisma.TestCaseWhereInput = { productId };

    // Add filters
    const filters = this.getFilters(req, ['type', 'status', 'automationStatus']);
    Object.assign(where, filters);

    const [testCases, total] = await Promise.all([
      this.prisma.testCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { executions: true }
          }
        }
      }),
      this.prisma.testCase.count({ where })
    ]);

    // Add execution data to each test case
    const testCasesWithStats = await Promise.all(
      testCases.map(async (testCase) => {
        const executions = await this.prisma.testExecution.findMany({
          where: { testCaseId: testCase.id }
        });

        const latestExecution = executions[0];
        const executionStats = executions.reduce((stats, execution) => {
          stats.total++;
          switch (execution.status) {
            case 'passed': stats.passed++; break;
            case 'failed': stats.failed++; break;
            case 'skipped': stats.skipped++; break;
            case 'blocked': stats.blocked++; break;
          }
          return stats;
        }, { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0 });

        return {
          ...testCase,
          latestExecution,
          executionStats
        };
      })
    );

    return this.success(res, {
      testCases: testCasesWithStats,
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
export default new TestCaseController();