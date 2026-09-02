/**
 * Exact, non-heuristic commit attribution — reported by the Claude Code git
 * hook (scripts/install-claude-code-hook.sh) immediately after a commit,
 * authenticated the same way as the OTel telemetry endpoints (a tenant's
 * existing Anthropic AiProviderConnection token — no new connection type).
 *
 * Model name is deliberately not accepted here: it isn't reliably available
 * to the hook at commit time. The rollup UI joins CommitAttribution.sessionId
 * against AiUsageEvent.sessionId/model for the same connection at read time
 * instead of duplicating it at write time.
 */

import type { AiProviderConnection } from '@prisma/client';
import prisma from '../../lib/prisma';
import productRepositoryService from './product-repository.service';

export interface CommitAttributionInput {
  sha: string;
  repo: string; // "owner/repo"
  sessionId: string;
  occurredAt?: string;
}

export class UnmappedRepoError extends Error {
  constructor(repo: string) {
    super(`Repository "${repo}" is not mapped to any product for this tenant`);
    this.name = 'UnmappedRepoError';
  }
}

export async function recordExactCommitAttribution(
  connection: AiProviderConnection,
  input: CommitAttributionInput,
): Promise<{ commitId: string; attributionId: string }> {
  const { sha, repo, sessionId, occurredAt } = input;
  if (!sha || !repo || !sessionId) {
    throw new Error('sha, repo, and sessionId are required');
  }

  const productRepository = await productRepositoryService.findMappedRepo(connection.tenantId, repo);
  if (!productRepository) throw new UnmappedRepoError(repo);

  // The background sync (github-commit-sync.service.ts) usually reaches this
  // commit first, but the hook can beat it — create a minimal stub row if so,
  // rather than dropping the attribution or blocking on a live GitHub call.
  const commit = await prisma.commit.upsert({
    where: { productRepositoryId_sha: { productRepositoryId: productRepository.id, sha } },
    create: {
      tenantId: connection.tenantId,
      productRepositoryId: productRepository.id,
      sha,
      message: '',
      authoredAt: occurredAt ? new Date(occurredAt) : new Date(),
      url: '',
    },
    update: {},
  });

  const attribution = await prisma.commitAttribution.upsert({
    where: { commitId_source: { commitId: commit.id, source: 'claude_code_hook' } },
    create: {
      tenantId: connection.tenantId,
      commitId: commit.id,
      confidence: 'exact',
      tool: 'claude_code',
      source: 'claude_code_hook',
      sessionId,
    },
    update: { sessionId },
  });

  return { commitId: commit.id, attributionId: attribution.id };
}

export interface CommitAttributionSummary {
  totalCommits: number;
  exact: number;
  heuristic: number;
  unattributed: number;
  byTool: Record<string, number>;
  churn: { additions: number; deletions: number; commitsWithStats: number; commitsMissingStats: number };
}

const SUMMARY_WINDOW_DAYS = 30;

/**
 * A commit can carry both an "exact" and a "heuristic" attribution row (the
 * Claude Code hook fires and Claude Code also self-tags its own commits) —
 * exact always wins for counting purposes so a commit is never double-counted
 * across tiers. A commit with neither is "unattributed", never guessed at.
 */
export async function getCommitAttributionSummary(productRepositoryId: string): Promise<CommitAttributionSummary> {
  const since = new Date(Date.now() - SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const commits = await prisma.commit.findMany({
    where: { productRepositoryId, authoredAt: { gte: since } },
    include: { attributions: true },
  });

  const summary: CommitAttributionSummary = {
    totalCommits: commits.length,
    exact: 0,
    heuristic: 0,
    unattributed: 0,
    byTool: {},
    churn: { additions: 0, deletions: 0, commitsWithStats: 0, commitsMissingStats: 0 },
  };

  for (const commit of commits) {
    const winner =
      commit.attributions.find((a) => a.confidence === 'exact') ??
      commit.attributions.find((a) => a.confidence === 'heuristic');

    if (winner?.confidence === 'exact') summary.exact += 1;
    else if (winner?.confidence === 'heuristic') summary.heuristic += 1;
    else summary.unattributed += 1;

    if (winner) summary.byTool[winner.tool] = (summary.byTool[winner.tool] ?? 0) + 1;

    if (commit.additions !== null && commit.deletions !== null) {
      summary.churn.additions += commit.additions;
      summary.churn.deletions += commit.deletions;
      summary.churn.commitsWithStats += 1;
    } else {
      summary.churn.commitsMissingStats += 1;
    }
  }

  return summary;
}
