import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { encrypt, decrypt } from '../../lib/encryption';

export type IntegrationProvider = 'jira' | 'azure_devops' | 'openai' | 'vertex_ai';
export type IntegrationStatus = 'connected' | 'error' | 'reauth_required' | 'disconnected';

export const MIN_SYNC_FREQUENCY_MINUTES = 5;

interface UpsertConnectionInput {
  tenantId: string;
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  externalMetadata?: Record<string, unknown>;
  connectedAccountLabel?: string | null;
  createdBy: string;
}

export interface IntegrationStatusView {
  isConnected: boolean;
  provider: IntegrationProvider;
  status?: IntegrationStatus;
  connectedAccountLabel?: string | null;
  syncFrequencyMinutes?: number;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  externalMetadata?: Record<string, unknown>;
}

class IntegrationService {
  async upsertConnection(input: UpsertConnectionInput) {
    const {
      tenantId, provider, accessToken, refreshToken, expiresAt,
      scopes, externalMetadata, connectedAccountLabel, createdBy,
    } = input;

    const encryptedAccessToken = encrypt(accessToken);
    const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null;

    return prisma.integration.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: {
        tenantId,
        provider,
        status: 'connected',
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: expiresAt ?? null,
        scopes: scopes ?? [],
        externalMetadata: (externalMetadata ?? {}) as Prisma.InputJsonValue,
        connectedAccountLabel: connectedAccountLabel ?? null,
        isActive: true,
        createdBy,
      },
      update: {
        status: 'connected',
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: expiresAt ?? null,
        scopes: scopes ?? [],
        externalMetadata: (externalMetadata ?? {}) as Prisma.InputJsonValue,
        connectedAccountLabel: connectedAccountLabel ?? null,
        isActive: true,
        lastSyncError: null,
      },
    });
  }

  /**
   * Rotates the access/refresh token pair after a successful provider refresh call.
   * Kept separate from upsertConnection so callers refreshing mid-sync don't
   * accidentally reset status/lastSyncError bookkeeping.
   */
  async recordTokenRefresh(tenantId: string, provider: IntegrationProvider, params: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
  }) {
    return prisma.integration.update({
      where: { tenantId_provider: { tenantId, provider } },
      data: {
        encryptedAccessToken: encrypt(params.accessToken),
        encryptedRefreshToken: params.refreshToken ? encrypt(params.refreshToken) : undefined,
        tokenExpiresAt: params.expiresAt ?? null,
      },
    });
  }

  async getDecryptedTokens(tenantId: string, provider: IntegrationProvider): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    externalMetadata: Record<string, unknown>;
  } | null> {
    const integration = await prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!integration || !integration.isActive) return null;

    return {
      accessToken: decrypt(integration.encryptedAccessToken),
      refreshToken: integration.encryptedRefreshToken ? decrypt(integration.encryptedRefreshToken) : null,
      expiresAt: integration.tokenExpiresAt,
      externalMetadata: (integration.externalMetadata as Record<string, unknown>) ?? {},
    };
  }

  async getStatus(tenantId: string, provider: IntegrationProvider): Promise<IntegrationStatusView> {
    const integration = await prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });

    if (!integration || !integration.isActive) {
      return { isConnected: false, provider };
    }

    return {
      isConnected: integration.status === 'connected',
      provider,
      status: integration.status as IntegrationStatus,
      connectedAccountLabel: integration.connectedAccountLabel,
      syncFrequencyMinutes: integration.syncFrequencyMinutes,
      lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: integration.lastSyncError,
      externalMetadata: (integration.externalMetadata as Record<string, unknown>) ?? {},
    };
  }

  async listForTenant(tenantId: string) {
    return prisma.integration.findMany({ where: { tenantId, isActive: true } });
  }

  async listDueForSync() {
    return prisma.integration.findMany({
      where: { isActive: true, status: 'connected' },
    });
  }

  async updateSyncFrequency(tenantId: string, provider: IntegrationProvider, minutes: number) {
    const clamped = Math.max(MIN_SYNC_FREQUENCY_MINUTES, Math.floor(minutes));
    return prisma.integration.update({
      where: { tenantId_provider: { tenantId, provider } },
      data: { syncFrequencyMinutes: clamped },
    });
  }

  /**
   * Merges into externalMetadata without touching credentials/status — used
   * by pull-based sync adapters (OpenAI, Vertex) to persist an incremental
   * cursor (e.g. lastIngestedUnixTime) every tick without re-encrypting and
   * rewriting the access token on every sync, which upsertConnection would do.
   */
  async updateExternalMetadata(tenantId: string, provider: IntegrationProvider, patch: Record<string, unknown>) {
    const integration = await prisma.integration.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
    if (!integration) return;
    const merged = { ...(integration.externalMetadata as Record<string, unknown>), ...patch };
    return prisma.integration.update({
      where: { tenantId_provider: { tenantId, provider } },
      data: { externalMetadata: merged as Prisma.InputJsonValue },
    });
  }

  async recordSyncStart(integrationId: string) {
    return prisma.integration.update({
      where: { id: integrationId },
      data: { lastSyncStartedAt: new Date() },
    });
  }

  async recordSyncSuccess(integrationId: string) {
    return prisma.integration.update({
      where: { id: integrationId },
      data: { lastSyncedAt: new Date(), lastSyncError: null, status: 'connected' },
    });
  }

  async recordSyncError(integrationId: string, message: string) {
    return prisma.integration.update({
      where: { id: integrationId },
      data: { lastSyncedAt: new Date(), lastSyncError: message.slice(0, 2000) },
    });
  }

  async markReauthRequired(tenantId: string, provider: IntegrationProvider, message: string) {
    return prisma.integration.update({
      where: { tenantId_provider: { tenantId, provider } },
      data: { status: 'reauth_required', lastSyncError: message.slice(0, 2000) },
    });
  }

  async disconnect(tenantId: string, provider: IntegrationProvider) {
    return prisma.integration.update({
      where: { tenantId_provider: { tenantId, provider } },
      data: { isActive: false, status: 'disconnected' },
    });
  }

  /**
   * Lazily creates (once per tenant) the synthetic "integration-sync" system
   * user used as WorkItem/Sprint createdBy for synced rows whose real Jira/ADO
   * author has never logged into QualiMetrix. createdBy is NOT NULL + FK-enforced,
   * and external account ids (esp. Jira's) don't fit a real user identity.
   */
  async getOrCreateSystemUser(tenantId: string): Promise<string> {
    const email = `integration-sync+${tenantId}@qualimetrix.internal`;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return existing.id;

    const created = await prisma.user.create({
      data: {
        email,
        name: 'Integration Sync',
        role: 'system',
        isActive: false,
        tenantId,
      },
    });
    return created.id;
  }
}

export const integrationService = new IntegrationService();
export default integrationService;
