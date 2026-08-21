import { Prisma, type AiProviderConnection } from "@prisma/client";
import prisma from "../../lib/prisma";
import { decrypt, encrypt, generateSecureToken, hashToken, maskToken } from "../../lib/encryption";

export const ANTHROPIC_CHANNELS = [
  "anthropic_direct",
  "anthropic_console",
  "aws_bedrock",
  "google_vertex",
  "microsoft_foundry",
  "gateway",
] as const;
export const ANTHROPIC_PLAN_TYPES = ["team", "enterprise", "console_api", "custom"] as const;
export const ANTHROPIC_COLLECTION_MODES = [
  "managed_otel",
  "enterprise_analytics",
  "console_analytics",
  "hybrid",
] as const;
export const ANTHROPIC_CREDENTIAL_SOURCES = ["enterprise_analytics", "console_admin"] as const;

export type AnthropicChannel = (typeof ANTHROPIC_CHANNELS)[number];
export type AnthropicPlanType = (typeof ANTHROPIC_PLAN_TYPES)[number];
export type AnthropicCollectionMode = (typeof ANTHROPIC_COLLECTION_MODES)[number];
export type AnthropicCredentialSource = (typeof ANTHROPIC_CREDENTIAL_SOURCES)[number];

export interface CreateAnthropicConnectionInput {
  tenantId: string;
  createdBy: string;
  organizationName: string;
  externalAccountId: string;
  domain?: string | null;
  acquisitionChannel: AnthropicChannel;
  planType: AnthropicPlanType;
  collectionMode: AnthropicCollectionMode;
  apiKey?: string | null;
  requestBaseUrl: string;
}

export interface AnthropicCapabilities {
  managedOtel: boolean;
  providerActivity: boolean;
  providerUsage: boolean;
  providerCost: boolean;
  costAuthority: "provider_billed" | "provider_estimated" | "cloud_provider" | "none";
  apiAdapter: "enterprise" | "console" | null;
}

export interface TelemetryDeploymentReadiness {
  baseUrl: string;
  enterpriseReady: boolean;
  mode: "enterprise" | "local_test" | "configuration_required";
  source: "configured" | "request";
  message: string;
}

export interface ManagedTelemetryDeployment extends TelemetryDeploymentReadiness {
  schemaVersion: 1;
  generatedAt: string;
  managedSettings: ReturnType<typeof buildManagedSettings>;
}

class ProviderValidationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function sanitizeProviderMessage(value: string): string {
  return value
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

export function resolveAnthropicCapabilities(
  input: Pick<CreateAnthropicConnectionInput, "acquisitionChannel" | "planType" | "collectionMode">,
): AnthropicCapabilities {
  const { acquisitionChannel: channel, planType, collectionMode: mode } = input;

  if (channel === "anthropic_direct" && planType === "team" && mode === "enterprise_analytics") {
    throw new Error(
      "A Claude Team organization cannot use a Claude Enterprise Analytics credential.",
    );
  }
  if (
    mode === "enterprise_analytics" &&
    (channel !== "anthropic_direct" || planType !== "enterprise")
  ) {
    throw new Error(
      "Enterprise Analytics is available only for a direct Anthropic Enterprise organization.",
    );
  }
  if (mode === "console_analytics") {
    const supported =
      (channel === "anthropic_console" && planType === "console_api") ||
      (channel === "anthropic_direct" && planType === "team");
    if (!supported) {
      throw new Error(
        "Claude Code Analytics requires an Anthropic Console organization or a Team organization whose Admin key proves access.",
      );
    }
  }
  if (mode === "hybrid") {
    const supported =
      (channel === "anthropic_direct" && planType === "enterprise") ||
      (channel === "anthropic_direct" && planType === "team") ||
      (channel === "anthropic_console" && planType === "console_api");
    if (!supported)
      throw new Error(
        "Hybrid collection currently supports direct Team, direct Enterprise, or Anthropic Console organizations.",
      );
  }
  if (!["anthropic_direct", "anthropic_console"].includes(channel) && mode !== "managed_otel") {
    throw new Error(
      `${channel} billing requires its cloud/gateway adapter; this Claude connector currently supports managed OTel for that channel.`,
    );
  }

  const apiAdapter =
    mode === "enterprise_analytics" ||
    (mode === "hybrid" && channel === "anthropic_direct" && planType === "enterprise")
      ? "enterprise"
      : mode === "console_analytics" ||
          (mode === "hybrid" &&
            ((channel === "anthropic_console" && planType === "console_api") ||
              (channel === "anthropic_direct" && planType === "team")))
        ? "console"
        : null;

  return {
    managedOtel: mode === "managed_otel" || mode === "hybrid",
    providerActivity: apiAdapter !== null,
    providerUsage: apiAdapter !== null,
    providerCost: apiAdapter !== null,
    costAuthority:
      apiAdapter === "enterprise"
        ? "provider_billed"
        : apiAdapter === "console"
          ? "provider_estimated"
          : ["aws_bedrock", "google_vertex", "microsoft_foundry", "gateway"].includes(channel)
            ? "cloud_provider"
            : "none",
    apiAdapter,
  };
}

async function anthropicGet(path: string, apiKey: string): Promise<Response> {
  return fetch(`https://api.anthropic.com${path}`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "user-agent": "QualiMetrix/1.0 (enterprise-ai-usage-monitoring)",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: sanitizeProviderMessage(text) };
  }
}

export async function validateAnthropicCredential(
  apiKey: string,
  expectedOrganizationId: string | null,
  adapter: "enterprise" | "console",
) {
  const date = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  let organizationId: string | null = null;
  let organizationName: string | null = null;

  if (adapter === "console") {
    // Console Admin API keys can call /organizations/me. Enterprise Analytics
    // keys cannot: Anthropic deliberately makes these key types non-interchangeable.
    const orgResponse = await anthropicGet("/v1/organizations/me", apiKey);
    const org = await readJson(orgResponse);
    if (!orgResponse.ok) {
      const providerMessage = typeof org.error === "string" ? `: ${org.error}` : "";
      throw new ProviderValidationError(
        `Anthropic rejected the Console Admin credential${providerMessage}`,
        orgResponse.status,
      );
    }
    if (typeof org.id !== "string")
      throw new Error("Anthropic organization validation returned no organization ID.");
    organizationId = org.id;
    if (expectedOrganizationId && org.id !== expectedOrganizationId) {
      throw new Error(
        `Credential belongs to Anthropic organization ${org.id}, not ${expectedOrganizationId}.`,
      );
    }
    organizationName = typeof org.name === "string" ? org.name : null;
  }

  const nextDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const capabilityPath =
    adapter === "enterprise"
      ? `/v1/organizations/analytics/user_usage_report?starting_at=${date}T00%3A00%3A00Z&ending_at=${nextDate}T00%3A00%3A00Z&products%5B%5D=claude_code&limit=1`
      : `/v1/organizations/usage_report/claude_code?starting_at=${date}&limit=1`;
  const capabilityResponse = await anthropicGet(capabilityPath, apiKey);
  const capabilityBody = await readJson(capabilityResponse);
  if (!capabilityResponse.ok) {
    const providerMessage =
      typeof capabilityBody.error === "string" ? `: ${capabilityBody.error}` : "";
    throw new ProviderValidationError(
      `Credential cannot read ${adapter} Claude Code analytics${providerMessage}`,
      capabilityResponse.status,
    );
  }
  if (adapter === "enterprise") {
    if (typeof capabilityBody.organization_id !== "string") {
      throw new Error("Enterprise Analytics validation returned no organization ID.");
    }
    organizationId = capabilityBody.organization_id;
    if (expectedOrganizationId && capabilityBody.organization_id !== expectedOrganizationId) {
      throw new Error(
        `Credential belongs to Anthropic organization ${capabilityBody.organization_id}, not ${expectedOrganizationId}.`,
      );
    }

    // Validate the activity capability separately; it supplies the real Claude
    // Code sessions/commits/PR/line metrics used by this connector.
    const activityResponse = await anthropicGet(
      `/v1/organizations/analytics/users?date=${date}&limit=1`,
      apiKey,
    );
    if (!activityResponse.ok) {
      const activityBody = await readJson(activityResponse);
      const providerMessage =
        typeof activityBody.error === "string" ? `: ${activityBody.error}` : "";
      throw new ProviderValidationError(
        `Credential cannot read Enterprise activity analytics${providerMessage}`,
        activityResponse.status,
      );
    }
  }

  if (!organizationId) {
    throw new Error("Anthropic credential validation returned no organization ID.");
  }
  return { id: organizationId, name: organizationName };
}

function adapterForCredentialSource(source: AnthropicCredentialSource): "enterprise" | "console" {
  return source === "enterprise_analytics" ? "enterprise" : "console";
}

export async function discoverAnthropicCredential(
  source: AnthropicCredentialSource,
  apiKey: string,
  expectedOrganizationId?: string | null,
) {
  const adapter = adapterForCredentialSource(source);
  const organization = await validateAnthropicCredential(
    apiKey.trim(),
    expectedOrganizationId?.trim() || null,
    adapter,
  );
  return {
    credentialSource: source,
    keyType: adapter === "enterprise" ? "Analytics API key" : "Admin API key",
    organization,
    capabilities: {
      historicalAnalytics: true,
      dailyUserActivity: true,
      productivityMetrics: true,
      tokenUsage: true,
      costAuthority: adapter === "enterprise" ? "provider_billed" : "provider_estimated",
      realtimeEvents: false,
    },
  };
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The QualiMetrix telemetry ingestion URL is not a valid absolute URL.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "The QualiMetrix telemetry ingestion URL must not contain credentials, query parameters, or a fragment.",
    );
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("The QualiMetrix telemetry ingestion URL must use HTTP or HTTPS.");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.")
  );
}

export function resolveTelemetryDeploymentReadiness(
  requestBaseUrl: string,
  configuredBaseUrl = process.env.QUALIMETRIX_PUBLIC_API_URL,
): TelemetryDeploymentReadiness {
  const configured = configuredBaseUrl?.trim();
  const baseUrl = normalizeBaseUrl(configured || requestBaseUrl);
  const parsed = new URL(baseUrl);
  const source = configured ? "configured" : "request";

  if (configured && parsed.protocol === "https:" && !isLocalHostname(parsed.hostname)) {
    return {
      baseUrl,
      enterpriseReady: true,
      mode: "enterprise",
      source,
      message: "Public HTTPS telemetry ingestion is configured for organization deployment.",
    };
  }

  if (isLocalHostname(parsed.hostname)) {
    return {
      baseUrl,
      enterpriseReady: false,
      mode: "local_test",
      source,
      message:
        "Localhost works only when Claude Code and the QualiMetrix API run on the same computer. Do not publish this package to an organization.",
    };
  }

  return {
    baseUrl,
    enterpriseReady: false,
    mode: "configuration_required",
    source,
    message:
      "Set QUALIMETRIX_PUBLIC_API_URL to the trusted HTTPS API address before generating an organization deployment package.",
  };
}

export function assertTelemetryDeploymentAllowed(
  readiness: TelemetryDeploymentReadiness,
  runtimeEnvironment = process.env.NODE_ENV,
): void {
  if (runtimeEnvironment === "production" && !readiness.enterpriseReady) {
    throw new Error(
      "Managed telemetry deployment is blocked until QUALIMETRIX_PUBLIC_API_URL is configured with a non-local HTTPS address.",
    );
  }
}

export function buildManagedSettings(
  baseUrl: string,
  connectionId: string,
  tenantId: string,
  token: string,
) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return {
    env: {
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      OTEL_METRICS_EXPORTER: "otlp",
      OTEL_LOGS_EXPORTER: "otlp",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: `${normalizedBaseUrl}/api/v1/ai-usage/otlp/${connectionId}/metrics`,
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `${normalizedBaseUrl}/api/v1/ai-usage/otlp/${connectionId}/logs`,
      OTEL_EXPORTER_OTLP_HEADERS: `x-qualimetrix-connection-token=${token}`,
      OTEL_RESOURCE_ATTRIBUTES: `qualimetrix.tenant_id=${tenantId},qualimetrix.connection_id=${connectionId}`,
      OTEL_LOG_USER_PROMPTS: "0",
      OTEL_LOG_TOOL_DETAILS: "0",
      OTEL_LOG_TOOL_CONTENT: "0",
    },
  };
}

function buildManagedTelemetryDeployment(
  requestBaseUrl: string,
  connectionId: string,
  tenantId: string,
  token: string,
): ManagedTelemetryDeployment {
  const readiness = resolveTelemetryDeploymentReadiness(requestBaseUrl);
  assertTelemetryDeploymentAllowed(readiness);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...readiness,
    managedSettings: buildManagedSettings(readiness.baseUrl, connectionId, tenantId, token),
  };
}

type ConnectionWithCounts = AiProviderConnection & {
  _count?: { identities: number };
  identities?: { id: string }[];
};

function publicConnection(connection: ConnectionWithCounts) {
  const capabilities = (connection.capabilities ?? {}) as unknown as AnthropicCapabilities;
  const apiVerification = capabilities.apiAdapter
    ? connection.lastValidatedAt
      ? "verified"
      : "unverified"
    : "not_configured";
  const telemetryVerification = capabilities.managedOtel
    ? connection.lastTelemetryAt
      ? "verified"
      : "awaiting_deployment"
    : "not_configured";
  const configuredChecks = [apiVerification, telemetryVerification].filter(
    (value) => value !== "not_configured",
  );
  const verifiedChecks = configuredChecks.filter((value) => value === "verified");
  const overallVerification =
    configuredChecks.length > 0 && verifiedChecks.length === configuredChecks.length
      ? "verified"
      : verifiedChecks.length > 0
        ? "partially_verified"
        : telemetryVerification === "awaiting_deployment"
          ? "awaiting_deployment"
          : "registered_unverified";
  return {
    id: connection.id,
    vendor: connection.vendor,
    product: connection.product,
    acquisitionChannel: connection.acquisitionChannel,
    planType: connection.planType,
    organizationName: connection.organizationName,
    externalAccountId: connection.externalAccountId,
    domain: connection.domain,
    collectionMode: connection.collectionMode,
    status: connection.status,
    credentialLabel: connection.credentialLabel,
    capabilities,
    verification: {
      overall: overallVerification,
      api: apiVerification,
      telemetry: telemetryVerification,
    },
    syncFrequencyMinutes: connection.syncFrequencyMinutes,
    lastValidatedAt: connection.lastValidatedAt,
    lastTelemetryAt: connection.lastTelemetryAt,
    lastSyncedAt: connection.lastSyncedAt,
    lastSyncError: connection.lastSyncError,
    isActive: connection.isActive,
    createdAt: connection.createdAt,
    identityCount: connection._count?.identities,
    mappedIdentityCount: connection.identities?.length,
  };
}

function connectionHasLegalHold(connection: AiProviderConnection): boolean {
  if (
    !connection.config ||
    typeof connection.config !== "object" ||
    Array.isArray(connection.config)
  )
    return false;
  return (connection.config as Prisma.JsonObject).legalHold === true;
}

function deletionConfirmationPhrase(organizationName: string): string {
  return `DELETE ${organizationName}`;
}

class AiProviderConnectionService {
  async createAnthropic(input: CreateAnthropicConnectionInput) {
    const capabilities = resolveAnthropicCapabilities(input);
    const apiKey = input.apiKey?.trim() || null;
    if (capabilities.apiAdapter && !apiKey)
      throw new Error("A reporting API key is required for this collection mode.");
    if (!capabilities.apiAdapter && apiKey)
      throw new Error("Do not supply an Anthropic API key for a managed-OTel-only connection.");

    let validatedName: string | null = null;
    if (capabilities.apiAdapter && apiKey) {
      const org = await validateAnthropicCredential(
        apiKey,
        input.externalAccountId,
        capabilities.apiAdapter,
      );
      validatedName = org.name;
    }

    const telemetryToken = capabilities.managedOtel ? `qm_otel_${generateSecureToken()}` : null;
    const now = new Date();
    const uniqueKey = {
      tenantId: input.tenantId,
      vendor: "anthropic",
      acquisitionChannel: input.acquisitionChannel,
      externalAccountId: input.externalAccountId,
    };
    const existing = await prisma.aiProviderConnection.findUnique({
      where: { tenantId_vendor_acquisitionChannel_externalAccountId: uniqueKey },
    });
    if (existing?.isActive) {
      throw new Error(
        "This Anthropic organization is already connected through the selected acquisition channel.",
      );
    }

    const deploymentReadiness = telemetryToken
      ? resolveTelemetryDeploymentReadiness(input.requestBaseUrl)
      : null;
    if (deploymentReadiness) assertTelemetryDeploymentAllowed(deploymentReadiness);
    const connectionData = {
      product: "claude_code",
      planType: input.planType,
      organizationName: validatedName || input.organizationName,
      domain: input.domain?.toLowerCase() || null,
      collectionMode: input.collectionMode,
      authType: capabilities.apiAdapter ? "api_key" : "connection_token",
      encryptedCredential: apiKey ? encrypt(apiKey) : null,
      credentialLabel: apiKey ? `${capabilities.apiAdapter} key ${maskToken(apiKey)}` : null,
      telemetryTokenHash: telemetryToken ? hashToken(telemetryToken) : null,
      telemetryTokenCreatedAt: telemetryToken ? now : null,
      status: capabilities.managedOtel ? "awaiting_telemetry" : "connected",
      scopes: capabilities.apiAdapter === "enterprise" ? ["read:analytics"] : ["usage:read"],
      capabilities: capabilities as unknown as Prisma.InputJsonValue,
      config: {
        privacy: { prompts: false, toolArguments: false, codeContent: false },
        ...(deploymentReadiness
          ? {
              telemetryDeployment: {
                baseUrl: deploymentReadiness.baseUrl,
                enterpriseReady: deploymentReadiness.enterpriseReady,
                generatedAt: now.toISOString(),
              },
            }
          : {}),
      },
      syncCursor: { initialBackfillDays: 30, overlapDays: 2 },
      lastValidatedAt: capabilities.apiAdapter ? now : null,
      lastTelemetryAt: null,
      lastSyncedAt: null,
      lastSyncStartedAt: null,
      lastSyncError: null,
      isActive: true,
      createdBy: input.createdBy,
    } satisfies Prisma.AiProviderConnectionUncheckedUpdateInput;

    const connection = await prisma.aiProviderConnection.upsert({
      where: { tenantId_vendor_acquisitionChannel_externalAccountId: uniqueKey },
      create: {
        tenantId: input.tenantId,
        vendor: "anthropic",
        acquisitionChannel: input.acquisitionChannel,
        externalAccountId: input.externalAccountId,
        ...connectionData,
      },
      update: connectionData,
    });

    const managedDeployment = telemetryToken
      ? buildManagedTelemetryDeployment(
          input.requestBaseUrl,
          connection.id,
          input.tenantId,
          telemetryToken,
        )
      : null;
    return {
      connection: publicConnection(connection),
      managedSettings: managedDeployment?.managedSettings ?? null,
      deployment: managedDeployment,
    };
  }

  getTelemetryDeploymentReadiness(requestBaseUrl: string) {
    return resolveTelemetryDeploymentReadiness(requestBaseUrl);
  }

  async attachAnthropicReportingCredential(
    tenantId: string,
    connectionId: string,
    source: AnthropicCredentialSource,
    apiKey: string,
  ) {
    const connection = await this.getForTenant(tenantId, connectionId);
    if (!connection) return null;

    const existingCapabilities = connection.capabilities as unknown as AnthropicCapabilities;
    const collectionMode: AnthropicCollectionMode = existingCapabilities.managedOtel
      ? "hybrid"
      : source === "enterprise_analytics"
        ? "enterprise_analytics"
        : "console_analytics";
    const capabilities = resolveAnthropicCapabilities({
      acquisitionChannel: connection.acquisitionChannel as AnthropicChannel,
      planType: connection.planType as AnthropicPlanType,
      collectionMode,
    });
    if (capabilities.apiAdapter !== adapterForCredentialSource(source)) {
      throw new Error("The reporting key type does not match this organization and plan.");
    }
    const discovery = await discoverAnthropicCredential(
      source,
      apiKey,
      connection.externalAccountId,
    );

    const currentConfig =
      connection.config &&
      typeof connection.config === "object" &&
      !Array.isArray(connection.config)
        ? (connection.config as Prisma.JsonObject)
        : {};
    const updated = await prisma.aiProviderConnection.update({
      where: { id: connection.id },
      data: {
        organizationName: discovery.organization.name || connection.organizationName,
        collectionMode,
        authType: existingCapabilities.managedOtel ? "api_key_and_connection_token" : "api_key",
        encryptedCredential: encrypt(apiKey.trim()),
        credentialLabel: `${discovery.keyType} ${maskToken(apiKey.trim())}`,
        scopes: capabilities.apiAdapter === "enterprise" ? ["read:analytics"] : ["usage:read"],
        capabilities: capabilities as unknown as Prisma.InputJsonValue,
        lastValidatedAt: new Date(),
        lastSyncError: null,
        status:
          capabilities.managedOtel && !connection.lastTelemetryAt
            ? "awaiting_telemetry"
            : "connected",
        config: {
          ...currentConfig,
          reportingCredential: {
            source,
            verifiedAt: new Date().toISOString(),
            organizationId: discovery.organization.id,
          },
        },
      },
    });

    return {
      connection: publicConnection(updated),
      discovery,
    };
  }

  async listAnthropic(tenantId: string) {
    const connections = await prisma.aiProviderConnection.findMany({
      // Keep disconnected records visible so an authorized PM can reconnect
      // them or permanently erase the retained history later.
      where: { tenantId, vendor: "anthropic" },
      include: {
        _count: { select: { identities: true } },
        identities: { where: { userId: { not: null } }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return connections.map(publicConnection);
  }

  async getForTenant(tenantId: string, id: string) {
    return prisma.aiProviderConnection.findFirst({
      where: { id, tenantId, vendor: "anthropic", isActive: true },
    });
  }

  async getAnyForTenant(tenantId: string, id: string) {
    return prisma.aiProviderConnection.findFirst({
      where: { id, tenantId, vendor: "anthropic" },
    });
  }

  async getDeletionPreview(tenantId: string, connectionId: string) {
    const connection = await this.getAnyForTenant(tenantId, connectionId);
    if (!connection) return null;
    const [identities, rawEvents, dailyActivities, usageEvents] = await Promise.all([
      prisma.aiProviderIdentity.count({ where: { connectionId } }),
      prisma.aiProviderRawEvent.count({ where: { connectionId } }),
      prisma.aiProviderDailyActivity.count({ where: { connectionId } }),
      prisma.aiUsageEvent.count({ where: { providerConnectionId: connectionId } }),
    ]);
    return {
      connectionId: connection.id,
      organizationName: connection.organizationName,
      externalAccountId: connection.externalAccountId,
      vendor: connection.vendor,
      product: connection.product,
      active: connection.isActive,
      legalHold: connectionHasLegalHold(connection),
      confirmationPhrase: deletionConfirmationPhrase(connection.organizationName),
      recordCounts: {
        connections: 1,
        identities,
        rawEvents,
        dailyActivities,
        usageEvents,
        totalCollectedRecords: identities + rawEvents + dailyActivities + usageEvents,
      },
      consequences: [
        "Provider synchronization stops immediately.",
        "The QualiMetrix telemetry credential is permanently invalidated.",
        "Observed identities, raw events, daily activity, and normalized usage/cost facts are deleted.",
        "Anthropic credentials must still be revoked separately in the Anthropic administration console.",
      ],
    };
  }

  async permanentlyDelete(
    tenantId: string,
    connectionId: string,
    requestedBy: string,
    reason: string,
    confirmation: string,
  ) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new Error("Deletion reason must be between 10 and 500 characters.");
    }

    return prisma.$transaction(async (tx) => {
      const connection = await tx.aiProviderConnection.findFirst({
        where: { id: connectionId, tenantId, vendor: "anthropic" },
      });
      if (!connection) return null;
      if (connectionHasLegalHold(connection)) {
        throw new Error(
          "This organization is under legal hold. Remove the hold through the authorized governance process before deletion.",
        );
      }
      if (confirmation !== deletionConfirmationPhrase(connection.organizationName)) {
        throw new Error("Deletion confirmation phrase does not match.");
      }

      // Disable both collection paths before counting/deleting. A concurrent
      // ingest that already resolved the old token will fail its FK insert
      // after the connection is deleted by this transaction.
      await tx.aiProviderConnection.update({
        where: { id: connection.id },
        data: {
          isActive: false,
          status: "deleting",
          encryptedCredential: null,
          telemetryTokenHash: null,
        },
      });

      const [identities, rawEvents, dailyActivities, usageEvents] = await Promise.all([
        tx.aiProviderIdentity.count({ where: { connectionId } }),
        tx.aiProviderRawEvent.count({ where: { connectionId } }),
        tx.aiProviderDailyActivity.count({ where: { connectionId } }),
        tx.aiUsageEvent.count({ where: { providerConnectionId: connectionId } }),
      ]);
      const recordCounts = {
        connections: 1,
        identities,
        rawEvents,
        dailyActivities,
        usageEvents,
        totalCollectedRecords: identities + rawEvents + dailyActivities + usageEvents,
      };
      const completedAt = new Date();
      const audit = await tx.aiProviderDeletionAudit.create({
        data: {
          tenantId,
          requestedBy,
          vendor: connection.vendor,
          product: connection.product,
          connectionFingerprint: hashToken(`${tenantId}:${connection.vendor}:${connection.id}`),
          reason: normalizedReason,
          recordCounts: recordCounts as unknown as Prisma.InputJsonValue,
          status: "completed",
          requestedAt: completedAt,
          completedAt,
        },
      });

      await tx.aiProviderConnection.delete({ where: { id: connection.id } });
      return {
        deletionReceiptId: audit.id,
        completedAt: audit.completedAt,
        recordCounts,
      };
    });
  }

  async listIdentities(tenantId: string, connectionId: string) {
    const connection = await this.getForTenant(tenantId, connectionId);
    if (!connection) return null;
    return prisma.aiProviderIdentity.findMany({
      where: { connectionId, tenantId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: [{ email: "asc" }, { externalUserId: "asc" }],
    });
  }

  async rotateTelemetryToken(tenantId: string, connectionId: string, requestBaseUrl: string) {
    const connection = await this.getForTenant(tenantId, connectionId);
    if (!connection) return null;
    const capabilities = connection.capabilities as unknown as AnthropicCapabilities;
    if (!capabilities.managedOtel) throw new Error("This connection does not use managed OTel.");
    const telemetryToken = `qm_otel_${generateSecureToken()}`;
    const deployment = buildManagedTelemetryDeployment(
      requestBaseUrl,
      connection.id,
      tenantId,
      telemetryToken,
    );
    const currentConfig =
      connection.config &&
      typeof connection.config === "object" &&
      !Array.isArray(connection.config)
        ? (connection.config as Prisma.JsonObject)
        : {};
    const updatedConnection = await prisma.aiProviderConnection.update({
      where: { id: connection.id },
      data: {
        telemetryTokenHash: hashToken(telemetryToken),
        telemetryTokenCreatedAt: new Date(),
        status: "awaiting_telemetry",
        lastSyncError: null,
        config: {
          ...currentConfig,
          telemetryDeployment: {
            baseUrl: deployment.baseUrl,
            enterpriseReady: deployment.enterpriseReady,
            generatedAt: deployment.generatedAt,
          },
        },
      },
    });
    return {
      connection: publicConnection(updatedConnection),
      managedSettings: deployment.managedSettings,
      deployment,
    };
  }

  async disconnect(tenantId: string, connectionId: string) {
    const connection = await this.getForTenant(tenantId, connectionId);
    if (!connection) return null;
    return prisma.aiProviderConnection.update({
      where: { id: connection.id },
      data: {
        isActive: false,
        status: "disconnected",
        encryptedCredential: null,
        telemetryTokenHash: null,
      },
    });
  }

  async resolveTelemetryConnection(connectionId: string, token: string) {
    const connection = await prisma.aiProviderConnection.findFirst({
      where: {
        id: connectionId,
        telemetryTokenHash: hashToken(token),
        vendor: "anthropic",
        isActive: true,
      },
    });
    return connection;
  }

  async getDecryptedCredential(connectionId: string): Promise<string | null> {
    const connection = await prisma.aiProviderConnection.findUnique({
      where: { id: connectionId },
    });
    return connection?.encryptedCredential ? decrypt(connection.encryptedCredential) : null;
  }

  async listDueAnthropicApiConnections() {
    return prisma.aiProviderConnection.findMany({
      where: {
        vendor: "anthropic",
        isActive: true,
        status: { in: ["connected", "error", "awaiting_telemetry"] },
        encryptedCredential: { not: null },
      },
    });
  }

  async recordSyncStart(id: string) {
    await prisma.aiProviderConnection.update({
      where: { id },
      data: { lastSyncStartedAt: new Date() },
    });
  }

  async recordSyncSuccess(id: string, cursor: Record<string, unknown>) {
    await prisma.aiProviderConnection.update({
      where: { id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncError: null,
        status: "connected",
        syncCursor: cursor as Prisma.InputJsonValue,
      },
    });
  }

  async recordSyncError(id: string, error: unknown) {
    const message = sanitizeProviderMessage(error instanceof Error ? error.message : String(error));
    const httpStatus =
      typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : null;
    const status =
      (error instanceof ProviderValidationError || httpStatus !== null) &&
      [401, 403].includes(httpStatus ?? -1)
        ? "reauth_required"
        : "error";
    await prisma.aiProviderConnection.update({
      where: { id },
      data: { lastSyncError: message, status },
    });
  }
}

export const aiProviderConnectionService = new AiProviderConnectionService();
export default aiProviderConnectionService;
