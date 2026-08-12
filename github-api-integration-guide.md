# GitHub Integration API

This API provides comprehensive GitHub repository status and analytics for the QualiMetrix platform.

## Setup

1. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Configure GitHub Token**:
   - Create a `.env` file in the project root
   - Copy from `.env.example` and add your GitHub token:
     ```
     GITHUB_TOKEN=ghp_your_github_token_here
     ```
   - Generate token at: https://github.com/settings/tokens
   - Required scopes: `repo` (full control of private repositories), `read:org` (read org data)

3. **Start the API server**:
   ```bash
   npm run api:dev
   ```

## API Endpoints

### Base URL
```
http://localhost:3001/api/v1
```

### GitHub Endpoints

#### 1. Token Status Check
```
GET /github/token-status
```
Check if GitHub token is configured and get token type.

**Response:**
```json
{
  "success": true,
  "data": {
    "hasToken": true,
    "tokenType": "personal_access_token"
  },
  "message": "GitHub token is configured"
}
```

#### 2. Complete Project Status
```
GET /github/:owner/:repo/status
```
Get comprehensive project status including repository info, commits, issues, PRs, branches, workflows, and health score.

**Example:** `/github/facebook/react/status`

**Response:**
```json
{
  "success": true,
  "data": {
    "repository": { /* GitHub repository info */ },
    "recent_commits": [ /* Recent commits */ ],
    "issues_summary": {
      "total": 1000,
      "open": 50,
      "closed": 950,
      "recent_issues": [ /* Recent issues */ ]
    },
    "pull_requests_summary": {
      "total": 500,
      "open": 25,
      "merged": 450,
      "closed": 25,
      "recent_prs": [ /* Recent PRs */ ]
    },
    "branches": [ /* All branches */ ],
    "recent_workflows": [ /* Recent CI/CD runs */ ],
    "health_score": 85,
    "last_updated": "2026-08-10T12:00:00.000Z"
  },
  "metadata": {
    "owner": "facebook",
    "repo": "react",
    "fetched_at": "2026-08-10T12:00:00.000Z",
    "health_score": 85
  }
}
```

#### 3. Repository Information
```
GET /github/:owner/:repo/repository
```
Get detailed repository information.

**Example:** `/github/facebook/react/repository`

#### 4. Recent Commits
```
GET /github/:owner/:repo/commits?limit=10
```
Get recent commits with customizable limit.

**Example:** `/github/facebook/react/commits?limit=5`

#### 5. Issues
```
GET /github/:owner/:repo/issues?state=all&limit=20
```
Get issues with filtering by state (`open`, `closed`, `all`) and customizable limit.

**Example:** `/github/facebook/react/issues?state=open&limit=10`

#### 6. Pull Requests
```
GET /github/:owner/:repo/pull-requests?state=all&limit=20
```
Get pull requests with filtering by state (`open`, `closed`, `all`) and customizable limit.

**Example:** `/github/facebook/react/pull-requests?state=open&limit=10`

#### 7. Branches
```
GET /github/:owner/:repo/branches
```
Get all repository branches with protection status.

**Example:** `/github/facebook/react/branches`

#### 8. Workflows/CI-CD
```
GET /github/:owner/:repo/workflows?limit=10
```
Get recent GitHub Actions workflow runs.

**Example:** `/github/facebook/react/workflows?limit=5`

#### 9. Clear Cache
```
POST /github/clear-cache
```
Clear the internal GitHub API cache.

## Health Score Algorithm

The health score (0-100) is calculated based on:

- **Recent Activity**: Penalty for no commits in 7/30 days
- **Issues Ratio**: Reward for high closed/open issues ratio
- **Open PRs**: Penalty for too many open PRs (>10, >20)
- **Workflow Success Rate**: Reward for high CI/CD success rate
- **Repository Maturity**: Penalty for very new repositories (<30 days)

## Testing

Run the integration test script:
```bash
node test-github-integration.js
```

## Features

- **Comprehensive Status**: Single endpoint for complete project overview
- **Real-time Data**: Direct GitHub API integration
- **Health Scoring**: Automated project health assessment
- **Caching**: Built-in 5-minute cache to respect GitHub rate limits
- **Error Handling**: Graceful handling of rate limits and API errors
- **Flexible Querying**: Individual endpoints for specific data needs

## Rate Limits

- **Unauthenticated**: 60 requests/hour
- **Authenticated**: 5000 requests/hour
- Built-in caching helps stay within limits

## Error Handling

All endpoints return consistent error responses:
```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "details": "Additional error details (in development mode)"
}
```

## Next Steps

Potential enhancements:
- [ ] Add support for multiple repositories
- [ ] Implement historical data tracking
- [ ] Add webhook support for real-time updates
- [ ] Create dashboard UI for GitHub metrics
- [ ] Add contribution statistics
- [ ] Implement code quality metrics integration