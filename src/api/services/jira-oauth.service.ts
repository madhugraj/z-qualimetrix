/**
 * Jira Cloud OAuth 2.0 (3LO) — authorize URL, code/refresh token exchange,
 * and accessible-resources (cloudId) lookup.
 *
 * Scopes mix Jira platform "classic" scopes (read:jira-work, read:jira-user)
 * with Jira Software "granular" scopes (read:board-scope:jira-software,
 * read:sprint:jira-software) — the Agile REST API (boards/sprints) that
 * jira-sync.service.ts calls does not accept classic scopes at all, per
 * Atlassian's current docs. Before this takes effect, "Jira Software API"
 * must be added as a permission for this app at
 * developer.atlassian.com/console/myapps, and every tenant with an existing
 * Jira connection must re-authorize — old tokens won't carry the new scopes.
 *
 * read:project:jira is required *in addition to* read:board-scope:jira-software
 * for GET /rest/agile/1.0/board specifically (confirmed against Atlassian's
 * own API reference — board-scope alone 401s with "scope does not match"
 * even though token introspection shows board-scope/sprint present).
 *
 * The two read:*:confluence scopes below piggyback Confluence Cloud access
 * onto this SAME app/consent screen (deliberate — see
 * confluence-sync.service.ts's file comment for why) rather than a second,
 * independently-registered Atlassian app. This requires "Confluence API" to
 * also be added as a permission for this app at
 * developer.atlassian.com/console/myapps, and every tenant with an existing
 * Jira connection must re-authorize once more to pick these up — same
 * one-time cost as the board/sprint scopes above.
 *
 * These are GRANULAR scopes (read:space:confluence, read:page:confluence),
 * not the classic read:confluence-space.summary/read:confluence-content.all
 * this file originally shipped with — confirmed live against a real site
 * that Confluence's classic-scoped v1 REST API (/wiki/rest/api/space,
 * /wiki/rest/api/content) returns 410 Gone (retired by Atlassian), and its
 * replacement v2 API (/wiki/api/v2/...) 401s ("scope does not match") on
 * the classic scopes — it only accepts the granular ones. Must be selected
 * under the Developer Console's "Granular scopes" tab, not "Classic scopes".
 */

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

const SCOPES = [
  'read:jira-work',
  'read:jira-user',
  'read:project:jira',
  'read:board-scope:jira-software',
  'read:sprint:jira-software',
  'read:space:confluence',
  'read:page:confluence',
  'offline_access',
].join(' ');

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
  /** Atlassian can silently grant a subset of the requested `SCOPES` (e.g. if
   * the Developer Console app lacks the Jira Software API permission) — this
   * is the space-separated `scope` the token response actually returned, not
   * an assumption of what was requested. Empty if Atlassian omits the field. */
  scope: string[];
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
      scope: typeof data.scope === 'string' ? data.scope.split(' ').filter(Boolean) : [],
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
      scope: typeof data.scope === 'string' ? data.scope.split(' ').filter(Boolean) : [],
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
