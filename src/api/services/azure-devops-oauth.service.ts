/**
 * Azure DevOps OAuth 2.0 — the dedicated Azure DevOps OAuth app flow
 * (app.vssps.visualstudio.com), NOT a general Entra ID/Azure AD app
 * registration. This is the standard third-party-integration path (how
 * Jira/Trello/Slack-style integrations connect to ADO) and works uniformly
 * across customer orgs regardless of their Entra ID setup. Cloud only —
 * Azure DevOps Server (on-prem) does not support this flow.
 */

const AUTHORIZE_URL = 'https://app.vssps.visualstudio.com/oauth2/authorize';
const TOKEN_URL = 'https://app.vssps.visualstudio.com/oauth2/token';
const PROFILE_URL = 'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0';
const ACCOUNTS_URL = 'https://app.vssps.visualstudio.com/_apis/accounts';

const SCOPES = ['vso.work', 'vso.project'].join(' ');
const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — register an Azure DevOps OAuth app at app.vssps.visualstudio.com/app/register and set it in .env`);
  }
  return value;
}

export interface AdoTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

export interface AdoOrganization {
  accountId: string;
  accountName: string;
}

class AzureDevOpsOAuthService {
  getAuthorizeUrl(state: string): string {
    const clientId = requireEnv('AZURE_DEVOPS_CLIENT_ID');
    const redirectUri = requireEnv('AZURE_DEVOPS_REDIRECT_URI');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'Assertion',
      scope: SCOPES,
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  private async requestToken(grantType: string, assertion: string, includeRedirect: boolean): Promise<AdoTokenResult> {
    const body = new URLSearchParams({
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: requireEnv('AZURE_DEVOPS_CLIENT_SECRET'),
      grant_type: grantType,
      assertion,
    });
    if (includeRedirect) body.set('redirect_uri', requireEnv('AZURE_DEVOPS_REDIRECT_URI'));

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      // ADO returns 400 with an error body for a revoked/expired refresh token —
      // caller (azure-devops-sync.service.ts) maps this to Integration.status = 'reauth_required'.
      throw new Error(`Azure DevOps token request failed (${response.status}): ${responseBody}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + Number(data.expires_in) * 1000),
    };
  }

  async exchangeCodeForToken(code: string): Promise<AdoTokenResult> {
    return this.requestToken('urn:ietf:params:oauth:grant-type:jwt-bearer', code, true);
  }

  async refreshAccessToken(refreshToken: string): Promise<AdoTokenResult> {
    return this.requestToken('refresh_token', refreshToken, true);
  }

  async listAccessibleOrganizations(accessToken: string): Promise<AdoOrganization[]> {
    const profileResponse = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!profileResponse.ok) {
      throw new Error(`Azure DevOps profile lookup failed (${profileResponse.status}): ${await profileResponse.text()}`);
    }
    const profile = await profileResponse.json();

    const accountsResponse = await fetch(`${ACCOUNTS_URL}?memberId=${profile.id}&api-version=6.0`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!accountsResponse.ok) {
      throw new Error(`Azure DevOps accounts lookup failed (${accountsResponse.status}): ${await accountsResponse.text()}`);
    }
    const accounts = await accountsResponse.json();
    return (accounts.value ?? []).map((a: any) => ({ accountId: a.accountId, accountName: a.accountName }));
  }
}

export const azureDevOpsOAuthService = new AzureDevOpsOAuthService();
export default azureDevOpsOAuthService;
