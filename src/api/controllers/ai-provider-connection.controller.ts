import { Request, Response } from "express";
import {
  ANTHROPIC_CHANNELS,
  ANTHROPIC_COLLECTION_MODES,
  ANTHROPIC_CREDENTIAL_SOURCES,
  ANTHROPIC_PLAN_TYPES,
  type AnthropicChannel,
  type AnthropicCollectionMode,
  type AnthropicCredentialSource,
  type AnthropicPlanType,
  aiProviderConnectionService,
  discoverAnthropicCredential,
} from "../services/ai-provider-connection.service";
import { requestSyncNow } from "../../lib/scheduler";
import { syncAnthropicConnection } from "../services/anthropic-usage-sync.service";

function tenantId(req: Request): string | null {
  return req.user?.tenantId ?? null;
}

function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

export async function listAnthropicConnections(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant)
    return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const data = await aiProviderConnectionService.listAnthropic(tenant);
  res.json({ success: true, data });
}

export async function getAnthropicDeploymentReadiness(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant)
    return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  try {
    const data = aiProviderConnectionService.getTelemetryDeploymentReadiness(baseUrl(req));
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Telemetry deployment is not configured",
    });
  }
}

export async function discoverAnthropicReportingCredential(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant)
    return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const { credentialSource, apiKey, externalAccountId } = req.body ?? {};
  if (!isOneOf(credentialSource, ANTHROPIC_CREDENTIAL_SOURCES)) {
    return res.status(400).json({ success: false, error: "Unsupported credential source" });
  }
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return res.status(400).json({ success: false, error: "Reporting API key is required" });
  }
  if (typeof externalAccountId !== "string" || !externalAccountId.trim()) {
    return res.status(400).json({ success: false, error: "Organization ID is required" });
  }
  try {
    const data = await discoverAnthropicCredential(credentialSource, apiKey, externalAccountId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Reporting credential validation failed",
    });
  }
}

export async function attachAnthropicReportingCredential(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant)
    return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const { credentialSource, apiKey } = req.body ?? {};
  if (!isOneOf(credentialSource, ANTHROPIC_CREDENTIAL_SOURCES)) {
    return res.status(400).json({ success: false, error: "Unsupported credential source" });
  }
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return res.status(400).json({ success: false, error: "Reporting API key is required" });
  }
  try {
    const data = await aiProviderConnectionService.attachAnthropicReportingCredential(
      tenant,
      req.params.id,
      credentialSource as AnthropicCredentialSource,
      apiKey,
    );
    if (!data) return res.status(404).json({ success: false, error: "Connection not found" });

    const connection = await aiProviderConnectionService.getForTenant(tenant, req.params.id);
    if (connection) requestSyncNow(connection.id, () => syncAnthropicConnection(connection));
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Reporting credential connection failed",
    });
  }
}

export async function createAnthropicConnection(req: Request, res: Response) {
  try {
    const tenant = tenantId(req);
    if (!tenant)
      return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
    const {
      organizationName,
      externalAccountId,
      domain,
      acquisitionChannel,
      planType,
      collectionMode,
      apiKey,
    } = req.body ?? {};

    if (typeof organizationName !== "string" || !organizationName.trim()) {
      return res.status(400).json({ success: false, error: "organizationName is required" });
    }
    if (typeof externalAccountId !== "string" || !externalAccountId.trim()) {
      return res.status(400).json({ success: false, error: "externalAccountId is required" });
    }
    if (!isOneOf(acquisitionChannel, ANTHROPIC_CHANNELS)) {
      return res.status(400).json({ success: false, error: "Unsupported acquisitionChannel" });
    }
    if (!isOneOf(planType, ANTHROPIC_PLAN_TYPES)) {
      return res.status(400).json({ success: false, error: "Unsupported planType" });
    }
    if (!isOneOf(collectionMode, ANTHROPIC_COLLECTION_MODES)) {
      return res.status(400).json({ success: false, error: "Unsupported collectionMode" });
    }

    const data = await aiProviderConnectionService.createAnthropic({
      tenantId: tenant,
      createdBy: req.user!.id,
      organizationName: organizationName.trim(),
      externalAccountId: externalAccountId.trim(),
      domain: typeof domain === "string" ? domain.trim() || null : null,
      acquisitionChannel: acquisitionChannel as AnthropicChannel,
      planType: planType as AnthropicPlanType,
      collectionMode: collectionMode as AnthropicCollectionMode,
      apiKey: typeof apiKey === "string" ? apiKey : null,
      requestBaseUrl: baseUrl(req),
    });

    if (data.connection.capabilities.apiAdapter) {
      const connection = await aiProviderConnectionService.getForTenant(tenant, data.connection.id);
      if (connection) requestSyncNow(connection.id, () => syncAnthropicConnection(connection));
    }

    res.status(201).json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Anthropic connection";
    const status = /already exists|already connected|Unique constraint/i.test(message) ? 409 : 400;
    res.status(status).json({ success: false, error: message });
  }
}

export async function listAnthropicIdentities(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant)
    return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const data = await aiProviderConnectionService.listIdentities(tenant, req.params.id);
  if (!data) return res.status(404).json({ success: false, error: "Connection not found" });
  res.json({ success: true, data });
}

export async function rotateAnthropicTelemetryToken(req: Request, res: Response) {
  try {
    const tenant = tenantId(req);
    if (!tenant)
      return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
    const data = await aiProviderConnectionService.rotateTelemetryToken(
      tenant,
      req.params.id,
      baseUrl(req),
    );
    if (!data) return res.status(404).json({ success: false, error: "Connection not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Token rotation failed",
    });
  }
}

export async function syncAnthropicNow(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant)
    return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const connection = await aiProviderConnectionService.getForTenant(tenant, req.params.id);
  if (!connection) return res.status(404).json({ success: false, error: "Connection not found" });
  if (!connection.encryptedCredential) {
    return res.status(409).json({
      success: false,
      error: "This connection receives OTel telemetry and has no provider API to sync.",
    });
  }
  const accepted = requestSyncNow(connection.id, () => syncAnthropicConnection(connection));
  if (!accepted)
    return res
      .status(409)
      .json({ success: false, error: "A sync for this connection is already running" });
  res.json({ success: true, message: "Sync started" });
}

export async function disconnectAnthropicConnection(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant)
    return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const disconnected = await aiProviderConnectionService.disconnect(tenant, req.params.id);
  if (!disconnected) return res.status(404).json({ success: false, error: "Connection not found" });
  res.json({ success: true });
}
