import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import analyticsService from '../services/analytics.service';
import { canAccessProduct } from '../middleware/auth.middleware';

/**
 * Analytics Controller
 * Handles quality metrics, KPIs, and performance indicators
 */
export class AnalyticsController extends BaseController {

  private isPortfolioRole(role?: string): boolean {
    return role === 'pm' || role === 'executive';
  }

  /**
   * Checks the caller may read `productId` (own tenant, plus membership for
   * non-pm/executive roles). Writes the 403 itself on failure so call sites
   * just need `if (!(await this.requireProductAccess(req, res, id))) return;`.
   */
  private async requireProductAccess(req: Request, res: Response, productId: string): Promise<boolean> {
    if (!req.user || !(await canAccessProduct(req.user, productId))) {
      this.error(res, 'Not scoped to this product', 403);
      return false;
    }
    return true;
  }

  /**
   * Resolves the tenant to scope a tenant-wide query to. Always the caller's
   * own tenant — a client-supplied `provided` value (path or query param) is
   * only ever compared against it, never substituted in its place, so
   * requesting another tenant's id 403s instead of silently running against
   * the caller's own tenant.
   */
  private resolveScopedTenantId(req: Request, res: Response, provided?: string): string | null {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      this.error(res, 'No tenant associated with this account', 403);
      return null;
    }
    if (provided && provided !== tenantId) {
      this.error(res, 'Not scoped to this tenant', 403);
      return null;
    }
    return tenantId;
  }

  /**
   * Resolves scope for endpoints that accept an optional productId and fall
   * back to a tenant-wide aggregate when it's absent. The fallback is only
   * available to pm/executive (org-wide by design) — a po/developer/tester
   * omitting productId would otherwise get an aggregate spanning products
   * outside their TenantMembership.accessibleProducts grant, defeating the
   * per-product membership check entirely. Writes the error response itself
   * and returns null on any failure.
   */
  private async resolveProductOrTenantScope(
    req: Request,
    res: Response,
    productId?: string
  ): Promise<{ productId?: string; tenantId?: string } | null> {
    if (productId) {
      if (!(await this.requireProductAccess(req, res, productId))) return null;
      return { productId };
    }

    if (!this.isPortfolioRole(req.user?.role)) {
      this.error(res, 'productId is required for this role', 400);
      return null;
    }

    const tenantId = this.resolveScopedTenantId(req, res);
    if (!tenantId) return null;
    return { tenantId };
  }

  /**
   * Get MTTR (Mean Time To Resolve) metrics
   */
  getMTTR = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId, startDate, endDate } = req.query;

    const scope = await this.resolveProductOrTenantScope(req, res, productId as string | undefined);
    if (!scope) return;

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const mttr = await analyticsService.calculateMTTR(scope.productId, startDateObj, endDateObj, scope.tenantId);

    return this.success(res, mttr);
  });

  /**
   * Get defect leakage metrics
   */
  getDefectLeakage = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId, startDate, endDate } = req.query;

    const scope = await this.resolveProductOrTenantScope(req, res, productId as string | undefined);
    if (!scope) return;

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const defectLeakage = await analyticsService.calculateDefectLeakage(
      scope.productId,
      startDateObj,
      endDateObj,
      scope.tenantId
    );

    return this.success(res, defectLeakage);
  });

  /**
   * Get test execution metrics
   */
  getTestExecutionMetrics = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId, startDate, endDate } = req.query;

    const scope = await this.resolveProductOrTenantScope(req, res, productId as string | undefined);
    if (!scope) return;

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const testMetrics = await analyticsService.calculateTestExecutionMetrics(
      scope.productId,
      startDateObj,
      endDateObj,
      scope.tenantId
    );

    return this.success(res, testMetrics);
  });

  /**
   * Get per-sprint velocity trend (story points + bugs created/resolved)
   */
  getVelocityTrend = this.asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const { limit } = req.query;

    const error = this.validateRequired(req.params, ['productId']);
    if (error) {
      return this.error(res, error, 400);
    }

    const velocityTrend = await analyticsService.calculateVelocityTrend(
      productId,
      limit ? Number(limit) : undefined
    );

    return this.success(res, velocityTrend);
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
    const { tenantId: providedTenantId, startDate, endDate } = req.query;

    const tenantId = this.resolveScopedTenantId(req, res, providedTenantId as string | undefined);
    if (!tenantId) return;

    const startDateObj = startDate ? new Date(startDate as string) : undefined;
    const endDateObj = endDate ? new Date(endDate as string) : undefined;

    const teamProductivity = await analyticsService.calculateTeamProductivity(
      tenantId,
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
    const { startDate, endDate } = req.query;

    const tenantId = this.resolveScopedTenantId(req, res, req.params.tenantId);
    if (!tenantId) return;

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
    const { tenantId: providedTenantId, productId } = req.query;

    if (!providedTenantId && !productId) {
      return this.error(res, 'Either tenantId or productId is required', 400);
    }

    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

    try {
      let dashboardData: any = {};

      if (productId) {
        if (!(await this.requireProductAccess(req, res, productId as string))) return;

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
        // Tenant-level dashboard — pm/executive only, same reasoning as
        // resolveProductOrTenantScope.
        if (!this.isPortfolioRole(req.user?.role)) {
          return this.error(res, 'tenantId view requires pm or executive', 403);
        }
        const tenantId = this.resolveScopedTenantId(req, res, providedTenantId as string | undefined);
        if (!tenantId) return;

        const tenantAnalytics = await analyticsService.getTenantAnalytics(tenantId, startDate);

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

    const scope = await this.resolveProductOrTenantScope(req, res, productId as string | undefined);
    if (!scope) return;

    try {
      const [mttr, defectLeakage, testMetrics] = await Promise.all([
        analyticsService.calculateMTTR(scope.productId, startDate, undefined, scope.tenantId),
        analyticsService.calculateDefectLeakage(scope.productId, startDate, undefined, scope.tenantId),
        analyticsService.calculateTestExecutionMetrics(scope.productId, startDate, undefined, scope.tenantId)
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
