import prisma from '../../lib/prisma';
import integrationService from './integration.service';
import azureDevOpsOAuthService from './azure-devops-oauth.service';
import { generateEmbeddings } from './local-embeddings.service';
import type { Integration, Product } from '@prisma/client';

// ADO's System.Description is HTML, unlike Jira's ADF-JSON — a quick tag
// strip is enough for embedding input text (display-only concerns like
// jira-sync.service.ts's adf-to-text.ts don't apply here since this repo
// doesn't render ADO descriptions anywhere yet).
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const RECONCILE_MISS_THRESHOLD = 2;
const BATCH_SIZE = 200; // ADO workitemsbatch hard limit

const STORY_POINTS_FIELDS = ['Microsoft.VSTS.Scheduling.StoryPoints', 'Microsoft.VSTS.Scheduling.Effort'];

function mapIssueType(adoWorkItemType: string | undefined): string {
  const name = (adoWorkItemType ?? '').toLowerCase();
  if (name.includes('bug')) return 'bug';
  if (name.includes('story') || name.includes('backlog item')) return 'story';
  if (name.includes('epic')) return 'epic';
  return 'task';
}

/** ADO's numeric Microsoft.VSTS.Common.Priority: 1 (highest) .. 4 (lowest), Agile/Scrum default. */
function mapPriority(priority: number | undefined): string {
  switch (priority) {
    case 1: return 'critical';
    case 2: return 'high';
    case 3: return 'medium';
    case 4: return 'low';
    default: return 'medium';
  }
}

/** Mirrors Jira's statusCategory split: 'bug' resolves as 'resolved', everything else as 'completed'. */
function mapStateCategory(category: string | undefined, workItemType: string): string {
  switch (category) {
    case 'Proposed': return 'open';
    case 'InProgress': return 'in_progress';
    case 'Resolved':
    case 'Completed':
      return workItemType === 'bug' ? 'resolved' : 'completed';
    case 'Removed': return 'closed';
    default: return 'open';
  }
}

/** Escapes a WIQL string literal — WIQL has no bind-variable support, so this is the only injection guard. */
function escapeWiql(value: string): string {
  return value.replace(/'/g, "''");
}

function projectFromAreaPath(areaPath: string): string {
  return areaPath.split('\\')[0];
}

interface AdoClient {
  organization: string;
  accessToken: string;
}

async function adoFetch(client: AdoClient, path: string, init?: RequestInit): Promise<any> {
  const url = path.startsWith('http') ? path : `https://dev.azure.com/${client.organization}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Azure DevOps API ${path} failed (${response.status}): ${body}`);
  }
  return response.json();
}

async function ensureValidToken(integration: Integration): Promise<string> {
  const tokens = await integrationService.getDecryptedTokens(integration.tenantId, 'azure_devops');
  if (!tokens) throw new Error('Azure DevOps integration has no stored tokens');

  const expiresAt = tokens.expiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    await integrationService.markReauthRequired(integration.tenantId, 'azure_devops', 'Access token expired and no refresh token is stored');
    throw new Error('reauth_required');
  }

  try {
    const refreshed = await azureDevOpsOAuthService.refreshAccessToken(tokens.refreshToken);
    await integrationService.recordTokenRefresh(integration.tenantId, 'azure_devops', refreshed);
    return refreshed.accessToken;
  } catch (err) {
    await integrationService.markReauthRequired(
      integration.tenantId, 'azure_devops',
      `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`
    );
    throw new Error('reauth_required');
  }
}

/**
 * ADO's System.State varies by process template (Agile/Scrum/CMMI each use
 * different state names), but each work item type's state definitions expose
 * a stable `category` (Proposed/InProgress/Resolved/Completed/Removed) — the
 * closest ADO analog to Jira's statusCategory. Cached per type, per run.
 */
async function getStateCategoryMap(client: AdoClient, project: string, workItemType: string, cache: Map<string, Record<string, string>>): Promise<Record<string, string>> {
  const cached = cache.get(workItemType);
  if (cached) return cached;

  const data = await adoFetch(client, `/${encodeURIComponent(project)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/states?api-version=7.0`);
  const map: Record<string, string> = {};
  for (const state of data.value ?? []) {
    map[state.name] = state.category;
  }
  cache.set(workItemType, map);
  return map;
}

async function fetchIterationsForProject(client: AdoClient, project: string): Promise<Array<{
  id: string; name: string; startDate?: string; finishDate?: string; timeFrame?: string;
}>> {
  const data = await adoFetch(client, `/${encodeURIComponent(project)}/_apis/work/teamsettings/iterations?api-version=7.0`);
  return data.value ?? [];
}

async function upsertIterations(tenantId: string, product: Product, iterations: Array<{
  id: string; name: string; startDate?: string; finishDate?: string; timeFrame?: string;
}>): Promise<Map<string, string>> {
  const iterationIdMap = new Map<string, string>();

  for (const iteration of iterations) {
    const status = iteration.timeFrame === 'current' ? 'active' : iteration.timeFrame === 'future' ? 'planning' : 'completed';
    const row = await prisma.sprint.upsert({
      where: {
        productId_externalSystem_externalId: {
          productId: product.id, externalSystem: 'azure_devops', externalId: iteration.id,
        },
      },
      create: {
        tenantId, productId: product.id, externalSystem: 'azure_devops', externalId: iteration.id,
        name: iteration.name, status,
        startDate: iteration.startDate ? new Date(iteration.startDate) : new Date(),
        endDate: iteration.finishDate ? new Date(iteration.finishDate) : new Date(),
        isActive: true, lastSeenAtSourceAt: new Date(),
      },
      update: {
        name: iteration.name, status,
        startDate: iteration.startDate ? new Date(iteration.startDate) : undefined,
        endDate: iteration.finishDate ? new Date(iteration.finishDate) : undefined,
        isActive: true, lastSeenAtSourceAt: new Date(),
      },
    });
    iterationIdMap.set(iteration.id, row.id);
  }

  return iterationIdMap;
}

async function resolveAssigneeId(uniqueName: string | undefined): Promise<string | null> {
  if (!uniqueName || !uniqueName.includes('@')) return null;
  const user = await prisma.user.findUnique({ where: { email: uniqueName } });
  return user?.id ?? null;
}

async function fetchWorkItemIds(client: AdoClient, project: string, areaPath: string): Promise<number[]> {
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${escapeWiql(project)}' AND [System.AreaPath] UNDER '${escapeWiql(areaPath)}'`;
  const result = await adoFetch(client, `/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.0`, {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });
  // WIQL has no pagination and a hard 20,000-result cap — a project this size needs
  // date-bounded sub-queries, not handled here; this is a known v1 limitation.
  return (result.workItems ?? []).map((w: any) => w.id);
}

async function* fetchWorkItemBatches(client: AdoClient, ids: number[], stateCategoryCache: Map<string, Record<string, string>>, project: string): AsyncGenerator<any[]> {
  const fields = [
    'System.Title', 'System.Description', 'System.WorkItemType', 'System.State', 'System.AssignedTo', 'System.CreatedBy',
    'System.IterationId', 'System.IterationPath', 'Microsoft.VSTS.Common.Priority',
    'Microsoft.VSTS.Scheduling.StoryPoints', 'Microsoft.VSTS.Scheduling.Effort',
    'Microsoft.VSTS.Common.ResolvedDate',
  ];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const result = await adoFetch(client, `/${encodeURIComponent(project)}/_apis/wit/workitemsbatch?api-version=7.0`, {
      method: 'POST',
      body: JSON.stringify({ ids: chunk, fields }),
    });
    yield result.value ?? [];
  }
}

export async function syncProduct(integration: Integration, product: Product): Promise<void> {
  if (!product.azureDevopsAreaPath) throw new Error(`Product ${product.id} has no azureDevopsAreaPath mapped`);

  const accessToken = await ensureValidToken(integration);
  const organization = (integration.externalMetadata as any)?.organization;
  if (!organization) throw new Error('Azure DevOps integration is missing organization in externalMetadata');
  const client: AdoClient = { organization, accessToken };

  const project = projectFromAreaPath(product.azureDevopsAreaPath);
  const systemUserId = await integrationService.getOrCreateSystemUser(integration.tenantId);
  const stateCategoryCache = new Map<string, Record<string, string>>();

  const iterations = await fetchIterationsForProject(client, project);
  const iterationIdMap = await upsertIterations(integration.tenantId, product, iterations);

  const runStartedAt = new Date();
  const ids = await fetchWorkItemIds(client, project, product.azureDevopsAreaPath);

  for await (const items of fetchWorkItemBatches(client, ids, stateCategoryCache, project)) {
    const batchExternalIds = items.map((item: any) => String(item.id));
    const existingRows = await prisma.workItem.findMany({
      where: { productId: product.id, externalSystem: 'azure_devops', externalId: { in: batchExternalIds } },
      select: { externalId: true, title: true, description: true, embedding: true },
    });
    const existingByExternalId = new Map(existingRows.map((r) => [r.externalId, r]));

    // Same batched-embedding shape as jira-sync.service.ts: detect new/
    // changed bugs across the whole batch, one OpenAI call, not one per item.
    const mapped = items.map((item: any) => {
      const f = item.fields;
      const workItemType = mapIssueType(f['System.WorkItemType']);
      const title = f['System.Title'] ?? '(no title)';
      const description = f['System.Description'] ? String(f['System.Description']) : null;
      const existing = existingByExternalId.get(String(item.id));
      // Also re-embed a bug whose text hasn't changed but was never embedded
      // — same backfill reasoning as jira-sync.service.ts.
      const contentChanged = workItemType === 'bug'
        && (!existing || existing.title !== title || existing.description !== description || existing.embedding.length === 0);
      return { item, f, workItemType, title, description, existing, contentChanged };
    });

    const toEmbed = mapped.filter((m) => m.contentChanged);
    const embeddingsByExternalId = new Map<string, number[]>();
    if (toEmbed.length > 0) {
      try {
        const vectors = await generateEmbeddings(
          toEmbed.map((m) => `${m.title} ${m.description ? stripHtml(m.description) : ''}`)
        );
        toEmbed.forEach((m, i) => embeddingsByExternalId.set(String(m.item.id), vectors[i]));
      } catch (err) {
        console.error(`Embedding generation failed for product ${product.id}, continuing without it:`, err);
      }
    }

    for (const m of mapped) {
      const { item, f, workItemType, title, description, existing } = m;
      const stateCategoryMap = await getStateCategoryMap(client, project, f['System.WorkItemType'], stateCategoryCache);
      const status = mapStateCategory(stateCategoryMap[f['System.State']], workItemType);
      const priority = mapPriority(f['Microsoft.VSTS.Common.Priority']);
      const assigneeId = await resolveAssigneeId(f['System.AssignedTo']?.uniqueName);
      const storyPoints = f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? f['Microsoft.VSTS.Scheduling.Effort'] ?? null;
      const sprintId = f['System.IterationId'] ? iterationIdMap.get(String(f['System.IterationId'])) ?? null : null;
      const embedding = embeddingsByExternalId.get(String(item.id)) ?? existing?.embedding ?? [];

      const externalMetadata = {
        assigneeName: f['System.AssignedTo']?.displayName ?? null,
        assigneeEmail: f['System.AssignedTo']?.uniqueName ?? null,
        reporterName: f['System.CreatedBy']?.displayName ?? null,
        reporterEmail: f['System.CreatedBy']?.uniqueName ?? null,
      };

      await prisma.workItem.upsert({
        where: {
          productId_externalSystem_externalId: {
            productId: product.id, externalSystem: 'azure_devops', externalId: String(item.id),
          },
        },
        create: {
          tenantId: integration.tenantId, productId: product.id,
          externalSystem: 'azure_devops', externalId: String(item.id),
          type: workItemType, status, priority,
          title, description, embedding,
          assigneeId, sprintId, storyPoints: storyPoints ? Math.round(storyPoints) : null,
          createdBy: systemUserId,
          resolvedAt: f['Microsoft.VSTS.Common.ResolvedDate'] ? new Date(f['Microsoft.VSTS.Common.ResolvedDate']) : null,
          isActive: true, lastSeenAtSourceAt: new Date(), externalMetadata,
        },
        update: {
          type: workItemType, status, priority,
          title, description, embedding,
          assigneeId, sprintId, storyPoints: storyPoints ? Math.round(storyPoints) : null,
          resolvedAt: f['Microsoft.VSTS.Common.ResolvedDate'] ? new Date(f['Microsoft.VSTS.Common.ResolvedDate']) : null,
          isActive: true, lastSeenAtSourceAt: new Date(), externalMetadata,
        },
      });
    }
  }

  await reconcileMissingWorkItems(product.id, runStartedAt);
}

async function reconcileMissingWorkItems(productId: string, runStartedAt: Date): Promise<void> {
  const missed = await prisma.workItem.findMany({
    where: { productId, externalSystem: 'azure_devops', isActive: true, lastSeenAtSourceAt: { lt: runStartedAt } },
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

  const products = await prisma.product.findMany({
    where: { tenantId: integration.tenantId, azureDevopsAreaPath: { not: null }, isActive: true },
  });

  const results = await Promise.allSettled(products.map((p) => syncProduct(integration, p)));

  const errors = results
    .map((r, i) => (r.status === 'rejected' ? `${products[i].name}: ${r.reason}` : null))
    .filter((e): e is string => e !== null);

  if (errors.some((e) => e.includes('reauth_required'))) return;

  if (errors.length > 0) {
    await integrationService.recordSyncError(integration.id, errors.join(' | '));
  } else {
    await integrationService.recordSyncSuccess(integration.id);
  }
}
