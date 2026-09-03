/**
 * Real per-developer signals for the Engineering Health page's developer
 * profile cards — after-hours %, weekend activity, and P0/P1 load, plus a
 * transparent burnout-index formula computed from them. The rest of that
 * page (feature/fix allocation, knowledge silos, training suggestions)
 * stays on hardcoded sample data (src/lib/qm-people.ts) — no real data path
 * exists for those without new instrumentation (e.g. per-file commit
 * tracking for silo detection), so they're deliberately untouched here.
 *
 * "Activity" merges two real, independent sources into one timeline rather
 * than showing two separate percentages: GitHub Commit timestamps, and Jira
 * WorkItemActivity status-transition timestamps (jira-sync.service.ts's
 * changelog sync). Both are equally valid "was this person doing tracked
 * work right now" signals for after-hours/weekend detection specifically —
 * unlike CommitAttribution's exact/heuristic split, which stays separate
 * because those measure different *confidence* levels of the same claim,
 * not different *activities*.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MATCH_WINDOW_DAYS = 30; // matches commit-attribution.service.ts's SUMMARY_WINDOW_DAYS convention
const AFTER_HOURS_START_HOUR = 19; // 7pm local
const AFTER_HOURS_END_HOUR = 8; // 8am local
const P0P1_LOAD_CAP = 10; // items at which the burnout formula's load term maxes out — a disclosed constant, not a validated threshold

export interface DeveloperHealthProfile {
  id: string;
  name: string;
  squad: string | null;
  role: string;
  avatarInitials: string;
  hasActivityData: boolean;
  activityBreakdown: { githubCommits: number; jiraTransitions: number };
  afterHoursPct: number | null;
  weekendActivityCount: number | null;
  weekendActivityPct: number | null;
  p0p1Load: number;
  /** null when hasActivityData is false — never a silently-healthy-looking 0. */
  burnoutIndex: number | null;
  /**
   * Real Jira worklog seconds (jira-sync.service.ts's syncWorklogs), matched
   * to this developer by case-insensitive email — same join style as the
   * commits query above, and the same accepted gap: a worklog author whose
   * Jira account has its email set private never matches here. Independent
   * of hasActivityData on purpose — a developer can log real worklog hours
   * directly without a matching commit or Jira status transition in the
   * window, so gating this behind that flag would hide real data.
   */
  hoursLoggedSeconds: number;
}

export const BURNOUT_FORMULA_LABEL =
  `40% after-hours activity share + 30% weekend activity share + 30% open P0/P1 load (capped at ${P0P1_LOAD_CAP} items) — activity is GitHub commits + Jira status changes combined. A transparent combination of the real signals below, not a validated clinical measure.`;

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function localHourAndWeekday(date: Date, timeZone: string): { hour: number; isWeekend: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  return { hour, isWeekend: weekday === 'Sat' || weekday === 'Sun' };
}

export async function getDeveloperHealthProfiles(tenantId: string): Promise<DeveloperHealthProfile[]> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const timeZone = (tenant?.settings as { timezone?: string } | null)?.timezone || 'UTC';

  // Jira's "Choose Jira analytics scope" picker (Integrations page) lets a PM
  // narrow which people show up in per-person analytics like this roster —
  // deliberately independent of what's synced (Backlog/Bug Intelligence/
  // Projects always show everything). Absent or empty selection = no
  // restriction; an empty selection must never silently hide every
  // developer, which would look identical to a regression.
  const jiraIntegration = await prisma.integration.findFirst({
    where: { tenantId, provider: 'jira' },
    select: { externalMetadata: true },
  });
  const selectedUserEmails = (jiraIntegration?.externalMetadata as { selectedUserEmails?: string[] } | null)?.selectedUserEmails ?? [];

  const developers = await prisma.user.findMany({
    where: {
      tenantId, role: 'developer', isActive: true,
      ...(selectedUserEmails.length > 0 ? { email: { in: selectedUserEmails } } : {}),
    },
    select: { id: true, name: true, email: true, squad: true, role: true },
  });

  const since = new Date(Date.now() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return Promise.all(
    developers.map(async (dev): Promise<DeveloperHealthProfile> => {
      const [commits, jiraActivity, p0p1Load, worklogAgg] = await Promise.all([
        prisma.commit.findMany({
          where: { tenantId, authoredAt: { gte: since }, authorEmail: { equals: dev.email, mode: 'insensitive' } },
          select: { authoredAt: true },
        }),
        prisma.workItemActivity.findMany({
          where: { tenantId, userId: dev.id, occurredAt: { gte: since }, source: 'jira' },
          select: { occurredAt: true },
        }),
        prisma.workItem.count({
          where: {
            tenantId,
            assigneeId: dev.id,
            type: 'bug',
            isActive: true,
            priority: { in: ['critical', 'high'] },
            status: { in: ['open', 'in_progress'] },
          },
        }),
        prisma.workLog.aggregate({
          where: { tenantId, authorEmail: { equals: dev.email, mode: 'insensitive' }, startedAt: { gte: since } },
          _sum: { timeSpentSeconds: true },
        }),
      ]);
      const hoursLoggedSeconds = worklogAgg._sum.timeSpentSeconds ?? 0;

      const events = [...commits.map((c) => c.authoredAt), ...jiraActivity.map((a) => a.occurredAt)];
      const hasActivityData = events.length > 0;
      let afterHoursPct: number | null = null;
      let weekendActivityCount: number | null = null;
      let weekendActivityPct: number | null = null;
      let burnoutIndex: number | null = null;

      if (hasActivityData) {
        let afterHoursCount = 0;
        let weekendCount = 0;
        for (const occurredAt of events) {
          const { hour, isWeekend } = localHourAndWeekday(occurredAt, timeZone);
          if (hour >= AFTER_HOURS_START_HOUR || hour < AFTER_HOURS_END_HOUR) afterHoursCount += 1;
          if (isWeekend) weekendCount += 1;
        }
        afterHoursPct = Math.round((afterHoursCount / events.length) * 100);
        weekendActivityCount = weekendCount;
        weekendActivityPct = Math.round((weekendCount / events.length) * 100);
        burnoutIndex = Math.round(
          0.4 * afterHoursPct + 0.3 * weekendActivityPct + 0.3 * Math.min(p0p1Load / P0P1_LOAD_CAP, 1) * 100
        );
      }

      return {
        id: dev.id,
        name: dev.name ?? dev.email,
        squad: dev.squad,
        role: dev.role,
        avatarInitials: avatarInitials(dev.name ?? dev.email),
        hasActivityData,
        activityBreakdown: { githubCommits: commits.length, jiraTransitions: jiraActivity.length },
        afterHoursPct,
        weekendActivityCount,
        weekendActivityPct,
        p0p1Load,
        burnoutIndex,
        hoursLoggedSeconds,
      };
    })
  );
}
