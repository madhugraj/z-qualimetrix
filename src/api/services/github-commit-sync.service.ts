/**
 * Persists real commit data (previously fetched live and discarded, see
 * github.service.ts) and detects self-tagged AI authorship from commit
 * trailers. This is the "heuristic" confidence tier only — a commit matching
 * one of these patterns gets a CommitAttribution row with confidence:
 * "heuristic", source: "trailer_detected". Exact, non-heuristic attribution
 * for Claude Code specifically comes from a separate path: the git-hook
 * ingestion endpoint in ai-usage.controller.ts (source: "claude_code_hook").
 *
 * A commit matching no pattern here gets no CommitAttribution row at all —
 * shown in the UI as "unattributed", never guessed at.
 */

import prisma from '../../lib/prisma';
import githubTokenService from './github-token.service';
import githubService from './github.service';
import type { GitHubIntegration } from '@prisma/client';

// Rate-limit-conscious: per-commit stat calls are a separate, heavier GitHub
// API call than the list-commits pass above, so only a bounded batch is
// backfilled per sync tick rather than the whole outstanding backlog at once.
const MAX_STATS_FETCHES_PER_RUN = 20;

const TRAILER_PATTERNS: Array<{ tool: string; pattern: RegExp }> = [
  { tool: 'claude_code', pattern: /Co-Authored-By:\s*Claude[^<\n]*<[^>]*@anthropic\.com>/i },
  { tool: 'claude_code', pattern: /Generated (?:with|by) \[?Claude Code\]?/i },
  { tool: 'github_copilot', pattern: /Co-Authored-By:\s*[^<\n]*copilot[^<\n]*<[^>]*>/i },
];
const BOT_SUFFIX_PATTERN = /\[bot\]$/i;

function detectTrailer(
  message: string,
  authorName: string | null,
  authorEmail: string | null,
): { tool: string; trailer: string } | null {
  for (const { tool, pattern } of TRAILER_PATTERNS) {
    const match = message.match(pattern);
    if (match) return { tool, trailer: match[0].trim() };
  }
  const botIdentity = [authorName, authorEmail].find((v) => v && BOT_SUFFIX_PATTERN.test(v));
  if (botIdentity) return { tool: botIdentity.replace(/@.*/, '').trim(), trailer: botIdentity };
  return null;
}

async function recordTrailerAttribution(
  tenantId: string,
  commitId: string,
  message: string,
  authorName: string | null,
  authorEmail: string | null,
): Promise<void> {
  const detected = detectTrailer(message, authorName, authorEmail);
  if (!detected) return;

  await prisma.commitAttribution.upsert({
    where: { commitId_source: { commitId, source: 'trailer_detected' } },
    create: {
      tenantId,
      commitId,
      confidence: 'heuristic',
      source: 'trailer_detected',
      tool: detected.tool,
      detectedTrailer: detected.trailer,
    },
    update: { tool: detected.tool, detectedTrailer: detected.trailer },
  });
}

async function syncRepo(
  tenantId: string,
  token: string,
  productRepositoryId: string,
  githubRepo: string,
): Promise<void> {
  const [owner, repo] = githubRepo.split('/');
  if (!owner || !repo) return;

  const latest = await prisma.commit.findFirst({
    where: { productRepositoryId },
    orderBy: { authoredAt: 'desc' },
    select: { authoredAt: true },
  });

  const fetched = await githubService.getCommitsForSync(token, owner, repo, {
    since: latest?.authoredAt.toISOString(),
    perPage: 100,
  });

  for (const c of fetched) {
    if (!c.authoredAt) continue;
    const commit = await prisma.commit.upsert({
      where: { productRepositoryId_sha: { productRepositoryId, sha: c.sha } },
      create: {
        tenantId,
        productRepositoryId,
        sha: c.sha,
        message: c.message,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        authoredAt: new Date(c.authoredAt),
        url: c.url,
      },
      update: {
        message: c.message,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
      },
    });

    await recordTrailerAttribution(tenantId, commit.id, c.message, c.authorName, c.authorEmail);
  }

  const needsStats = await prisma.commit.findMany({
    where: { productRepositoryId, statsSyncedAt: null },
    orderBy: { authoredAt: 'desc' },
    take: MAX_STATS_FETCHES_PER_RUN,
  });
  for (const commit of needsStats) {
    const stats = await githubService.getCommitStats(token, owner, repo, commit.sha);
    if (!stats) continue;
    await prisma.commit.update({
      where: { id: commit.id },
      data: { additions: stats.additions, deletions: stats.deletions, statsSyncedAt: new Date() },
    });
  }
}

export async function syncGithubCommits(integration: GitHubIntegration): Promise<void> {
  const token = await githubTokenService.getToken(integration.tenantId);
  if (!token) return; // disconnected mid-flight between scheduling and running

  const repos = await prisma.productRepository.findMany({
    where: { isActive: true, product: { tenantId: integration.tenantId, isActive: true } },
  });

  for (const productRepository of repos) {
    try {
      await syncRepo(integration.tenantId, token, productRepository.id, productRepository.githubRepo);
    } catch (error) {
      console.error(
        `[github-commit-sync] Failed for repo ${productRepository.githubRepo} (tenant ${integration.tenantId}):`,
        error,
      );
    }
  }

  await prisma.gitHubIntegration.update({
    where: { id: integration.id },
    data: { lastSyncedAt: new Date() },
  });
}

/** Due-check candidates for the scheduler tick — actual due-time filtering happens in scheduler.ts, matching the existing AiProviderConnection pattern. */
export async function listGithubIntegrationsForSync(): Promise<GitHubIntegration[]> {
  return prisma.gitHubIntegration.findMany({ where: { isActive: true } });
}

export default syncGithubCommits;
