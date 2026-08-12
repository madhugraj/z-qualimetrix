import { Request, Response } from 'express'
import githubService from '../services/github.service'

/**
 * GitHub Controller
 * Handles all GitHub-related API endpoints
 */

export async function getProjectStatus(req: Request, res: Response): Promise<void> {
  try {
    const { owner, repo } = req.params
    const tenantId = (req.query.tenantId as string) || 'default-tenant'

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    console.log(`🔍 Fetching GitHub project status for ${owner}/${repo} (tenant: ${tenantId})`)

    // Set token from database for this tenant
    await githubService.setTokenFromDatabase(tenantId)

    const status = await githubService.getProjectStatus(owner, repo)

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
    const { owner, repo } = req.params

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    console.log(`🔍 Fetching GitHub repository info for ${owner}/${repo}`)
    const repository = await githubService.getRepository(owner, repo)

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
    const { owner, repo } = req.params
    const limit = parseInt(req.query.limit as string) || 10
    const tenantId = (req.query.tenantId as string) || 'default-tenant'

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    console.log(`🔍 Fetching recent commits for ${owner}/${repo} (tenant: ${tenantId})`)

    // Set token from database for this tenant
    await githubService.setTokenFromDatabase(tenantId)

    const commits = await githubService.getRecentCommits(owner, repo, limit)

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

export async function getIssues(req: Request, res: Response): Promise<void> {
  try {
    const { owner, repo } = req.params
    const state = (req.query.state as string) || 'all'
    const limit = parseInt(req.query.limit as string) || 20

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    console.log(`🔍 Fetching issues for ${owner}/${repo}`)
    const issues = await githubService.getIssues(owner, repo, state, limit)

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
    const { owner, repo } = req.params
    const state = (req.query.state as string) || 'all'
    const limit = parseInt(req.query.limit as string) || 20

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    console.log(`🔍 Fetching pull requests for ${owner}/${repo}`)
    const pullRequests = await githubService.getPullRequests(owner, repo, state, limit)

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
    const { owner, repo } = req.params

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    console.log(`🔍 Fetching branches for ${owner}/${repo}`)
    const branches = await githubService.getBranches(owner, repo)

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
    const { owner, repo } = req.params
    const limit = parseInt(req.query.limit as string) || 10

    if (!owner || !repo) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Owner and repository parameters are required'
      })
      return
    }

    console.log(`🔍 Fetching workflows for ${owner}/${repo}`)
    const workflows = await githubService.getRecentWorkflows(owner, repo, limit)

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
    const tokenStatus = githubService.getTokenStatus()

    res.json({
      success: true,
      data: tokenStatus,
      message: tokenStatus.hasToken
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
    const isValid = await githubService.validateToken(token)

    if (isValid) {
      // Set the token in the service for future requests
      githubService.setToken(token)

      res.json({
        success: true,
        message: 'GitHub token validated successfully',
        data: {
          valid: true,
          tokenType: githubService.getTokenType(token)
        }
      })
    } else {
      res.status(401).json({
        error: 'Invalid token',
        message: 'GitHub token validation failed'
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
    const repositories = await githubService.getUserRepositories()

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
    const tenantId = (req.query.tenantId as string) || '11d0f8f8-fd2e-4e2c-8d01-8f9b0ae1e167'

    if (!repos || !Array.isArray(repos) || repos.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Repositories array is required'
      })
      return
    }

    console.log(`🔍 Fetching multi-repo status for ${repos.length} repositories`)

    // Set token from database for this tenant
    await githubService.setTokenFromDatabase(tenantId)

    const results = await Promise.allSettled(
      repos.map(async (repoString: string) => {
        const [owner, repo] = repoString.split('/')
        if (!owner || !repo) {
          throw new Error(`Invalid repo format: ${repoString}`)
        }

        try {
          const status = await githubService.getProjectStatus(owner, repo)
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
        })) : undefined
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