import { PrismaClient } from '@prisma/client';

/**
 * Analytics Engine Service
 * Calculates quality metrics, KPIs, and performance indicators
 */
export class AnalyticsService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient = new PrismaClient()) {
    this.prisma = prisma;
  }

  /**
   * Calculate Mean Time To Resolve (MTTR) for bugs
   * MTTR = Total time to resolve bugs / Number of resolved bugs
   */
  async calculateMTTR(productId?: string, startDate?: Date, endDate?: Date, tenantId?: string): Promise<{
    overall: number;
    byPriority: Record<string, number>;
    bySprint: Record<string, number>;
    trend: Array<{ period: string; mttr: number }>;
  }> {
    const where: any = {
      type: 'bug',
      status: 'resolved',
      resolvedAt: { not: null }
    };

    if (productId) where.productId = productId;
    else if (tenantId) where.tenantId = tenantId;
    if (startDate) where.createdAt = { ...where.createdAt, gte: startDate };
    if (endDate) where.createdAt = { ...where.createdAt, lte: endDate };

    const [resolvedBugs, trend] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        select: {
          id: true,
          priority: true,
          sprintId: true,
          createdAt: true,
          resolvedAt: true,
          product: { select: { id: true, name: true } }
        }
      }),
      this.calculateMttrTrend(productId, tenantId, startDate, endDate)
    ]);

    if (resolvedBugs.length === 0) {
      return {
        overall: 0,
        byPriority: {},
        bySprint: {},
        trend
      };
    }

    // Calculate MTTR in hours
    const resolutionTimes = resolvedBugs.map(bug => {
      if (!bug.resolvedAt) return 0;
      const created = new Date(bug.createdAt).getTime();
      const resolved = new Date(bug.resolvedAt).getTime();
      return (resolved - created) / (1000 * 60 * 60); // Convert to hours
    });

    const overall = resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;

    // Calculate by priority
    const byPriority: Record<string, number> = {};
    const bySprint: Record<string, number> = {};

    for (let i = 0; i < resolvedBugs.length; i++) {
      const bug = resolvedBugs[i];
      const resolutionTime = resolutionTimes[i];

      // By priority
      if (!byPriority[bug.priority]) {
        byPriority[bug.priority] = { total: 0, count: 0 };
      }
      byPriority[bug.priority].total += resolutionTime;
      byPriority[bug.priority].count += 1;

      // By sprint
      if (bug.sprintId) {
        if (!bySprint[bug.sprintId]) {
          bySprint[bug.sprintId] = { total: 0, count: 0 };
        }
        bySprint[bug.sprintId].total += resolutionTime;
        bySprint[bug.sprintId].count += 1;
      }
    }

    // Calculate averages
    const byPriorityAvg: Record<string, number> = {};
    const bySprintAvg: Record<string, number> = {};

    for (const key in byPriority) {
      byPriorityAvg[key] = byPriority[key].total / byPriority[key].count;
    }

    for (const key in bySprint) {
      bySprintAvg[key] = bySprint[key].total / bySprint[key].count;
    }

    return {
      overall: Math.round(overall * 10) / 10, // Round to 1 decimal
      byPriority: byPriorityAvg,
      bySprint: bySprintAvg,
      trend
    };
  }

  /**
   * MTTR trend over the most recent sprints — mirrors calculateDefectLeakageTrend's shape.
   */
  private async calculateMttrTrend(productId?: string, tenantId?: string, startDate?: Date, endDate?: Date): Promise<Array<{ period: string; mttr: number }>> {
    const sprints = await this.getRecentSprints({ productId, tenantId, startDate, endDate });

    const trend = [];

    for (const sprint of sprints) {
      const resolvedBugs = await this.prisma.workItem.findMany({
        where: { sprintId: sprint.id, type: 'bug', status: 'resolved', resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true }
      });

      const times = resolvedBugs
        .filter((bug) => bug.resolvedAt)
        .map((bug) => (new Date(bug.resolvedAt!).getTime() - new Date(bug.createdAt).getTime()) / (1000 * 60 * 60));

      const avg = times.length > 0 ? times.reduce((sum, t) => sum + t, 0) / times.length : 0;
      trend.push({ period: sprint.name, mttr: Math.round(avg * 10) / 10 });
    }

    return trend.reverse(); // Return in chronological order
  }

  /**
   * Calculate defect leakage rate
   * Defect Leakage = Bugs found in production / Total bugs
   */
  async calculateDefectLeakage(productId?: string, startDate?: Date, endDate?: Date, tenantId?: string): Promise<{
    rate: number;
    totalBugs: number;
    productionBugs: number;
    trend: Array<{ period: string; rate: number }>;
  }> {
    const where: any = { type: 'bug' };

    if (productId) where.productId = productId;
    else if (tenantId) where.tenantId = tenantId;
    if (startDate) where.createdAt = { ...where.createdAt, gte: startDate };
    if (endDate) where.createdAt = { ...where.createdAt, lte: endDate };

    const [allBugs, productionBugs] = await Promise.all([
      this.prisma.workItem.count({
        where
      }),
      this.prisma.workItem.count({
        where: {
          ...where,
          // For production bugs, we'll use priority and external ID patterns
          // In real implementation, you'd have explicit production vs staging indicators
          priority: { in: ['critical', 'high'] } // High-priority bugs as proxy for production issues
        }
      })
    ]);

    const rate = allBugs > 0 ? (productionBugs / allBugs) * 100 : 0;

    // Calculate trend over time (last 6 sprints)
    const trend = await this.calculateDefectLeakageTrend(productId, startDate, endDate, tenantId);

    return {
      rate: Math.round(rate * 10) / 10,
      totalBugs: allBugs,
      productionBugs,
      trend
    };
  }

  /**
   * Most recent sprints for a product (or, absent that, a whole tenant) —
   * shared by every per-sprint trend below so they line up on the same set
   * of sprints instead of each re-deriving it slightly differently.
   */
  private async getRecentSprints(params: {
    productId?: string;
    tenantId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    const { productId, tenantId, startDate, endDate, limit = 6 } = params;
    return this.prisma.sprint.findMany({
      where: {
        ...(productId ? { productId } : tenantId ? { tenantId } : {}),
        ...(startDate && { startDate: { gte: startDate } }),
        ...(endDate && { endDate: { lte: endDate } })
      },
      orderBy: { startDate: 'desc' },
      take: limit
    });
  }

  /**
   * Calculate defect leakage trend over time
   */
  private async calculateDefectLeakageTrend(productId?: string, startDate?: Date, endDate?: Date, tenantId?: string): Promise<Array<{ period: string; rate: number }>> {
    const sprints = await this.getRecentSprints({ productId, tenantId, startDate, endDate });

    const trend = [];

    for (const sprint of sprints) {
      const [totalBugs, prodBugs] = await Promise.all([
        this.prisma.workItem.count({
          where: {
            sprintId: sprint.id,
            type: 'bug'
          }
        }),
        this.prisma.workItem.count({
          where: {
            sprintId: sprint.id,
            type: 'bug',
            priority: { in: ['critical', 'high'] }
          }
        })
      ]);

      const rate = totalBugs > 0 ? (prodBugs / totalBugs) * 100 : 0;
      trend.push({
        period: sprint.name,
        rate: Math.round(rate * 10) / 10
      });
    }

    return trend.reverse(); // Return in chronological order
  }

  /**
   * Calculate test execution metrics
   */
  async calculateTestExecutionMetrics(productId?: string, startDate?: Date, endDate?: Date, tenantId?: string): Promise<{
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    passRate: number;
    automationRate: number;
    executionTrend: Array<{ period: string; passRate: number }>;
  }> {
    const where: any = {};

    if (productId) {
      where.testCase = { productId };
    } else if (tenantId) {
      where.testCase = { tenantId };
    }

    if (startDate || endDate) {
      where.executedAt = {};
      if (startDate) where.executedAt.gte = startDate;
      if (endDate) where.executedAt.lte = endDate;
    }

    const executions = await this.prisma.testExecution.findMany({
      where,
      include: {
        testCase: {
          select: {
            automationStatus: true,
            product: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    const metrics = {
      total: executions.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      passRate: 0,
      automationRate: 0,
      executionTrend: [] as Array<{ period: string; passRate: number }>
    };

    // Calculate basic metrics
    for (const execution of executions) {
      switch (execution.status) {
        case 'passed': metrics.passed++; break;
        case 'failed': metrics.failed++; break;
        case 'skipped': metrics.skipped++; break;
        case 'blocked': metrics.blocked++; break;
      }
    }

    metrics.passRate = metrics.total > 0 ? (metrics.passed / metrics.total) * 100 : 0;
    metrics.automationRate = executions.length > 0
      ? (executions.filter(e => e.testCase.automationStatus === 'automated').length / executions.length) * 100
      : 0;

    // Calculate trend by grouping executions by date
    const executionsByDate = executions.reduce((acc, execution) => {
      const date = new Date(execution.executedAt).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = { total: 0, passed: 0 };
      acc[date].total++;
      if (execution.status === 'passed') acc[date].passed++;
      return acc;
    }, {} as Record<string, { total: number; passed: number }>);

    metrics.executionTrend = Object.entries(executionsByDate)
      .map(([date, stats]) => ({
        period: date,
        passRate: stats.total > 0 ? (stats.passed / stats.total) * 100 : 0
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      ...metrics,
      passRate: Math.round(metrics.passRate * 10) / 10,
      automationRate: Math.round(metrics.automationRate * 10) / 10
    };
  }

  /**
   * Velocity (completed story points) plus bugs created/resolved, per sprint,
   * for the most recent sprints — backs the velocity chart, which otherwise
   * has no trend source (calculateTeamProductivity.teamVelocity is a single
   * snapshot, not a series).
   */
  async calculateVelocityTrend(productId: string, limit: number = 6): Promise<Array<{
    period: string;
    velocity: number;
    created: number;
    resolved: number;
  }>> {
    const sprints = await this.getRecentSprints({ productId, limit });

    const trend = [];

    for (const sprint of sprints) {
      const [completedItems, created, resolved] = await Promise.all([
        this.prisma.workItem.findMany({
          where: { sprintId: sprint.id, status: 'completed', storyPoints: { not: null } },
          select: { storyPoints: true }
        }),
        this.prisma.workItem.count({ where: { sprintId: sprint.id, type: 'bug' } }),
        this.prisma.workItem.count({ where: { sprintId: sprint.id, type: 'bug', status: 'resolved' } })
      ]);

      const velocity = completedItems.reduce((sum, item) => sum + (item.storyPoints || 0), 0);
      trend.push({ period: sprint.name, velocity, created, resolved });
    }

    return trend.reverse(); // Return in chronological order
  }

  /**
   * Calculate release readiness score
   * Based on test coverage, open bugs, and recent test results
   */
  async calculateReleaseReadiness(productId: string): Promise<{
    overallScore: number;
    components: {
      testCoverage: number;
      bugHealth: number;
      recentTestResults: number;
      automationCoverage: number;
    };
    recommendation: string;
    risks: string[];
  }> {
    // Get product work items and test cases
    const [openBugs, totalBugs, testCases, recentExecutions] = await Promise.all([
      this.prisma.workItem.count({
        where: {
          productId,
          type: 'bug',
          status: { in: ['open', 'in_progress'] },
          priority: { in: ['critical', 'high'] }
        }
      }),
      this.prisma.workItem.count({
        where: { productId, type: 'bug' }
      }),
      this.prisma.testCase.count({
        where: { productId, status: 'active' }
      }),
      this.prisma.testExecution.findMany({
        where: {
          testCase: { productId },
          executedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
        },
        include: { testCase: { select: { automationStatus: true } } }
      })
    ]);

    // Calculate components
    const testCoverage = 100; // Would be calculated based on requirements coverage
    const bugHealth = totalBugs > 0 ? ((totalBugs - openBugs) / totalBugs) * 100 : 100;
    const recentTestResults = recentExecutions.length > 0
      ? (recentExecutions.filter(e => e.status === 'passed').length / recentExecutions.length) * 100
      : 0;
    const automationCoverage = testCases > 0
      ? (recentExecutions.filter(e => e.testCase.automationStatus === 'automated').length / testCases) * 100
      : 0;

    // Calculate overall score (weighted average)
    const overallScore = (
      testCoverage * 0.25 +
      bugHealth * 0.35 +
      recentTestResults * 0.25 +
      automationCoverage * 0.15
    );

    // Determine recommendation and risks
    const risks: string[] = [];
    let recommendation = '';

    if (overallScore >= 80) {
      recommendation = 'Ready for release';
    } else if (overallScore >= 60) {
      recommendation = 'Proceed with caution';
      if (openBugs > 0) risks.push(`${openBugs} high-priority bugs still open`);
    } else {
      recommendation = 'Not ready for release';
      if (openBugs > 0) risks.push(`${openBugs} high-priority bugs still open`);
      if (recentTestResults < 70) risks.push('Recent test pass rate below 70%');
      if (automationCoverage < 30) risks.push('Low automation coverage');
    }

    if (testCases < 10) risks.push('Limited test coverage');

    return {
      overallScore: Math.round(overallScore),
      components: {
        testCoverage: Math.round(testCoverage),
        bugHealth: Math.round(bugHealth),
        recentTestResults: Math.round(recentTestResults),
        automationCoverage: Math.round(automationCoverage)
      },
      recommendation,
      risks
    };
  }

  /**
   * Calculate team productivity metrics
   */
  async calculateTeamProductivity(tenantId: string, startDate?: Date, endDate?: Date): Promise<{
    totalWorkItems: number;
    completedWorkItems: number;
    totalTestCases: number;
    totalDeliverables: number;
    teamVelocity: number;
    topContributors: Array<{ userId: string; name: string; contributions: number }>;
  }> {
    const where: any = { tenantId };

    if (startDate) where.createdAt = { ...where.createdAt, gte: startDate };
    if (endDate) where.createdAt = { ...where.createdAt, lte: endDate };

    const [workItems, totalWorkItemsCount, testCases, deliverables] = await Promise.all([
      this.prisma.workItem.findMany({
        where: { ...where, status: 'completed' },
        include: { creator: { select: { id: true, name: true } } }
      }),
      this.prisma.workItem.count({ where }),
      this.prisma.testCase.findMany({
        where,
        include: { creator: { select: { id: true, name: true } } }
      }),
      this.prisma.manualDeliverable.findMany({
        where,
        include: { creator: { select: { id: true, name: true } } }
      })
    ]);

    // Calculate contributions by user
    const contributions: Record<string, { userId: string; name: string; count: number }> = {};

    for (const item of [...workItems, ...testCases, ...deliverables]) {
      const userId = item.creator.id;
      if (!contributions[userId]) {
        contributions[userId] = {
          userId,
          name: item.creator.name || 'Unknown',
          count: 0
        };
      }
      contributions[userId].count++;
    }

    const topContributors = Object.values(contributions)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(({ userId, name, count }) => ({ userId, name, contributions: count }));

    // Calculate team velocity (story points completed)
    const completedItems = await this.prisma.workItem.findMany({
      where: { ...where, status: 'completed', storyPoints: { not: null } }
    });

    const teamVelocity = completedItems.reduce((sum, item) => sum + (item.storyPoints || 0), 0);

    return {
      totalWorkItems: totalWorkItemsCount,
      completedWorkItems: workItems.length,
      totalTestCases: testCases.length,
      totalDeliverables: deliverables.length,
      teamVelocity,
      topContributors
    };
  }

  /**
   * Get comprehensive product analytics
   */
  async getProductAnalytics(productId: string, startDate?: Date, endDate?: Date): Promise<{
    product: { id: string; name: string; key: string };
    mttr: Awaited<ReturnType<typeof this.calculateMTTR>>;
    defectLeakage: Awaited<ReturnType<typeof this.calculateDefectLeakage>>;
    testMetrics: Awaited<ReturnType<typeof this.calculateTestExecutionMetrics>>;
    releaseReadiness: Awaited<ReturnType<typeof this.calculateReleaseReadiness>>;
  }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, key: true }
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const [mttr, defectLeakage, testMetrics, releaseReadiness] = await Promise.all([
      this.calculateMTTR(productId, startDate, endDate),
      this.calculateDefectLeakage(productId, startDate, endDate),
      this.calculateTestExecutionMetrics(productId, startDate, endDate),
      this.calculateReleaseReadiness(productId)
    ]);

    return {
      product,
      mttr,
      defectLeakage,
      testMetrics,
      releaseReadiness
    };
  }

  /**
   * Get comprehensive tenant analytics
   */
  async getTenantAnalytics(tenantId: string, startDate?: Date, endDate?: Date): Promise<{
    tenant: { id: string; name: string; slug: string };
    teamProductivity: Awaited<ReturnType<typeof this.calculateTeamProductivity>>;
    products: Array<{ productId: string; productName: string; healthScore: number }>;
    overallQualityScore: number;
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true }
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true }
    });

    // Get analytics for each product
    const productAnalytics = await Promise.all(
      products.map(async (product) => {
        try {
          const analytics = await this.getProductAnalytics(product.id, startDate, endDate);
          const healthScore = (
            (100 - analytics.defectLeakage.rate) * 0.3 +
            analytics.testMetrics.passRate * 0.4 +
            analytics.releaseReadiness.overallScore * 0.3
          );

          return {
            productId: product.id,
            productName: product.name,
            healthScore: Math.round(healthScore)
          };
        } catch (error) {
          return {
            productId: product.id,
            productName: product.name,
            healthScore: 0
          };
        }
      })
    );

    const overallQualityScore = productAnalytics.length > 0
      ? productAnalytics.reduce((sum, p) => sum + p.healthScore, 0) / productAnalytics.length
      : 0;

    const teamProductivity = await this.calculateTeamProductivity(tenantId, startDate, endDate);

    return {
      tenant,
      teamProductivity,
      products: productAnalytics,
      overallQualityScore: Math.round(overallQualityScore)
    };
  }
}

// Export singleton instance
export default new AnalyticsService();