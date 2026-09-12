/**
 * Real, per-user notification bell — replaces the old fully-mock qm-alerts.ts
 * (identical for every user, local-only "read" state). Alerts are computed
 * live from real data at request time, same as the mock model, so there's no
 * duplicate copy of "what counts as a burnout/silo/etc signal" to keep in
 * sync with the pages that already compute these (Engineering Health,
 * Compliance-adjacent analytics) — only NotificationRead is actually
 * persisted, since "read" was the one part that was fake.
 *
 * Visibility is role-aware per signal, not a single route-level gate:
 * - Open P0 bugs: pm/executive see the team-wide list; everyone else sees
 *   only bugs assigned to them — this is the one signal where "bound to this
 *   user" means their own work, not a broader team view.
 * - Burnout: pm/executive see every developer crossing the threshold (team
 *   signal, matching /engineering-health's own gate); everyone else only
 *   ever sees their own row, never a colleague's.
 * - Knowledge silo: pm/executive only. getKnowledgeSilo keys results by
 *   externalAssigneeId, not a real User.id — per getAssigneeWorkload's own
 *   "courtesy only, never gating" caveat on that join, it isn't reliable
 *   enough to match against "is this me" for a non-portfolio caller.
 * - Defect-heavy modules: pm/executive get the tenant-wide distribution;
 *   everyone else gets it scoped to their own accessible products.
 *
 * Duplicate-bug detection (qm-alerts.ts's old `duplicateAlerts`) is
 * deliberately NOT included — getSimilarBugs has no batch variant and
 * re-scores an entire product from scratch per bug, so a tenant-wide version
 * would be a real cost problem, not just missing polish. Deferred.
 */
import prisma from '../../lib/prisma';
import type { AuthenticatedUser } from '../middleware/auth.middleware';
import { isPortfolioRole } from '../middleware/auth.middleware';
import { getDeveloperHealthProfiles } from './engineering-health.service';
import analyticsService from './analytics.service';

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface NotificationAlert {
  id: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  to: string;
  params?: Record<string, string>;
  isRead: boolean;
}

const BURNOUT_THRESHOLD = 70; // matches the old qm-alerts.ts mock's own threshold
const OPEN_BUG_STATUSES = ['open', 'in_progress'];
const P0_ALERT_LIMIT = 10;
const SILO_MIN_BUGS_PER_LABEL = 3;
const HOT_LABEL_MIN_DEFECTS = 8;

/** Own product ids for a non-portfolio caller, or null (no filter) for pm/executive. */
async function resolveOwnProductIds(user: AuthenticatedUser): Promise<string[] | null> {
  if (isPortfolioRole(user.role)) return null;
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: user.tenantId ?? '', userId: user.id } },
    select: { accessibleProducts: true },
  });
  return membership?.accessibleProducts ?? [];
}

async function buildP0Alerts(user: AuthenticatedUser, ownProductIds: string[] | null): Promise<NotificationAlert[]> {
  const portfolio = isPortfolioRole(user.role);
  if (!portfolio && ownProductIds && ownProductIds.length === 0) return [];

  const bugs = await prisma.workItem.findMany({
    where: {
      tenantId: user.tenantId ?? '',
      type: 'bug',
      isActive: true,
      priority: 'critical',
      status: { in: OPEN_BUG_STATUSES },
      ...(portfolio ? {} : { productId: { in: ownProductIds ?? [] } }),
      ...(portfolio ? {} : { assigneeId: user.id }),
    },
    select: { id: true, title: true, externalAssigneeName: true },
    take: P0_ALERT_LIMIT,
    orderBy: { createdAt: 'desc' },
  });

  return bugs.map((bug) => ({
    id: `p0-${bug.id}`,
    severity: 'critical' as const,
    title: `P0 open: ${bug.title}`,
    detail: portfolio
      ? `Owned by ${bug.externalAssigneeName ?? 'unassigned'}`
      : `Assigned to you`,
    to: '/bugs/$bugId',
    params: { bugId: bug.id },
    isRead: false,
  }));
}

async function buildBurnoutAlerts(user: AuthenticatedUser): Promise<NotificationAlert[]> {
  if (!user.tenantId) return [];
  const portfolio = isPortfolioRole(user.role);
  const profiles = await getDeveloperHealthProfiles(user.tenantId);
  const strained = profiles.filter((p) => (p.burnoutIndex ?? 0) >= BURNOUT_THRESHOLD);
  const relevant = portfolio ? strained : strained.filter((p) => p.id === user.id);

  return relevant.map((p) => ({
    id: `burnout-${p.id}`,
    severity: 'warning' as const,
    title: portfolio ? `Workload strain: ${p.name}` : 'Your workload strain is elevated',
    detail: `${p.afterHoursPct ?? 0}% after-hours activity and ${p.p0p1Load} P0/P1 items in flight.`,
    to: '/engineering-health',
    isRead: false,
  }));
}

async function buildSiloAlerts(user: AuthenticatedUser): Promise<NotificationAlert[]> {
  if (!isPortfolioRole(user.role) || !user.tenantId) return [];
  const { labels } = await analyticsService.getKnowledgeSilo(undefined, user.tenantId, SILO_MIN_BUGS_PER_LABEL);
  return labels
    .filter((l) => l.risk === 'high')
    .slice(0, 5)
    .map((l) => ({
      id: `silo-${l.label}`,
      severity: 'info' as const,
      title: `Knowledge silo: ${l.label}`,
      detail: `${l.topAssignee.displayName} resolves ${l.topAssignee.percent}% of these — a single point of failure.`,
      to: '/engineering-health',
      isRead: false,
    }));
}

async function buildHeatmapAlerts(user: AuthenticatedUser, ownProductIds: string[] | null): Promise<NotificationAlert[]> {
  if (!user.tenantId) return [];
  const portfolio = isPortfolioRole(user.role);

  const counts = new Map<string, number>();
  if (portfolio) {
    const { distribution } = await analyticsService.calculateBugLabelDistribution(undefined, undefined, undefined, user.tenantId);
    for (const d of distribution) counts.set(d.label, (counts.get(d.label) ?? 0) + d.count);
  } else {
    for (const productId of (ownProductIds ?? []).slice(0, 10)) {
      const { distribution } = await analyticsService.calculateBugLabelDistribution(productId);
      for (const d of distribution) counts.set(d.label, (counts.get(d.label) ?? 0) + d.count);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= HOT_LABEL_MIN_DEFECTS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => ({
      id: `hot-${label}`,
      severity: 'warning' as const,
      title: `Defect cluster: ${label}`,
      detail: `${count} tracked defects — a concentration worth prioritizing.`,
      to: '/reports',
      isRead: false,
    }));
}

export async function getNotifications(user: AuthenticatedUser): Promise<{ alerts: NotificationAlert[]; unreadCount: number }> {
  if (!user.tenantId) return { alerts: [], unreadCount: 0 };

  const ownProductIds = await resolveOwnProductIds(user);
  const [p0, burnout, silo, heatmap] = await Promise.all([
    buildP0Alerts(user, ownProductIds),
    buildBurnoutAlerts(user),
    buildSiloAlerts(user),
    buildHeatmapAlerts(user, ownProductIds),
  ]);
  const alerts = [...p0, ...burnout, ...heatmap, ...silo];

  if (alerts.length === 0) return { alerts, unreadCount: 0 };

  const readRows = await prisma.notificationRead.findMany({
    where: { userId: user.id, notificationId: { in: alerts.map((a) => a.id) } },
    select: { notificationId: true },
  });
  const readIds = new Set(readRows.map((r) => r.notificationId));
  const withReadState = alerts.map((a) => ({ ...a, isRead: readIds.has(a.id) }));

  return { alerts: withReadState, unreadCount: withReadState.filter((a) => !a.isRead).length };
}

export async function markNotificationRead(user: AuthenticatedUser, notificationId: string): Promise<void> {
  if (!user.tenantId) return;
  await prisma.notificationRead.upsert({
    where: { userId_notificationId: { userId: user.id, notificationId } },
    create: { tenantId: user.tenantId, userId: user.id, notificationId },
    update: {},
  });
}

export async function markNotificationsRead(user: AuthenticatedUser, notificationIds: string[]): Promise<void> {
  if (!user.tenantId || notificationIds.length === 0) return;
  await prisma.$transaction(
    notificationIds.map((notificationId) =>
      prisma.notificationRead.upsert({
        where: { userId_notificationId: { userId: user.id, notificationId } },
        create: { tenantId: user.tenantId!, userId: user.id, notificationId },
        update: {},
      })
    )
  );
}
