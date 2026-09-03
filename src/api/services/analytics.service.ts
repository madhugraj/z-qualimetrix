import { PrismaClient } from '@prisma/client';

/**
 * Buckets our normalized WorkItem.type into the 3 categories a PM actually
 * reasons about when reading a velocity chart — bug fixes, sub-task grind,
 * and everything that ships user-facing scope (stories/tasks/epics).
 * Generic across tenants/providers: driven by our own normalized `type`
 * column, not any one org's raw issue-type names.
 */
type WorkTypeCategory = 'bug' | 'subtask' | 'feature';

function categorizeWorkType(type: string): WorkTypeCategory {
  if (type === 'bug') return 'bug';
  if (type === 'subtask') return 'subtask';
  return 'feature';
}

function emptyTypeBreakdown(): Record<WorkTypeCategory, number> {
  return { bug: 0, subtask: 0, feature: 0 };
}

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
    /** False when zero bugs have ever been resolved for this scope — `overall: 0` in
     * that case means "never measured," not "instant resolution." Callers must check
     * this before treating the number as real. */
    hasData: boolean;
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

    // A resolvedAt earlier than createdAt is a timestamp anomaly, not a bug
    // resolved instantly or in negative time — most commonly a backfilled/
    // historical issue whose createdAt got stamped at sync time rather than
    // its real Jira creation date. Drop it rather than let it corrupt the
    // average with a negative resolution time.
    const validResolvedBugs = resolvedBugs.filter(
      (bug) => bug.resolvedAt && new Date(bug.resolvedAt).getTime() >= new Date(bug.createdAt).getTime()
    );

    if (validResolvedBugs.length === 0) {
      return {
        overall: 0,
        byPriority: {},
        bySprint: {},
        trend,
        hasData: false
      };
    }

    // Calculate MTTR in hours
    const resolutionTimes = validResolvedBugs.map(bug => {
      const created = new Date(bug.createdAt).getTime();
      const resolved = new Date(bug.resolvedAt!).getTime();
      return (resolved - created) / (1000 * 60 * 60); // Convert to hours
    });

    const overall = resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;

    // Calculate by priority
    const byPriority: Record<string, number> = {};
    const bySprint: Record<string, number> = {};

    for (let i = 0; i < validResolvedBugs.length; i++) {
      const bug = validResolvedBugs[i];
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
      trend,
      hasData: true
    };
  }

  /**
   * Calendar-week buckets (most recent `fallbackWeeks` weeks, capped at 12
   * points) used as the trend axis whenever no real Sprint/board data has
   * been synced for a scope — Jira Software's Agile REST API (boards,
   * sprints) needs a separate OAuth scope from classic Jira REST, so most
   * tenants have zero Sprint rows until that's granted. Every tenant has
   * item timestamps regardless, so this keeps trend charts real (not empty,
   * not fabricated) for any provider and any team, sprint-based or not.
   */
  private weekBuckets(startDate?: Date, endDate?: Date, fallbackWeeks = 8): Array<{ start: Date; end: Date; label: string }> {
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    if (startDate) {
      start.setTime(new Date(startDate).getTime());
    } else {
      start.setDate(start.getDate() - (fallbackWeeks * 7 - 1));
    }
    start.setHours(0, 0, 0, 0);

    const buckets: Array<{ start: Date; end: Date; label: string }> = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const bucketStart = new Date(cursor);
      const bucketEnd = new Date(cursor);
      bucketEnd.setDate(bucketEnd.getDate() + 6);
      bucketEnd.setHours(23, 59, 59, 999);
      if (bucketEnd.getTime() > end.getTime()) bucketEnd.setTime(end.getTime());
      buckets.push({
        start: bucketStart,
        end: bucketEnd,
        label: bucketStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      });
      cursor.setDate(cursor.getDate() + 7);
    }

    // A YTD/quarter range would otherwise produce 20-50+ points and make
    // the chart unreadable — keep only the most recent 12 weeks of it.
    return buckets.slice(-12);
  }

  /**
   * MTTR trend over the most recent sprints, falling back to calendar weeks
   * when no Sprint data exists for this scope (see weekBuckets).
   */
  private async calculateMttrTrend(productId?: string, tenantId?: string, startDate?: Date, endDate?: Date): Promise<Array<{ period: string; mttr: number }>> {
    const sprints = await this.getRecentSprints({ productId, tenantId, startDate, endDate });

    if (sprints.length > 0) {
      const trend = [];

      for (const sprint of sprints) {
        const resolvedBugs = await this.prisma.workItem.findMany({
          where: { sprintId: sprint.id, type: 'bug', status: 'resolved', resolvedAt: { not: null } },
          select: { createdAt: true, resolvedAt: true }
        });

        const times = resolvedBugs
          .filter((bug) => bug.resolvedAt && new Date(bug.resolvedAt).getTime() >= new Date(bug.createdAt).getTime())
          .map((bug) => (new Date(bug.resolvedAt!).getTime() - new Date(bug.createdAt).getTime()) / (1000 * 60 * 60));

        const avg = times.length > 0 ? times.reduce((sum, t) => sum + t, 0) / times.length : 0;
        trend.push({ period: sprint.name, mttr: Math.round(avg * 10) / 10 });
      }

      return trend.reverse(); // Return in chronological order
    }

    const resolvedBugs = await this.prisma.workItem.findMany({
      where: {
        type: 'bug',
        status: 'resolved',
        resolvedAt: { not: null },
        ...(productId ? { productId } : tenantId ? { tenantId } : {})
      },
      select: { createdAt: true, resolvedAt: true }
    });

    const buckets = this.weekBuckets(startDate, endDate);
    const trend: Array<{ period: string; mttr: number }> = [];

    for (const bucket of buckets) {
      const times = resolvedBugs
        .filter((bug) => {
          const resolved = new Date(bug.resolvedAt!).getTime();
          return (
            resolved >= bucket.start.getTime() &&
            resolved <= bucket.end.getTime() &&
            resolved >= new Date(bug.createdAt).getTime()
          );
        })
        .map((bug) => (new Date(bug.resolvedAt!).getTime() - new Date(bug.createdAt).getTime()) / (1000 * 60 * 60));

      if (times.length > 0) {
        trend.push({ period: bucket.label, mttr: Math.round((times.reduce((sum, t) => sum + t, 0) / times.length) * 10) / 10 });
      }
    }

    return trend;
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
    /** False when zero bugs are tracked for this scope — `rate: 0` in that case
     * means "never measured," not "zero leakage." */
    hasData: boolean;
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
      trend,
      hasData: allBugs > 0
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
    /** False when zero test executions are recorded for this scope — the rates
     * default to 0 mathematically but mean "never run," not "always failing." */
    hasData: boolean;
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
      automationRate: Math.round(metrics.automationRate * 10) / 10,
      hasData: metrics.total > 0
    };
  }

  /**
   * Completed-item count (all types) plus bugs created/resolved, per sprint
   * — or per calendar week when no Sprint data is synced (see weekBuckets).
   * "Velocity" is defined as a completed-item COUNT, not story points:
   * across this tenant's real data, story points are set on 1 of 2,494 work
   * items, so a points-based number would silently read as ~0 for nearly
   * every team. Count-based velocity is what actually reflects throughput
   * for teams that don't estimate in points — and matches how PMs here
   * already track it manually (issues completed per sprint).
   */
  async calculateVelocityTrend(productId?: string, tenantId?: string, startDate?: Date, endDate?: Date, limit: number = 6): Promise<Array<{
    period: string;
    velocity: number;
    created: number;
    resolved: number;
    byType: Record<WorkTypeCategory, number>;
  }>> {
    const sprints = await this.getRecentSprints({ productId, tenantId, startDate, endDate, limit });

    if (sprints.length > 0) {
      const trend = [];

      for (const sprint of sprints) {
        const [completedByType, created, resolved] = await Promise.all([
          this.prisma.workItem.groupBy({
            by: ['type'],
            where: { sprintId: sprint.id, status: { in: ['resolved', 'completed'] } },
            _count: true
          }),
          this.prisma.workItem.count({ where: { sprintId: sprint.id, type: 'bug' } }),
          this.prisma.workItem.count({ where: { sprintId: sprint.id, type: 'bug', status: 'resolved' } })
        ]);

        const byType = emptyTypeBreakdown();
        let velocity = 0;
        for (const row of completedByType) {
          byType[categorizeWorkType(row.type)] += row._count;
          velocity += row._count;
        }

        trend.push({ period: sprint.name, velocity, created, resolved, byType });
      }

      return trend.reverse(); // Return in chronological order
    }

    const scopeWhere = productId ? { productId } : tenantId ? { tenantId } : {};
    const [completedItems, bugItems] = await Promise.all([
      this.prisma.workItem.findMany({
        where: { ...scopeWhere, status: { in: ['resolved', 'completed'] } },
        select: { type: true, resolvedAt: true, statusChangedAt: true, updatedAt: true }
      }),
      this.prisma.workItem.findMany({
        where: { ...scopeWhere, type: 'bug' },
        select: { createdAt: true, status: true, resolvedAt: true, statusChangedAt: true }
      })
    ]);

    const buckets = this.weekBuckets(startDate, endDate);
    const inBucket = (bucket: { start: Date; end: Date }, at: Date) =>
      at.getTime() >= bucket.start.getTime() && at.getTime() <= bucket.end.getTime();

    const trend = buckets.map((bucket) => {
      const itemsInBucket = completedItems.filter((item) =>
        inBucket(bucket, new Date(item.resolvedAt ?? item.statusChangedAt ?? item.updatedAt))
      );

      const byType = emptyTypeBreakdown();
      for (const item of itemsInBucket) byType[categorizeWorkType(item.type)]++;

      const created = bugItems.filter((bug) => inBucket(bucket, new Date(bug.createdAt))).length;
      const resolved = bugItems.filter((bug) => {
        if (bug.status !== 'resolved') return false;
        const at = bug.resolvedAt ?? bug.statusChangedAt;
        return at ? inBucket(bucket, new Date(at)) : false;
      }).length;

      return { period: bucket.label, velocity: itemsInBucket.length, created, resolved, byType };
    });

    // Drop leading/trailing all-zero weeks so a product with only a few
    // weeks of real history doesn't render as a long flat line at 0.
    return trend.filter((point) => point.velocity > 0 || point.created > 0 || point.resolved > 0);
  }

  /**
   * High-priority (critical/high) bugs resolved in the most recent period —
   * the real Sprint if one is synced for this scope, otherwise the trailing
   * 7 days (the same sprint/calendar-week fallback as the trend charts
   * above). This is the "what did the team actually fix last sprint"
   * question a PM asks in a status update.
   */
  async getRecentHighPriorityFixes(productId?: string, tenantId?: string, limit: number = 20): Promise<{
    periodLabel: string;
    periodSource: 'sprint' | 'week';
    bugs: Array<{
      id: string;
      externalId: string | null;
      title: string;
      priority: string;
      resolvedAt: string;
      assigneeName: string | null;
    }>;
    hasData: boolean;
  }> {
    const [mostRecentSprint] = await this.getRecentSprints({ productId, tenantId, limit: 1 });

    const where: any = {
      type: 'bug',
      status: 'resolved',
      priority: { in: ['critical', 'high'] },
      resolvedAt: { not: null },
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    let periodLabel: string;
    let periodSource: 'sprint' | 'week';

    if (mostRecentSprint) {
      where.sprintId = mostRecentSprint.id;
      periodLabel = mostRecentSprint.name;
      periodSource = 'sprint';
    } else {
      where.resolvedAt = { not: null, gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      periodLabel = 'Last 7 days';
      periodSource = 'week';
    }

    const bugs = await this.prisma.workItem.findMany({
      where,
      orderBy: { resolvedAt: 'desc' },
      take: limit,
      select: { id: true, externalId: true, title: true, priority: true, resolvedAt: true, externalMetadata: true }
    });

    return {
      periodLabel,
      periodSource,
      bugs: bugs.map((b) => ({
        id: b.id,
        externalId: b.externalId,
        title: b.title,
        priority: b.priority ?? 'unset',
        resolvedAt: b.resolvedAt!.toISOString(),
        assigneeName: (b.externalMetadata as any)?.assigneeName ?? null
      })),
      hasData: bugs.length > 0
    };
  }

  /**
   * Completed-item throughput for the current calendar quarter (to date)
   * vs. the prior full quarter — same completed-item definition as
   * calculateVelocityTrend, summed over a fixed calendar window instead of
   * a per-sprint/week series. Calendar quarters (not Jira sprint
   * boundaries) so this works identically for any tenant regardless of
   * board/sprint sync status.
   */
  async getQuarterOverQuarterVelocity(productId?: string, tenantId?: string): Promise<{
    current: { label: string; total: number; byType: Record<WorkTypeCategory, number> };
    previous: { label: string; total: number; byType: Record<WorkTypeCategory, number> };
    changePercent: number | null;
    hasData: boolean;
  }> {
    const now = new Date();
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const currentStart = new Date(now.getFullYear(), qStartMonth, 1);
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getFullYear(), Math.floor(previousEnd.getMonth() / 3) * 3, 1);

    const scopeWhere = productId ? { productId } : tenantId ? { tenantId } : {};
    const items = await this.prisma.workItem.findMany({
      where: { ...scopeWhere, status: { in: ['resolved', 'completed'] } },
      select: { type: true, resolvedAt: true, statusChangedAt: true, updatedAt: true }
    });

    const summarize = (start: Date, end: Date) => {
      const inWindow = items.filter((item) => {
        const at = new Date(item.resolvedAt ?? item.statusChangedAt ?? item.updatedAt).getTime();
        return at >= start.getTime() && at <= end.getTime();
      });
      const byType = emptyTypeBreakdown();
      for (const item of inWindow) byType[categorizeWorkType(item.type)]++;
      return { total: inWindow.length, byType };
    };

    const quarterLabel = (start: Date, toDate: boolean) =>
      `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}${toDate ? ' (to date)' : ''}`;

    const current = { label: quarterLabel(currentStart, true), ...summarize(currentStart, now) };
    const previous = { label: quarterLabel(previousStart, false), ...summarize(previousStart, previousEnd) };

    const changePercent = previous.total > 0
      ? Math.round(((current.total - previous.total) / previous.total) * 1000) / 10
      : null;

    return { current, previous, changePercent, hasData: current.total > 0 || previous.total > 0 };
  }

  /**
   * Calculate release readiness score
   * Based on test coverage, open bugs, and recent test results
   */
  async calculateReleaseReadiness(productId: string): Promise<{
    overallScore: number;
    components: {
      testCoverage: number | null;
      bugHealth: number | null;
      recentTestResults: number | null;
      automationCoverage: number | null;
    };
    recommendation: string;
    risks: string[];
    /** False when none of the four components below have any real signal —
     * `overallScore: 0` in that case is a placeholder, not an actual score. */
    hasData: boolean;
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

    // No requirements↔test-case traceability model exists in this schema (see
    // the RTM deferral) — this component has no data source at all, ever.
    const testCoverage: number | null = null;
    // `null` (not 100) when totalBugs is 0 — "no bugs tracked yet" is not the
    // same claim as "measured and found perfectly healthy."
    const bugHealth: number | null = totalBugs > 0 ? ((totalBugs - openBugs) / totalBugs) * 100 : null;
    const recentTestResults: number | null = recentExecutions.length > 0
      ? (recentExecutions.filter(e => e.status === 'passed').length / recentExecutions.length) * 100
      : null;
    const automationCoverage: number | null = testCases > 0
      ? (recentExecutions.filter(e => e.testCase.automationStatus === 'automated').length / testCases) * 100
      : null;

    // Weighted average over only the components that actually have data —
    // re-normalizing the weights rather than defaulting a missing component
    // to a fixed value, which previously made an empty product score the
    // same as a genuinely healthy one.
    const weights = { testCoverage: 0.25, bugHealth: 0.35, recentTestResults: 0.25, automationCoverage: 0.15 };
    const raw = { testCoverage, bugHealth, recentTestResults, automationCoverage };
    const available = (Object.keys(raw) as Array<keyof typeof raw>).filter((k) => raw[k] !== null);
    const totalWeight = available.reduce((sum, k) => sum + weights[k], 0);
    const hasData = totalWeight > 0;
    const overallScore = hasData
      ? available.reduce((sum, k) => sum + (raw[k] as number) * weights[k], 0) / totalWeight
      : 0;

    // Determine recommendation and risks
    const risks: string[] = [];
    let recommendation = '';

    if (!hasData) {
      recommendation = 'Not enough data yet — connect Jira/test tooling and sync activity for this product';
    } else if (overallScore >= 80) {
      recommendation = 'Ready for release';
    } else if (overallScore >= 60) {
      recommendation = 'Proceed with caution';
      if (openBugs > 0) risks.push(`${openBugs} high-priority bugs still open`);
    } else {
      recommendation = 'Not ready for release';
      if (openBugs > 0) risks.push(`${openBugs} high-priority bugs still open`);
      if (recentTestResults !== null && recentTestResults < 70) risks.push('Recent test pass rate below 70%');
      if (automationCoverage !== null && automationCoverage < 30) risks.push('Low automation coverage');
    }

    if (testCases > 0 && testCases < 10) risks.push('Limited test coverage');

    return {
      overallScore: Math.round(overallScore),
      components: {
        testCoverage,
        bugHealth: bugHealth !== null ? Math.round(bugHealth) : null,
        recentTestResults: recentTestResults !== null ? Math.round(recentTestResults) : null,
        automationCoverage: automationCoverage !== null ? Math.round(automationCoverage) : null
      },
      recommendation,
      risks,
      hasData
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
    products: Array<{ productId: string; productName: string; healthScore: number; hasData: boolean; totalWorkItems: number }>;
    overallQualityScore: number;
    /** False when not a single active product has any real signal yet. */
    hasData: boolean;
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

    // Get analytics for each product — same "average only what has data"
    // approach as calculateReleaseReadiness, so a product with no bug/test
    // signal reports as no-score rather than a fabricated middle value.
    // `totalWorkItems` is tracked separately so a product that's genuinely
    // synced (real backlog: stories/tasks/features) but has zero bugs/tests
    // yet reads as "no defects logged" rather than "not synced at all" —
    // those are very different claims a product owner needs told apart.
    const productAnalytics = await Promise.all(
      products.map(async (product) => {
        try {
          const [analytics, totalWorkItems] = await Promise.all([
            this.getProductAnalytics(product.id, startDate, endDate),
            this.prisma.workItem.count({ where: { productId: product.id } })
          ]);
          const parts: Array<{ value: number; weight: number }> = [];
          if (analytics.defectLeakage.hasData) parts.push({ value: 100 - analytics.defectLeakage.rate, weight: 0.3 });
          if (analytics.testMetrics.hasData) parts.push({ value: analytics.testMetrics.passRate, weight: 0.4 });
          if (analytics.releaseReadiness.hasData) parts.push({ value: analytics.releaseReadiness.overallScore, weight: 0.3 });

          const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
          const hasData = totalWeight > 0;
          const healthScore = hasData
            ? Math.round(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight)
            : 0;

          return { productId: product.id, productName: product.name, healthScore, hasData, totalWorkItems };
        } catch (error) {
          return { productId: product.id, productName: product.name, healthScore: 0, hasData: false, totalWorkItems: 0 };
        }
      })
    );

    const scoredProducts = productAnalytics.filter((p) => p.hasData);
    const overallQualityScore = scoredProducts.length > 0
      ? scoredProducts.reduce((sum, p) => sum + p.healthScore, 0) / scoredProducts.length
      : 0;

    const teamProductivity = await this.calculateTeamProductivity(tenantId, startDate, endDate);

    return {
      tenant,
      teamProductivity,
      products: productAnalytics,
      overallQualityScore: Math.round(overallQualityScore),
      hasData: scoredProducts.length > 0
    };
  }

  /**
   * Real bug distribution by Jira label (e.g. UI-BUG, FUNC-BUG) — this org's
   * Jira projects don't use Components, so labels are the only real
   * categorical tag on a bug. Untagged bugs bucket into "Unlabeled" so the
   * distribution's total still sums to the bug count.
   */
  async calculateBugLabelDistribution(productId?: string, startDate?: Date, endDate?: Date, tenantId?: string): Promise<{
    distribution: Array<{ label: string; count: number }>;
    /** False when zero bugs are tracked for this scope. */
    hasData: boolean;
  }> {
    const where: any = { type: 'bug', isActive: true };
    if (productId) where.productId = productId;
    else if (tenantId) where.tenantId = tenantId;
    if (startDate) where.createdAt = { ...where.createdAt, gte: startDate };
    if (endDate) where.createdAt = { ...where.createdAt, lte: endDate };

    const bugs = await this.prisma.workItem.findMany({ where, select: { labels: true } });

    const counts = new Map<string, number>();
    for (const bug of bugs) {
      const labels = bug.labels.length > 0 ? bug.labels : ['Unlabeled'];
      for (const label of labels) {
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }

    const distribution = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    return { distribution, hasData: bugs.length > 0 };
  }

  /**
   * Count of currently-open critical/high priority bugs — same priority
   * values calculateDefectLeakage already uses as its production-bug proxy,
   * just exposed as its own standalone figure.
   */
  async calculateOpenP0P1Count(productId?: string, tenantId?: string): Promise<{
    count: number;
    /** False when zero bugs are tracked for this scope — `count: 0` in that
     * case means "never measured," not "nothing open." */
    hasData: boolean;
  }> {
    const where: any = { type: 'bug', isActive: true };
    if (productId) where.productId = productId;
    else if (tenantId) where.tenantId = tenantId;

    const [totalBugs, count] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.count({
        where: { ...where, priority: { in: ['critical', 'high'] }, status: { in: ['open', 'in_progress'] } }
      })
    ]);

    return { count, hasData: totalBugs > 0 };
  }

  /**
   * Bug Reopen Rate + First-Time Fix Rate, from reopenCount tracked at sync
   * time (jira-sync.service.ts detects resolved/completed -> open/in_progress
   * transitions). Population is "reopenCount > 0 OR currently resolved/
   * completed" rather than "resolvedAt is set" — Jira clears resolutiondate
   * when an issue is reopened, so a bug resolved-then-reopened-then-sitting
   * in_progress again would otherwise be missed entirely.
   */
  async calculateReopenMetrics(productId?: string, startDate?: Date, endDate?: Date, tenantId?: string): Promise<{
    reopenRate: number;
    firstTimeFixRate: number;
    /** False when no bug has ever been resolved (or reopened) for this scope. */
    hasData: boolean;
  }> {
    const where: any = {
      type: 'bug',
      isActive: true,
      OR: [{ reopenCount: { gt: 0 } }, { status: { in: ['resolved', 'completed'] } }]
    };
    if (productId) where.productId = productId;
    else if (tenantId) where.tenantId = tenantId;
    if (startDate) where.updatedAt = { ...where.updatedAt, gte: startDate };
    if (endDate) where.updatedAt = { ...where.updatedAt, lte: endDate };

    const everResolved = await this.prisma.workItem.findMany({ where, select: { reopenCount: true } });
    const denominator = everResolved.length;
    const reopened = everResolved.filter((w) => w.reopenCount > 0).length;
    const reopenRate = denominator > 0 ? (reopened / denominator) * 100 : 0;

    return {
      reopenRate: Math.round(reopenRate * 10) / 10,
      firstTimeFixRate: Math.round((100 - reopenRate) * 10) / 10,
      hasData: denominator > 0
    };
  }

  /**
   * Items sitting in a QA/review/blocked-like raw Jira status past a day
   * threshold. Filters on the RAW status name (not the collapsed `status`
   * bucket — "In QA" and "Code Review" both collapse to 'in_progress') using
   * the same simple keyword-matching style as jira-sync.service.ts's
   * mapIssueType, no ML/NLP involved.
   */
  async getQaBottlenecks(productId?: string, tenantId?: string, thresholdDays: number = 3): Promise<{
    bottlenecks: Array<{ id: string; externalId: string | null; title: string; rawStatus: string; daysInStatus: number; severity: 'critical' | 'warning' | 'neutral' }>;
    /** False when nothing is currently sitting in any QA-like raw status at all
     * — distinct from "some exist but none crossed the threshold yet." */
    hasData: boolean;
  }> {
    const where: any = { isActive: true, status: 'in_progress', statusChangedAt: { not: null } };
    if (productId) where.productId = productId;
    else if (tenantId) where.tenantId = tenantId;

    const candidates = await this.prisma.workItem.findMany({
      where,
      select: { id: true, externalId: true, title: true, externalStatusName: true, statusChangedAt: true }
    });

    const QA_STATUS_KEYWORDS = /qa|test|review|verification|blocked/i;
    const qaCandidates = candidates.filter((c) => QA_STATUS_KEYWORDS.test(c.externalStatusName ?? ''));

    const now = Date.now();
    const bottlenecks = qaCandidates
      .map((c) => ({
        id: c.id,
        externalId: c.externalId,
        title: c.title,
        rawStatus: c.externalStatusName as string,
        daysInStatus: Math.round((now - c.statusChangedAt!.getTime()) / (1000 * 60 * 60 * 24))
      }))
      .filter((c) => c.daysInStatus >= thresholdDays)
      .sort((a, b) => b.daysInStatus - a.daysInStatus)
      .map((c) => ({
        ...c,
        severity: (c.daysInStatus >= thresholdDays * 3 ? 'critical' : c.daysInStatus >= thresholdDays * 2 ? 'warning' : 'neutral') as 'critical' | 'warning' | 'neutral'
      }));

    return { bottlenecks, hasData: qaCandidates.length > 0 };
  }

  /**
   * Server-side related/similar bugs for one bug, over real synced titles +
   * descriptions in the same product — replaces the client-side tf-idf demo
   * that ran over a 10-row mock corpus in src/lib/qm-bugs.ts.
   *
   * Prefers real local-embedding cosine similarity (semantic — catches
   * paraphrases tf-idf misses; see local-embeddings.service.ts) when both
   * the baseline bug and at least one candidate have one stored; falls back
   * to tf-idf token-overlap otherwise (this bug hasn't been re-synced since
   * embeddings shipped yet). A tenant never sees a broken/empty panel purely
   * because embeddings haven't backfilled yet — see jira-sync.service.ts's
   * embedding pass.
   */
  async getSimilarBugs(workItemId: string, limit: number = 5): Promise<{
    similar: Array<{ id: string; externalId: string | null; title: string; status: string; score: number }>;
    /** False when the baseline bug doesn't exist, or no other bugs exist in its product yet. */
    hasData: boolean;
  }> {
    const baseline = await this.prisma.workItem.findUnique({
      where: { id: workItemId },
      select: { id: true, productId: true, title: true, description: true, embedding: true, externalSystem: true }
    });
    if (!baseline) return { similar: [], hasData: false };

    const candidates = await this.prisma.workItem.findMany({
      where: { productId: baseline.productId, type: 'bug', isActive: true, id: { not: workItemId } },
      select: { id: true, externalId: true, title: true, status: true, description: true, embedding: true, externalSystem: true }
    });
    if (candidates.length === 0) return { similar: [], hasData: false };

    const embeddedCandidates = candidates.filter((c) => c.embedding.length > 0);
    let ranked: Array<{ id: string; score: number }>;

    if (baseline.embedding.length > 0 && embeddedCandidates.length > 0) {
      const { cosineSimilarity } = await import('./local-embeddings.service');
      // Semantic cosine similarity runs "hotter" than tf-idf's sparse-vector
      // overlap — unrelated short texts routinely still land around 0.1-0.3
      // in embedding space, so 0.08 (tf-idf's threshold) would flag nearly
      // everything. 0.5 is a starting point, not an empirically-tuned value
      // — revisit once real embeddings are live and match against actual
      // known-duplicate pairs.
      ranked = embeddedCandidates
        .map((c) => ({ id: c.id, score: cosineSimilarity(baseline.embedding, c.embedding) }))
        .filter((r) => r.score > 0.5)
        .sort((a, b) => b.score - a.score);
    } else {
      const { rankBySimilarity } = await import('../utils/text-similarity');
      const { adfToPlainText } = await import('../utils/adf-to-text');
      // description is raw ADF JSON for Jira bugs, raw HTML for Azure
      // DevOps ones — strip either down to plain text before comparing, or
      // JSON/HTML syntax noise dominates the token overlap.
      const plainText = (description: string | null, externalSystem: string): string => {
        if (!description) return '';
        return externalSystem === 'jira' ? adfToPlainText(description) : description.replace(/<[^>]*>/g, ' ');
      };
      ranked = rankBySimilarity(
        `${baseline.title} ${plainText(baseline.description, baseline.externalSystem)}`,
        candidates.map((c) => ({ id: c.id, text: `${c.title} ${plainText(c.description, c.externalSystem)}` }))
      );
    }

    const similar = ranked
      .slice(0, limit)
      .map(({ id, score }) => {
        const candidate = candidates.find((c) => c.id === id)!;
        return { id: candidate.id, externalId: candidate.externalId, title: candidate.title, status: candidate.status, score: Math.round(score * 100) / 100 };
      });

    return { similar, hasData: true };
  }

  /**
   * Holistic per-project status for the whole tenant — connection state,
   * sync recency, bug resolution, health score. Built as a fixed number of
   * grouped aggregate queries (not one round-trip per product) so the query
   * count doesn't scale with how many projects a tenant has.
   *
   * Provider-agnostic by construction: every field comes from WorkItem's
   * shared shape (type/status/externalSystem/lastSeenAtSourceAt), which
   * jira-sync.service.ts and azure-devops-sync.service.ts both populate
   * with the same status vocabulary — nothing here assumes Jira.
   */
  async getProjectsOverview(tenantId: string): Promise<{
    projects: Array<{
      productId: string;
      productName: string;
      /** Distinct externalSystem values actually present among this product's synced rows — reflects reality, not just config. */
      connectedSystems: string[];
      /** A Jira project or Azure DevOps area path is configured, whether or not anything has synced yet. */
      isMapped: boolean;
      lastSyncedAt: string | null;
      totalWorkItems: number;
      totalBugs: number;
      openBugs: number;
      resolvedBugs: number;
      /** resolvedBugs / (totalBugs - closedBugs). Null, not 0, when there's nothing to measure. */
      resolutionRate: number | null;
      healthScore: number;
      hasData: boolean;
    }>;
    hasData: boolean;
  }> {
    const [products, bugStatusCounts, totalCounts, lastSynced, systemRows, tenantAnalytics] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, jiraProjectId: true, azureDevopsAreaPath: true }
      }),
      this.prisma.workItem.groupBy({
        by: ['productId', 'status'],
        where: { tenantId, type: 'bug', isActive: true },
        _count: true
      }),
      this.prisma.workItem.groupBy({
        by: ['productId'],
        where: { tenantId, isActive: true },
        _count: true
      }),
      this.prisma.workItem.groupBy({
        by: ['productId'],
        where: { tenantId },
        _max: { lastSeenAtSourceAt: true }
      }),
      this.prisma.workItem.findMany({
        where: { tenantId },
        distinct: ['productId', 'externalSystem'],
        select: { productId: true, externalSystem: true }
      }),
      this.getTenantAnalytics(tenantId)
    ]);

    const healthByProduct = new Map(tenantAnalytics.products.map((p) => [p.productId, p]));
    const totalsByProduct = new Map(totalCounts.map((t) => [t.productId, t._count]));
    const lastSyncedByProduct = new Map(lastSynced.map((s) => [s.productId, s._max.lastSeenAtSourceAt]));

    const systemsByProduct = new Map<string, Set<string>>();
    for (const row of systemRows) {
      if (!systemsByProduct.has(row.productId)) systemsByProduct.set(row.productId, new Set());
      systemsByProduct.get(row.productId)!.add(row.externalSystem);
    }

    const bugBucketsByProduct = new Map<string, { open: number; resolved: number; closed: number; total: number }>();
    for (const row of bugStatusCounts) {
      const bucket = bugBucketsByProduct.get(row.productId) ?? { open: 0, resolved: 0, closed: 0, total: 0 };
      const count = row._count as unknown as number;
      if (row.status === 'open' || row.status === 'in_progress') bucket.open += count;
      else if (row.status === 'resolved' || row.status === 'completed') bucket.resolved += count;
      else if (row.status === 'closed') bucket.closed += count;
      bucket.total += count;
      bugBucketsByProduct.set(row.productId, bucket);
    }

    const projects = products.map((product) => {
      const bugs = bugBucketsByProduct.get(product.id) ?? { open: 0, resolved: 0, closed: 0, total: 0 };
      const measurableBugs = bugs.total - bugs.closed;
      const health = healthByProduct.get(product.id);

      return {
        productId: product.id,
        productName: product.name,
        connectedSystems: Array.from(systemsByProduct.get(product.id) ?? []),
        isMapped: !!(product.jiraProjectId || product.azureDevopsAreaPath),
        lastSyncedAt: lastSyncedByProduct.get(product.id)?.toISOString() ?? null,
        totalWorkItems: totalsByProduct.get(product.id) ?? 0,
        totalBugs: bugs.total,
        openBugs: bugs.open,
        resolvedBugs: bugs.resolved,
        resolutionRate: measurableBugs > 0 ? Math.round((bugs.resolved / measurableBugs) * 1000) / 10 : null,
        healthScore: health?.healthScore ?? 0,
        hasData: health?.hasData ?? false
      };
    });

    return { projects, hasData: projects.some((p) => p.hasData) };
  }

  /**
   * Snapshot of everything not yet done — open + in-progress work items
   * across all item types (stories, tasks, bugs), broken down by priority
   * and type. This is a status-derived proxy for "backlog," not a literal
   * Jira board backlog (ranked, un-sprinted issues) — that ranking data
   * needs the same Agile-API board/sprint scope the velocity/MTTR fallback
   * exists for — but it's real, live, and works for every tenant/provider
   * regardless of whether that scope has been granted.
   */
  async getBacklogSummary(productId?: string, tenantId?: string, type?: string): Promise<{
    total: number;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    oldestCreatedAt: string | null;
    hasData: boolean;
  }> {
    const where: any = {
      status: { in: ['open', 'in_progress'] },
      ...(type ? { type } : {}),
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const [total, byPriorityRows, byTypeRows, oldest] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.groupBy({ by: ['priority'], where, _count: true }),
      this.prisma.workItem.groupBy({ by: ['type'], where, _count: true }),
      this.prisma.workItem.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
    ]);

    const byPriority: Record<string, number> = {};
    for (const row of byPriorityRows) byPriority[row.priority ?? 'unset'] = row._count;

    const byType: Record<string, number> = {};
    for (const row of byTypeRows) byType[row.type] = row._count;

    return {
      total,
      byPriority,
      byType,
      oldestCreatedAt: oldest?.createdAt.toISOString() ?? null,
      hasData: total > 0
    };
  }

  /**
   * Currently-open items bucketed by age (days since createdAt) — flags
   * where a queue is accumulating stale work, something a point-in-time
   * count can't show. Optional `type` scopes to one item type (e.g. 'bug'
   * for Bug Intelligence); omitted, it covers the whole backlog, same
   * open/in_progress status set getBacklogSummary uses.
   */
  async getAgeDistribution(productId?: string, tenantId?: string, type?: string): Promise<{
    buckets: Array<{ label: string; count: number }>;
    hasData: boolean;
  }> {
    const where: any = {
      status: { in: ['open', 'in_progress'] },
      ...(type ? { type } : {}),
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const items = await this.prisma.workItem.findMany({ where, select: { createdAt: true } });

    const ranges = [
      { label: '0-7d', maxDays: 7 },
      { label: '8-14d', maxDays: 14 },
      { label: '15-30d', maxDays: 30 },
      { label: '31-60d', maxDays: 60 },
      { label: '60d+', maxDays: Infinity }
    ];
    const buckets = ranges.map((r) => ({ label: r.label, count: 0 }));

    const now = Date.now();
    for (const item of items) {
      const ageDays = (now - new Date(item.createdAt).getTime()) / 86_400_000;
      const idx = ranges.findIndex((r) => ageDays <= r.maxDays);
      buckets[idx === -1 ? buckets.length - 1 : idx].count++;
    }

    return { buckets, hasData: items.length > 0 };
  }

  /**
   * Items created vs. items completed (any type) per period — the backlog
   * equivalent of calculateVelocityTrend's created/resolved overlay, but
   * scoped to the whole backlog rather than bugs only. Net change per
   * period (created - completed) answers "is the backlog growing or
   * shrinking," which a current-snapshot-only summary can't. Same
   * sprint/calendar-week fallback as the other trend methods.
   */
  async calculateBacklogFlow(productId?: string, tenantId?: string, startDate?: Date, endDate?: Date, limit: number = 6): Promise<Array<{
    period: string;
    created: number;
    completed: number;
    netChange: number;
  }>> {
    const sprints = await this.getRecentSprints({ productId, tenantId, startDate, endDate, limit });

    if (sprints.length > 0) {
      const trend = [];
      for (const sprint of sprints) {
        const [created, completed] = await Promise.all([
          this.prisma.workItem.count({ where: { sprintId: sprint.id } }),
          this.prisma.workItem.count({ where: { sprintId: sprint.id, status: { in: ['resolved', 'completed'] } } })
        ]);
        trend.push({ period: sprint.name, created, completed, netChange: created - completed });
      }
      return trend.reverse();
    }

    const scopeWhere = productId ? { productId } : tenantId ? { tenantId } : {};
    const [createdItems, completedItems] = await Promise.all([
      this.prisma.workItem.findMany({ where: scopeWhere, select: { createdAt: true } }),
      this.prisma.workItem.findMany({
        where: { ...scopeWhere, status: { in: ['resolved', 'completed'] } },
        select: { resolvedAt: true, statusChangedAt: true, updatedAt: true }
      })
    ]);

    const buckets = this.weekBuckets(startDate, endDate);
    const inBucket = (bucket: { start: Date; end: Date }, at: Date) =>
      at.getTime() >= bucket.start.getTime() && at.getTime() <= bucket.end.getTime();

    const trend = buckets.map((bucket) => {
      const created = createdItems.filter((item) => inBucket(bucket, new Date(item.createdAt))).length;
      const completed = completedItems.filter((item) =>
        inBucket(bucket, new Date(item.resolvedAt ?? item.statusChangedAt ?? item.updatedAt))
      ).length;
      return { period: bucket.label, created, completed, netChange: created - completed };
    });

    return trend.filter((point) => point.created > 0 || point.completed > 0);
  }

  /**
   * Requirements Traceability from real issue-link data (WorkItemLink,
   * populated at sync time from Jira/ADO's native issue links) — for each
   * requirement (story/epic), the bugs actually linked to it and their
   * resolution status. This is NOT test-case coverage — there's no
   * test-management tool connected, so "coverage" here means "has a linked
   * defect been tracked," not "% of test cases passing." Requirements with
   * zero links are excluded rather than shown as a false "Ready" — no link
   * means "untraced," not "verified clean."
   */
  async getRequirementTraceability(productId?: string, tenantId?: string, limit: number = 25): Promise<{
    requirements: Array<{
      id: string;
      externalId: string | null;
      title: string;
      type: string;
      linkedBugs: Array<{ id: string; externalId: string | null; title: string; status: string; priority: string | null }>;
      status: 'ready' | 'at_risk' | 'blocked';
    }>;
    hasData: boolean;
  }> {
    const where: any = {
      type: { in: ['story', 'epic'] },
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const requirements = await this.prisma.workItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true, externalId: true, title: true, type: true,
        linksFrom: { select: { targetItem: { select: { id: true, externalId: true, title: true, status: true, priority: true, type: true } } } },
        linksTo: { select: { sourceItem: { select: { id: true, externalId: true, title: true, status: true, priority: true, type: true } } } }
      }
    });

    const rows = requirements.map((req) => {
      const linked = [
        ...req.linksFrom.map((l) => l.targetItem),
        ...req.linksTo.map((l) => l.sourceItem)
      ].filter((item) => item.type === 'bug');

      const seen = new Set<string>();
      const linkedBugs = linked.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));

      const openBugs = linkedBugs.filter((b) => b.status === 'open' || b.status === 'in_progress');
      const criticalOpen = openBugs.filter((b) => b.priority === 'critical' || b.priority === 'high');

      const status: 'ready' | 'at_risk' | 'blocked' =
        criticalOpen.length > 0 ? 'blocked' : openBugs.length > 0 ? 'at_risk' : 'ready';

      return {
        id: req.id,
        externalId: req.externalId,
        title: req.title,
        type: req.type,
        linkedBugs: linkedBugs.map((b) => ({ id: b.id, externalId: b.externalId, title: b.title, status: b.status, priority: b.priority })),
        status
      };
    });

    const withLinks = rows.filter((r) => r.linkedBugs.length > 0);

    return { requirements: withLinks, hasData: withLinks.length > 0 };
  }

  /**
   * Per-epic progress rollup from WorkItem.parentId (populated at sync time
   * by jira-sync.service.ts / azure-devops-sync.service.ts from Jira's
   * parent/Epic Link fields or ADO's System.Parent). Counts DIRECT children
   * only — a sub-task under a story under an epic already rolls into that
   * story, not counted transitively here. An epic with zero synced children
   * is still returned (a real "nothing scoped under this epic yet" signal,
   * not noise); percentComplete/pointsComplete are null, never a fabricated
   * 0%, when there's nothing measurable.
   *
   * `summary` is aggregated across the FULL matching set (bounded only by
   * EPIC_SCAN_CAP, a sanity ceiling — not by `limit`), so KPI tiles/charts on
   * a dashboard never misrepresent the portfolio just because the table view
   * only renders `limit` rows. `health` reuses the same "blocked > at risk"
   * severity ordering as getRequirementTraceability, but derived from an
   * epic's own direct children rather than WorkItemLink — 'blocked' means at
   * least one open critical/high child; 'at_risk' means no such blocker but
   * the epic hasn't been touched in STALE_DAYS while still incomplete
   * (a real "nothing is moving" signal, not just "has open work," which
   * would otherwise flag nearly every active epic).
   */
  async getEpicRollups(productId?: string, tenantId?: string, limit: number = 50): Promise<{
    epics: Array<{
      id: string;
      externalId: string | null;
      title: string;
      status: string;
      externalStatusName: string | null;
      productId: string;
      productName: string;
      updatedAt: string;
      totalChildren: number;
      childCounts: Record<string, number>;
      percentComplete: number | null;
      pointsComplete: { done: number; total: number; percent: number } | null;
      timeComplete: { spentSeconds: number; estimateSeconds: number; percent: number } | null;
      health: 'on_track' | 'at_risk' | 'blocked';
    }>;
    summary: {
      totalEpics: number;
      epicsWithNoChildren: number;
      avgPercentComplete: number | null;
      byHealth: { on_track: number; at_risk: number; blocked: number };
      byStatus: Record<string, number>;
      byProgressBucket: { no_data: number; '0-25': number; '25-50': number; '50-75': number; '75-100': number };
    };
    hasData: boolean;
  }> {
    const STALE_DAYS = 14;
    // Sanity ceiling on the unbounded portfolio scan, same "known v1
    // limitation at extreme scale" posture as azure-devops-sync.service.ts's
    // 20,000-result WIQL cap — no tenant is anywhere near this today.
    const EPIC_SCAN_CAP = 2000;
    const emptySummary = {
      totalEpics: 0, epicsWithNoChildren: 0, avgPercentComplete: null as number | null,
      byHealth: { on_track: 0, at_risk: 0, blocked: 0 },
      byStatus: {} as Record<string, number>,
      byProgressBucket: { no_data: 0, '0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 }
    };

    const where: any = {
      type: 'epic',
      isActive: true,
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const allEpics = await this.prisma.workItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: EPIC_SCAN_CAP,
      select: {
        id: true, externalId: true, title: true, status: true, externalStatusName: true,
        updatedAt: true, productId: true, product: { select: { name: true } },
        // An epic can carry directly-logged time on its own issue (confirmed
        // on real data), not just via its children — timeComplete below adds
        // this in on top of the children rollup, unlike pointsComplete
        // (epics essentially never carry their own story points).
        originalEstimateSeconds: true, timeSpentSeconds: true
      }
    });

    if (allEpics.length === 0) return { epics: [], summary: emptySummary, hasData: false };

    const allEpicIds = allEpics.map((e) => e.id);

    // Every epic's child counts/points, and its "blocked" signal, each in one
    // aggregate query regardless of portfolio size — same "one groupBy for
    // everything" shape as getProjectsOverview's bugStatusCounts above.
    const [statusGroups, riskyGroups] = await Promise.all([
      this.prisma.workItem.groupBy({
        by: ['parentId', 'status'],
        where: { parentId: { in: allEpicIds }, isActive: true },
        _count: true,
        _sum: { storyPoints: true, originalEstimateSeconds: true, timeSpentSeconds: true }
      }),
      this.prisma.workItem.groupBy({
        by: ['parentId'],
        where: {
          parentId: { in: allEpicIds }, isActive: true,
          status: { in: ['open', 'in_progress'] },
          priority: { in: ['critical', 'high'] }
        },
        _count: true
      })
    ]);

    const groupsByEpicId = new Map<string, typeof statusGroups>();
    for (const row of statusGroups) {
      if (!row.parentId) continue;
      const list = groupsByEpicId.get(row.parentId) ?? [];
      list.push(row);
      groupsByEpicId.set(row.parentId, list);
    }
    const riskyCountByEpicId = new Map<string, number>();
    for (const row of riskyGroups) {
      if (!row.parentId) continue;
      riskyCountByEpicId.set(row.parentId, row._count as unknown as number);
    }

    const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const allRows = allEpics.map((epic) => {
      const groups = groupsByEpicId.get(epic.id) ?? [];
      const childCounts: Record<string, number> = {};
      let totalChildren = 0;
      let closedOrDone = 0;
      let pointsDone = 0;
      let pointsTotal = 0;
      let anyPoints = false;
      let spentSeconds = 0;
      let estimateSeconds = 0;
      let anyTime = false;

      for (const g of groups) {
        const count = g._count as unknown as number;
        childCounts[g.status] = (childCounts[g.status] ?? 0) + count;
        totalChildren += count;
        if (g.status === 'resolved' || g.status === 'completed') closedOrDone += count;

        const pointsSum = g._sum?.storyPoints ?? null;
        if (pointsSum != null) {
          anyPoints = true;
          pointsTotal += pointsSum;
          if (g.status === 'resolved' || g.status === 'completed') pointsDone += pointsSum;
        }

        // Time spent isn't gated by status like points-done is — hours
        // already logged are already logged whether or not the item is
        // finished, so this is a burn-rate (spent vs. estimate), not a
        // done-vs-total ratio.
        const spentSum = g._sum?.timeSpentSeconds ?? null;
        const estimateSum = g._sum?.originalEstimateSeconds ?? null;
        if (spentSum != null) { anyTime = true; spentSeconds += spentSum; }
        if (estimateSum != null) { anyTime = true; estimateSeconds += estimateSum; }
      }

      // An epic can carry directly-logged time on its own issue, not just via
      // its children (confirmed on real data) — add it in on top.
      if (epic.timeSpentSeconds != null) { anyTime = true; spentSeconds += epic.timeSpentSeconds; }
      if (epic.originalEstimateSeconds != null) { anyTime = true; estimateSeconds += epic.originalEstimateSeconds; }

      // Exclude closed (without resolving) from the denominator — same
      // convention as getProjectsOverview's resolutionRate: out of scope, not remaining work.
      const measurable = totalChildren - (childCounts.closed ?? 0);
      const percentComplete = measurable > 0 ? Math.round((closedOrDone / measurable) * 1000) / 10 : null;

      const isBlocked = (riskyCountByEpicId.get(epic.id) ?? 0) > 0;
      const isStalledIncomplete = epic.updatedAt < staleThreshold && percentComplete !== null && percentComplete < 100;
      const health: 'on_track' | 'at_risk' | 'blocked' = isBlocked ? 'blocked' : isStalledIncomplete ? 'at_risk' : 'on_track';

      return {
        id: epic.id,
        externalId: epic.externalId,
        title: epic.title,
        status: epic.status,
        externalStatusName: epic.externalStatusName,
        productId: epic.productId,
        productName: epic.product.name,
        updatedAt: epic.updatedAt.toISOString(),
        totalChildren,
        childCounts,
        percentComplete,
        pointsComplete: anyPoints && pointsTotal > 0
          ? { done: pointsDone, total: pointsTotal, percent: Math.round((pointsDone / pointsTotal) * 1000) / 10 }
          : null,
        timeComplete: anyTime && estimateSeconds > 0
          ? { spentSeconds, estimateSeconds, percent: Math.round((spentSeconds / estimateSeconds) * 1000) / 10 }
          : null,
        health
      };
    });

    const withProgress = allRows.filter((r) => r.percentComplete !== null);
    const byProgressBucket = { no_data: 0, '0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 };
    const byHealth = { on_track: 0, at_risk: 0, blocked: 0 };
    const byStatus: Record<string, number> = {};

    for (const r of allRows) {
      byHealth[r.health]++;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.percentComplete === null) byProgressBucket.no_data++;
      else if (r.percentComplete < 25) byProgressBucket['0-25']++;
      else if (r.percentComplete < 50) byProgressBucket['25-50']++;
      else if (r.percentComplete < 75) byProgressBucket['50-75']++;
      else byProgressBucket['75-100']++;
    }

    const summary = {
      totalEpics: allRows.length,
      epicsWithNoChildren: allRows.filter((r) => r.totalChildren === 0).length,
      avgPercentComplete: withProgress.length > 0
        ? Math.round(withProgress.reduce((sum, r) => sum + (r.percentComplete ?? 0), 0) / withProgress.length)
        : null,
      byHealth,
      byStatus,
      byProgressBucket
    };

    return { epics: allRows.slice(0, limit), summary, hasData: allRows.length > 0 };
  }
}

// Export singleton instance
export default new AnalyticsService();