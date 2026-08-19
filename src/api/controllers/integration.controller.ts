import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../../lib/prisma';
import integrationService, { IntegrationProvider, MIN_SYNC_FREQUENCY_MINUTES } from '../services/integration.service';
import { signOAuthState, verifyOAuthState } from '../../lib/jwt';
import jiraOAuthService from '../services/jira-oauth.service';
import azureDevOpsOAuthService from '../services/azure-devops-oauth.service';
import { syncAllProductsForIntegration as syncAllJira } from '../services/jira-sync.service';
import { syncAllProductsForIntegration as syncAllAdo } from '../services/azure-devops-sync.service';
import { requestSyncNow } from '../../lib/scheduler';

// Mutating endpoints (connect/disconnect/update-frequency/sync-now) are gated
// requireAdmin (PM-only) at the router level — see integration.routes.ts.
// handleCallback is the deliberate exception (see its docstring).

// Matches the CORS origin default in server.ts (FRONTEND_ORIGIN) — keep these in sync.
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:8086';

function getTenantId(req: Request): string {
  return req.user?.tenantId || '';
}

function getUserId(req: Request): string {
  return req.user?.id || '';
}

function isKnownProvider(provider: string): provider is IntegrationProvider {
  return provider === 'jira' || provider === 'azure_devops';
}

export async function startConnect(req: Request, res: Response) {
  const { provider } = req.params;
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }

  const tenantId = getTenantId(req);
  const userId = getUserId(req);
  if (!tenantId || !userId) {
    return res.status(400).json({ success: false, error: 'tenantId and userId are required' });
  }

  const state = signOAuthState({ tenantId, userId, provider, nonce: crypto.randomBytes(16).toString('hex') });

  if (provider === 'jira') {
    return res.json({ success: true, data: { authorizeUrl: jiraOAuthService.getAuthorizeUrl(state) } });
  }

  return res.json({ success: true, data: { authorizeUrl: azureDevOpsOAuthService.getAuthorizeUrl(state) } });
}

/**
 * Deliberate exception to the requireAdmin-everywhere pattern: this is reached
 * via a full browser redirect from Atlassian/Microsoft, so no custom headers
 * (x-tenant-id/x-user-id, or a future session bearer token) survive the trip.
 * It self-authenticates by verifying the signed `state` and trusts tenant/user
 * identity ONLY from its decoded payload — never from headers or query params
 * on this request. Do not add requireAdmin here; it cannot work on this route.
 */
export async function handleCallback(req: Request, res: Response) {
  const { provider } = req.params;
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`${FRONTEND_URL}/integrations?error=${encodeURIComponent(String(oauthError))}`);
  }
  if (!isKnownProvider(provider) || typeof code !== 'string' || typeof state !== 'string') {
    return res.redirect(`${FRONTEND_URL}/integrations?error=invalid_callback`);
  }

  let statePayload;
  try {
    statePayload = verifyOAuthState(state);
  } catch {
    return res.redirect(`${FRONTEND_URL}/integrations?error=invalid_state`);
  }
  if (statePayload.provider !== provider) {
    return res.redirect(`${FRONTEND_URL}/integrations?error=provider_mismatch`);
  }

  try {
    if (provider === 'jira') {
      const tokens = await jiraOAuthService.exchangeCodeForToken(code);
      const resources = await jiraOAuthService.getAccessibleResources(tokens.accessToken);
      const site = resources[0];
      if (!site) throw new Error('No accessible Jira sites returned for this account');

      await integrationService.upsertConnection({
        tenantId: statePayload.tenantId,
        provider: 'jira',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scopes: ['read:jira-work', 'read:jira-user', 'offline_access'],
        externalMetadata: { cloudId: site.cloudId, siteUrl: site.siteUrl, siteName: site.siteName },
        connectedAccountLabel: site.siteName,
        createdBy: statePayload.userId,
      });

      return res.redirect(`${FRONTEND_URL}/integrations?connected=jira`);
    }

    // provider === 'azure_devops'
    const tokens = await azureDevOpsOAuthService.exchangeCodeForToken(code);
    const orgs = await azureDevOpsOAuthService.listAccessibleOrganizations(tokens.accessToken);
    const org = orgs[0];
    if (!org) throw new Error('No accessible Azure DevOps organizations returned for this account');
    // Multiple accessible orgs: auto-pick the first; a "change organization" action can
    // re-query listAccessibleOrganizations with the already-stored token later if needed.

    await integrationService.upsertConnection({
      tenantId: statePayload.tenantId,
      provider: 'azure_devops',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: ['vso.work', 'vso.project'],
      externalMetadata: { organization: org.accountName, accountId: org.accountId },
      connectedAccountLabel: org.accountName,
      createdBy: statePayload.userId,
    });

    return res.redirect(`${FRONTEND_URL}/integrations?connected=azure_devops`);
  } catch (err) {
    console.error(`OAuth callback error (${provider}):`, err);
    return res.redirect(`${FRONTEND_URL}/integrations?error=connection_failed`);
  }
}

export async function getStatus(req: Request, res: Response) {
  const { provider } = req.params;
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  const tenantId = getTenantId(req);
  const status = await integrationService.getStatus(tenantId, provider);
  res.json({ success: true, data: status });
}

export async function listAll(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const integrations = await integrationService.listForTenant(tenantId);
  res.json({
    success: true,
    data: integrations.map((i) => ({
      provider: i.provider,
      status: i.status,
      connectedAccountLabel: i.connectedAccountLabel,
      syncFrequencyMinutes: i.syncFrequencyMinutes,
      lastSyncedAt: i.lastSyncedAt,
      lastSyncError: i.lastSyncError,
    })),
  });
}

export async function updateSyncFrequency(req: Request, res: Response) {
  const { provider } = req.params;
  const { minutes } = req.body;
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  if (typeof minutes !== 'number' || minutes < MIN_SYNC_FREQUENCY_MINUTES) {
    return res.status(400).json({ success: false, error: `minutes must be a number >= ${MIN_SYNC_FREQUENCY_MINUTES}` });
  }
  const tenantId = getTenantId(req);
  await integrationService.updateSyncFrequency(tenantId, provider, minutes);
  res.json({ success: true });
}

export async function disconnect(req: Request, res: Response) {
  const { provider } = req.params;
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  const tenantId = getTenantId(req);
  await integrationService.disconnect(tenantId, provider);
  res.json({ success: true });
}

export async function triggerSync(req: Request, res: Response) {
  const { provider } = req.params;
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  const tenantId = getTenantId(req);

  const integration = await prisma.integration.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (!integration || !integration.isActive) {
    return res.status(404).json({ success: false, error: 'Integration not connected' });
  }

  const syncFn = provider === 'jira' ? syncAllJira : syncAllAdo;
  const accepted = requestSyncNow(integration.id, () => syncFn(integration));
  if (!accepted) {
    return res.status(409).json({ success: false, error: 'A sync for this integration is already running' });
  }
  res.json({ success: true, message: 'Sync started' });
}

export async function listProjects(req: Request, res: Response) {
  const { provider } = req.params;
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  const tenantId = getTenantId(req);

  const integration = await prisma.integration.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (!integration || !integration.isActive) {
    return res.status(404).json({ success: false, error: 'Integration not connected' });
  }

  if (provider === 'jira') {
    const tokens = await integrationService.getDecryptedTokens(tenantId, 'jira');
    if (!tokens) return res.status(404).json({ success: false, error: 'Integration not connected' });
    const cloudId = (tokens.externalMetadata as any)?.cloudId;

    const response = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      return res.status(502).json({ success: false, error: 'Failed to fetch Jira projects' });
    }
    const data = await response.json();
    return res.json({
      success: true,
      data: (data.values ?? []).map((p: any) => ({ id: p.id, key: p.key, name: p.name })),
    });
  }

  // provider === 'azure_devops' — returns top-level team projects; a project's
  // deeper area-path tree can be drilled into later via the classification-nodes
  // API. Product mapping falls back to free text for sub-area selection for now.
  const tokens = await integrationService.getDecryptedTokens(tenantId, 'azure_devops');
  if (!tokens) return res.status(404).json({ success: false, error: 'Integration not connected' });
  const organization = (tokens.externalMetadata as any)?.organization;

  const response = await fetch(`https://dev.azure.com/${organization}/_apis/projects?api-version=7.0`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    return res.status(502).json({ success: false, error: 'Failed to fetch Azure DevOps projects' });
  }
  const data = await response.json();
  return res.json({
    success: true,
    data: (data.value ?? []).map((p: any) => ({ id: p.id, key: p.name, name: p.name })),
  });
}
