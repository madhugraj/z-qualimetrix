interface GitHubRepository {
  id: number
  name: string
  full_name: string
  description: string | null
  language: string | null
  stargazers_count: number
  watchers_count: number
  forks_count: number
  open_issues_count: number
  url: string
  created_at: string
  updated_at: string
  pushed_at: string
  size: number
  default_branch: string
  visibility: string
  license: any
  owner: {
    login: string
    id: number
    type: string
  }
}

interface GitHubCommit {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

interface GitHubIssue {
  id: number
  number: number
  title: string
  state: string
  created_at: string
  updated_at: string
  closed_at: string | null
  user: string
  labels: string[]
  url: string
}

interface GitHubPullRequest {
  id: number
  number: number
  title: string
  state: string
  created_at: string
  updated_at: string
  closed_at: string | null
  merged_at: string | null
  user: string
  url: string
  review_status: string
}

interface GitHubBranch {
  name: string
  commit: {
    sha: string
    url: string
  }
  protected: boolean
}

interface GitHubWorkflowRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  url: string
  run_number: number
  event: string
}

interface ProjectStatus {
  repository: GitHubRepository | null
  recent_commits: GitHubCommit[]
  issues_summary: {
    total: number
    open: number
    closed: number
    recent_issues: GitHubIssue[]
  }
  pull_requests_summary: {
    total: number
    open: number
    merged: number
    closed: number
    recent_prs: GitHubPullRequest[]
  }
  branches: GitHubBranch[]
  recent_workflows: GitHubWorkflowRun[]
  health_score: number
  last_updated: string
}

class GitHubService {
  private baseUrl = 'https://api.github.com'
  private requestCache = new Map<string, { data: any; expiry: number }>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  private async fetchFromGitHub(token: string | null, endpoint: string): Promise<any> {
    try {
      const cacheKey = `${token}-${endpoint}`
      const cached = this.requestCache.get(cacheKey)

      if (cached && cached.expiry > Date.now()) {
        return cached.data
      }

      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QualiMetrix-GitHub-Integration'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, { headers })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      this.requestCache.set(cacheKey, {
        data,
        expiry: Date.now() + this.CACHE_TTL
      })

      return data
    } catch (error) {
      console.error('GitHub API fetch error:', error)
      throw error
    }
  }

  async getRepository(token: string | null, owner: string, repo: string): Promise<GitHubRepository> {
    return this.fetchFromGitHub(token, `/repos/${owner}/${repo}`)
  }

  async getRecentCommits(token: string | null, owner: string, repo: string, limit: number = 10): Promise<GitHubCommit[]> {
    const commits = await this.fetchFromGitHub(token, `/repos/${owner}/${repo}/commits?per_page=${limit}`)

    return commits.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message.split('\n')[0], // First line only
      author: commit.commit.author.name || commit.author?.login || 'Unknown',
      date: commit.commit.author.date,
      url: commit.html_url,
    }))
  }

  /**
   * Full commit data for persistence (github-commit-sync.service.ts) —
   * unlike getRecentCommits (first-line message only, live display), this
   * keeps the full message (trailers included, needed for AI-attribution
   * detection) and author email.
   */
  async getCommitsForSync(
    token: string | null,
    owner: string,
    repo: string,
    opts: { since?: string; perPage?: number } = {},
  ): Promise<Array<{ sha: string; message: string; authorName: string | null; authorEmail: string | null; authoredAt: string; url: string }>> {
    const params = new URLSearchParams({ per_page: String(opts.perPage ?? 100) })
    if (opts.since) params.set('since', opts.since)
    const commits = await this.fetchFromGitHub(token, `/repos/${owner}/${repo}/commits?${params.toString()}`)

    return commits.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message,
      authorName: commit.commit.author?.name ?? commit.author?.login ?? null,
      authorEmail: commit.commit.author?.email ?? null,
      authoredAt: commit.commit.author?.date,
      url: commit.html_url,
    }))
  }

  /** Per-commit diff stats — a separate, heavier call than the list endpoint above, so callers should batch/rate-limit it. */
  async getCommitStats(token: string | null, owner: string, repo: string, sha: string): Promise<{ additions: number; deletions: number } | null> {
    try {
      const detail = await this.fetchFromGitHub(token, `/repos/${owner}/${repo}/commits/${sha}`)
      return { additions: detail.stats?.additions ?? 0, deletions: detail.stats?.deletions ?? 0 }
    } catch (error) {
      console.warn(`Could not fetch commit stats for ${sha}:`, error)
      return null
    }
  }

  async getIssues(token: string | null, owner: string, repo: string, state: string = 'all', limit: number = 20): Promise<GitHubIssue[]> {
    const issues = await this.fetchFromGitHub(token, `/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}&sort=created&direction=desc`)

    return issues.map((issue: any) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
      user: issue.user?.login || 'Unknown',
      labels: issue.labels?.map((l: any) => l.name) || [],
      url: issue.html_url,
    }))
  }

  async getPullRequests(token: string | null, owner: string, repo: string, state: string = 'all', limit: number = 20): Promise<GitHubPullRequest[]> {
    const prs = await this.fetchFromGitHub(token, `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}&sort=created&direction=desc`)

    return prs.map((pr: any) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at,
      merged_at: pr.merged_at,
      user: pr.user?.login || 'Unknown',
      url: pr.html_url,
      review_status: pr.review_status || 'none',
    }))
  }

  async getBranches(token: string | null, owner: string, repo: string): Promise<GitHubBranch[]> {
    const branches = await this.fetchFromGitHub(token, `/repos/${owner}/${repo}/branches?per_page=100`)

    return branches.map((branch: any) => ({
      name: branch.name,
      commit: {
        sha: branch.commit.sha,
        url: branch.commit.url,
      },
      protected: branch.protected || false,
    }))
  }

  async getRecentWorkflows(token: string | null, owner: string, repo: string, limit: number = 10): Promise<GitHubWorkflowRun[]> {
    try {
      const runs = await this.fetchFromGitHub(token, `/repos/${owner}/${repo}/actions/runs?per_page=${limit}`)

      return runs.workflow_runs.map((run: any) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        created_at: run.created_at,
        updated_at: run.updated_at,
        url: run.html_url,
        run_number: run.run_number,
        event: run.event,
      }))
    } catch (error) {
      console.warn('Could not fetch workflows:', error)
      return []
    }
  }

  async getProjectStatus(token: string | null, owner: string, repo: string): Promise<ProjectStatus> {
    try {
      const [repository, commits, issues, pullRequests, branches, workflows] = await Promise.all([
        this.getRepository(token, owner, repo),
        this.getRecentCommits(token, owner, repo),
        this.getIssues(token, owner, repo, 'all', 100),
        this.getPullRequests(token, owner, repo, 'all', 100),
        this.getBranches(token, owner, repo),
        this.getRecentWorkflows(token, owner, repo)
      ])

      const openIssues = issues.filter(i => i.state === 'open')
      const closedIssues = issues.filter(i => i.state === 'closed')

      const openPRs = pullRequests.filter(pr => pr.state === 'open')
      const mergedPRs = pullRequests.filter(pr => pr.merged_at)
      const closedPRs = pullRequests.filter(pr => pr.state === 'closed' && !pr.merged_at)

      const healthScore = this.calculateHealthScore({
        repository,
        commits: commits.length,
        issues: { open: openIssues.length, closed: closedIssues.length },
        pullRequests: { open: openPRs.length, merged: mergedPRs.length },
        workflows: workflows.filter(w => w.conclusion === 'success').length,
        totalWorkflows: workflows.length
      })

      return {
        repository,
        recent_commits: commits,
        issues_summary: {
          total: issues.length,
          open: openIssues.length,
          closed: closedIssues.length,
          recent_issues: issues.slice(0, 5)
        },
        pull_requests_summary: {
          total: pullRequests.length,
          open: openPRs.length,
          merged: mergedPRs.length,
          closed: closedPRs.length,
          recent_prs: pullRequests.slice(0, 5)
        },
        branches,
        recent_workflows: workflows,
        health_score: healthScore,
        last_updated: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error fetching project status:', error)
      throw error
    }
  }

  private calculateHealthScore(data: any): number {
    let score = 100

    // Recent activity penalty (if no commits in 7 days)
    const lastCommitDate = data.commits > 0 ? new Date() : null
    const daysSinceLastCommit = lastCommitDate ?
      Math.floor((Date.now() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24)) : 365
    if (daysSinceLastCommit > 7) score -= 10
    if (daysSinceLastCommit > 30) score -= 20

    // Issues ratio
    const issueRatio = data.issues.closed / (data.issues.open + data.issues.closed + 1)
    if (issueRatio < 0.5) score -= 15

    // Open PRs penalty
    if (data.pullRequests.open > 10) score -= 10
    if (data.pullRequests.open > 20) score -= 15

    // Workflow success rate
    const workflowSuccessRate = data.totalWorkflows > 0 ?
      data.workflows / data.totalWorkflows : 1
    if (workflowSuccessRate < 0.8) score -= 15
    if (workflowSuccessRate < 0.5) score -= 25

    // Repository maturity
    if (data.repository?.created_at) {
      const age = Math.floor((Date.now() - new Date(data.repository.created_at).getTime()) / (1000 * 60 * 60 * 24))
      if (age < 30) score -= 10 // New repository penalty
    }

    return Math.max(0, Math.min(100, score))
  }

  clearCache(): void {
    this.requestCache.clear()
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QualiMetrix-GitHub-Integration',
        'Authorization': `Bearer ${token}`
      }

      const response = await fetch(`${this.baseUrl}/user`, { headers })

      if (response.ok) {
        const userData = await response.json()
        console.log(`✅ Token validated for user: ${userData.login}`)
        return true
      }

      return false
    } catch (error) {
      console.error('Token validation failed:', error)
      return false
    }
  }

  getTokenType(token: string): string {
    if (token.startsWith('ghp_')) return 'personal_access_token'
    if (token.startsWith('gho_')) return 'oauth_token'
    if (token.startsWith('ghu_')) return 'user_token'
    return 'unknown'
  }

  async getUserRepositories(token: string | null): Promise<Array<{ name: string; full_name: string; description: string }>> {
    try {
      const repos = await this.fetchFromGitHub(token, '/user/repos?per_page=100&sort=updated')

      return repos.map((repo: any) => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description || ''
      }))
    } catch (error) {
      console.error('Failed to fetch user repositories:', error)
      return []
    }
  }
}

export const githubService = new GitHubService()
export default githubService