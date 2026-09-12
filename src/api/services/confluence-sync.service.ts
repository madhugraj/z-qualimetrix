// Confluence Cloud sync — mirrors jira-sync.service.ts's skeleton (token
// refresh, paginate-then-upsert, per-tenant space selection cached in
// externalMetadata) but for spaces/pages instead of issues.
//
// This deliberately runs against its OWN 'confluence' Integration row rather
// than reusing 'jira''s, even though both share the same underlying
// Atlassian OAuth grant (see jira-oauth.service.ts's SCOPES comment) — the
// two rows track independent sync state (lastSyncedAt, syncFrequencyMinutes,
// selected spaces vs selected projects), and atlassian-token.service.ts is
// what keeps their *token* halves in sync, not this file.

import prisma from '../../lib/prisma';
import integrationService from './integration.service';
import { ensureValidAtlassianToken } from './atlassian-token.service';
import { generateEmbeddings } from './local-embeddings.service';
import { confluenceStorageToText } from '../utils/confluence-storage-to-text';
import type { Integration } from '@prisma/client';

const MAX_RATE_LIMIT_WAIT_MS = 60 * 1000;
// MiniLM only handles ~1000 chars well (local-embeddings.service.ts's
// MAX_INPUT_CHARS) — a single embedding over a whole page would silently
// ignore most of it, so pages are split into windows well under that.
const CHUNK_TARGET_CHARS = 800;
// Safety valve against a pathologically large page (e.g. an auto-generated
// export dump) turning one sync pass into thousands of embedding calls.
const MAX_CHUNKS_PER_PAGE = 40;

interface ConfluenceClient {
  cloudId: string;
  accessToken: string;
}

async function confluenceFetch(client: ConfluenceClient, path: string, init?: RequestInit): Promise<any> {
  const url = path.startsWith('http') ? path : `https://api.atlassian.com/ex/confluence/${client.cloudId}${path}`;
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
    return confluenceFetch(client, path, init);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Confluence API ${path} failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function ensureValidToken(integration: Integration): Promise<string> {
  return ensureValidAtlassianToken(integration.tenantId, 'confluence');
}

/**
 * Splits page text into ~CHUNK_TARGET_CHARS windows on blank-line
 * boundaries, no overlap — the simplest reasonable strategy given no
 * existing chunking precedent in this codebase to match. Re-chunked from
 * scratch (delete + reinsert, see syncPage below) whenever a page's
 * `version` changes; never incrementally patched.
 */
export function chunkPageText(text: string): string[] {
  if (!text.trim()) return [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    if (chunks.length >= MAX_CHUNKS_PER_PAGE) break;
    if (current && current.length + para.length + 1 > CHUNK_TARGET_CHARS) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n${para}` : para;
    }
  }
  if (current && chunks.length < MAX_CHUNKS_PER_PAGE) chunks.push(current);
  return chunks;
}

// Confluence's v1 REST API (/wiki/rest/api/space, /wiki/rest/api/content) is
// retired — confirmed live against a real site, it now returns 410 Gone.
// Everything here uses the current v2 API (/wiki/api/v2/...), which needs
// the granular read:space:confluence / read:page:confluence scopes, not the
// classic ones (see jira-oauth.service.ts's SCOPES comment).

interface ConfluenceSpaceApi {
  id: string;
  key: string;
  name: string;
  type?: string;
}

async function* fetchSpacePages(client: ConfluenceClient): AsyncGenerator<ConfluenceSpaceApi[]> {
  let path: string | undefined = '/wiki/api/v2/spaces?limit=100';
  while (path) {
    const page: any = await confluenceFetch(client, path);
    yield (page.results ?? []) as ConfluenceSpaceApi[];
    path = page._links?.next ?? undefined;
  }
}

interface ConfluenceContentApi {
  id: string;
  title: string;
  version?: { number: number };
  body?: { storage?: { value: string } };
  _links?: { webui?: string };
}

// space-id filters by the space's real numeric Confluence id, not its key —
// v2 has no spaceKey query param equivalent to v1's.
async function* fetchContentPages(client: ConfluenceClient, spaceId: string): AsyncGenerator<ConfluenceContentApi[]> {
  let path: string | undefined =
    `/wiki/api/v2/pages?space-id=${encodeURIComponent(spaceId)}&status=current&body-format=storage&limit=50`;
  while (path) {
    const page: any = await confluenceFetch(client, path);
    yield (page.results ?? []) as ConfluenceContentApi[];
    path = page._links?.next ?? undefined;
  }
}

async function upsertSpace(tenantId: string, space: ConfluenceSpaceApi, isSelected: boolean) {
  return prisma.confluenceSpace.upsert({
    where: { tenantId_externalSystem_externalId: { tenantId, externalSystem: 'confluence', externalId: space.id } },
    create: {
      tenantId, externalSystem: 'confluence', externalId: space.id,
      key: space.key, name: space.name, spaceType: space.type ?? null,
      isSelected, isActive: true, lastSeenAtSourceAt: new Date(),
    },
    // isSelected is user-controlled (confluence.controller.ts's saveSelection)
    // — a routine sync pass must never clobber it back to whatever it was on
    // first discovery.
    update: {
      key: space.key, name: space.name, spaceType: space.type ?? null,
      isActive: true, lastSeenAtSourceAt: new Date(),
    },
  });
}

async function syncSpacePages(tenantId: string, spaceRowId: string, client: ConfluenceClient, spaceExternalId: string, siteUrl: string | undefined): Promise<void> {
  for await (const contentPage of fetchContentPages(client, spaceExternalId)) {
    for (const content of contentPage) {
      const version = content.version?.number ?? 0;

      const existing = await prisma.confluencePage.findUnique({
        where: { spaceId_externalSystem_externalId: { spaceId: spaceRowId, externalSystem: 'confluence', externalId: content.id } },
        select: { id: true, version: true },
      });
      // Cheap, authoritative change detection — Confluence's own version
      // number, no content diffing needed. Unchanged pages skip straight
      // past re-parsing/re-chunking/re-embedding.
      if (existing && existing.version === version) continue;

      const bodyText = confluenceStorageToText(content.body?.storage?.value);
      const webUrl = content._links?.webui && siteUrl ? `${siteUrl}${content._links.webui}` : null;

      const pageRow = await prisma.confluencePage.upsert({
        where: { spaceId_externalSystem_externalId: { spaceId: spaceRowId, externalSystem: 'confluence', externalId: content.id } },
        create: {
          tenantId, spaceId: spaceRowId, externalSystem: 'confluence', externalId: content.id,
          title: content.title.slice(0, 500), bodyText, version, webUrl,
          isActive: true, lastSeenAtSourceAt: new Date(),
        },
        update: {
          title: content.title.slice(0, 500), bodyText, version, webUrl,
          isActive: true, lastSeenAtSourceAt: new Date(),
        },
      });

      // Delete + reinsert chunks whenever the page changed — no incremental
      // re-chunking, matching the "cheap version check, no diffing" posture
      // above.
      await prisma.confluencePageChunk.deleteMany({ where: { pageId: pageRow.id } });
      const chunkTexts = chunkPageText(bodyText);
      if (chunkTexts.length === 0) continue;

      try {
        const vectors = await generateEmbeddings(chunkTexts);
        await prisma.confluencePageChunk.createMany({
          data: chunkTexts.map((text, i) => ({
            tenantId, pageId: pageRow.id, chunkIndex: i, text, embedding: vectors[i] ?? [],
          })),
        });
      } catch (err) {
        // Same resilience posture as jira-sync.service.ts's bug-embedding
        // pass: embeddings are an additive search/suggestion signal, not a
        // sync prerequisite — a page still syncs (title/body/link all work)
        // even if the local embedding model hiccups on it.
        console.error(`Confluence page embedding failed for ${content.id}, storing text-only chunks:`, err);
        await prisma.confluencePageChunk.createMany({
          data: chunkTexts.map((text, i) => ({ tenantId, pageId: pageRow.id, chunkIndex: i, text, embedding: [] })),
        });
      }
    }
  }
}

export async function syncAllConfluence(integration: Integration): Promise<void> {
  await integrationService.recordSyncStart(integration.id);

  try {
    const accessToken = await ensureValidToken(integration);
    const metadata = (integration.externalMetadata as Record<string, unknown>) ?? {};
    const cloudId = metadata.cloudId as string | undefined;
    const siteUrl = metadata.siteUrl as string | undefined;
    if (!cloudId) throw new Error('Confluence integration is missing cloudId in externalMetadata');
    const client: ConfluenceClient = { cloudId, accessToken };

    // Discover + upsert every accessible space (cheap — metadata only), so
    // the selection UI (confluence.controller.ts's listSpaces) always has an
    // up-to-date list to choose from, independent of what's actually synced.
    const selectedSpaceKeys = new Set(
      Array.isArray(metadata.selectedSpaceKeys) ? (metadata.selectedSpaceKeys as unknown[]).filter((k): k is string => typeof k === 'string') : []
    );

    const spaceRowsByKey = new Map<string, { id: string; externalId: string }>();
    for await (const spacePage of fetchSpacePages(client)) {
      for (const space of spacePage) {
        const row = await upsertSpace(integration.tenantId, space, selectedSpaceKeys.has(space.key));
        spaceRowsByKey.set(space.key, { id: row.id, externalId: space.id });
      }
    }

    // Only selected spaces get their pages synced — an org's whole Confluence
    // instance is usually far broader than what's relevant to this tenant
    // (mirrors jira-sync.service.ts's selectedProjectIds convention).
    const results = await Promise.allSettled(
      [...selectedSpaceKeys].map((spaceKey) => {
        const spaceRow = spaceRowsByKey.get(spaceKey);
        if (!spaceRow) return Promise.resolve(); // selected key no longer accessible — skip, don't fail the run
        return syncSpacePages(integration.tenantId, spaceRow.id, client, spaceRow.externalId, siteUrl);
      })
    );

    const errors = results
      .map((r, i) => (r.status === 'rejected' ? `${[...selectedSpaceKeys][i]}: ${r.reason}` : null))
      .filter((e): e is string => e !== null);

    if (errors.length > 0) {
      await integrationService.recordSyncError(integration.id, errors.join(' | '));
    } else {
      await integrationService.recordSyncSuccess(integration.id);
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'reauth_required') {
      // markReauthRequired was already called inside ensureValidToken; nothing further to do here.
      return;
    }
    await integrationService.recordSyncError(integration.id, err instanceof Error ? err.message : String(err));
  }
}
