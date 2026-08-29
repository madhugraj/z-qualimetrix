import prisma from '../../lib/prisma';
import integrationService from './integration.service';
import jiraOAuthService from './jira-oauth.service';
import type { Integration, Product } from '@prisma/client';

const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const MAX_RATE_LIMIT_WAIT_MS = 60 * 1000;
const RECONCILE_MISS_THRESHOLD = 2;

/**
 * Maps Jira's stable statusCategory.key (new|indeterminate|done — always present
 * regardless of how a site's actual status names are customized) onto the
 * vocabulary analytics.service.ts already filters on. 'done' splits by work
 * item type since QualiMetrix distinguishes resolved (bugs) from completed
 * (everything else) — see analytics.service.ts lines 25 vs 389/424.
 */
function mapStatus(statusCategoryKey: string, workItemType: string): string {
  switch (statusCategoryKey) {
    case 'new':
      return 'open';
    case 'indeterminate':
      return 'in_progress';
    case 'done':
      return workItemType === 'bug' ? 'resolved' : 'completed';
    default:
      return 'open';
  }
}

const DEFAULT_PRIORITY_MAP: Record<string, string> = {
  highest: 'critical', blocker: 'critical', critical: 'critical',
  high: 'high', major: 'high',
  medium: 'medium', moderate: 'medium',
  low: 'low', lowest: 'low', minor: 'low', trivial: 'low',
};

function mapPriority(jiraPriorityName: string | undefined, overrides: Record<string, string>): string {
  if (!jiraPriorityName) return 'medium';
  const key = jiraPriorityName.toLowerCase();
  return overrides[key] ?? DEFAULT_PRIORITY_MAP[key] ?? 'medium';
}

function mapIssueType(jiraIssueTypeName: string | undefined): string {
  const name = (jiraIssueTypeName ?? '').toLowerCase();
  if (name.includes('bug') || name.includes('defect')) return 'bug';
  if (name.includes('story')) return 'story';
  if (name.includes('epic')) return 'epic';
  if (name.includes('task')) return 'task';
  return 'task';
}

interface JiraClient {
  cloudId: string;
  accessToken: string;
}

async function jiraFetch(client: JiraClient, path: string, init?: RequestInit): Promise<any> {
  const url = `https://api.atlassian.com/ex/jira/${client.cloudId}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 429) {
    const retryAfterSec = Number(response.headers.get('Retry-After') ?? '5');
    const waitMs = Math.min(retryAfterSec * 1000, MAX_RATE_LIMIT_WAIT_MS);
    await new Promise((r) => setTimeout(r, waitMs));
    return jiraFetch(client, path, init);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira API ${path} failed (${response.status}): ${body}`);
  }

  return response.json();
}

/**
 * Ensures a valid, non-expired access token, refreshing via jiraOAuthService
 * if within TOKEN_REFRESH_BUFFER_MS of expiry. Throws a distinguishable error
 * (marks Integration.status = 'reauth_required') if the refresh token itself
 * is dead — caller must stop the sync run for this integration on that error.
 */
async function ensureValidToken(integration: Integration): Promise<string> {
  const tokens = await integrationService.getDecryptedTokens(integration.tenantId, 'jira');
  if (!tokens) throw new Error('Jira integration has no stored tokens');

  const expiresAt = tokens.expiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    await integrationService.markReauthRequired(integration.tenantId, 'jira', 'Access token expired and no refresh token is stored');
    throw new Error('reauth_required');
  }

  try {
    const refreshed = await jiraOAuthService.refreshAccessToken(tokens.refreshToken);
    await integrationService.recordTokenRefresh(integration.tenantId, 'jira', refreshed);
    return refreshed.accessToken;
  } catch (err) {
    await integrationService.markReauthRequired(
      integration.tenantId, 'jira',
      `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`
    );
    throw new Error('reauth_required');
  }
}

/**
 * Story points is always a custom field whose numeric id varies per Jira site.
 * Discovered once and cached in Integration.externalMetadata so subsequent
 * syncs don't re-fetch the field catalog every run.
 */
async function getStoryPointsFieldId(client: JiraClient, integration: Integration): Promise<string | null> {
  const metadata = (integration.externalMetadata as Record<string, unknown>) ?? {};
  if (typeof metadata.storyPointsFieldId === 'string') return metadata.storyPointsFieldId;

  const fields: Array<{ id: string; name: string }> = await jiraFetch(client, '/rest/api/3/field');
  const match = fields.find((f) =>
    /^story point/i.test(f.name) || f.name === 'Story Points'
  );

  const fieldId = match?.id ?? null;
  await prisma.integration.update({
    where: { id: integration.id },
    data: { externalMetadata: { ...metadata, storyPointsFieldId: fieldId } },
  });
  return fieldId;
}

async function fetchSprintsForProject(client: JiraClient, jiraProjectId: string): Promise<Array<{
  id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string;
}>> {
  let boards: { values?: any[] };
  try {
    boards = await jiraFetch(client, `/rest/agile/1.0/board?projectKeyOrId=${jiraProjectId}`);
  } catch (err) {
    // Board/sprint data is a bonus on top of issue sync, not a prerequisite —
    // e.g. the connection is missing the separate Jira Software scope the
    // Agile API requires. Degrade to "no sprint data" so issue sync still runs.
    console.error(`Jira board lookup failed for project ${jiraProjectId}, continuing without sprint data:`, err);
    return [];
  }
  const sprintsById = new Map<number, any>();

  for (const board of boards.values ?? []) {
    try {
      let startAt = 0;
      // Sprint endpoint still uses classic startAt/maxResults pagination as of this writing.
      for (;;) {
        const page = await jiraFetch(client, `/rest/agile/1.0/board/${board.id}/sprint?startAt=${startAt}&maxResults=50&state=active,closed,future`);
        for (const sprint of page.values ?? []) {
          sprintsById.set(sprint.id, sprint);
        }
        if (page.isLast !== false || !page.values?.length) break;
        startAt += page.values.length;
      }
    } catch {
      // Some boards (e.g. plain Kanban without sprints enabled) 400 on the sprint endpoint — skip.
      continue;
    }
  }

  return Array.from(sprintsById.values());
}

async function upsertSprints(tenantId: string, product: Product, sprints: Array<{
  id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string;
}>): Promise<Map<number, string>> {
  const sprintIdMap = new Map<number, string>();

  for (const sprint of sprints) {
    const status = sprint.state === 'active' ? 'active' : sprint.state === 'future' ? 'planning' : 'completed';
    const row = await prisma.sprint.upsert({
      where: {
        productId_externalSystem_externalId: {
          productId: product.id, externalSystem: 'jira', externalId: String(sprint.id),
        },
      },
      create: {
        tenantId, productId: product.id, externalSystem: 'jira', externalId: String(sprint.id),
        name: sprint.name, status,
        startDate: sprint.startDate ? new Date(sprint.startDate) : new Date(),
        endDate: sprint.endDate ? new Date(sprint.endDate) : new Date(),
        goal: sprint.goal ?? null,
        isActive: true, lastSeenAtSourceAt: new Date(),
      },
      update: {
        name: sprint.name, status,
        startDate: sprint.startDate ? new Date(sprint.startDate) : undefined,
        endDate: sprint.endDate ? new Date(sprint.endDate) : undefined,
        goal: sprint.goal ?? null,
        isActive: true, lastSeenAtSourceAt: new Date(),
      },
    });
    sprintIdMap.set(sprint.id, row.id);
  }

  return sprintIdMap;
}

async function resolveAssigneeId(email: string | undefined): Promise<string | null> {
  if (!email) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  return user?.id ?? null;
}

interface JqlPage {
  issues: any[];
  nextPageToken?: string;
}

async function* fetchIssuePages(client: JiraClient, jql: string, storyPointsFieldId: string | null): AsyncGenerator<any[]> {
  let nextPageToken: string | undefined;
  const fields = ['summary', 'description', 'issuetype', 'status', 'priority', 'assignee', 'reporter', 'sprint', 'created', 'updated', 'resolutiondate'];
  if (storyPointsFieldId) fields.push(storyPointsFieldId);

  for (;;) {
    const body: Record<string, unknown> = { jql, maxResults: 100, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    // Atlassian has been migrating issue search from startAt/maxResults offset
    // pagination to nextPageToken on /rest/api/3/search/jql — verify against
    // current Atlassian docs if this endpoint's contract has changed.
    const page: JqlPage = await jiraFetch(client, '/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    yield page.issues ?? [];
    if (!page.nextPageToken || !page.issues?.length) break;
    nextPageToken = page.nextPageToken;
  }
}

export async function syncProduct(integration: Integration, product: Product): Promise<void> {
  if (!product.jiraProjectId) throw new Error(`Product ${product.id} has no jiraProjectId mapped`);

  const accessToken = await ensureValidToken(integration);
  const client: JiraClient = { cloudId: (integration.externalMetadata as any)?.cloudId, accessToken };
  if (!client.cloudId) throw new Error('Jira integration is missing cloudId in externalMetadata');

  const priorityOverrides = ((integration.externalMetadata as any)?.statusMap?.priority as Record<string, string>) ?? {};
  const storyPointsFieldId = await getStoryPointsFieldId(client, integration);
  const systemUserId = await integrationService.getOrCreateSystemUser(integration.tenantId);

  const sprints = await fetchSprintsForProject(client, product.jiraProjectId);
  const sprintIdMap = await upsertSprints(integration.tenantId, product, sprints);

  const runStartedAt = new Date();
  const jql = `project = ${product.jiraProjectId} ORDER BY updated DESC`;

  for await (const issues of fetchIssuePages(client, jql, storyPointsFieldId)) {
    for (const issue of issues) {
      const f = issue.fields;
      const workItemType = mapIssueType(f.issuetype?.name);
      const status = mapStatus(f.status?.statusCategory?.key, workItemType);
      const priority = mapPriority(f.priority?.name, priorityOverrides);
      const assigneeId = await resolveAssigneeId(f.assignee?.emailAddress);
      const storyPoints = storyPointsFieldId ? (f[storyPointsFieldId] ?? null) : null;

      const jiraSprintField = Array.isArray(f.sprint) ? f.sprint[f.sprint.length - 1] : f.sprint;
      const sprintId = jiraSprintField?.id ? sprintIdMap.get(jiraSprintField.id) ?? null : null;

      const externalMetadata = {
        jiraKey: issue.key,
        assigneeAccountId: f.assignee?.accountId ?? null,
        assigneeName: f.assignee?.displayName ?? null,
        assigneeEmail: f.assignee?.emailAddress ?? null,
        reporterName: f.reporter?.displayName ?? null,
        reporterEmail: f.reporter?.emailAddress ?? null,
      };

      await prisma.workItem.upsert({
        where: {
          productId_externalSystem_externalId: {
            productId: product.id, externalSystem: 'jira', externalId: String(issue.id),
          },
        },
        create: {
          tenantId: integration.tenantId, productId: product.id,
          externalSystem: 'jira', externalId: String(issue.id),
          type: workItemType, status, priority,
          title: f.summary ?? '(no title)', description: f.description ? JSON.stringify(f.description) : null,
          assigneeId, sprintId, storyPoints,
          createdBy: systemUserId,
          // Jira's real creation date, not Prisma's now()-on-insert default —
          // a backfilled/historical issue synced today must keep its actual
          // creation date, or MTTR (createdAt vs resolvedAt) comes out
          // negative for anything resolved before this app ever synced it.
          createdAt: f.created ? new Date(f.created) : undefined,
          resolvedAt: f.resolutiondate ? new Date(f.resolutiondate) : null,
          isActive: true, lastSeenAtSourceAt: new Date(), externalMetadata,
        },
        update: {
          type: workItemType, status, priority,
          title: f.summary ?? '(no title)',
          assigneeId, sprintId, storyPoints,
          // Also corrected on every update (not just create) so the very next
          // sync cycle repairs rows that were written before this fix existed,
          // instead of leaving already-synced issues permanently wrong.
          createdAt: f.created ? new Date(f.created) : undefined,
          resolvedAt: f.resolutiondate ? new Date(f.resolutiondate) : null,
          isActive: true, lastSeenAtSourceAt: new Date(), externalMetadata,
        },
      });
    }
  }

  await reconcileMissingWorkItems(product.id, runStartedAt);
}

/**
 * A JQL query alone can't detect an issue that moved out of the tracked
 * project — it just stops matching. Anything active-but-untouched this run
 * gets its miss count bumped in externalMetadata; only soft-flagged inactive
 * after RECONCILE_MISS_THRESHOLD consecutive misses, never hard-deleted
 * (would corrupt historical sprint/MTTR trend charts).
 */
async function reconcileMissingWorkItems(productId: string, runStartedAt: Date): Promise<void> {
  const missed = await prisma.workItem.findMany({
    where: { productId, externalSystem: 'jira', isActive: true, lastSeenAtSourceAt: { lt: runStartedAt } },
  });

  for (const item of missed) {
    const metadata = (item.externalMetadata as Record<string, unknown>) ?? {};
    const missCount = (typeof metadata.reconcileMissCount === 'number' ? metadata.reconcileMissCount : 0) + 1;

    await prisma.workItem.update({
      where: { id: item.id },
      data: {
        isActive: missCount < RECONCILE_MISS_THRESHOLD,
        externalMetadata: { ...metadata, reconcileMissCount: missCount },
      },
    });
  }
}

export async function syncAllProductsForIntegration(integration: Integration): Promise<void> {
  await integrationService.recordSyncStart(integration.id);

  const metadata = (integration.externalMetadata as Record<string, unknown>) ?? {};
  const hasSavedProjectSelection = Array.isArray(metadata.selectedProjectIds);
  const selectedProjectIds = hasSavedProjectSelection
    ? (metadata.selectedProjectIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : undefined;

  const products = await prisma.product.findMany({
    where: {
      tenantId: integration.tenantId,
      jiraProjectId: selectedProjectIds ? { in: selectedProjectIds } : { not: null },
      isActive: true,
    },
  });

  const results = await Promise.allSettled(products.map((p) => syncProduct(integration, p)));

  const errors = results
    .map((r, i) => (r.status === 'rejected' ? `${products[i].name}: ${r.reason}` : null))
    .filter((e): e is string => e !== null);

  if (errors.some((e) => e.includes('reauth_required'))) {
    // markReauthRequired was already called inside ensureValidToken; nothing further to do here.
    return;
  }

  if (errors.length > 0) {
    await integrationService.recordSyncError(integration.id, errors.join(' | '));
  } else {
    await integrationService.recordSyncSuccess(integration.id);
  }
}
