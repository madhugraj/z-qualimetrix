import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import integrationService from '../services/integration.service';
import { ensureValidAtlassianToken } from '../services/atlassian-token.service';
import { searchConfluencePages, suggestPagesForWorkItem } from '../services/confluence-search.service';
import { paramString, queryString } from '../utils/http-params';
import { canAccessProduct } from '../middleware/auth.middleware';

function getTenantId(req: Request): string {
  return req.user?.tenantId || '';
}

function getUserId(req: Request): string {
  return req.user?.id || '';
}

/**
 * These endpoints only checked tenantId, never per-product membership —
 * unlike getWorkItemById (workitem.controller.ts), which also calls
 * canAccessProduct so a non-portfolio-role caller can't read a work item
 * outside their TenantMembership.accessibleProducts grant just by knowing
 * its id. Confirms the work item belongs to the caller's tenant AND that
 * they're allowed to see its product; returns null (having already written
 * the response) on either failure.
 */
async function requireWorkItemAccess(req: Request, res: Response, workItemId: string): Promise<{ tenantId: string; productId: string } | null> {
  const tenantId = getTenantId(req);
  const workItem = await prisma.workItem.findFirst({ where: { id: workItemId, tenantId }, select: { productId: true } });
  if (!workItem) {
    res.status(404).json({ success: false, error: 'Work item not found' });
    return null;
  }
  if (!req.user || !(await canAccessProduct(req.user, workItem.productId))) {
    res.status(404).json({ success: false, error: 'Work item not found' });
    return null;
  }
  return { tenantId, productId: workItem.productId };
}

// ---------------------------------------------------------------------------
// Spaces — discovery + tenant's sync selection (mirrors saveJiraSelection's
// selectedProjectIds convention in integration.controller.ts, one level up:
// a space, not a page, is the unit of "what to sync").
// ---------------------------------------------------------------------------

/**
 * Live-fetched from Confluence, not read from the ConfluenceSpace table —
 * same on-demand convention as integration.controller.ts's listProjects for
 * Jira. Reading from the DB instead would leave the selection UI showing
 * "no spaces available" until the first scheduled sync pass runs (spaces are
 * otherwise only discovered as a side effect of confluence-sync.service.ts),
 * a startup gap this avoids entirely. Already-saved selections (isSelected,
 * or externalMetadata.selectedSpaceKeys before a space has even been synced
 * once) are merged in by key so a prior choice still shows as checked.
 */
export async function listSpaces(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const integration = await prisma.integration.findUnique({
    where: { tenantId_provider: { tenantId, provider: 'confluence' } },
  });
  if (!integration || !integration.isActive) {
    return res.status(404).json({ success: false, error: 'Confluence integration not connected' });
  }

  const metadata = (integration.externalMetadata as Record<string, unknown>) ?? {};
  const cloudId = metadata.cloudId as string | undefined;
  if (!cloudId) return res.status(409).json({ success: false, error: 'Confluence site is not configured' });

  let accessToken: string;
  try {
    accessToken = await ensureValidAtlassianToken(tenantId, 'confluence');
  } catch {
    return res.status(409).json({ success: false, error: 'Confluence needs to be re-authorized' });
  }

  // v2 API — the v1 endpoint this originally called (/wiki/rest/api/space)
  // is retired (410 Gone on a real site); see confluence-sync.service.ts's
  // file comment.
  const response = await fetch(`https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces?limit=200`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    return res.status(502).json({ success: false, error: 'Failed to fetch Confluence spaces' });
  }
  const data = await response.json();
  const liveSpaces: Array<{ id: string; key: string; name: string; type?: string }> = data.results ?? [];

  const selectedRows = await prisma.confluenceSpace.findMany({
    where: { tenantId, isSelected: true },
    select: { key: true },
  });
  const selectedKeys = new Set(selectedRows.map((s) => s.key));
  const savedSelection = Array.isArray(metadata.selectedSpaceKeys)
    ? (metadata.selectedSpaceKeys as unknown[]).filter((k): k is string => typeof k === 'string')
    : [];
  for (const key of savedSelection) selectedKeys.add(key);

  return res.json({
    success: true,
    data: liveSpaces.map((s) => ({
      key: s.key, name: s.name, spaceType: s.type ?? null, isSelected: selectedKeys.has(s.key),
    })),
  });
}

export async function saveSelection(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const { spaceKeys } = req.body ?? {};
  if (!Array.isArray(spaceKeys) || !spaceKeys.every((k) => typeof k === 'string')) {
    return res.status(400).json({ success: false, error: 'spaceKeys must be an array of strings' });
  }

  const integration = await prisma.integration.findUnique({
    where: { tenantId_provider: { tenantId, provider: 'confluence' } },
  });
  if (!integration || !integration.isActive) {
    return res.status(404).json({ success: false, error: 'Confluence integration not connected' });
  }

  const availableSpaces = await prisma.confluenceSpace.findMany({ where: { tenantId, isActive: true }, select: { key: true } });
  const availableKeys = new Set(availableSpaces.map((s) => s.key));
  const selected = [...new Set(spaceKeys)].filter((k) => availableKeys.has(k));
  if (selected.length !== new Set(spaceKeys).size) {
    return res.status(400).json({ success: false, error: 'One or more selected spaces are not accessible' });
  }

  await prisma.$transaction([
    prisma.confluenceSpace.updateMany({ where: { tenantId }, data: { isSelected: false } }),
    prisma.confluenceSpace.updateMany({ where: { tenantId, key: { in: selected } }, data: { isSelected: true } }),
  ]);

  // The next sync pass (confluence-sync.service.ts) reads this list, not the
  // isSelected column, to decide which spaces' pages to fetch — keep both in
  // sync so the selection UI (reading isSelected) and the sync engine
  // (reading externalMetadata) never disagree.
  await integrationService.updateExternalMetadata(tenantId, 'confluence', {
    selectedSpaceKeys: selected,
    selectionUpdatedAt: new Date().toISOString(),
  });

  res.json({ success: true, data: { selectedCount: selected.length } });
}

// ---------------------------------------------------------------------------
// Pages — browsing + search (DocumentHub's real Confluence source, replacing
// its mock entry).
// ---------------------------------------------------------------------------

export async function listPages(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const spaceKey = queryString(req.query.spaceKey);
  const pages = await prisma.confluencePage.findMany({
    where: { tenantId, isActive: true, ...(spaceKey ? { space: { key: spaceKey } } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: {
      id: true, externalId: true, title: true, webUrl: true, updatedAt: true, lastSeenAtSourceAt: true,
      space: { select: { key: true, name: true } },
    },
  });
  res.json({ success: true, data: pages });
}

export async function getPage(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const id = paramString(req.params.id);
  const page = await prisma.confluencePage.findFirst({
    where: { id, tenantId },
    select: {
      id: true, externalId: true, title: true, bodyText: true, webUrl: true, version: true, updatedAt: true,
      space: { select: { key: true, name: true } },
    },
  });
  if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
  res.json({ success: true, data: page });
}

export async function search(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const q = queryString(req.query.q) ?? '';
  const result = await searchConfluencePages(tenantId, q, 15);
  res.json({ success: true, data: result });
}

// ---------------------------------------------------------------------------
// Work-item <-> page links (mounted under /work-items/:workItemId/documents
// in routes/index.ts, not under /integrations — a link is a property of the
// work item, matching where every other work-item sub-resource lives).
// ---------------------------------------------------------------------------

export async function listLinkedDocuments(req: Request, res: Response) {
  const workItemId = paramString(req.params.workItemId);
  const access = await requireWorkItemAccess(req, res, workItemId);
  if (!access) return;
  const { tenantId } = access;

  const links = await prisma.workItemDocumentLink.findMany({
    where: { tenantId, workItemId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, linkType: true, createdAt: true,
      page: {
        select: {
          id: true, externalId: true, title: true, webUrl: true, updatedAt: true,
          space: { select: { name: true } },
        },
      },
    },
  });
  res.json({ success: true, data: links });
}

export async function suggestLinks(req: Request, res: Response) {
  const workItemId = paramString(req.params.workItemId);
  const access = await requireWorkItemAccess(req, res, workItemId);
  if (!access) return;

  const result = await suggestPagesForWorkItem(workItemId, 5);
  res.json({ success: true, data: result });
}

export async function createLink(req: Request, res: Response) {
  const userId = getUserId(req);
  const workItemId = paramString(req.params.workItemId);
  const { pageId } = req.body ?? {};
  if (typeof pageId !== 'string' || !pageId) {
    return res.status(400).json({ success: false, error: 'pageId is required' });
  }

  const access = await requireWorkItemAccess(req, res, workItemId);
  if (!access) return;
  const { tenantId } = access;

  const page = await prisma.confluencePage.findFirst({ where: { id: pageId, tenantId }, select: { id: true } });
  if (!page) return res.status(404).json({ success: false, error: 'Confluence page not found' });

  const link = await prisma.workItemDocumentLink.upsert({
    where: { workItemId_pageId: { workItemId, pageId } },
    create: { tenantId, workItemId, pageId, createdBy: userId },
    update: {},
  });
  res.json({ success: true, data: link });
}

export async function deleteLink(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const linkId = paramString(req.params.linkId);
  const link = await prisma.workItemDocumentLink.findFirst({ where: { id: linkId, tenantId }, select: { id: true, workItemId: true } });
  if (!link) return res.status(404).json({ success: false, error: 'Link not found' });

  // Same product-membership check as the other work-item-document endpoints
  // — tenantId match alone isn't enough, or a non-portfolio-role caller could
  // unlink a document from a work item outside their own product scope.
  const access = await requireWorkItemAccess(req, res, link.workItemId);
  if (!access) return;

  await prisma.workItemDocumentLink.delete({ where: { id: linkId } });
  res.json({ success: true });
}
