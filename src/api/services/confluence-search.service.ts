// Brute-force cosine-similarity search over ConfluencePageChunk rows — the
// same posture already proven for bug similarity (analytics.service.ts's
// getSimilarBugs): no pgvector, no hosted vector DB, consistent with this
// app's "fully local, no new paid infra" embeddings philosophy. Fine at the
// expected scale (hundreds to low thousands of pages per tenant, a few
// thousand chunk vectors).

import prisma from '../../lib/prisma';
import { generateEmbeddings, cosineSimilarity } from './local-embeddings.service';
import { adfToPlainText } from '../utils/adf-to-text';

// Same starting point as getSimilarBugs's threshold — semantic cosine
// similarity runs "hotter" than sparse token-overlap, so unrelated short
// texts routinely still land around 0.1-0.3. Not empirically tuned yet;
// revisit once real usage data exists to check it against.
const SUGGESTION_SIMILARITY_THRESHOLD = 0.5;

export interface ConfluenceSearchResult {
  id: string;
  externalId: string;
  title: string;
  webUrl: string | null;
  spaceName: string;
  snippet: string;
  score: number;
}

type PageWithChunks = {
  id: string;
  externalId: string;
  title: string;
  bodyText: string | null;
  webUrl: string | null;
  space: { name: string };
  chunks: { text: string; embedding: number[] }[];
};

function bestChunkMatch(page: PageWithChunks, queryVector: number[]): { score: number; text: string } {
  let best = { score: -1, text: '' };
  for (const chunk of page.chunks) {
    if (chunk.embedding.length === 0) continue;
    const score = cosineSimilarity(queryVector, chunk.embedding);
    if (score > best.score) best = { score, text: chunk.text };
  }
  return best;
}

function toResult(page: PageWithChunks, score: number, snippet: string): ConfluenceSearchResult {
  return {
    id: page.id,
    externalId: page.externalId,
    title: page.title,
    webUrl: page.webUrl,
    spaceName: page.space.name,
    snippet: snippet.slice(0, 240),
    score,
  };
}

/**
 * Free-text search across a tenant's synced Confluence pages. Prefers real
 * embedding cosine similarity when at least one page has embeddings; falls
 * back to a plain substring match on title/body otherwise (freshly synced
 * pages before the next embed pass, or the local embedding model failing
 * open on a given page) — same dual-mode posture as getSimilarBugs.
 */
export async function searchConfluencePages(
  tenantId: string,
  query: string,
  limit: number = 10
): Promise<{ results: ConfluenceSearchResult[]; hasData: boolean }> {
  const pages = await prisma.confluencePage.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true, externalId: true, title: true, bodyText: true, webUrl: true,
      space: { select: { name: true } },
      chunks: { select: { text: true, embedding: true } },
    },
  });
  if (pages.length === 0) return { results: [], hasData: false };

  const trimmedQuery = query.trim();
  const hasEmbeddings = pages.some((p) => p.chunks.some((c) => c.embedding.length > 0));

  if (hasEmbeddings && trimmedQuery) {
    const [queryVector] = await generateEmbeddings([trimmedQuery]);
    const ranked = pages
      .map((page) => ({ page, ...bestChunkMatch(page, queryVector) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return { results: ranked.map((r) => toResult(r.page, r.score, r.text)), hasData: true };
  }

  const q = trimmedQuery.toLowerCase();
  const matched = pages
    .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.bodyText ?? '').toLowerCase().includes(q))
    .slice(0, limit);

  return { results: matched.map((p) => toResult(p, 0, p.bodyText ?? '')), hasData: true };
}

/**
 * Suggests Confluence pages likely relevant to a work item (an Epic, in
 * practice) — same brute-force cosine ranking as searchConfluencePages, but
 * seeded from the work item's own content instead of a typed query. Already-
 * linked pages are excluded so this only ever surfaces new candidates.
 */
export async function suggestPagesForWorkItem(
  workItemId: string,
  limit: number = 5
): Promise<{ results: ConfluenceSearchResult[]; hasData: boolean }> {
  const workItem = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { tenantId: true, title: true, description: true, embedding: true, externalSystem: true },
  });
  if (!workItem) return { results: [], hasData: false };

  const alreadyLinked = await prisma.workItemDocumentLink.findMany({
    where: { workItemId },
    select: { pageId: true },
  });
  const excludeIds = alreadyLinked.map((l) => l.pageId);

  const pages = await prisma.confluencePage.findMany({
    where: { tenantId: workItem.tenantId, isActive: true, id: { notIn: excludeIds } },
    select: {
      id: true, externalId: true, title: true, bodyText: true, webUrl: true,
      space: { select: { name: true } },
      chunks: { select: { text: true, embedding: true } },
    },
  });
  if (pages.length === 0) return { results: [], hasData: false };

  let baselineVector = workItem.embedding;
  if (baselineVector.length === 0) {
    // WorkItem.embedding is only ever populated for bugs today (see
    // jira-sync.service.ts/azure-devops-sync.service.ts — embeddings there
    // exist purely to power bug-similarity), so an epic/story reaches this
    // branch every time, not just as a rare backfill case. description is
    // raw ADF JSON for Jira items, raw HTML for Azure DevOps ones — strip
    // either down to plain text first, same as getSimilarBugs does, or JSON/
    // HTML syntax noise would dominate the embedding.
    const plainDescription = workItem.description
      ? workItem.externalSystem === 'jira'
        ? adfToPlainText(workItem.description)
        : workItem.description.replace(/<[^>]*>/g, ' ')
      : '';
    const text = `${workItem.title} ${plainDescription}`.trim();
    if (!text) return { results: [], hasData: false };
    [baselineVector] = await generateEmbeddings([text]);
  }

  const ranked = pages
    .map((page) => ({ page, ...bestChunkMatch(page, baselineVector) }))
    .filter((r) => r.score > SUGGESTION_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { results: ranked.map((r) => toResult(r.page, r.score, r.text)), hasData: true };
}
