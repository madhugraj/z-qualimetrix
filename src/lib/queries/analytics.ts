import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

async function fetchAnalytics<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return body.data as T;
}

function withProduct(path: string, productId?: string): string {
  return productId ? `${path}?productId=${productId}` : path;
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
export function useMttr(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-mttr", productId],
    queryFn: () => fetchAnalytics<MttrResult>(withProduct("/analytics/mttr", productId)),
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

export function useDefectLeakage(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-defect-leakage", productId],
    queryFn: () => fetchAnalytics<DefectLeakageResult>(withProduct("/analytics/defect-leakage", productId)),
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

export function useTestExecutionMetrics(productId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["analytics-test-metrics", productId],
    queryFn: () => fetchAnalytics<TestExecutionMetricsResult>(withProduct("/analytics/test-metrics", productId)),
    enabled,
  });
}

export interface VelocityTrendEntry {
  period: string;
  velocity: number;
  created: number;
  resolved: number;
}

export function useVelocityTrend(productId?: string) {
  return useQuery({
    queryKey: ["analytics-velocity-trend", productId],
    queryFn: () => fetchAnalytics<VelocityTrendEntry[]>(`/products/${productId}/velocity-trend`),
    enabled: !!productId,
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

export function useTenantAnalytics(tenantId?: string) {
  return useQuery({
    queryKey: ["analytics-tenant", tenantId],
    queryFn: () => fetchAnalytics<TenantAnalyticsResult>(`/tenants/${tenantId}/analytics`),
    enabled: !!tenantId,
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
