import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../../lib/prisma';
import integrationService, { IntegrationProvider, MIN_SYNC_FREQUENCY_MINUTES } from '../services/integration.service';
import { signOAuthState, verifyOAuthState } from '../../lib/jwt';
import jiraOAuthService from '../services/jira-oauth.service';
import azureDevOpsOAuthService from '../services/azure-devops-oauth.service';
import { requestSyncNow, getSyncHandler } from '../../lib/scheduler';
import { maskToken } from '../../lib/encryption';
import { paramString } from '../utils/http-params';

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
  return provider === 'jira' || provider === 'azure_devops' || provider === 'openai';
}

function isOAuthProvider(provider: IntegrationProvider): provider is 'jira' | 'azure_devops' {
  return provider === 'jira' || provider === 'azure_devops';
}

export async function startConnect(req: Request, res: Response) {
  const provider = paramString(req.params.provider);
  if (!isKnownProvider(provider) || !isOAuthProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown or non-OAuth provider: ${provider}` });
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
  const provider = paramString(req.params.provider);
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`${FRONTEND_URL}/integrations?error=${encodeURIComponent(String(oauthError))}`);
  }
  if (!isKnownProvider(provider) || !isOAuthProvider(provider) || typeof code !== 'string' || typeof state !== 'string') {
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
  const provider = paramString(req.params.provider);
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
  const provider = paramString(req.params.provider);
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
  const provider = paramString(req.params.provider);
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  const tenantId = getTenantId(req);
  await integrationService.disconnect(tenantId, provider);
  res.json({ success: true });
}

export async function triggerSync(req: Request, res: Response) {
  const provider = paramString(req.params.provider);
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  const tenantId = getTenantId(req);

  const integration = await prisma.integration.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (!integration || !integration.isActive) {
    return res.status(404).json({ success: false, error: 'Integration not connected' });
  }

  const syncFn = getSyncHandler(provider);
  if (!syncFn) {
    return res.status(501).json({ success: false, error: `No sync handler registered for provider "${provider}"` });
  }
  const accepted = requestSyncNow(integration.id, () => syncFn(integration));
  if (!accepted) {
    return res.status(409).json({ success: false, error: 'A sync for this integration is already running' });
  }
  res.json({ success: true, message: 'Sync started' });
}

export async function listProjects(req: Request, res: Response) {
  const provider = paramString(req.params.provider);
  if (!isKnownProvider(provider) || !isOAuthProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown or non-project-based provider: ${provider}` });
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

export async function listJiraUsers(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const tokens = await integrationService.getDecryptedTokens(tenantId, 'jira');
  if (!tokens) return res.status(404).json({ success: false, error: 'Jira integration not connected' });

  const cloudId = (tokens.externalMetadata as any)?.cloudId;
  if (!cloudId) return res.status(409).json({ success: false, error: 'Jira site is not configured' });

  const users: Array<{ accountId: string; displayName: string; emailAddress: string | null; avatarUrl: string | null }> = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/users/search?startAt=${startAt}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' } },
    );
    if (!response.ok) {
      return res.status(502).json({ success: false, error: 'Failed to fetch Jira users' });
    }
    const page = await response.json() as any[];
    users.push(...page
      .filter((u: any) => u.accountType === 'atlassian' && u.active !== false)
      .map((u: any) => ({
        accountId: u.accountId,
        displayName: u.displayName || 'Unknown user',
        emailAddress: u.emailAddress || null,
        avatarUrl: u.avatarUrls?.['48x48'] || null,
      })));
    if (page.length < maxResults) break;
    startAt += page.length;
  }

  return res.json({ success: true, data: users });
}

export async function saveJiraSelection(req: Request, res: Response) {
  const tenantId = getTenantId(req);
  const { projectIds, userAccountIds } = req.body ?? {};
  if (!Array.isArray(projectIds) || !projectIds.every((id) => typeof id === 'string')) {
    return res.status(400).json({ success: false, error: 'projectIds must be an array of strings' });
  }
  if (!Array.isArray(userAccountIds) || !userAccountIds.every((id) => typeof id === 'string')) {
    return res.status(400).json({ success: false, error: 'userAccountIds must be an array of strings' });
  }

  const integration = await prisma.integration.findUnique({
    where: { tenantId_provider: { tenantId, provider: 'jira' } },
  });
  if (!integration || !integration.isActive) {
    return res.status(404).json({ success: false, error: 'Jira integration not connected' });
  }

  const tokens = await integrationService.getDecryptedTokens(tenantId, 'jira');
  const cloudId = (tokens?.externalMetadata as any)?.cloudId;
  if (!tokens || !cloudId) {
    return res.status(409).json({ success: false, error: 'Jira site is not configured' });
  }
  const projectsResponse = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search?maxResults=1000`,
    { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' } },
  );
  if (!projectsResponse.ok) {
    return res.status(502).json({ success: false, error: 'Failed to validate Jira projects' });
  }
  const availableProjects = ((await projectsResponse.json()).values ?? []) as Array<{ id: string; key: string; name: string }>;
  const selectedProjects = availableProjects.filter((project) => projectIds.includes(String(project.id)));
  if (selectedProjects.length !== new Set(projectIds).size) {
    return res.status(400).json({ success: false, error: 'One or more selected Jira projects are not accessible' });
  }

  // A selected Jira project becomes a QualiMetrix product automatically, so
  // the next scheduled sync has a concrete destination for its work items.
  await prisma.$transaction(selectedProjects.map((project) => prisma.product.upsert({
    where: { tenantId_key: { tenantId, key: project.key } },
    create: {
      tenantId,
      name: project.name,
      key: project.key,
      jiraProjectKey: project.key,
      jiraProjectId: String(project.id),
    },
    update: {
      jiraProjectKey: project.key,
      jiraProjectId: String(project.id),
      isActive: true,
    },
  })));

  await integrationService.updateExternalMetadata(tenantId, 'jira', {
    selectedProjectIds: [...new Set(projectIds)],
    selectedUserAccountIds: [...new Set(userAccountIds)],
    selectionUpdatedAt: new Date().toISOString(),
  });
  return res.json({ success: true });
}

/**
 * OpenAI/Vertex use a pasted API credential, not an OAuth redirect — no
 * startConnect/handleCallback equivalent needed. requireAdmin-gated at the
 * route level, same as every other credential-mutating endpoint here.
 */
export async function connectOpenAi(req: Request, res: Response) {
  const { adminApiKey } = req.body ?? {};
  if (typeof adminApiKey !== 'string' || adminApiKey.trim().length < 10) {
    return res.status(400).json({ success: false, error: 'adminApiKey is required' });
  }

  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ success: false, error: 'Not assigned to an organization yet' });

  await integrationService.upsertConnection({
    tenantId,
    provider: 'openai',
    accessToken: adminApiKey.trim(),
    connectedAccountLabel: `Admin key ${maskToken(adminApiKey.trim())}`,
    createdBy: req.user!.id,
  });

  res.json({ success: true });
}

/**
 * Attributes an org-level usage-API vendor's per-developer key/account id
 * (e.g. OpenAI's api_key_id) to a QualiMetrix user — see AiProviderKeyMapping's
 * schema comment. Tenant-scoped from req.user, requireAdmin-gated (mounted
 * in routes).
 */
export async function listKeyMappings(req: Request, res: Response) {
  const provider = paramString(req.params.provider);
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ success: false, error: 'Not assigned to an organization yet' });

  const mappings = await prisma.aiProviderKeyMapping.findMany({
    where: { tenantId, provider },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: mappings });
}

export async function upsertKeyMapping(req: Request, res: Response) {
  const provider = paramString(req.params.provider);
  if (!isKnownProvider(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }
  const { externalKeyId, userId, label } = req.body ?? {};
  if (typeof externalKeyId !== 'string' || !externalKeyId.trim()) {
    return res.status(400).json({ success: false, error: 'externalKeyId is required' });
  }
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ success: false, error: 'Not assigned to an organization yet' });

  const targetUser = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!targetUser) return res.status(400).json({ success: false, error: 'userId must belong to your organization' });

  const mapping = await prisma.aiProviderKeyMapping.upsert({
    where: { tenantId_provider_externalKeyId: { tenantId, provider, externalKeyId: externalKeyId.trim() } },
    create: { tenantId, provider, externalKeyId: externalKeyId.trim(), userId: targetUser.id, label: label || null },
    update: { userId: targetUser.id, label: label || null },
  });
  res.json({ success: true, data: mapping });
}

export async function deleteKeyMapping(req: Request, res: Response) {
  const id = paramString(req.params.id);
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ success: false, error: 'Not assigned to an organization yet' });

  const mapping = await prisma.aiProviderKeyMapping.findUnique({ where: { id } });
  if (!mapping || mapping.tenantId !== tenantId) {
    return res.status(404).json({ success: false, error: 'Mapping not found' });
  }
  await prisma.aiProviderKeyMapping.delete({ where: { id } });
  res.json({ success: true });
}
