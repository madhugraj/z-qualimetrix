import integrationService from './integration.service';
import jiraOAuthService from './jira-oauth.service';

const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;

type AtlassianProvider = 'jira' | 'confluence';

const SIBLING: Record<AtlassianProvider, AtlassianProvider> = {
  jira: 'confluence',
  confluence: 'jira',
};

/**
 * Confluence connects via Jira's OAuth grant (see jira-oauth.service.ts's
 * SCOPES comment) — the 'jira' and 'confluence' Integration rows for a
 * tenant start out holding the exact same access/refresh token pair from one
 * consent screen, but Atlassian rotates the refresh token on every use. If
 * jira-sync and confluence-sync each refreshed independently off their own
 * row's now-stale copy, whichever one refreshes second would 400
 * (invalid_grant) and get wrongly marked reauth_required even though the
 * underlying grant is perfectly fine. This is the single choke point both
 * sync services call instead of refreshing directly, so a refresh always
 * updates both rows together and neither can race the other onto a dead
 * refresh token.
 */
export async function ensureValidAtlassianToken(
  tenantId: string,
  provider: AtlassianProvider,
): Promise<string> {
  const tokens = await integrationService.getDecryptedTokens(tenantId, provider);
  if (!tokens) throw new Error(`${provider} integration has no stored tokens`);

  const expiresAt = tokens.expiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }

  // The sibling row may already hold a freshly-rotated pair from its own
  // sync running first — reuse that instead of spending this grant's
  // one-shot refresh token a second time, which would just fail.
  const siblingProvider = SIBLING[provider];
  const siblingTokens = await integrationService.getDecryptedTokens(tenantId, siblingProvider);
  const siblingExpiresAt = siblingTokens?.expiresAt?.getTime() ?? 0;
  if (siblingTokens && siblingExpiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    await integrationService.recordTokenRefresh(tenantId, provider, {
      accessToken: siblingTokens.accessToken,
      refreshToken: siblingTokens.refreshToken,
      expiresAt: siblingTokens.expiresAt,
    });
    return siblingTokens.accessToken;
  }

  const refreshToken = tokens.refreshToken ?? siblingTokens?.refreshToken ?? null;
  if (!refreshToken) {
    await integrationService.markReauthRequired(tenantId, provider, 'Access token expired and no refresh token is stored');
    throw new Error('reauth_required');
  }

  try {
    const refreshed = await jiraOAuthService.refreshAccessToken(refreshToken);
    await integrationService.recordTokenRefresh(tenantId, provider, refreshed);
    // Best-effort: propagate the rotated pair to the sibling row too, so its
    // next check sees a fresh token instead of racing a second, now-dead
    // refresh token. A tenant that never re-authorized to add Confluence
    // scopes simply has no 'confluence' row yet — nothing to propagate to.
    if (siblingTokens) {
      await integrationService.recordTokenRefresh(tenantId, siblingProvider, refreshed).catch(() => {});
    }
    return refreshed.accessToken;
  } catch (err) {
    await integrationService.markReauthRequired(
      tenantId, provider,
      `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`
    );
    throw new Error('reauth_required');
  }
}
