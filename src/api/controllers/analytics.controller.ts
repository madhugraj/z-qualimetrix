import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import analyticsService from '../services/analytics.service';

/**
 * Analytics Controller
 * Handles quality metrics, KPIs, and performance indicators
 */
export class AnalyticsController extends BaseController {

  /**
   * Get MTTR (Mean Time To Resolve) metrics
   */
  getMTTR = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId, startDate, endDate } = req.query;

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const mttr = await analyticsService.calculateMTTR(
      productId as string,
      startDateObj,
      endDateObj
    );

    return this.success(res, mttr);
  });

  /**
   * Get defect leakage metrics
   */
  getDefectLeakage = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId, startDate, endDate } = req.query;

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const defectLeakage = await analyticsService.calculateDefectLeakage(
      productId as string,
      startDateObj,
      endDateObj
    );

    return this.success(res, defectLeakage);
  });

  /**
   * Get test execution metrics
   */
  getTestExecutionMetrics = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId, startDate, endDate } = req.query;

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const testMetrics = await analyticsService.calculateTestExecutionMetrics(
      productId as string,
      startDateObj,
      endDateObj
    );

    return this.success(res, testMetrics);
  });

  /**
   * Get release readiness score
   */
  getReleaseReadiness = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;

    const error = this.validateRequired(req.params, ['productId']);
    if (error) {
      return this.error(res, error, 400);
    }

    const releaseReadiness = await analyticsService.calculateReleaseReadiness(productId);

    return this.success(res, releaseReadiness);
  });

  /**
   * Get team productivity metrics
   */
  getTeamProductivity = this.asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, startDate, endDate } = req.query;

    const error = this.validateRequired(req.query, ['tenantId']);
    if (error) {
      return this.error(res, error, 400);
    }

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const teamProductivity = await analyticsService.calculateTeamProductivity(
      tenantId as string,
      startDateObj,
      endDateObj
    );

    return this.success(res, teamProductivity);
  });

  /**
   * Get comprehensive product analytics
   */
  getProductAnalytics = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const { startDate, endDate } = req.query;

    const error = this.validateRequired(req.params, ['productId']);
    if (error) {
      return this.error(res, error, 400);
    }

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const productAnalytics = await analyticsService.getProductAnalytics(
      productId,
      startDateObj,
      endDateObj
    );

    return this.success(res, productAnalytics);
  });

  /**
   * Get comprehensive tenant analytics
   */
  getTenantAnalytics = this.asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const { startDate, endDate } = req.query;

    const error = this.validateRequired(req.params, ['tenantId']);
    if (error) {
      return this.error(res, error, 400);
    }

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const tenantAnalytics = await analyticsService.getTenantAnalytics(
      tenantId,
      startDateObj,
      endDateObj
    );

    return this.success(res, tenantAnalytics);
  });

  /**
   * Get quality dashboard summary
   * Combines multiple metrics for a comprehensive view
   */
  getQualityDashboard = this.asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, productId } = req.query;

    if (!tenantId && !productId) {
      return this.error(res, 'Either tenantId or productId is required', 400);
    }

    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

    try {
      let dashboardData: any = {};

      if (productId) {
        // Product-level dashboard
        const [mttr, defectLeakage, testMetrics, releaseReadiness] = await Promise.all([
          analyticsService.calculateMTTR(productId as string, startDate),
          analyticsService.calculateDefectLeakage(productId as string, startDate),
          analyticsService.calculateTestExecutionMetrics(productId as string, startDate),
          analyticsService.calculateReleaseReadiness(productId as string)
        ]);

        dashboardData = {
          level: 'product',
          productId,
          metrics: {
            mttr: { value: mttr.overall, unit: 'hours', trend: 'stable' },
            defectLeakage: { value: defectLeakage.rate, unit: '%', trend: 'decreasing' },
            testPassRate: { value: testMetrics.passRate, unit: '%', trend: 'increasing' },
            automationRate: { value: testMetrics.automationRate, unit: '%', trend: 'stable' },
            releaseReadiness: { score: releaseReadiness.overallScore, recommendation: releaseReadiness.recommendation }
          },
          risks: releaseReadiness.risks,
          lastUpdated: new Date().toISOString()
        };
      } else {
        // Tenant-level dashboard
        const tenantAnalytics = await analyticsService.getTenantAnalytics(tenantId as string, startDate);

        dashboardData = {
          level: 'tenant',
          tenantId,
          metrics: {
            overallQualityScore: { value: tenantAnalytics.overallQualityScore, unit: 'score' },
            teamVelocity: { value: tenantAnalytics.teamProductivity.teamVelocity, unit: 'points' },
            totalWorkItems: { value: tenantAnalytics.teamProductivity.completedWorkItems, unit: 'items' },
            topContributors: { value: tenantAnalytics.teamProductivity.topContributors.length, unit: 'members' }
          },
          products: tenantAnalytics.products,
          lastUpdated: new Date().toISOString()
        };
      }

      return this.success(res, dashboardData);
    } catch (error: any) {
      return this.error(res, error.message, 500);
    }
  });

  /**
   * Get quality trends over time
   */
  getQualityTrends = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId, period } = req.query;

    const timePeriod = period && typeof period === 'string' ? period : '30d';
    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '180d': 180
    };

    const days = daysMap[timePeriod] || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const [mttr, defectLeakage, testMetrics] = await Promise.all([
        analyticsService.calculateMTTR(productId as string, startDate),
        analyticsService.calculateDefectLeakage(productId as string, startDate),
        analyticsService.calculateTestExecutionMetrics(productId as string, startDate)
      ]);

      const trends = {
        period: timePeriod,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
        metrics: {
          mttr: {
            current: mttr.overall,
            unit: 'hours',
            status: mttr.overall < 24 ? 'good' : mttr.overall < 48 ? 'warning' : 'critical'
          },
          defectLeakage: {
            current: defectLeakage.rate,
            unit: '%',
            status: defectLeakage.rate < 5 ? 'good' : defectLeakage.rate < 10 ? 'warning' : 'critical'
          },
          testExecution: {
            current: testMetrics.passRate,
            unit: '%',
            status: testMetrics.passRate > 90 ? 'good' : testMetrics.passRate > 75 ? 'warning' : 'critical'
          }
        },
        trends: {
          defectLeakage: defectLeakage.trend,
          testExecution: testMetrics.executionTrend
        }
      };

      return this.success(res, trends);
    } catch (error: any) {
      return this.error(res, error.message, 500);
    }
  });
}

// Export singleton instance
export default new AnalyticsController();