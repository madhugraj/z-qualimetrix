import prisma from '../../lib/prisma';
import integrationService from './integration.service';
import { ensureValidAtlassianToken } from './atlassian-token.service';
import { generateEmbeddings } from './local-embeddings.service';
import { adfToPlainText } from '../utils/adf-to-text';
import type { Integration, Product } from '@prisma/client';

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
  // Must be checked before the generic 'task' match below — "Sub-task"
  // contains "task" as a substring, so the naive order previously collapsed
  // every sub-task into the same bucket as top-level Task, silently hiding
  // what was often the single largest category of work (real tenant data:
  // ~40% of a sprint's completed items were sub-tasks).
  if (name.includes('sub-task') || name.includes('subtask')) return 'subtask';
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
  // `path` is usually relative, but some paginated endpoints (e.g.
  // /worklog/updated's `nextPage`) hand back a full absolute URL to follow
  // as-is rather than a cursor to re-append — pass it straight through.
  const url = path.startsWith('http') ? path : `https://api.atlassian.com/ex/jira/${client.cloudId}${path}`;
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
 * Ensures a valid, non-expired access token, refreshing (via the shared
 * atlassian-token.service.ts, which also keeps a sibling 'confluence' row's
 * token pair in sync) if close to expiry. Throws a distinguishable error
 * (marks Integration.status = 'reauth_required') if the refresh token itself
 * is dead — caller must stop the sync run for this integration on that error.
 */
async function ensureValidToken(integration: Integration): Promise<string> {
  return ensureValidAtlassianToken(integration.tenantId, 'jira');
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

/**
 * Classic (non-hierarchy) Jira company-managed projects expose epic
 * membership via a custom "Epic Link" field (holding the epic's issue KEY,
 * not its id) instead of the modern `fields.parent` relation. Discovered and
 * cached the same way as story points. Returns null (and caches that) on
 * team-managed/hierarchy-enabled sites where the field doesn't exist at all
 * — the normal case, not an error.
 */
async function getEpicLinkFieldId(client: JiraClient, integration: Integration): Promise<string | null> {
  const metadata = (integration.externalMetadata as Record<string, unknown>) ?? {};
  if (typeof metadata.epicLinkFieldId === 'string') return metadata.epicLinkFieldId;

  const fields: Array<{ id: string; name: string }> = await jiraFetch(client, '/rest/api/3/field');
  const match = fields.find((f) => /^epic link$/i.test(f.name));

  const fieldId = match?.id ?? null;
  await prisma.integration.update({
    where: { id: integration.id },
    data: { externalMetadata: { ...metadata, epicLinkFieldId: fieldId } },
  });
  return fieldId;
}

/**
 * Sprint, like story points and epic link, is always a custom field (id
 * varies per site) — the literal string 'sprint' is not a real field name/
 * alias the search API recognizes, and requesting it as-is causes Jira to
 * silently omit it from the response (no error, just absent), leaving every
 * WorkItem.sprintId null forever. Discovered and cached the same way.
 */
async function getSprintFieldId(client: JiraClient, integration: Integration): Promise<string | null> {
  const metadata = (integration.externalMetadata as Record<string, unknown>) ?? {};
  if (typeof metadata.sprintFieldId === 'string') return metadata.sprintFieldId;

  const fields: Array<{ id: string; name: string }> = await jiraFetch(client, '/rest/api/3/field');
  const match = fields.find((f) => /^sprint$/i.test(f.name));

  const fieldId = match?.id ?? null;
  await prisma.integration.update({
    where: { id: integration.id },
    data: { externalMetadata: { ...metadata, sprintFieldId: fieldId } },
  });
  return fieldId;
}

async function fetchSprintsForProject(client: JiraClient, jiraProjectId: string): Promise<Array<{
  id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string;
  boardId?: number; boardName?: string;
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
          // A sprint can rarely be shared across boards — last board seen wins,
          // same "no ordering guarantee" posture as the rest of this dedup map.
          sprintsById.set(sprint.id, { ...sprint, boardId: board.id, boardName: board.name });
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
  boardId?: number; boardName?: string;
}>): Promise<Map<number, string>> {
  const sprintIdMap = new Map<number, string>();

  for (const sprint of sprints) {
    const status = sprint.state === 'active' ? 'active' : sprint.state === 'future' ? 'planning' : 'completed';
    const boardId = sprint.boardId != null ? String(sprint.boardId) : null;
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
        externalBoardId: boardId, boardName: sprint.boardName ?? null,
        isActive: true, lastSeenAtSourceAt: new Date(),
      },
      update: {
        name: sprint.name, status,
        startDate: sprint.startDate ? new Date(sprint.startDate) : undefined,
        endDate: sprint.endDate ? new Date(sprint.endDate) : undefined,
        goal: sprint.goal ?? null,
        externalBoardId: boardId, boardName: sprint.boardName ?? null,
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

interface JiraChangelogEntry {
  id: string;
  created: string;
  author?: { accountId?: string };
  items: Array<{ field: string; fromString?: string; toString?: string }>;
}

/**
 * Offset-paginated (startAt/maxResults/isLast) — confirmed via a live probe
 * against a real Jira Cloud site that this is a SEPARATE call from issue
 * search, not an `expand` param: `/search/jql`'s `expand:['changelog']`
 * returns 400, and the legacy `/search?expand=changelog` returns 410 Gone
 * ("migrate to /rest/api/3/search/jql" — which doesn't support expand at
 * all). This dedicated endpoint is the only path.
 */
async function* fetchChangelogPages(client: JiraClient, issueKey: string): AsyncGenerator<JiraChangelogEntry[]> {
  let startAt = 0;
  for (;;) {
    const page = await jiraFetch(client, `/rest/api/3/issue/${issueKey}/changelog?startAt=${startAt}&maxResults=100`);
    const values: JiraChangelogEntry[] = page.values ?? [];
    yield values;
    if (page.isLast || values.length === 0) break;
    startAt += values.length;
  }
}

/**
 * A changelog entry's `author` only carries `accountId` — no email, unlike
 * `issue.fields.assignee`/`reporter` (which have both). `accountIdToEmail`
 * is built from those fields as the same sync pass processes issues, so
 * resolving a changelog author to a real User needs no extra API call for
 * anyone who's also an assignee/reporter somewhere in this run; anyone else
 * stays unresolved (`userId: null` — the event is still recorded) rather
 * than paying for a per-author `/rest/api/3/user` lookup.
 */
async function syncStatusActivity(
  tenantId: string,
  workItemId: string,
  client: JiraClient,
  issueKey: string,
  accountIdToEmail: Map<string, string>
): Promise<void> {
  for await (const entries of fetchChangelogPages(client, issueKey)) {
    for (const entry of entries) {
      const statusItem = entry.items.find((i) => i.field === 'status');
      if (!statusItem) continue;
      const email = entry.author?.accountId ? accountIdToEmail.get(entry.author.accountId) : undefined;
      const userId = await resolveAssigneeId(email);

      await prisma.workItemActivity.upsert({
        where: { workItemId_externalId: { workItemId, externalId: entry.id } },
        create: {
          tenantId, workItemId, userId,
          eventType: 'status_transition',
          fromStatus: statusItem.fromString ?? null,
          toStatus: statusItem.toString ?? null,
          occurredAt: new Date(entry.created),
          source: 'jira',
          externalId: entry.id,
        },
        update: {}, // immutable historical event — nothing to reconcile on re-sync
      });
    }
  }
}

interface JqlPage {
  issues: any[];
  nextPageToken?: string;
}

async function* fetchIssuePages(
  client: JiraClient,
  jql: string,
  storyPointsFieldId: string | null,
  epicLinkFieldId: string | null,
  sprintFieldId: string | null
): AsyncGenerator<any[]> {
  let nextPageToken: string | undefined;
  const fields = ['summary', 'description', 'issuetype', 'status', 'priority', 'assignee', 'reporter', 'created', 'updated', 'resolutiondate', 'labels', 'issuelinks', 'parent', 'timetracking'];
  if (storyPointsFieldId) fields.push(storyPointsFieldId);
  if (epicLinkFieldId) fields.push(epicLinkFieldId);
  if (sprintFieldId) fields.push(sprintFieldId);

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
  const epicLinkFieldId = await getEpicLinkFieldId(client, integration);
  const sprintFieldId = await getSprintFieldId(client, integration);
  const systemUserId = await integrationService.getOrCreateSystemUser(integration.tenantId);

  const sprints = await fetchSprintsForProject(client, product.jiraProjectId);
  const sprintIdMap = await upsertSprints(integration.tenantId, product, sprints);

  const runStartedAt = new Date();
  const jql = `project = ${product.jiraProjectId} ORDER BY updated DESC`;

  // Collected across every page, resolved to internal WorkItem ids only
  // once the whole sync has finished — a link's target may live on a page
  // not yet processed, or in a different (also-synced) product entirely
  // (cross-project links are common), so resolution can't happen inline.
  const collectedLinks: Array<{ sourceExternalId: string; targetExternalId: string; linkType: string }> = [];
  // Collected for EVERY issue each run (not just ones with a parent) — see
  // persistWorkItemParents's doc comment for why omitting parent-less issues
  // here would leave un-parented items with a stale parentId forever.
  const collectedParents: Array<{ childExternalId: string; parentExternalId: string | null; epicKey: string | null }> = [];
  // Built progressively as issues are processed across this whole sync run
  // (not reset per page) — see syncStatusActivity's doc comment.
  const accountIdToEmail = new Map<string, string>();
  // No changelog fetch on a tenant's very first sync ever (lastSyncedAt null)
  // — avoids a potentially large one-time burst of per-issue API calls
  // against a big existing backlog. Activity starts accumulating from the
  // next sync onward, same as any other incremental signal.
  const changelogWatermark = integration.lastSyncedAt;

  for await (const issues of fetchIssuePages(client, jql, storyPointsFieldId, epicLinkFieldId, sprintFieldId)) {
    // Batched once per page (not per issue) so reopen/status-change detection
    // doesn't turn into an extra ~2500 findUnique calls at full-tenant scale —
    // this stays the same order of magnitude as the existing pagination cost.
    const pageExternalIds = issues.map((issue: any) => String(issue.id));
    const existingRows = await prisma.workItem.findMany({
      where: { productId: product.id, externalSystem: 'jira', externalId: { in: pageExternalIds } },
      select: {
        externalId: true, status: true, externalStatusName: true, reopenCount: true,
        title: true, description: true, embedding: true,
      },
    });
    const existingByExternalId = new Map(existingRows.map((r) => [r.externalId, r]));

    // Pass 1: map every issue's fields and flag which bugs need a fresh
    // embedding (new, or title/description changed) — collected across the
    // whole page so the OpenAI call below is one batched request, not one
    // per issue.
    const mapped = issues.map((issue: any) => {
      const f = issue.fields;
      const workItemType = mapIssueType(f.issuetype?.name);
      const status = mapStatus(f.status?.statusCategory?.key, workItemType);
      const priority = mapPriority(f.priority?.name, priorityOverrides);
      const labels: string[] = Array.isArray(f.labels) ? f.labels : [];
      const rawStatusName: string | null = f.status?.name ?? null;
      const title = f.summary ?? '(no title)';
      const description = f.description ? JSON.stringify(f.description) : null;
      const existing = existingByExternalId.get(String(issue.id));
      // Also re-embed a bug whose text hasn't changed but was never embedded
      // in the first place — every bug synced before this feature existed
      // has embedding=[] and needs this backfill pass, not just genuinely
      // edited ones.
      const contentChanged = workItemType === 'bug'
        && (!existing || existing.title !== title || existing.description !== description || existing.embedding.length === 0);
      return { issue, f, workItemType, status, priority, labels, rawStatusName, title, description, existing, contentChanged };
    });

    // Normalize each link to its "outward" verb direction (e.g. "blocks",
    // not "is blocked by") regardless of which of the pair's two issues we
    // read it from — Jira returns the same link on both sides, once as
    // outward and once as inward, so this collapses to one consistent
    // source->target row instead of two differently-worded duplicates.
    for (const issue of issues) {
      const links = issue.fields?.issuelinks;
      if (Array.isArray(links)) {
        for (const link of links) {
          const linkType = link.type?.outward ?? link.type?.name ?? 'related to';
          if (link.outwardIssue) {
            collectedLinks.push({ sourceExternalId: String(issue.id), targetExternalId: String(link.outwardIssue.id), linkType });
          } else if (link.inwardIssue) {
            collectedLinks.push({ sourceExternalId: String(link.inwardIssue.id), targetExternalId: String(issue.id), linkType });
          }
        }
      }

      // Modern hierarchy (`fields.parent`, numeric id) takes priority over the
      // legacy Epic Link custom field (issue KEY, not id) in persistWorkItemParents
      // when a site somehow has both populated.
      const parentField = issue.fields?.parent;
      const parentExternalId = parentField?.id ? String(parentField.id) : null;
      const epicKey = epicLinkFieldId ? (issue.fields?.[epicLinkFieldId] as string | undefined) ?? null : null;
      collectedParents.push({ childExternalId: String(issue.id), parentExternalId, epicKey });
    }

    const toEmbed = mapped.filter((m) => m.contentChanged);
    const embeddingsByExternalId = new Map<string, number[]>();
    if (toEmbed.length > 0) {
      try {
        const vectors = await generateEmbeddings(
          // description is stored as raw ADF JSON — embed the plain-text
          // extraction, not the JSON syntax noise, same util the bug detail
          // page uses for display.
          toEmbed.map((m) => `${m.title} ${adfToPlainText(m.description)}`)
        );
        toEmbed.forEach((m, i) => embeddingsByExternalId.set(String(m.issue.id), vectors[i]));
      } catch (err) {
        // Embeddings are an enhancement, not a sync-blocking dependency —
        // same resilience posture as the sprint/board lookup below.
        console.error(`Embedding generation failed for product ${product.id}, continuing without it:`, err);
      }
    }

    for (const m of mapped) {
      const { issue, f, workItemType, status, priority, labels, rawStatusName, title, description, existing } = m;
      const assigneeId = await resolveAssigneeId(f.assignee?.emailAddress);
      const storyPoints = storyPointsFieldId ? (f[storyPointsFieldId] ?? null) : null;
      const originalEstimateSeconds = f.timetracking?.originalEstimateSeconds ?? null;
      const remainingEstimateSeconds = f.timetracking?.remainingEstimateSeconds ?? null;
      const timeSpentSeconds = f.timetracking?.timeSpentSeconds ?? null;

      if (f.assignee?.accountId && f.assignee?.emailAddress) accountIdToEmail.set(f.assignee.accountId, f.assignee.emailAddress);
      if (f.reporter?.accountId && f.reporter?.emailAddress) accountIdToEmail.set(f.reporter.accountId, f.reporter.emailAddress);

      const sprintFieldValue = sprintFieldId ? f[sprintFieldId] : undefined;
      const jiraSprintField = Array.isArray(sprintFieldValue) ? sprintFieldValue[sprintFieldValue.length - 1] : sprintFieldValue;
      const sprintId = jiraSprintField?.id ? sprintIdMap.get(jiraSprintField.id) ?? null : null;

      const externalMetadata = {
        jiraKey: issue.key,
        assigneeAccountId: f.assignee?.accountId ?? null,
        assigneeName: f.assignee?.displayName ?? null,
        assigneeEmail: f.assignee?.emailAddress ?? null,
        reporterName: f.reporter?.displayName ?? null,
        reporterEmail: f.reporter?.emailAddress ?? null,
      };

      // Reopen detection uses the collapsed status bucket (a real business
      // event: fixed -> broken again). Status-duration tracking below instead
      // compares the RAW Jira status name, since e.g. "In QA" and "Code
      // Review" both collapse to the same 'in_progress' bucket and would
      // never register a change if compared on the bucket.
      const isReopen = !!existing
        && (existing.status === 'resolved' || existing.status === 'completed')
        && (status === 'open' || status === 'in_progress');
      const rawStatusChanged = !existing || existing.externalStatusName !== rawStatusName;
      // Keep the previously-stored vector when content didn't change (and
      // therefore wasn't re-embedded this pass) instead of wiping it back to
      // "not embedded" on every routine sync touch.
      const embedding = embeddingsByExternalId.get(String(issue.id)) ?? existing?.embedding ?? [];

      const externalAssigneeId = f.assignee?.accountId ?? null;
      const externalAssigneeName = f.assignee?.displayName ?? null;

      const workItemRow = await prisma.workItem.upsert({
        where: {
          productId_externalSystem_externalId: {
            productId: product.id, externalSystem: 'jira', externalId: String(issue.id),
          },
        },
        create: {
          tenantId: integration.tenantId, productId: product.id,
          externalSystem: 'jira', externalId: String(issue.id),
          type: workItemType, status, priority,
          title, description,
          assigneeId, externalAssigneeId, externalAssigneeName, sprintId, storyPoints, labels, embedding,
          originalEstimateSeconds, remainingEstimateSeconds, timeSpentSeconds,
          externalStatusName: rawStatusName, statusChangedAt: new Date(), reopenCount: 0,
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
          title, description,
          assigneeId, externalAssigneeId, externalAssigneeName, sprintId, storyPoints, labels, embedding,
          originalEstimateSeconds, remainingEstimateSeconds, timeSpentSeconds,
          externalStatusName: rawStatusName,
          // Only touch these when something actually changed, so an
          // unrelated field update doesn't reset "days in current status" or
          // double-count a reopen already recorded on a prior sync.
          ...(rawStatusChanged ? { statusChangedAt: new Date() } : {}),
          ...(isReopen ? { reopenCount: { increment: 1 } } : {}),
          // Also corrected on every update (not just create) so the very next
          // sync cycle repairs rows that were written before this fix existed,
          // instead of leaving already-synced issues permanently wrong.
          createdAt: f.created ? new Date(f.created) : undefined,
          resolvedAt: f.resolutiondate ? new Date(f.resolutiondate) : null,
          isActive: true, lastSeenAtSourceAt: new Date(), externalMetadata,
        },
      });

      if (changelogWatermark && f.updated && new Date(f.updated) > changelogWatermark) {
        await syncStatusActivity(integration.tenantId, workItemRow.id, client, issue.key, accountIdToEmail);
      }
    }
  }

  await persistWorkItemLinks(integration.tenantId, collectedLinks);
  await persistWorkItemParents(product.id, collectedParents);
  await reconcileMissingWorkItems(product.id, runStartedAt);
}

/**
 * Resolves collected Jira issue links (raw Jira issue ids) to internal
 * WorkItem rows and upserts them. A link whose source or target wasn't
 * synced at all (out-of-scope project, filtered issue type, etc.) is
 * silently skipped — traceability only covers what's actually tracked here.
 * Best-effort, additive: a link removed in Jira since the last sync isn't
 * detected and removed here, same convergent-over-time posture as the rest
 * of this sync (no hard deletes without an explicit reconcile pass).
 */
async function persistWorkItemLinks(
  tenantId: string,
  links: Array<{ sourceExternalId: string; targetExternalId: string; linkType: string }>
): Promise<void> {
  if (links.length === 0) return;

  const involvedIds = Array.from(new Set(links.flatMap((l) => [l.sourceExternalId, l.targetExternalId])));
  const resolved = await prisma.workItem.findMany({
    where: { tenantId, externalSystem: 'jira', externalId: { in: involvedIds } },
    select: { id: true, externalId: true },
  });
  const idByExternalId = new Map(resolved.map((r) => [r.externalId, r.id]));

  for (const link of links) {
    const sourceId = idByExternalId.get(link.sourceExternalId);
    const targetId = idByExternalId.get(link.targetExternalId);
    if (!sourceId || !targetId || sourceId === targetId) continue;

    await prisma.workItemLink.upsert({
      where: {
        sourceItemId_targetItemId_linkType: { sourceItemId: sourceId, targetItemId: targetId, linkType: link.linkType },
      },
      create: { tenantId, sourceItemId: sourceId, targetItemId: targetId, linkType: link.linkType },
      update: {},
    });
  }
}

/**
 * Resolves collected epic-parent references (both the modern `parent.id` and
 * the legacy Epic Link key) to internal WorkItem ids and writes them onto
 * WorkItem.parentId. Scoped to a single product — a cross-project parent
 * (rare, mostly a classic-Jira edge case) is left unresolved rather than
 * searching the whole tenant, since the rollups this feeds are product-scoped
 * anyway.
 *
 * Unlike persistWorkItemLinks, this writes an entry for every issue,
 * including a `parentExternalId: null, epicKey: null` one — an issue that
 * previously had a parent and no longer does (un-parented in Jira, not
 * re-parented to a different epic) must have its stored parentId explicitly
 * cleared here, or it stays stale forever. Re-parenting between two epics
 * self-corrects on its own since the new non-null value simply overwrites
 * the old one.
 */
async function persistWorkItemParents(
  productId: string,
  entries: Array<{ childExternalId: string; parentExternalId: string | null; epicKey: string | null }>
): Promise<void> {
  if (entries.length === 0) return;

  const numericParentIds = Array.from(new Set(entries.map((e) => e.parentExternalId).filter((v): v is string => !!v)));
  const childExternalIds = entries.map((e) => e.childExternalId);

  const [parentsByNumericId, epics, children] = await Promise.all([
    numericParentIds.length
      ? prisma.workItem.findMany({
          where: { productId, externalSystem: 'jira', externalId: { in: numericParentIds } },
          select: { id: true, externalId: true },
        })
      : Promise.resolve([]),
    prisma.workItem.findMany({
      where: { productId, externalSystem: 'jira', type: 'epic' },
      select: { id: true, externalMetadata: true },
    }),
    prisma.workItem.findMany({
      where: { productId, externalSystem: 'jira', externalId: { in: childExternalIds } },
      select: { id: true, externalId: true, parentId: true },
    }),
  ]);

  const idByNumericExternalId = new Map(parentsByNumericId.map((r) => [r.externalId as string, r.id]));
  const epicIdByKey = new Map<string, string>();
  for (const epic of epics) {
    const jiraKey = (epic.externalMetadata as Record<string, unknown> | null)?.jiraKey;
    if (typeof jiraKey === 'string') epicIdByKey.set(jiraKey, epic.id);
  }
  const childByExternalId = new Map(children.map((c) => [c.externalId as string, c]));

  for (const entry of entries) {
    const child = childByExternalId.get(entry.childExternalId);
    if (!child) continue;

    let resolvedParentId: string | null = null;
    if (entry.parentExternalId) {
      resolvedParentId = idByNumericExternalId.get(entry.parentExternalId) ?? null;
    }
    if (!resolvedParentId && entry.epicKey) {
      resolvedParentId = epicIdByKey.get(entry.epicKey) ?? null;
    }

    if (resolvedParentId === child.id) continue; // guard against self-parent
    if (resolvedParentId === child.parentId) continue; // no-op, already correct

    await prisma.workItem.update({ where: { id: child.id }, data: { parentId: resolvedParentId } });
  }
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

const WORKLOG_LIST_CHUNK = 1000; // Atlassian's documented cap on /worklog/list's ids array per request
const MAX_WORKLOG_PAGES = 1000; // safety cap against an unexpected pagination contract, not a realistic ceiling

interface JiraWorklogIdPage {
  values: Array<{ worklogId: number }>;
  until: number;
  lastPage: boolean;
  nextPage?: string;
}

async function* fetchWorklogIdPages(client: JiraClient, endpoint: 'updated' | 'deleted', since: number): AsyncGenerator<number[]> {
  let path: string | undefined = `/rest/api/3/worklog/${endpoint}?since=${since}`;
  for (let pageCount = 0; path && pageCount < MAX_WORKLOG_PAGES; pageCount++) {
    const page: JiraWorklogIdPage = await jiraFetch(client, path);
    yield (page.values ?? []).map((v) => v.worklogId);
    path = page.lastPage ? undefined : page.nextPage;
  }
}

/**
 * Site-wide, not per-project — Jira's worklog-sync endpoints (/worklog/
 * updated, /worklog/list, /worklog/deleted) have no project filter, unlike
 * issue search. Runs once per integration after every mapped product has
 * synced (see syncAllProductsForIntegration's call site), not once per
 * product, to avoid re-fetching and re-processing the same site-wide
 * worklog set once per mapped project.
 *
 * Full backfill on first-ever sync (since=0), deliberately unlike the
 * changelog watermark's "skip on first sync" posture elsewhere in this file
 * — worklogs already sitting in Jira are the actual point of this feature,
 * not a supplementary signal to accumulate going forward only.
 *
 * Re-reads Integration.externalMetadata fresh from the DB rather than
 * trusting the `integration` param: getStoryPointsFieldId/getEpicLinkFieldId
 * write to that same JSON column *during* the just-settled per-product
 * syncProduct calls, and this function runs after all of them — merging the
 * new watermark onto the caller's stale in-memory snapshot would silently
 * erase those writes.
 */
async function syncWorklogs(integration: Integration): Promise<void> {
  const accessToken = await ensureValidToken(integration);
  const client: JiraClient = { cloudId: (integration.externalMetadata as any)?.cloudId, accessToken };
  if (!client.cloudId) return;

  const fresh = await prisma.integration.findUniqueOrThrow({ where: { id: integration.id } });
  const metadata = (fresh.externalMetadata as Record<string, unknown>) ?? {};
  const since = typeof metadata.worklogSyncWatermark === 'number' ? metadata.worklogSyncWatermark : 0;
  // Captured before any fetches, not after — a watermark taken at completion
  // would create a gap for anything logged in Jira while this run was in flight.
  const syncStartedAt = Date.now();

  const updatedIds: number[] = [];
  for await (const ids of fetchWorklogIdPages(client, 'updated', since)) {
    updatedIds.push(...ids);
  }

  const deletedIds: number[] = [];
  for await (const ids of fetchWorklogIdPages(client, 'deleted', since)) {
    deletedIds.push(...ids);
  }

  for (let i = 0; i < updatedIds.length; i += WORKLOG_LIST_CHUNK) {
    const chunk = updatedIds.slice(i, i + WORKLOG_LIST_CHUNK);
    const worklogs = await jiraFetch(client, '/rest/api/3/worklog/list', {
      method: 'POST',
      body: JSON.stringify({ ids: chunk }),
    });
    await persistWorklogs(integration.tenantId, Array.isArray(worklogs) ? worklogs : []);
  }

  if (deletedIds.length > 0) {
    await prisma.workLog.deleteMany({
      where: { externalSystem: 'jira', externalId: { in: deletedIds.map(String) } },
    });
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { externalMetadata: { ...metadata, worklogSyncWatermark: syncStartedAt } },
  });
}

/**
 * Resolves each worklog's issueId to an internal WorkItem tenant-wide (not
 * product-scoped like persistWorkItemParents) — worklogs aren't fetched
 * per-project, so an issue outside every mapped product is simply
 * unresolvable here. Silently skipped, same best-effort posture as
 * persistWorkItemLinks.
 *
 * authorEmail is taken only directly from the worklog payload, never
 * looked up separately — Jira's per-user email-visibility privacy setting
 * means even a dedicated /rest/api/3/user(/bulk) lookup can return no email
 * for some real, active users (verified live against this integration), so
 * paying for that extra call would be pure waste. authorName is always
 * available and always stored; authorEmail is null for privacy-restricted
 * authors, same accepted gap Commit.authorEmail already has elsewhere.
 * authorAccountId is ALSO always available (same author object, but Jira
 * never hides accountId the way it hides email) — it's the reliable join
 * key for per-assignee workload metrics that don't depend on email visibility
 * or on the person having a QualiMetrix account at all.
 */
async function persistWorklogs(tenantId: string, worklogs: any[]): Promise<void> {
  if (worklogs.length === 0) return;

  const issueIds = Array.from(new Set(worklogs.map((w) => String(w.issueId))));
  const items = await prisma.workItem.findMany({
    where: { tenantId, externalSystem: 'jira', externalId: { in: issueIds } },
    select: { id: true, externalId: true },
  });
  const workItemIdByExternalId = new Map(items.map((i) => [i.externalId, i.id]));

  for (const w of worklogs) {
    const workItemId = workItemIdByExternalId.get(String(w.issueId));
    if (!workItemId) continue;

    const authorName = w.author?.displayName ?? null;
    const authorEmail = w.author?.emailAddress ?? null;
    const authorAccountId = w.author?.accountId ?? null;

    await prisma.workLog.upsert({
      where: { externalSystem_externalId: { externalSystem: 'jira', externalId: String(w.id) } },
      create: {
        tenantId, workItemId, authorName, authorEmail, authorAccountId,
        timeSpentSeconds: w.timeSpentSeconds,
        startedAt: new Date(w.started),
        externalSystem: 'jira', externalId: String(w.id),
      },
      update: {
        authorName, authorEmail, authorAccountId,
        timeSpentSeconds: w.timeSpentSeconds,
        startedAt: new Date(w.started),
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

  try {
    await syncWorklogs(integration);
  } catch (err) {
    // Worklogs are a secondary, additive signal — same resilience posture as
    // embeddings/board-lookup elsewhere in this file — never fail the whole
    // integration sync over it.
    console.error(`Worklog sync failed for integration ${integration.id}, continuing:`, err);
  }

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
