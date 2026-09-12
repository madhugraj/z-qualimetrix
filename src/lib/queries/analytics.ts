import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

async function fetchAnalytics<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data as T;
}

function withProduct(path: string, productId?: string): string {
  return productId ? `${path}?productId=${productId}` : path;
}

function withParams(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export interface MttrResult {
  overall: number;
  byPriority: Record<string, number>;
  bySprint: Record<string, number>;
  trend: Array<{ period: string; mttr: number }>;
  /** False means "never measured" — treat `overall`/`trend` as not-yet-available, not zero. */
  hasData: boolean;
}

/**
 * `enabled` should be false until either a productId is known or the caller
 * is confirmed portfolio-scoped (pm/executive with no product selected) —
 * the backend rejects an omitted productId for any other role, so firing
 * this before src/lib/product-context.tsx resolves would surface a spurious
 * 400 for po/developer/tester during the initial load.
 */
export function useMttr(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date, assigneeId?: string) {
  return useQuery({
    queryKey: ["analytics-mttr", productId, startDate?.toISOString(), endDate?.toISOString(), assigneeId],
    queryFn: () =>
      fetchAnalytics<MttrResult>(
        withParams("/analytics/mttr", { productId, startDate: startDate?.toISOString(), endDate: endDate?.toISOString(), assigneeId })
      ),
    enabled,
  });
}

export interface DefectLeakageResult {
  rate: number;
  totalBugs: number;
  productionBugs: number;
  trend: Array<{ period: string; rate: number }>;
  /** False means zero bugs are tracked — `rate: 0` in that case is not "zero leakage." */
  hasData: boolean;
}

export function useDefectLeakage(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["analytics-defect-leakage", productId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () =>
      fetchAnalytics<DefectLeakageResult>(
        withParams("/analytics/defect-leakage", { productId, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() })
      ),
    enabled,
  });
}

export interface TestExecutionMetricsResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  passRate: number;
  automationRate: number;
  executionTrend: Array<{ period: string; passRate: number }>;
  /** False means zero test executions are recorded — rates are "never run," not "failing." */
  hasData: boolean;
}

export function useTestExecutionMetrics(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["analytics-test-metrics", productId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () =>
      fetchAnalytics<TestExecutionMetricsResult>(
        withParams("/analytics/test-metrics", { productId, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() })
      ),
    enabled,
  });
}

export interface WorkTypeBreakdown {
  bug: number;
  subtask: number;
  feature: number;
}

export interface VelocityTrendEntry {
  period: string;
  velocity: number;
  created: number;
  resolved: number;
  byType: WorkTypeBreakdown;
}

export function useVelocityTrend(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["analytics-velocity-trend", productId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () =>
      fetchAnalytics<VelocityTrendEntry[]>(
        withParams("/analytics/velocity-trend", { productId, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() })
      ),
    enabled,
  });
}

export interface RecentHighPriorityFix {
  id: string;
  externalId: string | null;
  title: string;
  priority: string;
  resolvedAt: string;
  assigneeName: string | null;
}

export interface RecentHighPriorityFixesResult {
  periodLabel: string;
  periodSource: "sprint" | "week";
  bugs: RecentHighPriorityFix[];
  hasData: boolean;
}

export function useRecentHighPriorityFixes(productId?: string, enabled: boolean = true, limit?: number, assigneeId?: string) {
  return useQuery({
    queryKey: ["analytics-recent-high-priority-fixes", productId, limit, assigneeId],
    queryFn: () =>
      fetchAnalytics<RecentHighPriorityFixesResult>(
        withParams("/analytics/recent-high-priority-fixes", { productId, limit: limit?.toString(), assigneeId })
      ),
    enabled,
  });
}

export interface QuarterVelocitySummary {
  label: string;
  total: number;
  byType: WorkTypeBreakdown;
}

export interface QuarterOverQuarterVelocityResult {
  current: QuarterVelocitySummary;
  previous: QuarterVelocitySummary;
  changePercent: number | null;
  hasData: boolean;
}

export function useQuarterOverQuarterVelocity(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-velocity-qoq", productId],
    queryFn: () => fetchAnalytics<QuarterOverQuarterVelocityResult>(withParams("/analytics/velocity-qoq", { productId })),
    enabled,
  });
}

export interface TracedBug {
  id: string;
  externalId: string | null;
  title: string;
  status: string;
  priority: string | null;
}

export interface RequirementTraceRow {
  id: string;
  externalId: string | null;
  title: string;
  type: string;
  linkedBugs: TracedBug[];
  status: "ready" | "at_risk" | "blocked";
}

export interface RequirementTraceabilityResult {
  requirements: RequirementTraceRow[];
  hasData: boolean;
}

export function useRequirementTraceability(productId?: string, enabled: boolean = true, limit?: number) {
  return useQuery({
    queryKey: ["analytics-requirement-traceability", productId, limit],
    queryFn: () =>
      fetchAnalytics<RequirementTraceabilityResult>(
        withParams("/analytics/requirement-traceability", { productId, limit: limit?.toString() })
      ),
    enabled,
  });
}

export type EpicHealth = "on_track" | "at_risk" | "blocked";

export interface EpicRollupRow {
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
  health: EpicHealth;
  bugSummary: { openBugs: number; totalBugs: number; oldestOpenBugAgeDays: number | null };
  /** Jira board name(s) this epic is scheduled on, derived from its own sprint
   * and/or its children's sprints. Empty until Jira sync has board data. */
  boardNames: string[];
}

export interface EpicRollupsSummary {
  totalEpics: number;
  epicsWithNoChildren: number;
  avgPercentComplete: number | null;
  byHealth: Record<EpicHealth, number>;
  byStatus: Record<string, number>;
  byProgressBucket: { no_data: number; "0-25": number; "25-50": number; "50-75": number; "75-100": number };
  orphanBugCount: number;
  totalBugCount: number;
}

export interface EpicRollupsResult {
  epics: EpicRollupRow[];
  summary: EpicRollupsSummary;
  hasData: boolean;
}

export function useEpicRollups(productId?: string, enabled: boolean = true, limit?: number) {
  return useQuery({
    queryKey: ["analytics-epic-rollups", productId, limit],
    queryFn: () =>
      fetchAnalytics<EpicRollupsResult>(
        withParams("/analytics/epics", { productId, limit: limit?.toString() })
      ),
    enabled,
  });
}

export interface AssigneeWorkloadRow {
  externalAssigneeId: string;
  displayName: string;
  linkedUserId: string | null;
  totalItems: number;
  itemsByStatus: Record<string, number>;
  hoursLoggedSeconds: number;
}

export interface AssigneeWorkloadResult {
  assignees: AssigneeWorkloadRow[];
  unassignedCount: number;
  hasData: boolean;
}

export function useAssigneeWorkload(productId?: string, enabled: boolean = true, limit?: number) {
  return useQuery({
    queryKey: ["analytics-assignee-workload", productId, limit],
    queryFn: () =>
      fetchAnalytics<AssigneeWorkloadResult>(
        withParams("/analytics/assignee-workload", { productId, limit: limit?.toString() })
      ),
    enabled,
  });
}

export interface TeamUtilizationPerson {
  authorAccountId: string | null;
  name: string;
  loggedHours: number;
  capacityHours: number;
  utilizationPercent: number;
}

export interface TeamUtilizationResult {
  people: TeamUtilizationPerson[];
  capacityHoursPerPerson: number;
  businessDays: number;
  avgUtilizationPercent: number | null;
  hasData: boolean;
}

export function useTeamUtilization(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["analytics-team-utilization", productId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () =>
      fetchAnalytics<TeamUtilizationResult>(
        withParams("/analytics/team-utilization", { productId, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() })
      ),
    enabled,
  });
}

export interface TeamCostPerson {
  name: string;
  loggedHours: number;
  hourlyRateCents: number;
  costCents: number;
}

export interface TeamCostResult {
  totalCostCents: number;
  people: TeamCostPerson[];
  unmatchedHours: number;
  hoursWithoutRate: number;
  hasData: boolean;
}

export function useTeamCost(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["analytics-team-cost", productId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () =>
      fetchAnalytics<TeamCostResult>(
        withParams("/analytics/team-cost", { productId, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() })
      ),
    enabled,
  });
}

/** Real, all-time Jira/ADO worklog author — keyed by accountId, so every
 * entry here is a genuine contributor regardless of Jira's per-user email
 * privacy setting or whether they have a QualiMetrix login at all. */
export interface WorklogAuthor {
  authorAccountId: string;
  authorName: string | null;
  totalHours: number;
  hourlyRateCents: number | null;
}

interface WorklogAuthorsResult {
  authors: WorklogAuthor[];
}

export function useWorklogAuthors(enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-worklog-authors"],
    queryFn: () => fetchAnalytics<WorklogAuthorsResult>("/analytics/worklog-authors"),
    enabled,
  });
}

export function useSetWorklogAuthorRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { authorAccountId: string; authorName: string | null; hourlyRateCents: number | null }) =>
      fetchAnalytics("/analytics/worklog-author-rate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics-worklog-authors"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-team-cost"] });
    },
  });
}

export interface FeatureFixAllocationRow {
  externalAssigneeId: string;
  displayName: string;
  feature: number;
  fix: number;
  maintenance: number;
  total: number;
}

export interface FeatureFixAllocationResult {
  assignees: FeatureFixAllocationRow[];
  hasData: boolean;
}

export function useFeatureFixAllocation(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-feature-fix-allocation", productId],
    queryFn: () => fetchAnalytics<FeatureFixAllocationResult>(withParams("/analytics/feature-fix-allocation", { productId })),
    enabled,
  });
}

export type KnowledgeSiloRisk = "high" | "medium" | "low";

export interface KnowledgeSiloRow {
  label: string;
  totalBugs: number;
  topAssignee: { externalAssigneeId: string; displayName: string; count: number; percent: number };
  risk: KnowledgeSiloRisk;
}

export interface KnowledgeSiloResult {
  labels: KnowledgeSiloRow[];
  hasData: boolean;
}

export function useKnowledgeSilo(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-knowledge-silo", productId],
    queryFn: () => fetchAnalytics<KnowledgeSiloResult>(withParams("/analytics/knowledge-silo", { productId })),
    enabled,
  });
}

export interface ReleaseReadinessResult {
  overallScore: number;
  components: {
    testCoverage: number | null;
    bugHealth: number | null;
    recentTestResults: number | null;
    automationCoverage: number | null;
  };
  recommendation: string;
  risks: string[];
  /** False means none of the four components have any real signal yet. */
  hasData: boolean;
}

export function useReleaseReadiness(productId?: string) {
  return useQuery({
    queryKey: ["analytics-release-readiness", productId],
    queryFn: () => fetchAnalytics<ReleaseReadinessResult>(`/products/${productId}/release-readiness`),
    enabled: !!productId,
  });
}

export interface TeamProductivityResult {
  totalWorkItems: number;
  completedWorkItems: number;
  totalTestCases: number;
  totalDeliverables: number;
  teamVelocity: number;
  topContributors: Array<{ userId: string; name: string; contributions: number }>;
}

export function useTeamProductivity(tenantId?: string) {
  return useQuery({
    queryKey: ["analytics-team-productivity", tenantId],
    queryFn: () => fetchAnalytics<TeamProductivityResult>(`/analytics/team-productivity?tenantId=${tenantId}`),
    enabled: !!tenantId,
  });
}

export interface TenantAnalyticsResult {
  tenant: { id: string; name: string; slug: string };
  teamProductivity: TeamProductivityResult;
  products: Array<{ productId: string; productName: string; healthScore: number; hasData: boolean; totalWorkItems: number }>;
  overallQualityScore: number;
  /** False when not a single active product has any real signal yet. */
  hasData: boolean;
}

// Portfolio-wide by nature — the backend restricts this to pm/executive
// (see analytics.controller.ts's getTenantAnalytics), so callers outside
// that role should pass enabled=false rather than let the request 403.
export function useTenantAnalytics(tenantId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-tenant", tenantId],
    queryFn: () => fetchAnalytics<TenantAnalyticsResult>(`/tenants/${tenantId}/analytics`),
    enabled: !!tenantId && enabled,
  });
}

export interface DeliverableRecord {
  id: string;
  type: string;
  title: string;
  description: string | null;
  rating: number | null;
  links: string[];
  createdAt: string;
  creator: { name: string | null };
}

export function useProductDeliverables(productId?: string) {
  return useQuery({
    queryKey: ["product-deliverables", productId],
    queryFn: () =>
      fetchAnalytics<{ deliverables: DeliverableRecord[] }>(`/products/${productId}/deliverables`).then(
        (data) => data.deliverables
      ),
    enabled: !!productId,
  });
}

export interface BugLabelDistributionResult {
  distribution: Array<{ label: string; count: number }>;
  /** False means zero bugs are tracked for this scope. */
  hasData: boolean;
}

export function useBugLabelDistribution(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["analytics-bug-label-distribution", productId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () =>
      fetchAnalytics<BugLabelDistributionResult>(
        withParams("/analytics/bug-label-distribution", { productId, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() })
      ),
    enabled,
  });
}

export interface OpenP0P1Result {
  count: number;
  /** False means zero bugs are tracked — `count: 0` in that case is "never measured," not "nothing open." */
  hasData: boolean;
}

export function useOpenP0P1Count(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-open-p0-p1-count", productId],
    queryFn: () => fetchAnalytics<OpenP0P1Result>(withProduct("/analytics/open-p0-p1-count", productId)),
    enabled,
  });
}

export interface ReopenMetricsResult {
  reopenRate: number;
  firstTimeFixRate: number;
  /** False means no bug has ever been resolved (or reopened) for this scope. */
  hasData: boolean;
}

export function useReopenMetrics(productId?: string, enabled: boolean = true, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["analytics-reopen-metrics", productId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () =>
      fetchAnalytics<ReopenMetricsResult>(
        withParams("/analytics/reopen-metrics", { productId, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() })
      ),
    enabled,
  });
}

export interface QaBottleneck {
  id: string;
  externalId: string | null;
  title: string;
  rawStatus: string;
  daysInStatus: number;
  severity: "critical" | "warning" | "neutral";
}

export interface QaBottlenecksResult {
  bottlenecks: QaBottleneck[];
  /** False means nothing is currently sitting in any QA-like raw status at all. */
  hasData: boolean;
}

export function useQaBottlenecks(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-qa-bottlenecks", productId],
    queryFn: () => fetchAnalytics<QaBottlenecksResult>(withProduct("/analytics/qa-bottlenecks", productId)),
    enabled,
  });
}

export interface CycleTimeStage {
  status: string;
  avgDays: number;
  medianDays: number;
  transitionCount: number;
  totalDays: number;
}

export interface CycleTimeByStageResult {
  stages: CycleTimeStage[];
  bottleneckStage: string | null;
  hasData: boolean;
}

export function useCycleTimeByStage(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-cycle-time-by-stage", productId],
    queryFn: () => fetchAnalytics<CycleTimeByStageResult>(withProduct("/analytics/cycle-time-by-stage", productId)),
    enabled,
  });
}

export interface SimilarBugRow {
  id: string;
  externalId: string | null;
  title: string;
  status: string;
  score: number;
}

export interface SimilarBugsResult {
  similar: SimilarBugRow[];
  /** False when the baseline bug doesn't exist, or no other bugs exist in its product yet. */
  hasData: boolean;
}

export function useSimilarBugs(productId?: string, workItemId?: string, limit: number = 5) {
  return useQuery({
    queryKey: ["analytics-similar-bugs", productId, workItemId, limit],
    queryFn: () =>
      fetchAnalytics<SimilarBugsResult>(`/products/${productId}/work-items/${workItemId}/similar-bugs?limit=${limit}`),
    enabled: !!productId && !!workItemId,
  });
}

/** Seeds SimilarBugs with a real, most-recently-updated bug for the product — reuses the existing work-items list endpoint rather than adding a new one. */
export function useMostRecentBugId(productId?: string) {
  return useQuery({
    queryKey: ["most-recent-bug-id", productId],
    queryFn: () =>
      fetchAnalytics<{ workItems: Array<{ id: string }> }>(
        `/products/${productId}/work-items?type=bug&sortBy=updatedAt&sortOrder=desc&limit=1`
      ).then((data) => data.workItems[0]?.id),
    enabled: !!productId,
  });
}

export interface ProjectOverviewRow {
  productId: string;
  productName: string;
  connectedSystems: string[];
  isMapped: boolean;
  lastSyncedAt: string | null;
  totalWorkItems: number;
  totalBugs: number;
  openBugs: number;
  resolvedBugs: number;
  /** Null (not 0) when there's nothing measurable — e.g. every bug is cancelled/closed. */
  resolutionRate: number | null;
  healthScore: number;
  /** Distinct real assignees with at least one active item — not headcount, just who's actually touching this backlog. */
  teamSize: number;
  hasData: boolean;
}

export interface ProjectsOverviewResult {
  projects: ProjectOverviewRow[];
  hasData: boolean;
}

export function useProjectsOverview(enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-projects-overview"],
    queryFn: () => fetchAnalytics<ProjectsOverviewResult>("/analytics/projects-overview"),
    enabled,
  });
}
