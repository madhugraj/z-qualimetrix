/**
 * Tool catalog for the PM/Leadership analytics assistant. Thin adapters over
 * already-tenant-scoped analytics services — deliberately NOT a generic
 * NL-to-SQL layer. The model may request a tool with a `productId` and/or
 * date range; it is never trusted with tenant identity. Every executor
 * resolves scope via `resolveProductOrTenantScope`/`canAccessProduct`
 * (the same checks `analytics.controller.ts` enforces at the route layer)
 * before touching the database, using `tenantId`/`role` from the
 * authenticated session — never from the model's tool-call arguments.
 *
 * Deliberately excludes anything still backed by `src/lib/qm-people.ts`
 * (feature/fix allocation, knowledge silos, training suggestions) — that
 * stays hardcoded sample data with no real data path yet. Burnout index/
 * after-hours %/weekend activity moved to real signal in
 * engineering-health.service.ts and IS exposed below (get_developer_health_profiles).
 */
import { AuthenticatedUser, resolveProductOrTenantScope, ScopeError } from '../middleware/auth.middleware';
import analyticsService from './analytics.service';
import productRepositoryService from './product-repository.service';
import { getCommitAttributionSummary, type CommitAttributionSummary } from './commit-attribution.service';
import gpuSpendAnalyticsService from './gpu-spend-analytics.service';
import { getDeveloperHealthProfiles } from './engineering-health.service';
import type { ToolSchema } from './assistant-providers';

const productIdProp = {
  productId: {
    type: 'string',
    description: 'Optional product id to scope the query to a single product. Omit for a tenant-wide aggregate (only meaningful for pm/executive callers, which is already enforced server-side).',
  },
} as const;

const dateRangeProps = {
  startDate: { type: 'string', description: 'ISO date (YYYY-MM-DD), inclusive start of range. Omit for no lower bound.' },
  endDate: { type: 'string', description: 'ISO date (YYYY-MM-DD), inclusive end of range. Omit for no upper bound.' },
} as const;

function parseDate(v: unknown): Date | undefined {
  return typeof v === 'string' && v.trim() ? new Date(v) : undefined;
}

interface ToolDef extends ToolSchema {
  execute: (args: Record<string, unknown>, user: AuthenticatedUser) => Promise<unknown>;
}

async function scopeArgs(user: AuthenticatedUser, args: Record<string, unknown>) {
  return resolveProductOrTenantScope(user, typeof args.productId === 'string' ? args.productId : undefined);
}

function requireTenantId(user: AuthenticatedUser): string {
  if (!user.tenantId) throw new ScopeError('No tenant associated with this account');
  return user.tenantId;
}

export const ASSISTANT_TOOLS: ToolDef[] = [
  {
    name: 'get_mttr',
    description: 'Mean time to resolve bugs — overall, by priority, by sprint, with trend over time.',
    parameters: { type: 'object', properties: { ...productIdProp, ...dateRangeProps } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.calculateMTTR(scope.productId, parseDate(args.startDate), parseDate(args.endDate), scope.tenantId);
    },
  },
  {
    name: 'get_defect_leakage',
    description: 'Defect leakage rate — % of bugs that are critical/high priority (production-escape proxy), with trend.',
    parameters: { type: 'object', properties: { ...productIdProp, ...dateRangeProps } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.calculateDefectLeakage(scope.productId, parseDate(args.startDate), parseDate(args.endDate), scope.tenantId);
    },
  },
  {
    name: 'get_test_execution_metrics',
    description: 'Test execution stats — pass/fail/skip/blocked counts, pass rate, automation rate, trend.',
    parameters: { type: 'object', properties: { ...productIdProp, ...dateRangeProps } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.calculateTestExecutionMetrics(scope.productId, parseDate(args.startDate), parseDate(args.endDate), scope.tenantId);
    },
  },
  {
    name: 'get_velocity_trend',
    description: 'Completed work-item velocity per sprint/week, with created/resolved bug counts and a breakdown by item type.',
    parameters: {
      type: 'object',
      properties: { ...productIdProp, limit: { type: 'integer', description: 'How many recent periods to return (default 6).' }, ...dateRangeProps },
    },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      return analyticsService.calculateVelocityTrend(scope.productId, scope.tenantId, parseDate(args.startDate), parseDate(args.endDate), limit);
    },
  },
  {
    name: 'get_recent_high_priority_fixes',
    description: 'Critical/high-priority bugs resolved in the most recent sprint (or last 7 days if the product has no sprints).',
    parameters: { type: 'object', properties: { ...productIdProp, limit: { type: 'integer', description: 'Max bugs to return (default 20).' } } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      return analyticsService.getRecentHighPriorityFixes(scope.productId, scope.tenantId, limit);
    },
  },
  {
    name: 'get_quarter_over_quarter_velocity',
    description: 'Current vs. prior calendar-quarter completed-item counts, with percent change.',
    parameters: { type: 'object', properties: { ...productIdProp } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.getQuarterOverQuarterVelocity(scope.productId, scope.tenantId);
    },
  },
  {
    name: 'get_release_readiness',
    description: 'Weighted release-readiness score (bug health, test results, automation coverage) for a single product, with a recommendation and risk list. Requires a specific product — has no tenant-wide form.',
    parameters: { type: 'object', properties: { productId: { type: 'string', description: 'Required — this metric only exists per-product.' } }, required: ['productId'] },
    execute: async (args, user) => {
      if (typeof args.productId !== 'string') throw new ScopeError('productId is required for release readiness');
      const scope = await scopeArgs(user, args);
      if (!scope.productId) throw new ScopeError('productId is required for release readiness');
      return analyticsService.calculateReleaseReadiness(scope.productId);
    },
  },
  {
    name: 'get_team_productivity',
    description: 'Tenant-wide team productivity — total work items/tests/deliverables, team velocity (story points), top contributors. Always tenant-wide (no per-product form).',
    parameters: { type: 'object', properties: { ...dateRangeProps } },
    execute: async (args, user) => analyticsService.calculateTeamProductivity(requireTenantId(user), parseDate(args.startDate), parseDate(args.endDate)),
  },
  {
    name: 'get_developer_health_profiles',
    description: 'Per-developer signals: after-hours/weekend activity, P0/P1 bug load, hours logged (from Jira worklogs), and a transparent burnout-index formula. Always tenant-wide.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, user) => getDeveloperHealthProfiles(requireTenantId(user)),
  },
  {
    name: 'get_tenant_analytics',
    description: 'Portfolio-wide rollup — per-product health scores, team productivity, and an overall quality score across every product in the tenant.',
    parameters: { type: 'object', properties: { ...dateRangeProps } },
    execute: async (args, user) => analyticsService.getTenantAnalytics(requireTenantId(user), parseDate(args.startDate), parseDate(args.endDate)),
  },
  {
    name: 'get_bug_label_distribution',
    description: 'Bug counts grouped by Jira label (a proxy for defect domain/category).',
    parameters: { type: 'object', properties: { ...productIdProp, ...dateRangeProps } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.calculateBugLabelDistribution(scope.productId, parseDate(args.startDate), parseDate(args.endDate), scope.tenantId);
    },
  },
  {
    name: 'get_open_p0_p1_count',
    description: 'Count of currently open critical/high (P0/P1) priority bugs.',
    parameters: { type: 'object', properties: { ...productIdProp } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.calculateOpenP0P1Count(scope.productId, scope.tenantId);
    },
  },
  {
    name: 'get_reopen_metrics',
    description: 'Bug reopen rate and first-time-fix rate.',
    parameters: { type: 'object', properties: { ...productIdProp, ...dateRangeProps } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.calculateReopenMetrics(scope.productId, parseDate(args.startDate), parseDate(args.endDate), scope.tenantId);
    },
  },
  {
    name: 'get_qa_bottlenecks',
    description: 'Work items stuck in QA/review/blocked-like status past a threshold number of days.',
    parameters: { type: 'object', properties: { ...productIdProp, thresholdDays: { type: 'integer', description: 'Days stuck before flagging as a bottleneck (default 3).' } } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      const thresholdDays = typeof args.thresholdDays === 'number' ? args.thresholdDays : undefined;
      return analyticsService.getQaBottlenecks(scope.productId, scope.tenantId, thresholdDays);
    },
  },
  {
    name: 'get_projects_overview',
    description: 'Tenant-wide table of every project — connection/sync/health status. Always tenant-wide.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, user) => analyticsService.getProjectsOverview(requireTenantId(user)),
  },
  {
    name: 'get_backlog_summary',
    description: 'Open + in-progress backlog counts by priority and type.',
    parameters: { type: 'object', properties: { ...productIdProp, type: { type: 'string', description: 'Optional work item type filter, e.g. "bug" or "story".' } } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.getBacklogSummary(scope.productId, scope.tenantId, typeof args.type === 'string' ? args.type : undefined);
    },
  },
  {
    name: 'get_backlog_age_distribution',
    description: 'Open backlog items bucketed by age (0-7d, 8-14d, ... 60d+).',
    parameters: { type: 'object', properties: { ...productIdProp, type: { type: 'string', description: 'Optional work item type filter.' } } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      return analyticsService.getAgeDistribution(scope.productId, scope.tenantId, typeof args.type === 'string' ? args.type : undefined);
    },
  },
  {
    name: 'get_backlog_flow',
    description: 'Created vs. completed work items per period, with net backlog change over time.',
    parameters: { type: 'object', properties: { ...productIdProp, limit: { type: 'integer', description: 'How many recent periods (default 6).' }, ...dateRangeProps } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      return analyticsService.calculateBacklogFlow(scope.productId, scope.tenantId, parseDate(args.startDate), parseDate(args.endDate), limit);
    },
  },
  {
    name: 'get_requirement_traceability',
    description: 'Stories/epics with their linked bugs and a ready/at_risk/blocked status.',
    parameters: { type: 'object', properties: { ...productIdProp, limit: { type: 'integer', description: 'Max requirements to return (default 25).' } } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      return analyticsService.getRequirementTraceability(scope.productId, scope.tenantId, limit);
    },
  },
  {
    name: 'get_epic_rollup',
    description: 'Per-epic progress rollup — direct child item counts by status, % complete (count- and points-based), and a health signal (on_track/at_risk/blocked). Also returns a portfolio-wide summary (unaffected by limit).',
    parameters: { type: 'object', properties: { ...productIdProp, limit: { type: 'integer', description: 'Max epics to return (default 50).' } } },
    execute: async (args, user) => {
      const scope = await scopeArgs(user, args);
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      return analyticsService.getEpicRollups(scope.productId, scope.tenantId, limit);
    },
  },
  {
    name: 'get_github_metrics',
    description: 'GitHub repo health for a product — commit/PR/issue activity and CI status.',
    parameters: { type: 'object', properties: { productId: { type: 'string', description: 'Required — this metric only exists per-product.' } }, required: ['productId'] },
    execute: async (args, user) => {
      if (typeof args.productId !== 'string') throw new ScopeError('productId is required for GitHub metrics');
      const scope = await scopeArgs(user, args);
      if (!scope.productId) throw new ScopeError('productId is required for GitHub metrics');
      return productRepositoryService.getProductGitHubMetrics(scope.productId, requireTenantId(user));
    },
  },
  {
    name: 'get_ai_commit_attribution',
    description: 'AI-vs-human commit attribution for a product\'s mapped repo(s) over the last 30 days: exact (Claude Code hook-verified), heuristic (trailer-detected), and unattributed commit counts, by tool, plus real code churn. Never collapses exact and heuristic into a single number.',
    parameters: { type: 'object', properties: { productId: { type: 'string', description: 'Required — attribution is scoped per product\'s mapped repo(s).' } }, required: ['productId'] },
    execute: async (args, user) => {
      if (typeof args.productId !== 'string') throw new ScopeError('productId is required for AI commit attribution');
      const scope = await scopeArgs(user, args);
      if (!scope.productId) throw new ScopeError('productId is required for AI commit attribution');
      const repos = await productRepositoryService.getProductRepositories(scope.productId);
      const repoRows: Array<{ id: string; githubRepo: string }> = repos.success ? repos.data ?? [] : [];
      if (repoRows.length === 0) return { hasData: false, reason: 'No repo mapped to this product yet' };

      const summaries = await Promise.all(repoRows.map((r) => getCommitAttributionSummary(r.id)));
      const merged = summaries.reduce<CommitAttributionSummary>(
        (acc, s) => ({
          totalCommits: acc.totalCommits + s.totalCommits,
          exact: acc.exact + s.exact,
          heuristic: acc.heuristic + s.heuristic,
          unattributed: acc.unattributed + s.unattributed,
          byTool: Object.fromEntries(
            [...new Set([...Object.keys(acc.byTool), ...Object.keys(s.byTool)])].map((k) => [k, (acc.byTool[k] ?? 0) + (s.byTool[k] ?? 0)])
          ),
          churn: {
            additions: acc.churn.additions + s.churn.additions,
            deletions: acc.churn.deletions + s.churn.deletions,
            commitsWithStats: acc.churn.commitsWithStats + s.churn.commitsWithStats,
            commitsMissingStats: acc.churn.commitsMissingStats + s.churn.commitsMissingStats,
          },
        }),
        { totalCommits: 0, exact: 0, heuristic: 0, unattributed: 0, byTool: {}, churn: { additions: 0, deletions: 0, commitsWithStats: 0, commitsMissingStats: 0 } }
      );
      return { hasData: merged.totalCommits > 0, windowDays: 30, repos: repoRows.map((r) => r.githubRepo), ...merged };
    },
  },
  {
    name: 'get_gpu_ai_spend_summary',
    description: 'Tenant-wide AI/GPU compute spend summary — total cost, total GPU hours, connected providers. Always tenant-wide.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, user) => gpuSpendAnalyticsService.getSummary(requireTenantId(user)),
  },
  {
    name: 'get_gpu_spend_trend',
    description: 'Weekly AI/GPU compute cost trend over time. Always tenant-wide.',
    parameters: { type: 'object', properties: { ...dateRangeProps } },
    execute: async (args, user) => gpuSpendAnalyticsService.getSpendTrend(requireTenantId(user), parseDate(args.startDate), parseDate(args.endDate)),
  },
  {
    name: 'get_gpu_spend_by_squad',
    description: 'AI/GPU compute cost broken down by squad. Always tenant-wide.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, user) => gpuSpendAnalyticsService.getSpendBySquad(requireTenantId(user)),
  },
  {
    name: 'get_gpu_spend_by_type',
    description: 'AI/GPU compute cost broken down by GPU SKU/type. Always tenant-wide.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, user) => gpuSpendAnalyticsService.getSpendByGpuType(requireTenantId(user)),
  },
];

export function getToolSchemas(): ToolSchema[] {
  return ASSISTANT_TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

export async function executeAssistantTool(name: string, args: Record<string, unknown>, user: AuthenticatedUser): Promise<unknown> {
  const tool = ASSISTANT_TOOLS.find((t) => t.name === name);
  if (!tool) throw new ScopeError(`Unknown tool: ${name}`);
  return tool.execute(args, user);
}
