import { PrismaClient } from "@prisma/client";
import prisma from "../../lib/prisma";

/**
 * Leadership-facing GPU-compute rental spend analytics — reads
 * GpuComputeUsageEvent (see prisma/schema.prisma). No budget-consumed
 * percentage anywhere here: the existing AI-token budget pacing feature
 * uses entirely hardcoded, never-actually-set numbers (see
 * src/lib/ai-usage.server.ts's seatBudgetUsd/ORG_SPRINT_BUDGET_USD) — this
 * feature deliberately doesn't repeat that. utilizationPct is always null
 * today (no Monitoring-API integration yet); every method here reports
 * spend/cost only and never fabricates a utilization figure from cost data.
 */
export class GpuSpendAnalyticsService {
  constructor(private prisma: PrismaClient) {}

  private weekBuckets(startDate?: Date, endDate?: Date, fallbackWeeks = 8): Array<{ start: Date; end: Date; label: string }> {
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    if (startDate) start.setTime(new Date(startDate).getTime());
    else start.setDate(start.getDate() - (fallbackWeeks * 7 - 1));
    start.setHours(0, 0, 0, 0);

    const buckets: Array<{ start: Date; end: Date; label: string }> = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const bucketStart = new Date(cursor);
      const bucketEnd = new Date(cursor);
      bucketEnd.setDate(bucketEnd.getDate() + 6);
      bucketEnd.setHours(23, 59, 59, 999);
      if (bucketEnd.getTime() > end.getTime()) bucketEnd.setTime(end.getTime());
      buckets.push({ start: bucketStart, end: bucketEnd, label: bucketStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }) });
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets.slice(-12);
  }

  async getSpendTrend(tenantId: string, startDate?: Date, endDate?: Date): Promise<{
    trend: Array<{ period: string; costUsd: number }>;
    hasData: boolean;
  }> {
    const buckets = this.weekBuckets(startDate, endDate);
    const events = await this.prisma.gpuComputeUsageEvent.findMany({
      where: { tenantId, date: { gte: buckets[0]?.start, lte: buckets[buckets.length - 1]?.end } },
      select: { date: true, costUsd: true },
    });

    const trend = buckets
      .map((bucket) => {
        const costUsd = events
          .filter((e) => e.date.getTime() >= bucket.start.getTime() && e.date.getTime() <= bucket.end.getTime())
          .reduce((sum, e) => sum + e.costUsd, 0);
        return { period: bucket.label, costUsd: Math.round(costUsd * 100) / 100 };
      })
      .filter((point) => point.costUsd > 0);

    return { trend, hasData: trend.length > 0 };
  }

  async getSpendBySquad(tenantId: string): Promise<{
    breakdown: Array<{ squad: string; costUsd: number }>;
    hasData: boolean;
  }> {
    const rows = await this.prisma.gpuComputeUsageEvent.groupBy({
      by: ["squad"],
      where: { tenantId },
      _sum: { costUsd: true },
    });
    const breakdown = rows
      .map((r) => ({ squad: r.squad ?? "Unmapped", costUsd: Math.round((r._sum.costUsd ?? 0) * 100) / 100 }))
      .sort((a, b) => b.costUsd - a.costUsd);
    return { breakdown, hasData: breakdown.length > 0 };
  }

  async getSpendByGpuType(tenantId: string): Promise<{
    breakdown: Array<{ gpuType: string; costUsd: number }>;
    hasData: boolean;
  }> {
    const rows = await this.prisma.gpuComputeUsageEvent.groupBy({
      by: ["gpuType"],
      where: { tenantId },
      _sum: { costUsd: true },
    });
    const breakdown = rows
      .map((r) => ({ gpuType: r.gpuType ?? "Unrecognized SKU", costUsd: Math.round((r._sum.costUsd ?? 0) * 100) / 100 }))
      .sort((a, b) => b.costUsd - a.costUsd);
    return { breakdown, hasData: breakdown.length > 0 };
  }

  async getSummary(tenantId: string): Promise<{
    totalCostUsd: number;
    totalGpuHours: number | null;
    connections: Array<{ id: string; provider: string; status: string; lastSyncedAt: string | null; externalAccountId: string }>;
    hasData: boolean;
  }> {
    const [totals, connections] = await Promise.all([
      this.prisma.gpuComputeUsageEvent.aggregate({
        where: { tenantId },
        _sum: { costUsd: true, gpuHours: true },
      }),
      this.prisma.aiProviderConnection.findMany({
        where: { tenantId, isActive: true, vendor: { in: ["gcp", "aws", "azure", "krutrim"] } },
        select: { id: true, vendor: true, status: true, lastSyncedAt: true, externalAccountId: true },
      }),
    ]);

    return {
      totalCostUsd: Math.round((totals._sum.costUsd ?? 0) * 100) / 100,
      totalGpuHours: totals._sum.gpuHours ?? null,
      connections: connections.map((c) => ({
        id: c.id,
        provider: c.vendor,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
        externalAccountId: c.externalAccountId,
      })),
      hasData: (totals._sum.costUsd ?? 0) > 0,
    };
  }
}

export const gpuSpendAnalyticsService = new GpuSpendAnalyticsService(prisma);
export default gpuSpendAnalyticsService;
