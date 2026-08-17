/**
 * Jira Cloud OAuth 2.0 (3LO) — authorize URL, code/refresh token exchange,
 * and accessible-resources (cloudId) lookup. Scopes below are Atlassian's
 * "classic" scopes; verify against current Atlassian OAuth docs at
 * implementation time in case granular scopes are required for a given app.
 */

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

const SCOPES = ['read:jira-work', 'read:jira-user', 'offline_access'].join(' ');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — register a Jira OAuth 2.0 (3LO) app at developer.atlassian.com/console/myapps and set it in .env`);
  }
  return value;
}

export interface JiraTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

export interface JiraAccessibleResource {
  cloudId: string;
  siteUrl: string;
  siteName: string;
}

class JiraOAuthService {
  getAuthorizeUrl(state: string): string {
    const clientId = requireEnv('JIRA_CLIENT_ID');
    const redirectUri = requireEnv('JIRA_REDIRECT_URI');

    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      prompt: 'consent',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<JiraTokenResult> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: requireEnv('JIRA_CLIENT_ID'),
        client_secret: requireEnv('JIRA_CLIENT_SECRET'),
        code,
        redirect_uri: requireEnv('JIRA_REDIRECT_URI'),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira token exchange failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<JiraTokenResult> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: requireEnv('JIRA_CLIENT_ID'),
        client_secret: requireEnv('JIRA_CLIENT_SECRET'),
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      // Atlassian returns 400 invalid_grant when the refresh token was revoked/expired —
      // caller (jira-sync.service.ts) maps this to Integration.status = 'reauth_required'.
      throw new Error(`Jira token refresh failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      // Atlassian rotates the refresh token on every use; fall back to the old one
      // only if the response omits a new one (shouldn't normally happen).
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async getAccessibleResources(accessToken: string): Promise<JiraAccessibleResource[]> {
    const response = await fetch(ACCESSIBLE_RESOURCES_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira accessible-resources lookup failed (${response.status}): ${body}`);
    }

    const data: Array<{ id: string; url: string; name: string }> = await response.json();
    return data.map((r) => ({ cloudId: r.id, siteUrl: r.url, siteName: r.name }));
  }
}

export const jiraOAuthService = new JiraOAuthService();
export default jiraOAuthService;
