/**
 * GitHub Data Service for Dashboard Integration
 * Centralized GitHub API calls to feed real data into existing dashboard components
 */

import { API_V1_URL } from "@/lib/api-config";

const API_BASE = API_V1_URL;

export interface GitHubRepository {
  name: string;
  full_name: string;
  description?: string;
  updated_at: string;
  language?: string;
  stargazers_count?: number;
  open_issues_count?: number;
}

export interface GitHubMetrics {
  commits: number;
  pullRequests: number;
  issues: number;
  contributors: number;
  healthScore: number;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  files?: string[];
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  user: string;
  url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  labels: string[];
  user: string;
  url: string;
}

export interface SprintMetrics {
  sprint: string;
  commits: number;
  pullRequests: number;
  issues: number;
  storyPoints?: number;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  url: string;
}

/**
 * Real CI run history from GitHub Actions for the given repo — this is the
 * closest thing to "automated testing activity" this app can surface
 * without a dedicated test-management tool (Xray/Zephyr) connected: no
 * concept of "% of test cases automated" exists here, but real workflow
 * runs and their pass/fail outcome do. No tenantId param — the backend
 * derives the caller's tenant from their session, not a client-supplied ID.
 */
export async function getWorkflowRuns(owner: string, repo: string, limit: number = 30): Promise<GitHubWorkflowRun[]> {
  try {
    const response = await fetch(`${API_BASE}/github/${owner}/${repo}/workflows?limit=${limit}`, { credentials: 'include' });
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch GitHub workflow runs:', error);
    return [];
  }
}

/**
 * Fetch GitHub repositories for the current user
 */
export async function getGitHubRepositories(): Promise<GitHubRepository[]> {
  try {
    const response = await fetch(`${API_BASE}/github/user-repositories`, { credentials: 'include' });
    const data = await response.json();

    if (data.success) {
      return data.data;
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch GitHub repositories:', error);
    return [];
  }
}

/**
 * Get GitHub metrics for a specific repository
 */
export async function getGitHubMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
  try {
    // Fetch data from GitHub endpoints
    const [commitsResponse, prsResponse, issuesResponse, statusResponse] = await Promise.all([
      fetch(`${API_BASE}/github/${owner}/${repo}/commits?limit=100`, { credentials: 'include' }),
      fetch(`${API_BASE}/github/${owner}/${repo}/pull-requests?state=all&limit=100`, { credentials: 'include' }),
      fetch(`${API_BASE}/github/${owner}/${repo}/issues?state=all&limit=100`, { credentials: 'include' }),
      fetch(`${API_BASE}/github/${owner}/${repo}/status`, { credentials: 'include' })
    ]);

    const [commitsData, prsData, issuesData, statusData] = await Promise.all([
      commitsResponse.json(),
      prsResponse.json(),
      issuesResponse.json(),
      statusResponse.json()
    ]);

    const commits = commitsData.success ? commitsData.data.length : 0;
    const pullRequests = prsData.success ? prsData.data.length : 0;
    const issues = issuesData.success ? issuesData.data.filter((i: any) => i.state === 'open').length : 0;

    // Calculate unique contributors from commits
    const contributors = new Set();
    if (commitsData.success) {
      commitsData.data.forEach((commit: any) => {
        if (commit.author) contributors.add(commit.author);
      });
    }

    // Get health score from status endpoint
    const healthScore = statusData.success ? statusData.data.health_score || 75 : 75;

    return {
      commits,
      pullRequests,
      issues,
      contributors: contributors.size,
      healthScore
    };
  } catch (error) {
    console.error('Failed to fetch GitHub metrics:', error);

    // Return default metrics on error
    return {
      commits: 0,
      pullRequests: 0,
      issues: 0,
      contributors: 0,
      healthScore: 75
    };
  }
}

export interface CommitAttributionSummary {
  totalCommits: number;
  exact: number;
  heuristic: number;
  unattributed: number;
  byTool: Record<string, number>;
  churn: { additions: number; deletions: number; commitsWithStats: number; commitsMissingStats: number };
}

/**
 * Real, persisted AI-vs-human commit attribution for the last 30 days
 * (github-commit-sync.service.ts + the Claude Code hook). Distinct from
 * getCommitData below, which is a live GitHub API passthrough with no
 * attribution or persisted diff stats.
 */
export async function getCommitAttribution(owner: string, repo: string): Promise<CommitAttributionSummary | null> {
  try {
    const response = await fetch(`${API_BASE}/github/${owner}/${repo}/commit-attribution`, { credentials: 'include' });
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Failed to fetch commit attribution:', error);
    return null;
  }
}

/**
 * Get commit data with sprint alignment
 */
export async function getCommitData(owner: string, repo: string, since: string): Promise<GitHubCommit[]> {
  try {
    const response = await fetch(`${API_BASE}/github/${owner}/${repo}/commits?limit=100`, { credentials: 'include' });
    const data = await response.json();

    if (data.success) {
      return data.data.map((commit: any) => ({
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        date: commit.date,
        url: commit.url,
        files: commit.files || []
      }));
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch commit data:', error);
    return [];
  }
}

/**
 * Get pull request data for MTTR calculations
 */
export async function getPullRequestData(owner: string, repo: string): Promise<GitHubPullRequest[]> {
  try {
    const response = await fetch(`${API_BASE}/github/${owner}/${repo}/pull-requests?state=all&limit=100`, { credentials: 'include' });
    const data = await response.json();

    if (data.success) {
      return data.data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        user: pr.user,
        url: pr.html_url || pr.url
      }));
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch pull request data:', error);
    return [];
  }
}

/**
 * Get issue data for defect tracking
 */
export async function getIssueData(owner: string, repo: string): Promise<GitHubIssue[]> {
  try {
    const response = await fetch(`${API_BASE}/github/${owner}/${repo}/issues?state=all&limit=100`, { credentials: 'include' });
    const data = await response.json();

    if (data.success) {
      return data.data.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        labels: issue.labels?.map((l: any) => typeof l === 'string' ? l : l.name) || [],
        user: issue.user?.login || issue.user || 'unknown',
        url: issue.html_url || issue.url
      }));
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch issue data:', error);
    return [];
  }
}

/**
 * Calculate MTTR from GitHub issues
 */
export function calculateMTTR(issues: GitHubIssue[]): number {
  const closedIssues = issues.filter(issue =>
    issue.state === 'closed' && issue.closed_at && issue.created_at
  );

  if (closedIssues.length === 0) return 0;

  const mttrValues = closedIssues.map(issue => {
    const created = new Date(issue.created_at!).getTime();
    const closed = new Date(issue.closed_at!).getTime();
    return Math.round((closed - created) / (1000 * 60 * 60)); // Hours
  });

  const avgMTTR = mttrValues.reduce((sum, val) => sum + val, 0) / mttrValues.length;
  return Math.round(avgMTTR);
}

/**
 * Calculate sprint-based metrics from commits
 */
export function calculateSprintMetrics(commits: GitHubCommit[], sprintStart: string, sprintEnd: string): SprintMetrics {
  const sprintCommits = commits.filter(commit => {
    const commitDate = new Date(commit.date);
    const startDate = new Date(sprintStart);
    const endDate = new Date(sprintEnd);
    return commitDate >= startDate && commitDate <= endDate;
  });

  return {
    sprint: `${new Date(sprintStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    commits: sprintCommits.length,
    pullRequests: 0, // Would need PR data correlation
    issues: 0, // Would need issue data correlation
    storyPoints: undefined // Would need GitHub metadata or Jira integration
  };
}

/**
 * Get defect leakage rate (production bugs vs total bugs)
 */
export function calculateDefectLeakage(issues: GitHubIssue[]): number {
  const productionIssues = issues.filter(issue =>
    issue.labels.some(label =>
      label.toLowerCase().includes('production') ||
      label.toLowerCase().includes('prod') ||
      label.toLowerCase().includes('customer')
    )
  );

  const totalIssues = issues.filter(issue =>
    issue.labels.some(label =>
      label.toLowerCase().includes('bug') ||
      label.toLowerCase().includes('defect') ||
      label.toLowerCase().includes('issue')
    )
  );

  if (totalIssues.length === 0) return 0;

  return Math.round((productionIssues.length / totalIssues.length) * 100);
}

/**
 * Calculate bug reopen rate from issue status changes
 */
export function calculateReopenRate(issues: GitHubIssue[]): number {
  // This would require issue event history, for now return 0
  // GitHub API would need to provide issue timeline/events
  return 0;
}
