import { Request, Response } from 'express'
import githubService from '../services/github.service'
import githubTokenService from '../services/github-token.service'
import productRepositoryService from '../services/product-repository.service'
import { getCommitAttributionSummary } from '../services/commit-attribution.service'
import { paramString, queryString } from '../utils/http-params'

/**
 * GitHub Controller
 * Handles all GitHub-related API endpoints
 */

async function getTenantToken(tenantId: string): Promise<string | null> {
  return githubTokenService.getToken(tenantId)
}

/** tenantId is nullable on req.user (a user can be unassigned) — resolve it once per handler and 403 if missing. */
function requireTenantId(req: Request, res: Response): string | null {
  const tenantId = req.user?.tenantId
  if (!tenantId) {
    res.status(403).json({ error: 'Forbidden', message: 'Not assigned to an organization yet' })
    return null
  }
  return tenantId
}

/**
 * Repo-level read endpoints are scoped to whatever a tenant's stored
 * credential can reach otherwise — this restricts them to repos the org has
 * actually mapped to a product (see product-repository.service.ts's
 * isRepoMappedForTenant), so an authenticated member can't query arbitrary
 * GitHub repos with the org's token. getUserRepositories is deliberately
 * exempt — it's the discovery step used to build that mapping in the first
 * place, not a read against an already-scoped resource.
 */
async function assertRepoMapped(tenantId: string, res: Response, owner: string, repo: string): Promise<boolean> {
  const mapped = await productRepositoryService.isRepoMappedForTenant(tenantId, owner, repo)
  if (!mapped) {
    res.status(403).json({
      error: 'Forbidden',
      message: `${owner}/${repo} is not mapped to a product for this organization`,
    })
    return false
  }
  return true
}

export async function getProjectStatus(req: Request, res: Response): Promise<void> {
  try {
    const owner = paramString(req.params.owner)
    const repo = paramString(req.params.repo)

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    if (!(await assertRepoMapped(tenantId, res, owner, repo))) return

    console.log(`🔍 Fetching GitHub project status for ${owner}/${repo}`)

    const token = await getTenantToken(tenantId)
    const status = await githubService.getProjectStatus(token, owner, repo)

    res.json({
      success: true,
      data: status,
      metadata: {
        owner,
        repo,
        fetched_at: new Date().toISOString(),
        health_score: status.health_score
      }
    })
  } catch (error: any) {
    console.error('Error fetching project status:', error)
    res.status(500).json({
      error: 'Failed to fetch project status',
      message: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

export async function getRepository(req: Request, res: Response): Promise<void> {
  try {
    const owner = paramString(req.params.owner)
    const repo = paramString(req.params.repo)

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    if (!(await assertRepoMapped(tenantId, res, owner, repo))) return

    const token = await getTenantToken(tenantId)

    console.log(`🔍 Fetching GitHub repository info for ${owner}/${repo}`)
    const repository = await githubService.getRepository(token, owner, repo)

    res.json({
      success: true,
      data: repository
    })
  } catch (error: any) {
    console.error('Error fetching repository:', error)
    res.status(500).json({
      error: 'Failed to fetch repository',
      message: error.message || 'Unknown error'
    })
  }
}

export async function getRecentCommits(req: Request, res: Response): Promise<void> {
  try {
    const owner = paramString(req.params.owner)
    const repo = paramString(req.params.repo)
    const limit = parseInt(queryString(req.query.limit) ?? '') || 10

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    if (!(await assertRepoMapped(tenantId, res, owner, repo))) return

    console.log(`🔍 Fetching recent commits for ${owner}/${repo}`)

    const token = await getTenantToken(tenantId)
    const commits = await githubService.getRecentCommits(token, owner, repo, limit)

    res.json({
      success: true,
      data: commits,
      count: commits.length
    })
  } catch (error: any) {
    console.error('Error fetching commits:', error)
    res.status(500).json({
      error: 'Failed to fetch commits',
      message: error.message || 'Unknown error'
    })
  }
}

/**
 * Real, persisted AI-vs-human commit attribution (github-commit-sync.service.ts
 * + the Claude Code hook ingestion endpoint) — distinct from getRecentCommits,
 * which is a live, unpersisted GitHub API passthrough. Confidence tiers
 * ("exact" vs "heuristic") are never collapsed into a single number.
 */
export async function getCommitAttribution(req: Request, res: Response): Promise<void> {
  try {
    const owner = paramString(req.params.owner)
    const repo = paramString(req.params.repo)

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    const productRepository = await productRepositoryService.findMappedRepo(tenantId, `${owner}/${repo}`)
    if (!productRepository) {
      res.status(403).json({
        error: 'Forbidden',
        message: `${owner}/${repo} is not mapped to a product for this organization`,
      })
      return
    }

    const summary = await getCommitAttributionSummary(productRepository.id)

    res.json({ success: true, data: summary })
  } catch (error: any) {
    console.error('Error fetching commit attribution:', error)
    res.status(500).json({
      error: 'Failed to fetch commit attribution',
      message: error.message || 'Unknown error'
    })
  }
}

export async function getIssues(req: Request, res: Response): Promise<void> {
  try {
    const owner = paramString(req.params.owner)
    const repo = paramString(req.params.repo)
    const state = queryString(req.query.state) || 'all'
    const limit = parseInt(queryString(req.query.limit) ?? '') || 20

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    if (!(await assertRepoMapped(tenantId, res, owner, repo))) return

    const token = await getTenantToken(tenantId)

    console.log(`🔍 Fetching issues for ${owner}/${repo}`)
    const issues = await githubService.getIssues(token, owner, repo, state, limit)

    res.json({
      success: true,
      data: issues,
      count: issues.length,
      state
    })
  } catch (error: any) {
    console.error('Error fetching issues:', error)
    res.status(500).json({
      error: 'Failed to fetch issues',
      message: error.message || 'Unknown error'
    })
  }
}

export async function getPullRequests(req: Request, res: Response): Promise<void> {
  try {
    const owner = paramString(req.params.owner)
    const repo = paramString(req.params.repo)
    const state = queryString(req.query.state) || 'all'
    const limit = parseInt(queryString(req.query.limit) ?? '') || 20

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    if (!(await assertRepoMapped(tenantId, res, owner, repo))) return

    const token = await getTenantToken(tenantId)

    console.log(`🔍 Fetching pull requests for ${owner}/${repo}`)
    const pullRequests = await githubService.getPullRequests(token, owner, repo, state, limit)

    res.json({
      success: true,
      data: pullRequests,
      count: pullRequests.length,
      state
    })
  } catch (error: any) {
    console.error('Error fetching pull requests:', error)
    res.status(500).json({
      error: 'Failed to fetch pull requests',
      message: error.message || 'Unknown error'
    })
  }
}

export async function getBranches(req: Request, res: Response): Promise<void> {
  try {
    const owner = paramString(req.params.owner)
    const repo = paramString(req.params.repo)

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    if (!(await assertRepoMapped(tenantId, res, owner, repo))) return

    const token = await getTenantToken(tenantId)

    console.log(`🔍 Fetching branches for ${owner}/${repo}`)
    const branches = await githubService.getBranches(token, owner, repo)

    res.json({
      success: true,
      data: branches,
      count: branches.length
    })
  } catch (error: any) {
    console.error('Error fetching branches:', error)
    res.status(500).json({
      error: 'Failed to fetch branches',
      message: error.message || 'Unknown error'
    })
  }
}

export async function getWorkflows(req: Request, res: Response): Promise<void> {
  try {
    const owner = paramString(req.params.owner)
    const repo = paramString(req.params.repo)
    const limit = parseInt(queryString(req.query.limit) ?? '') || 10

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    if (!(await assertRepoMapped(tenantId, res, owner, repo))) return

    const token = await getTenantToken(tenantId)

    console.log(`🔍 Fetching workflows for ${owner}/${repo}`)
    const workflows = await githubService.getRecentWorkflows(token, owner, repo, limit)

    res.json({
      success: true,
      data: workflows,
      count: workflows.length
    })
  } catch (error: any) {
    console.error('Error fetching workflows:', error)
    res.status(500).json({
      error: 'Failed to fetch workflows',
      message: error.message || 'Unknown error'
    })
  }
}

export async function getTokenStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    const status = await githubTokenService.getStatus(tenantId)

    res.json({
      success: true,
      data: { hasToken: status.isConnected, tokenType: status.tokenType ?? null },
      message: status.isConnected
        ? 'GitHub token is configured'
        : 'GitHub token is not configured - some features may be limited'
    })
  } catch (error: any) {
    console.error('Error getting token status:', error)
    res.status(500).json({
      error: 'Failed to get token status',
      message: error.message || 'Unknown error'
    })
  }
}

export async function clearCache(req: Request, res: Response): Promise<void> {
  try {
    githubService.clearCache()

    res.json({
      success: true,
      message: 'GitHub API cache cleared successfully'
    })
  } catch (error: any) {
    console.error('Error clearing cache:', error)
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message || 'Unknown error'
    })
  }
}

/**
 * Pure validation, no side effects — never mutates any shared/stored
 * credential. Saving a validated token to this tenant's connection happens
 * through POST /github-token/tokens instead; this endpoint only answers
 * "is this token usable" before the caller decides whether to save it.
 */
export async function validateToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body

    if (!token) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Token is required'
      })
      return
    }

    console.log('🔍 Validating GitHub token...')
    const result = await githubTokenService.validateToken(token)

    if (result.isValid) {
      res.json({
        success: true,
        message: 'GitHub token validated successfully',
        data: { valid: true, tokenType: result.tokenType, username: result.username }
      })
    } else {
      res.status(401).json({
        error: 'Invalid token',
        message: result.error || 'GitHub token validation failed'
      })
    }
  } catch (error: any) {
    console.error('Error validating token:', error)
    res.status(500).json({
      error: 'Failed to validate token',
      message: error.message || 'Unknown error'
    })
  }
}

export async function getUserRepositories(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    const token = await getTenantToken(tenantId)
    const repositories = await githubService.getUserRepositories(token)

    res.json({
      success: true,
      data: repositories,
      count: repositories.length
    })
  } catch (error: any) {
    console.error('Error fetching user repositories:', error)
    res.status(500).json({
      error: 'Failed to fetch repositories',
      message: error.message || 'Unknown error'
    })
  }
}

export async function getMultiRepoStatus(req: Request, res: Response): Promise<void> {
  try {
    const { repos } = req.body // Array of "owner/repo" strings

    if (!repos || !Array.isArray(repos) || repos.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Repositories array is required'
      })
      return
    }

    const tenantId = requireTenantId(req, res)
    if (!tenantId) return

    const mappedChecks = await Promise.all(
      repos.map(async (repoString: string) => {
        const [owner, repo] = String(repoString).split('/')
        if (!owner || !repo) return { repoString, mapped: false }
        return { repoString, mapped: await productRepositoryService.isRepoMappedForTenant(tenantId, owner, repo) }
      })
    )
    const unmapped = mappedChecks.filter((c) => !c.mapped).map((c) => c.repoString)
    const mappedRepos = mappedChecks.filter((c) => c.mapped).map((c) => c.repoString)

    if (mappedRepos.length === 0) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'None of the requested repositories are mapped to a product for this organization',
      })
      return
    }

    console.log(`🔍 Fetching multi-repo status for ${mappedRepos.length} repositories`)

    const token = await getTenantToken(tenantId)

    const results = await Promise.allSettled(
      mappedRepos.map(async (repoString: string) => {
        const [owner, repo] = repoString.split('/')

        try {
          const status = await githubService.getProjectStatus(token, owner, repo)
          return {
            repo: repoString,
            success: true,
            data: status
          }
        } catch (error) {
          return {
            repo: repoString,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
    )

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).map(r => (r as any).value)
    const failed = results.filter(r => r.status === 'rejected' || !(r as any).value.success)

    // Calculate aggregated metrics
    const totalCommits = successful.reduce((sum, r) => sum + (r.data?.recent_commits?.length || 0), 0)
    const totalOpenIssues = successful.reduce((sum, r) => sum + (r.data?.issues_summary?.open || 0), 0)
    const totalOpenPRs = successful.reduce((sum, r) => sum + (r.data?.pull_requests_summary?.open || 0), 0)
    const avgHealthScore = successful.length > 0
      ? successful.reduce((sum, r) => sum + (r.data?.health_score || 0), 0) / successful.length
      : 0

    res.json({
      success: true,
      data: {
        repositories: successful.map(r => r.data),
        aggregated: {
          totalRepos: repos.length,
          successfulRepos: successful.length,
          failedRepos: failed.length,
          totalCommits,
          totalOpenIssues,
          totalOpenPRs,
          avgHealthScore: Math.round(avgHealthScore)
        },
        failures: failed.length > 0 ? failed.map((f: any) => ({
          repo: f.value?.repo || 'unknown',
          error: f.value?.error || f.reason || 'Unknown error'
        })) : undefined,
        unmapped: unmapped.length > 0 ? unmapped : undefined,
      },
      metadata: {
        fetched_at: new Date().toISOString(),
        tenant_id: tenantId
      }
    })
  } catch (error: any) {
    console.error('Error fetching multi-repo status:', error)
    res.status(500).json({
      error: 'Failed to fetch multi-repo status',
      message: error.message || 'Unknown error'
    })
  }
}
