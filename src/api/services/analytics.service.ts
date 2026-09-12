import { PrismaClient } from '@prisma/client';
import { STALE_ITEM_THRESHOLD_DAYS } from '../../lib/qm-thresholds';

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
 * Process/triage metadata Jira/ADO teams commonly encode as labels or tags
 * (severity-2, sprint-aug-sprint-1, ...) — real values, but not a module or
 * functional category, so they drown out actually-meaningful labels when
 * every consumer of WorkItem.labels tries to show "what kind of work is
 * this." Shared by every label-distribution view (defect heatmap, domain
 * donut, knowledge-silo detection) so they all agree on what counts as noise
 * instead of each hand-rolling a slightly different filter.
 */
const NOISE_LABEL = /^severity-|^sprint-/i;

/** Meaningful labels on this item, or ['Unlabeled'] if it has none once noise is stripped out. */
function meaningfulLabels(labels: string[]): string[] {
  const real = labels.filter((l) => !NOISE_LABEL.test(l));
  return real.length > 0 ? real : ['Unlabeled'];
}

/** Count of Mon-Fri days in [start, end] inclusive — the capacity baseline for getTeamUtilization, not a real leave/PTO-aware calendar. */
function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
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
  async calculateMTTR(productId?: string, startDate?: Date, endDate?: Date, tenantId?: string, assigneeId?: string): Promise<{
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
    // Internal FK (populated at sync time), not externalAssigneeId/email —
    // the latter is unreliable per getAssigneeWorkload's doc comment below
    // (Jira's per-user email-visibility setting can hide it for real users).
    if (assigneeId) where.assigneeId = assigneeId;

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
      this.calculateMttrTrend(productId, tenantId, startDate, endDate, assigneeId)
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
  private async calculateMttrTrend(productId?: string, tenantId?: string, startDate?: Date, endDate?: Date, assigneeId?: string): Promise<Array<{ period: string; mttr: number }>> {
    const sprints = await this.getRecentSprints({ productId, tenantId, startDate, endDate });

    if (sprints.length > 0) {
      const trend = [];

      for (const sprint of sprints) {
        const resolvedBugs = await this.prisma.workItem.findMany({
          where: { sprintId: sprint.id, type: 'bug', status: 'resolved', resolvedAt: { not: null }, ...(assigneeId ? { assigneeId } : {}) },
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
        ...(productId ? { productId } : tenantId ? { tenantId } : {}),
        ...(assigneeId ? { assigneeId } : {})
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
          // 'completed' included alongside 'resolved' — every other bug
          // aggregation in this file (getBacklogSummary, getProjectsOverview,
          // getEpicRollups) treats them as the same "done" state; this one
          // used to only match 'resolved', silently undercounting bugs
          // closed via the 'completed' status.
          this.prisma.workItem.count({ where: { sprintId: sprint.id, type: 'bug', status: { in: ['resolved', 'completed'] } } })
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
        if (bug.status !== 'resolved' && bug.status !== 'completed') return false;
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
  async getRecentHighPriorityFixes(productId?: string, tenantId?: string, limit: number = 20, assigneeId?: string): Promise<{
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
      ...(productId ? { productId } : tenantId ? { tenantId } : {}),
      ...(assigneeId ? { assigneeId } : {})
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
          const [analytics, totalWorkItems, epicRollups] = await Promise.all([
            this.getProductAnalytics(product.id, startDate, endDate),
            this.prisma.workItem.count({ where: { productId: product.id } }),
            // defectLeakage/testMetrics/releaseReadiness are ALL gated on
            // this product having real bug or test-execution data — a
            // product with a healthy, progressing backlog but zero bugs
            // (a real, good thing) previously scored as "no data" purely
            // because the other three signals all happen to share that one
            // gate. Epic completion is a genuinely independent signal that
            // doesn't need bugs to exist at all, confirmed live: several
            // real products here have real epics with real children but no
            // bug-type work items yet.
            this.getEpicRollups(product.id)
          ]);
          const parts: Array<{ value: number; weight: number }> = [];
          if (analytics.defectLeakage.hasData) parts.push({ value: 100 - analytics.defectLeakage.rate, weight: 0.25 });
          if (analytics.testMetrics.hasData) parts.push({ value: analytics.testMetrics.passRate, weight: 0.3 });
          if (analytics.releaseReadiness.hasData) parts.push({ value: analytics.releaseReadiness.overallScore, weight: 0.25 });
          if (epicRollups.summary.avgPercentComplete !== null) {
            parts.push({ value: epicRollups.summary.avgPercentComplete, weight: 0.2 });
          }

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
   * Real bug distribution by label/tag (Jira labels or Azure DevOps tags —
   * whatever categorical tagging the connected tenant actually uses; there's
   * no assumption here about which one, or that either is used at all).
   * Untagged bugs bucket into "Unlabeled" so the distribution's total still
   * sums to the bug count.
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
      for (const label of meaningfulLabels(bug.labels)) {
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
   * Average real dwell time per raw workflow stage (e.g. "Code Review",
   * "Ready for QA"), computed from WorkItemActivity's actual status-
   * transition timestamps — not a point-in-time snapshot like
   * getQaBottlenecks below (which only sees items stuck *right now*). This
   * sees the systemic pattern across every item that has ever passed
   * through a stage, whether or not it's currently sitting there, which is
   * what actually answers "which stage of our process is slow."
   *
   * Only counts CLOSED intervals — the time between one transition and the
   * next one on the same item — never "time since the last transition until
   * now" for an item still sitting there, since mixing a completed
   * measurement with an still-ongoing one would understate the real
   * duration for whatever's currently fastest-moving through that stage.
   * getQaBottlenecks already covers "what's stuck right now" separately.
   *
   * A stage needs at least `minTransitions` completed intervals before it's
   * surfaced, so one slow ticket passing through a rarely-used status
   * doesn't read as a systemic bottleneck.
   */
  async getCycleTimeByStage(productId?: string, tenantId?: string, minTransitions: number = 3): Promise<{
    stages: Array<{ status: string; avgDays: number; medianDays: number; transitionCount: number; totalDays: number }>;
    bottleneckStage: string | null;
    hasData: boolean;
  }> {
    const rows = await this.prisma.workItemActivity.findMany({
      where: {
        eventType: 'status_transition',
        ...(productId ? { workItem: { productId } } : tenantId ? { tenantId } : {})
      },
      orderBy: [{ workItemId: 'asc' }, { occurredAt: 'asc' }],
      select: { workItemId: true, toStatus: true, occurredAt: true },
      // Sanity ceiling on the unbounded scan, same posture as
      // getEpicRollups's EPIC_SCAN_CAP — no tenant is near this today.
      take: 50000
    });

    const durationsByStage = new Map<string, number[]>();
    let prevItemId: string | null = null;
    let prevStatus: string | null = null;
    let prevAt: Date | null = null;

    for (const row of rows) {
      if (row.workItemId !== prevItemId) {
        prevItemId = row.workItemId;
        prevStatus = row.toStatus;
        prevAt = row.occurredAt;
        continue;
      }
      if (prevStatus && prevAt) {
        const days = (row.occurredAt.getTime() - prevAt.getTime()) / (24 * 60 * 60 * 1000);
        if (days >= 0) {
          const list = durationsByStage.get(prevStatus) ?? [];
          list.push(days);
          durationsByStage.set(prevStatus, list);
        }
      }
      prevStatus = row.toStatus;
      prevAt = row.occurredAt;
    }

    const stages = Array.from(durationsByStage.entries())
      .map(([status, days]) => {
        const sorted = [...days].sort((a, b) => a - b);
        const totalDays = days.reduce((sum, d) => sum + d, 0);
        const medianDays = sorted[Math.floor(sorted.length / 2)];
        return {
          status,
          avgDays: Math.round((totalDays / days.length) * 10) / 10,
          medianDays: Math.round(medianDays * 10) / 10,
          transitionCount: days.length,
          totalDays: Math.round(totalDays)
        };
      })
      .filter((s) => s.transitionCount >= minTransitions)
      // Ranked by total portfolio-wide days lost (avg * volume), not raw
      // average — a stage with a slightly higher average but 15x fewer
      // transitions (e.g. a rare "Reopened" status hit 9 times) isn't a
      // bigger systemic problem than one with a lower average but hundreds
      // of transitions through it. Total time is what a team actually loses.
      .sort((a, b) => b.totalDays - a.totalDays);

    return { stages, bottleneckStage: stages[0]?.status ?? null, hasData: stages.length > 0 };
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
      /** Distinct real assignees (Jira accountId / ADO identity id) with at least one active item — not headcount, just who's actually touching this product's backlog. */
      teamSize: number;
      hasData: boolean;
    }>;
    hasData: boolean;
  }> {
    const [products, bugStatusCounts, totalCounts, lastSynced, systemRows, tenantAnalytics, assigneeRows] = await Promise.all([
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
      this.getTenantAnalytics(tenantId),
      this.prisma.workItem.findMany({
        where: { tenantId, isActive: true, externalAssigneeId: { not: null } },
        distinct: ['productId', 'externalAssigneeId'],
        select: { productId: true, externalAssigneeId: true }
      })
    ]);

    const healthByProduct = new Map(tenantAnalytics.products.map((p) => [p.productId, p]));
    const totalsByProduct = new Map(totalCounts.map((t) => [t.productId, t._count]));
    const lastSyncedByProduct = new Map(lastSynced.map((s) => [s.productId, s._max.lastSeenAtSourceAt]));
    const teamSizeByProduct = new Map<string, number>();
    for (const row of assigneeRows) {
      teamSizeByProduct.set(row.productId, (teamSizeByProduct.get(row.productId) ?? 0) + 1);
    }

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
        teamSize: teamSizeByProduct.get(product.id) ?? 0,
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
    byStatus: Record<string, number>;
    oldestCreatedAt: string | null;
    /** Critical/high-priority open work with no real assignee — a real
     * "who's picking this up" gap, not derivable from byPriority alone
     * since that mixes assigned and unassigned items together. */
    unassignedCriticalHigh: number;
    hasData: boolean;
  }> {
    const where: any = {
      status: { in: ['open', 'in_progress'] },
      ...(type ? { type } : {}),
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const [total, byPriorityRows, byTypeRows, byStatusRows, oldest, unassignedCriticalHigh] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.groupBy({ by: ['priority'], where, _count: true }),
      this.prisma.workItem.groupBy({ by: ['type'], where, _count: true }),
      this.prisma.workItem.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.workItem.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.prisma.workItem.count({
        where: { ...where, externalAssigneeId: null, priority: { in: ['critical', 'high'] } }
      })
    ]);

    const byPriority: Record<string, number> = {};
    for (const row of byPriorityRows) byPriority[row.priority ?? 'unset'] = row._count;

    const byType: Record<string, number> = {};
    for (const row of byTypeRows) byType[row.type] = row._count;

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) byStatus[row.status] = row._count;

    return {
      total,
      byPriority,
      byType,
      byStatus,
      oldestCreatedAt: oldest?.createdAt.toISOString() ?? null,
      unassignedCriticalHigh,
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
      { label: '8-14d', maxDays: STALE_ITEM_THRESHOLD_DAYS },
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
      ...(productId ? { productId } : tenantId ? { tenantId } : {}),
      // Pre-filter to requirements that actually qualify for this matrix
      // *before* applying `take` — ordering by recency and hoping some of
      // the most-recently-touched stories/epics happen to have a linked bug
      // left this permanently empty on real data (the requirements that DO
      // have linked bugs are often old and no longer being edited, so they
      // never made it into a recency-ordered top-`limit` candidate set).
      OR: [
        { children: { some: { type: 'bug' } } },
        { linksFrom: { some: { targetItem: { type: 'bug' } } } },
        { linksTo: { some: { sourceItem: { type: 'bug' } } } }
      ]
    };

    const requirements = await this.prisma.workItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true, externalId: true, title: true, type: true,
        linksFrom: { select: { targetItem: { select: { id: true, externalId: true, title: true, status: true, priority: true, type: true } } } },
        linksTo: { select: { sourceItem: { select: { id: true, externalId: true, title: true, status: true, priority: true, type: true } } } },
        // Real-world bug-to-requirement association is overwhelmingly the
        // parent-child hierarchy (a bug filed directly under a story/epic),
        // not Jira's separate, optional "issue links" feature — WorkItemLink
        // alone left this matrix permanently empty on real tenant data
        // despite hundreds of bugs correctly rolled up via parentId. Direct
        // children only, matching getEpicRollups' "direct children only,
        // not transitive" convention.
        children: { where: { type: 'bug' }, select: { id: true, externalId: true, title: true, status: true, priority: true, type: true } }
      }
    });

    const rows = requirements.map((req) => {
      const linked = [
        ...req.linksFrom.map((l) => l.targetItem),
        ...req.linksTo.map((l) => l.sourceItem),
        ...req.children
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
      externalAssigneeId: string | null;
      externalAssigneeName: string | null;
      updatedAt: string;
      totalChildren: number;
      childCounts: Record<string, number>;
      percentComplete: number | null;
      pointsComplete: { done: number; total: number; percent: number } | null;
      timeComplete: { spentSeconds: number; estimateSeconds: number; percent: number } | null;
      health: 'on_track' | 'at_risk' | 'blocked';
      /** Bug-type children only — a sharper "is this epic on fire" signal
       * than totalChildren, which mixes in stories/tasks/subtasks. */
      bugSummary: { openBugs: number; totalBugs: number; oldestOpenBugAgeDays: number | null };
      /** Jira board name(s) this epic is scheduled on — derived from the epic's own
       * sprint (team-managed boards) union its children's sprints (classic
       * company-managed boards, where only stories/tasks carry a sprint). Empty
       * when nothing synced has board data yet (see Sprint.boardName). */
      boardNames: string[];
    }>;
    summary: {
      totalEpics: number;
      epicsWithNoChildren: number;
      avgPercentComplete: number | null;
      byHealth: { on_track: number; at_risk: number; blocked: number };
      byStatus: Record<string, number>;
      byProgressBucket: { no_data: number; '0-25': number; '25-50': number; '50-75': number; '75-100': number };
      /** Active bugs in scope with no parent epic at all — a real backlog-
       * hygiene signal, not fabricated: some teams never link bugs to
       * epics, and this makes that visible instead of silently omitting it. */
      orphanBugCount: number;
      totalBugCount: number;
    };
    hasData: boolean;
  }> {
    const STALE_DAYS = STALE_ITEM_THRESHOLD_DAYS;
    // Sanity ceiling on the unbounded portfolio scan, same "known v1
    // limitation at extreme scale" posture as azure-devops-sync.service.ts's
    // 20,000-result WIQL cap — no tenant is anywhere near this today.
    const EPIC_SCAN_CAP = 2000;
    const emptySummary = {
      totalEpics: 0, epicsWithNoChildren: 0, avgPercentComplete: null as number | null,
      byHealth: { on_track: 0, at_risk: 0, blocked: 0 },
      byStatus: {} as Record<string, number>,
      byProgressBucket: { no_data: 0, '0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 },
      orphanBugCount: 0, totalBugCount: 0
    };

    const where: any = {
      type: 'epic',
      isActive: true,
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const bugScopeWhere = { type: 'bug', isActive: true, ...(productId ? { productId } : tenantId ? { tenantId } : {}) };
    const [orphanBugCount, totalBugCount] = await Promise.all([
      this.prisma.workItem.count({ where: { ...bugScopeWhere, parentId: null } }),
      this.prisma.workItem.count({ where: bugScopeWhere })
    ]);

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
        originalEstimateSeconds: true, timeSpentSeconds: true,
        // Only populated on team-managed Jira boards, where an epic itself can
        // sit in a sprint — see boardsByEpicId below for the more common
        // (classic/company-managed) case of deriving board via children instead.
        sprintId: true,
        externalAssigneeId: true, externalAssigneeName: true
      }
    });

    if (allEpics.length === 0) {
      return { epics: [], summary: { ...emptySummary, orphanBugCount, totalBugCount }, hasData: false };
    }

    const allEpicIds = allEpics.map((e) => e.id);

    // Every epic's child counts/points, and its "blocked" signal, each in one
    // aggregate query regardless of portfolio size — same "one groupBy for
    // everything" shape as getProjectsOverview's bugStatusCounts above.
    const [statusGroups, riskyGroups, bugStatusGroups, childSprintGroups] = await Promise.all([
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
      }),
      // Bug-only breakdown, separate from the all-types statusGroups above —
      // childCounts already sums every type together, and refactoring that
      // to also split by type would be far more invasive than one extra
      // narrow query for the one thing that actually needs it.
      this.prisma.workItem.groupBy({
        by: ['parentId', 'status'],
        where: { parentId: { in: allEpicIds }, isActive: true, type: 'bug' },
        _count: true,
        _min: { createdAt: true }
      }),
      // Which sprints an epic's children are scheduled in — the only board
      // signal available on classic/company-managed Jira, where the epic
      // issue itself never carries a sprint (see epic.sprintId comment above).
      this.prisma.workItem.groupBy({
        by: ['parentId', 'sprintId'],
        where: { parentId: { in: allEpicIds }, isActive: true, sprintId: { not: null } },
        _count: true
      })
    ]);

    const sprintIds = new Set<string>();
    for (const epic of allEpics) if (epic.sprintId) sprintIds.add(epic.sprintId);
    for (const row of childSprintGroups) if (row.sprintId) sprintIds.add(row.sprintId);
    const sprintBoards = sprintIds.size > 0
      ? await this.prisma.sprint.findMany({
          where: { id: { in: Array.from(sprintIds) } },
          select: { id: true, externalBoardId: true, boardName: true }
        })
      : [];
    const boardBySprintId = new Map(sprintBoards.map((s) => [s.id, s]));

    const childSprintIdsByEpicId = new Map<string, Set<string>>();
    for (const row of childSprintGroups) {
      if (!row.parentId || !row.sprintId) continue;
      const set = childSprintIdsByEpicId.get(row.parentId) ?? new Set<string>();
      set.add(row.sprintId);
      childSprintIdsByEpicId.set(row.parentId, set);
    }

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
    const bugGroupsByEpicId = new Map<string, typeof bugStatusGroups>();
    for (const row of bugStatusGroups) {
      if (!row.parentId) continue;
      const list = bugGroupsByEpicId.get(row.parentId) ?? [];
      list.push(row);
      bugGroupsByEpicId.set(row.parentId, list);
    }

    const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const now = Date.now();

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

      const bugGroups = bugGroupsByEpicId.get(epic.id) ?? [];
      let openBugs = 0;
      let totalBugs = 0;
      let oldestOpenBugCreatedAt: Date | null = null;
      for (const g of bugGroups) {
        const count = g._count as unknown as number;
        totalBugs += count;
        if (g.status === 'open' || g.status === 'in_progress') {
          openBugs += count;
          const min = g._min?.createdAt ?? null;
          if (min && (!oldestOpenBugCreatedAt || min < oldestOpenBugCreatedAt)) oldestOpenBugCreatedAt = min;
        }
      }
      const bugSummary = {
        openBugs,
        totalBugs,
        oldestOpenBugAgeDays: oldestOpenBugCreatedAt
          ? Math.floor((now - oldestOpenBugCreatedAt.getTime()) / (24 * 60 * 60 * 1000))
          : null
      };

      const epicSprintIds = new Set<string>(childSprintIdsByEpicId.get(epic.id) ?? []);
      if (epic.sprintId) epicSprintIds.add(epic.sprintId);
      const boardKeys = new Set<string>();
      const boardNames: string[] = [];
      for (const sprintId of epicSprintIds) {
        const board = boardBySprintId.get(sprintId);
        if (!board?.boardName) continue;
        const key = board.externalBoardId ?? board.boardName;
        if (boardKeys.has(key)) continue;
        boardKeys.add(key);
        boardNames.push(board.boardName);
      }
      boardNames.sort();

      return {
        id: epic.id,
        externalId: epic.externalId,
        title: epic.title,
        status: epic.status,
        externalStatusName: epic.externalStatusName,
        productId: epic.productId,
        productName: epic.product.name,
        externalAssigneeId: epic.externalAssigneeId,
        externalAssigneeName: epic.externalAssigneeName,
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
        health,
        bugSummary,
        boardNames
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
      byProgressBucket,
      orphanBugCount,
      totalBugCount
    };

    return { epics: allRows.slice(0, limit), summary, hasData: allRows.length > 0 };
  }

  /**
   * The three signals named verbatim in Yavar's Jira Adoption Policy §9.2
   * ("unlogged work, orphaned issues, boards not reflecting real status") —
   * today a manual, anecdotal check the policy assigns to a human; this
   * makes it a live, auditable query instead.
   */
  async getComplianceSignals(productId?: string, tenantId?: string, limit: number = 300, startDate?: Date, endDate?: Date): Promise<{
    unloggedWork: Array<{ id: string; externalId: string | null; title: string; type: string; status: string; externalStatusName: string | null; productId: string; productName: string; updatedAt: string }>;
    orphanedIssues: Array<{ id: string; externalId: string | null; title: string; type: string; status: string; productId: string; productName: string; updatedAt: string }>;
    staleInProgress: Array<{ id: string; externalId: string | null; title: string; type: string; status: string; productId: string; productName: string; updatedAt: string; daysStale: number }>;
    counts: { unloggedWork: number; orphanedIssues: number; staleInProgress: number };
    /** Denominator for each signal's percentage-of-total framing — the same
     * where-clause as the signal itself, minus the one condition that
     * defines it (e.g. unloggedWork's denominator drops the timeSpentSeconds
     * filter, leaving "all completed items"). */
    denominators: { unloggedWork: number; orphanedIssues: number; staleInProgress: number };
    /** Full, UNCAPPED per-product breakdown (Prisma groupBy, not a client-side
     * count over the capped preview rows above — those are oldest-first and
     * would silently bias a ranking). Null in single-product scope, where a
     * groupby degenerates to one row. */
    byProduct: {
      unloggedWork: Array<{ label: string; count: number }>;
      orphanedIssues: Array<{ label: string; count: number }>;
      staleInProgress: Array<{ label: string; count: number }>;
    } | null;
    /** Real period-over-period trend — only honestly reconstructable for
     * unlogged work, since resolvedAt/timeSpentSeconds are stable once an
     * item is resolved. Null unless startDate/endDate are both given. */
    unloggedWorkTrend: { current: number; previous: number; changePercent: number | null } | null;
    /** Composition, NOT a trend — orphanedIssues/staleInProgress have no
     * historical snapshot of parentId/status (WorkItemActivity only tracks
     * status transitions, and only for Jira-sourced tenants), so a literal
     * "up/down X%" would be fabricated. These split the CURRENT total by an
     * immutable timestamp instead — a verifiable fact about each ticket, not
     * a claim about when it became orphaned/stale. Both null unless
     * startDate/endDate are given; the two fields in each always sum to the
     * signal's own count (predates.../longStanding are computed by
     * subtraction, never as an independent count that could drift).
     */
    orphanedBreakdown: { createdThisWindow: number; predatesWindow: number } | null;
    staleBreakdown: { justCrossedThreshold: number; longStanding: number } | null;
    hasData: boolean;
  }> {
    const STALE_DAYS = STALE_ITEM_THRESHOLD_DAYS;
    const scopeWhere = productId ? { productId } : tenantId ? { tenantId } : {};
    const workableTypes = ['story', 'task', 'subtask', 'bug'];
    const selectFields = {
      id: true, externalId: true, title: true, type: true, status: true,
      externalStatusName: true, updatedAt: true, statusChangedAt: true,
      productId: true, product: { select: { name: true } }
    } as const;

    const unloggedWhere = {
      ...scopeWhere, isActive: true,
      type: { in: workableTypes },
      status: { in: ['resolved', 'completed'] },
      OR: [{ timeSpentSeconds: null }, { timeSpentSeconds: 0 }]
    };
    const orphanedWhere = {
      ...scopeWhere, isActive: true,
      type: { in: workableTypes },
      parentId: null
    };
    const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const staleWhere = {
      ...scopeWhere, isActive: true,
      status: 'in_progress',
      // Neither statusChangedAt nor updatedAt individually captures every
      // case (statusChangedAt is null until the first real transition since
      // this field was introduced) — OR-ing both against the threshold
      // mirrors the `?? ` fallback used everywhere else in this file without
      // needing a raw SQL COALESCE.
      OR: [
        { statusChangedAt: { lt: staleThreshold } },
        { statusChangedAt: null, updatedAt: { lt: staleThreshold } }
      ]
    };

    // Denominators mirror each signal's own where-clause minus the one
    // condition that defines it — "all completed items" / "all active
    // workable items" / "all in_progress items", so the signal's count can
    // be framed as a percentage of a real total, not a bare number.
    const unloggedDenominatorWhere = { ...scopeWhere, isActive: true, type: { in: workableTypes }, status: { in: ['resolved', 'completed'] } };
    const orphanedDenominatorWhere = { ...scopeWhere, isActive: true, type: { in: workableTypes } };
    const staleDenominatorWhere = { ...scopeWhere, isActive: true, status: 'in_progress' };

    const [
      unloggedRows, unloggedCount, orphanedRows, orphanedCount, staleRows, staleCount,
      unloggedDenominator, orphanedDenominator, staleDenominator
    ] = await Promise.all([
      this.prisma.workItem.findMany({ where: unloggedWhere, select: selectFields, orderBy: { updatedAt: 'asc' }, take: limit }),
      this.prisma.workItem.count({ where: unloggedWhere }),
      this.prisma.workItem.findMany({ where: orphanedWhere, select: selectFields, orderBy: { updatedAt: 'asc' }, take: limit }),
      this.prisma.workItem.count({ where: orphanedWhere }),
      this.prisma.workItem.findMany({ where: staleWhere, select: selectFields, orderBy: { updatedAt: 'asc' }, take: limit }),
      this.prisma.workItem.count({ where: staleWhere }),
      this.prisma.workItem.count({ where: unloggedDenominatorWhere }),
      this.prisma.workItem.count({ where: orphanedDenominatorWhere }),
      this.prisma.workItem.count({ where: staleDenominatorWhere })
    ]);

    const toRow = (r: (typeof unloggedRows)[number]) => ({
      id: r.id, externalId: r.externalId, title: r.title, type: r.type, status: r.status,
      externalStatusName: r.externalStatusName, productId: r.productId, productName: r.product.name,
      updatedAt: r.updatedAt.toISOString()
    });
    const now = Date.now();

    // Per-product ranking — full uncapped groupBy, not a client-side count
    // over unloggedRows/orphanedRows/staleRows (those are capped at `limit`
    // and ordered oldest-first, which would silently bias the ranking
    // toward whichever product's backlog happens to be oldest). Only
    // meaningful in portfolio scope; a single-product view degenerates a
    // groupby to one row, same reasoning epics.index.tsx's byProductData
    // panel already gates on !currentProduct.
    let byProduct: {
      unloggedWork: Array<{ label: string; count: number }>;
      orphanedIssues: Array<{ label: string; count: number }>;
      staleInProgress: Array<{ label: string; count: number }>;
    } | null = null;
    if (!productId && tenantId) {
      const [products, unloggedGroups, orphanedGroups, staleGroups] = await Promise.all([
        this.prisma.product.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
        this.prisma.workItem.groupBy({ by: ['productId'], where: unloggedWhere, _count: true }),
        this.prisma.workItem.groupBy({ by: ['productId'], where: orphanedWhere, _count: true }),
        this.prisma.workItem.groupBy({ by: ['productId'], where: staleWhere, _count: true })
      ]);
      const nameById = new Map(products.map((p) => [p.id, p.name]));
      const toCategoryCounts = (groups: Array<{ productId: string; _count: unknown }>) =>
        groups
          .map((g) => ({ label: nameById.get(g.productId) ?? 'Unknown', count: g._count as unknown as number }))
          .sort((a, b) => b.count - a.count);
      byProduct = {
        unloggedWork: toCategoryCounts(unloggedGroups),
        orphanedIssues: toCategoryCounts(orphanedGroups),
        staleInProgress: toCategoryCounts(staleGroups)
      };
    }

    // Trend/breakdown — only computed when the caller supplies a window
    // (the frontend's date-range selector). See this method's return-type
    // doc comments for why unloggedWork gets a real trend but the other two
    // get an honest composition split instead.
    let unloggedWorkTrend: { current: number; previous: number; changePercent: number | null } | null = null;
    let orphanedBreakdown: { createdThisWindow: number; predatesWindow: number } | null = null;
    let staleBreakdown: { justCrossedThreshold: number; longStanding: number } | null = null;

    if (startDate && endDate) {
      const windowMs = endDate.getTime() - startDate.getTime();
      const previousEnd = new Date(startDate.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - windowMs);
      const staleWindowStart = new Date(staleThreshold.getTime() - windowMs);

      const [trendRows, createdThisWindow] = await Promise.all([
        this.prisma.workItem.findMany({ where: unloggedWhere, select: { resolvedAt: true, statusChangedAt: true, updatedAt: true } }),
        this.prisma.workItem.count({ where: { ...orphanedWhere, createdAt: { gte: startDate } } })
      ]);

      const countInWindow = (start: Date, end: Date) => trendRows.filter((r) => {
        const at = (r.resolvedAt ?? r.statusChangedAt ?? r.updatedAt).getTime();
        return at >= start.getTime() && at <= end.getTime();
      }).length;
      const current = countInWindow(startDate, endDate);
      const previous = countInWindow(previousStart, previousEnd);
      unloggedWorkTrend = {
        current, previous,
        changePercent: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null
      };

      orphanedBreakdown = { createdThisWindow, predatesWindow: orphanedCount - createdThisWindow };

      const justCrossedThreshold = await this.prisma.workItem.count({
        where: {
          ...scopeWhere, isActive: true, status: 'in_progress',
          OR: [
            { statusChangedAt: { gte: staleWindowStart, lt: staleThreshold } },
            { statusChangedAt: null, updatedAt: { gte: staleWindowStart, lt: staleThreshold } }
          ]
        }
      });
      staleBreakdown = { justCrossedThreshold, longStanding: staleCount - justCrossedThreshold };
    }

    return {
      unloggedWork: unloggedRows.map(toRow),
      orphanedIssues: orphanedRows.map(toRow),
      staleInProgress: staleRows.map((r) => ({
        ...toRow(r),
        daysStale: Math.floor((now - (r.statusChangedAt ?? r.updatedAt).getTime()) / (24 * 60 * 60 * 1000))
      })),
      counts: { unloggedWork: unloggedCount, orphanedIssues: orphanedCount, staleInProgress: staleCount },
      denominators: { unloggedWork: unloggedDenominator, orphanedIssues: orphanedDenominator, staleInProgress: staleDenominator },
      byProduct,
      unloggedWorkTrend,
      orphanedBreakdown,
      staleBreakdown,
      hasData: unloggedCount > 0 || orphanedCount > 0 || staleCount > 0
    };
  }

  /**
   * Per-assignee workload — item counts by status and real Jira worklog
   * hours — keyed by WorkItem.externalAssigneeId (Jira accountId / Azure
   * DevOps identity id), NOT by internal User.assigneeId or email.
   *
   * This is deliberately independent of two separate things that
   * getDeveloperHealthProfiles (Engineering Health) requires and this does
   * not: (1) the person having a QualiMetrix account at all, and (2) their
   * Jira email being visible via the API (Jira's per-user email-visibility
   * privacy setting can hide it for most real users on a given site — this
   * was confirmed against a real, live tenant's Jira connection during
   * development, not assumed, though the exact proportion varies by site).
   * externalAssigneeId/displayName come straight from Jira's assignee object
   * and Azure DevOps's AssignedTo identity, both of which are always present
   * regardless of email visibility — so this shows real workload for anyone
   * assigned a work item, whether or not they've ever logged into
   * QualiMetrix. `linkedUserId` is included only as a courtesy cross-
   * reference when an internal User happens to share the resolved email;
   * nothing here depends on it being present.
   */
  async getAssigneeWorkload(productId?: string, tenantId?: string, limit: number = 100): Promise<{
    assignees: Array<{
      externalAssigneeId: string;
      displayName: string;
      linkedUserId: string | null;
      totalItems: number;
      itemsByStatus: Record<string, number>;
      hoursLoggedSeconds: number;
    }>;
    unassignedCount: number;
    hasData: boolean;
  }> {
    const where: any = {
      isActive: true,
      externalAssigneeId: { not: null },
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const [statusGroups, unassignedCount] = await Promise.all([
      this.prisma.workItem.groupBy({
        by: ['externalAssigneeId', 'status'],
        where,
        _count: true
      }),
      this.prisma.workItem.count({
        where: {
          isActive: true,
          externalAssigneeId: null,
          ...(productId ? { productId } : tenantId ? { tenantId } : {})
        }
      })
    ]);

    if (statusGroups.length === 0) {
      return { assignees: [], unassignedCount, hasData: false };
    }

    const assigneeIds = Array.from(new Set(statusGroups.map((g) => g.externalAssigneeId as string)));

    // One representative displayName (and, if present, assigneeEmail from
    // externalMetadata) per assignee — groupBy can't return a non-grouped
    // column, so this is a second, targeted lookup rather than scanning
    // every matching WorkItem row again.
    const [nameRows, worklogSums] = await Promise.all([
      this.prisma.workItem.findMany({
        where: { externalAssigneeId: { in: assigneeIds } },
        distinct: ['externalAssigneeId'],
        select: { externalAssigneeId: true, externalAssigneeName: true, externalMetadata: true }
      }),
      this.prisma.workLog.groupBy({
        by: ['authorAccountId'],
        where: {
          authorAccountId: { in: assigneeIds },
          ...(productId ? { workItem: { productId } } : tenantId ? { tenantId } : {})
        },
        _sum: { timeSpentSeconds: true }
      })
    ]);

    const nameByAssigneeId = new Map(nameRows.map((r) => [r.externalAssigneeId as string, r.externalAssigneeName]));
    const emailByAssigneeId = new Map(
      nameRows.map((r) => [r.externalAssigneeId as string, (r.externalMetadata as any)?.assigneeEmail as string | undefined])
    );
    const candidateEmails = Array.from(new Set(
      Array.from(emailByAssigneeId.values()).filter((e): e is string => !!e)
    ));
    // Courtesy cross-reference only — matched purely for display, never used
    // to gate whether an assignee's workload shows up (unlike
    // getDeveloperHealthProfiles, which requires this match to exist at all).
    const linkedUsers = candidateEmails.length
      ? await this.prisma.user.findMany({
          where: { email: { in: candidateEmails, mode: 'insensitive' } },
          select: { id: true, email: true }
        })
      : [];
    const userIdByEmail = new Map(linkedUsers.map((u) => [u.email.toLowerCase(), u.id]));
    const hoursByAssigneeId = new Map(worklogSums.map((w) => [w.authorAccountId as string, w._sum.timeSpentSeconds ?? 0]));

    const rows = assigneeIds.map((id) => {
      const itemsByStatus: Record<string, number> = {};
      let totalItems = 0;
      for (const g of statusGroups) {
        if (g.externalAssigneeId !== id) continue;
        const count = g._count as unknown as number;
        itemsByStatus[g.status] = (itemsByStatus[g.status] ?? 0) + count;
        totalItems += count;
      }
      const email = emailByAssigneeId.get(id);
      return {
        externalAssigneeId: id,
        displayName: nameByAssigneeId.get(id) ?? id,
        linkedUserId: email ? userIdByEmail.get(email.toLowerCase()) ?? null : null,
        totalItems,
        itemsByStatus,
        hoursLoggedSeconds: hoursByAssigneeId.get(id) ?? 0
      };
    });

    rows.sort((a, b) => b.totalItems - a.totalItems);

    return { assignees: rows.slice(0, limit), unassignedCount, hasData: rows.length > 0 };
  }

  /**
   * Real logged hours (from Jira worklogs) per person against an ASSUMED
   * standard capacity of 8h per business day in the range — Jira has no
   * leave/PTO/capacity calendar, so this denominator is a stated assumption,
   * never a measured fact. Someone part-time, or on leave for part of the
   * range, will show a misleadingly low or high % against this baseline.
   * Callers must keep the assumption visible in the UI, not just the number.
   *
   * Jira-only (WorkLog has no Azure DevOps equivalent — see the WorkLog
   * model's own doc comment on why that's a permanent platform gap, not a
   * v1 omission).
   */
  async getTeamUtilization(productId?: string, tenantId?: string, startDate?: Date, endDate?: Date): Promise<{
    people: Array<{ authorAccountId: string | null; name: string; loggedHours: number; capacityHours: number; utilizationPercent: number }>;
    capacityHoursPerPerson: number;
    businessDays: number;
    avgUtilizationPercent: number | null;
    hasData: boolean;
  }> {
    const end = endDate ?? new Date();
    const start = startDate ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const scopeWhere = productId ? { workItem: { productId } } : tenantId ? { tenantId } : {};

    const rows = await this.prisma.workLog.groupBy({
      by: ['authorAccountId'],
      where: { ...scopeWhere, authorAccountId: { not: null }, startedAt: { gte: start, lte: end } },
      _sum: { timeSpentSeconds: true }
    });

    if (rows.length === 0) {
      return { people: [], capacityHoursPerPerson: 0, businessDays: 0, avgUtilizationPercent: null, hasData: false };
    }

    const accountIds = rows.map((r) => r.authorAccountId as string);
    const nameRows = await this.prisma.workLog.findMany({
      where: { authorAccountId: { in: accountIds } },
      distinct: ['authorAccountId'],
      select: { authorAccountId: true, authorName: true }
    });
    const nameByAccountId = new Map(nameRows.map((r) => [r.authorAccountId, r.authorName]));

    const businessDays = countBusinessDays(start, end);
    const capacityHoursPerPerson = businessDays * 8;

    const people = rows
      .map((r) => {
        const loggedHours = Math.round(((r._sum.timeSpentSeconds ?? 0) / 3600) * 10) / 10;
        const utilizationPercent = capacityHoursPerPerson > 0
          ? Math.round((loggedHours / capacityHoursPerPerson) * 1000) / 10
          : 0;
        return {
          authorAccountId: r.authorAccountId,
          name: nameByAccountId.get(r.authorAccountId) ?? (r.authorAccountId as string),
          loggedHours,
          capacityHours: capacityHoursPerPerson,
          utilizationPercent
        };
      })
      .sort((a, b) => b.loggedHours - a.loggedHours);

    const avgUtilizationPercent = Math.round(
      (people.reduce((sum, p) => sum + p.utilizationPercent, 0) / people.length) * 10
    ) / 10;

    return { people, capacityHoursPerPerson, businessDays, avgUtilizationPercent, hasData: true };
  }

  /**
   * Real $ cost = hours logged x hourly rate — computed ONLY for worklog
   * authors who have a rate set via setWorklogAuthorRate below (keyed by
   * their real Jira accountId, never a QualiMetrix account or email — see
   * WorklogAuthorRate's model comment for why).
   *
   * Most real teammates won't have a rate set yet (a PM sets these
   * incrementally, never defaulted or estimated) — so `unmatchedHours` and
   * `hoursWithoutRate` disclose exactly how much real logged time is
   * missing from totalCostCents, rather than silently under-reporting cost
   * as if the total were complete.
   *
   * @param rateTenantId Always the caller's own tenant, independent of
   * `productId`/`tenantId` scoping below — rates are set per accountId per
   * tenant, not per product, so the rate lookup needs the tenant even when
   * `productId` narrows which worklogs count toward the hours.
   */
  async getTeamCost(rateTenantId: string, productId?: string, tenantId?: string, startDate?: Date, endDate?: Date): Promise<{
    totalCostCents: number;
    people: Array<{ name: string; loggedHours: number; hourlyRateCents: number; costCents: number }>;
    /** Real logged hours with no author accountId at all — can never be matched to anyone. */
    unmatchedHours: number;
    /** Real logged hours from an author with no rate set yet. */
    hoursWithoutRate: number;
    hasData: boolean;
  }> {
    const end = endDate ?? new Date();
    const start = startDate ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const scopeWhere = productId ? { workItem: { productId } } : tenantId ? { tenantId } : {};

    const rows = await this.prisma.workLog.groupBy({
      by: ['authorAccountId', 'authorName'],
      where: { ...scopeWhere, startedAt: { gte: start, lte: end } },
      _sum: { timeSpentSeconds: true }
    });

    if (rows.length === 0) {
      return { totalCostCents: 0, people: [], unmatchedHours: 0, hoursWithoutRate: 0, hasData: false };
    }

    const rates = await this.prisma.worklogAuthorRate.findMany({ where: { tenantId: rateTenantId } });
    const rateByAccountId = new Map(rates.map((r) => [r.authorAccountId, r.hourlyRateCents]));

    let totalCostCents = 0;
    let unmatchedHours = 0;
    let hoursWithoutRate = 0;
    const people: Array<{ name: string; loggedHours: number; hourlyRateCents: number; costCents: number }> = [];

    for (const row of rows) {
      const seconds = row._sum.timeSpentSeconds ?? 0;
      const hours = seconds / 3600;
      if (!row.authorAccountId) {
        unmatchedHours += hours;
        continue;
      }
      const rate = rateByAccountId.get(row.authorAccountId);
      if (rate == null) {
        hoursWithoutRate += hours;
        continue;
      }
      const costCents = Math.round(hours * rate);
      totalCostCents += costCents;
      people.push({ name: row.authorName ?? row.authorAccountId, loggedHours: Math.round(hours * 10) / 10, hourlyRateCents: rate, costCents });
    }

    people.sort((a, b) => b.costCents - a.costCents);

    return {
      totalCostCents,
      people,
      unmatchedHours: Math.round(unmatchedHours * 10) / 10,
      hoursWithoutRate: Math.round(hoursWithoutRate * 10) / 10,
      hasData: true
    };
  }

  /**
   * Real, all-time (no date window — rate eligibility isn't a report metric)
   * roster of Jira/ADO worklog authors for this tenant, with any rate
   * already set. Drives the hourly-rate editor: every entry here is a real
   * contributor by construction, since it's built from actual WorkLog rows,
   * not the QualiMetrix user directory (which may hold unrelated accounts).
   */
  async getWorklogAuthors(tenantId: string): Promise<Array<{
    authorAccountId: string;
    authorName: string | null;
    totalHours: number;
    hourlyRateCents: number | null;
  }>> {
    const rows = await this.prisma.workLog.groupBy({
      by: ['authorAccountId', 'authorName'],
      where: { tenantId, authorAccountId: { not: null } },
      _sum: { timeSpentSeconds: true }
    });

    const rates = await this.prisma.worklogAuthorRate.findMany({ where: { tenantId } });
    const rateByAccountId = new Map(rates.map((r) => [r.authorAccountId, r.hourlyRateCents]));

    // A person's display name can appear more than once if it ever changed
    // between worklog entries — collapse to one row per accountId, summing
    // hours and keeping the latest-seen name (arbitrary tie-break; names
    // rarely differ across a person's own worklogs).
    const byAccount = new Map<string, { authorAccountId: string; authorName: string | null; totalHours: number }>();
    for (const row of rows) {
      const hours = (row._sum.timeSpentSeconds ?? 0) / 3600;
      const existing = byAccount.get(row.authorAccountId!);
      if (existing) {
        existing.totalHours += hours;
        if (row.authorName) existing.authorName = row.authorName;
      } else {
        byAccount.set(row.authorAccountId!, { authorAccountId: row.authorAccountId!, authorName: row.authorName, totalHours: hours });
      }
    }

    return Array.from(byAccount.values())
      .map((a) => ({ ...a, totalHours: Math.round(a.totalHours * 10) / 10, hourlyRateCents: rateByAccountId.get(a.authorAccountId) ?? null }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }

  /** `hourlyRateCents: null` clears a previously-set rate. */
  async setWorklogAuthorRate(
    tenantId: string,
    authorAccountId: string,
    authorName: string | null,
    hourlyRateCents: number | null
  ): Promise<{ authorAccountId: string; hourlyRateCents: number | null }> {
    if (hourlyRateCents === null) {
      await this.prisma.worklogAuthorRate.deleteMany({ where: { tenantId, authorAccountId } });
      return { authorAccountId, hourlyRateCents: null };
    }
    const rate = await this.prisma.worklogAuthorRate.upsert({
      where: { tenantId_authorAccountId: { tenantId, authorAccountId } },
      create: { tenantId, authorAccountId, authorName, hourlyRateCents },
      update: { hourlyRateCents, ...(authorName ? { authorName } : {}) }
    });
    return { authorAccountId: rate.authorAccountId, hourlyRateCents: rate.hourlyRateCents };
  }

  /**
   * Per-assignee feature/fix/maintenance split from real WorkItem.type —
   * story->feature, bug->fix, task->maintenance. Scoped to resolved/completed
   * items only (an in-progress item hasn't actually landed as one category
   * of work yet) and keyed by externalAssigneeId, same reasoning as
   * getAssigneeWorkload: works for anyone Jira knows about, no QualiMetrix
   * account required. Subtasks and epics are excluded — they'd double-count
   * work already attributed to their parent story/bug/task.
   */
  async getFeatureFixAllocation(productId?: string, tenantId?: string): Promise<{
    assignees: Array<{
      externalAssigneeId: string;
      displayName: string;
      feature: number;
      fix: number;
      maintenance: number;
      total: number;
    }>;
    hasData: boolean;
  }> {
    const where: any = {
      isActive: true,
      externalAssigneeId: { not: null },
      status: { in: ['resolved', 'completed'] },
      type: { in: ['story', 'bug', 'task'] },
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const groups = await this.prisma.workItem.groupBy({
      by: ['externalAssigneeId', 'type'],
      where,
      _count: true
    });

    if (groups.length === 0) return { assignees: [], hasData: false };

    const assigneeIds = Array.from(new Set(groups.map((g) => g.externalAssigneeId as string)));
    const nameRows = await this.prisma.workItem.findMany({
      where: { externalAssigneeId: { in: assigneeIds } },
      distinct: ['externalAssigneeId'],
      select: { externalAssigneeId: true, externalAssigneeName: true }
    });
    const nameByAssigneeId = new Map(nameRows.map((r) => [r.externalAssigneeId as string, r.externalAssigneeName]));

    const TYPE_TO_CATEGORY: Record<string, 'feature' | 'fix' | 'maintenance'> = {
      story: 'feature', bug: 'fix', task: 'maintenance'
    };

    const byAssignee = new Map<string, { feature: number; fix: number; maintenance: number }>();
    for (const g of groups) {
      const id = g.externalAssigneeId as string;
      const category = TYPE_TO_CATEGORY[g.type];
      if (!category) continue;
      const entry = byAssignee.get(id) ?? { feature: 0, fix: 0, maintenance: 0 };
      entry[category] += g._count as unknown as number;
      byAssignee.set(id, entry);
    }

    const assignees = Array.from(byAssignee.entries())
      .map(([id, counts]) => ({
        externalAssigneeId: id,
        displayName: nameByAssigneeId.get(id) ?? id,
        ...counts,
        total: counts.feature + counts.fix + counts.maintenance
      }))
      .sort((a, b) => b.total - a.total);

    return { assignees, hasData: assignees.length > 0 };
  }

  /**
   * Knowledge-silo / bus-factor detection: for each label/tag attached to
   * resolved bugs (Jira labels or Azure DevOps tags — whichever the
   * connected tenant uses), what share was resolved by a single assignee.
   * Built on labels/tags rather than a dedicated "component" field: Jira's
   * Components field and ADO's Area Path both exist for this purpose, but
   * plenty of real teams never populate them, whereas labels/tags are
   * free-text and used opportunistically almost everywhere — shipping a
   * feature that's honestly-empty for any team that hasn't adopted
   * Components isn't more useful than one built on whatever tagging data
   * actually exists. Process/severity/sprint labels (e.g. "severity-2",
   * "sprint-aug-sprint-1") are filtered out as noise — they're not a module
   * or category in any sense relevant to bus-factor risk.
   *
   * A label/tag needs at least `minBugsPerLabel` resolved bugs before it's
   * surfaced at all, so one bug with one label never reads as "100% risk."
   */
  async getKnowledgeSilo(productId?: string, tenantId?: string, minBugsPerLabel: number = 3): Promise<{
    labels: Array<{
      label: string;
      totalBugs: number;
      topAssignee: { externalAssigneeId: string; displayName: string; count: number; percent: number };
      risk: 'high' | 'medium' | 'low';
    }>;
    hasData: boolean;
  }> {
    const where: any = {
      isActive: true,
      type: 'bug',
      status: { in: ['resolved', 'completed'] },
      externalAssigneeId: { not: null },
      ...(productId ? { productId } : tenantId ? { tenantId } : {})
    };

    const items = await this.prisma.workItem.findMany({
      where,
      select: { labels: true, externalAssigneeId: true, externalAssigneeName: true }
    });

    const countsByLabel = new Map<string, Map<string, { name: string; count: number }>>();
    for (const item of items) {
      const assigneeId = item.externalAssigneeId as string;
      const assigneeName = item.externalAssigneeName ?? assigneeId;
      for (const label of item.labels) {
        if (NOISE_LABEL.test(label)) continue;
        const byAssignee = countsByLabel.get(label) ?? new Map();
        const entry = byAssignee.get(assigneeId) ?? { name: assigneeName, count: 0 };
        entry.count += 1;
        byAssignee.set(assigneeId, entry);
        countsByLabel.set(label, byAssignee);
      }
    }

    const rows: Array<{
      label: string;
      totalBugs: number;
      topAssignee: { externalAssigneeId: string; displayName: string; count: number; percent: number };
      risk: 'high' | 'medium' | 'low';
    }> = [];

    for (const [label, byAssignee] of countsByLabel) {
      const totalBugs = Array.from(byAssignee.values()).reduce((sum, v) => sum + v.count, 0);
      if (totalBugs < minBugsPerLabel) continue;

      const [topId, top] = Array.from(byAssignee.entries()).sort((a, b) => b[1].count - a[1].count)[0];
      const percent = Math.round((top.count / totalBugs) * 1000) / 10;
      const risk: 'high' | 'medium' | 'low' = percent >= 70 ? 'high' : percent >= 50 ? 'medium' : 'low';

      rows.push({
        label,
        totalBugs,
        topAssignee: { externalAssigneeId: topId, displayName: top.name, count: top.count, percent },
        risk
      });
    }

    rows.sort((a, b) => b.topAssignee.percent - a.topAssignee.percent);

    return { labels: rows, hasData: rows.length > 0 };
  }
}

// Export singleton instance
export default new AnalyticsService();