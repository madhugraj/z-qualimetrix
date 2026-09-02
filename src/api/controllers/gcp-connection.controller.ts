import { Request, Response } from "express";
import providerConnectionService from "../services/provider-connection.service";
import { releaseIntegrationOperation, requestSyncNow, reserveIntegrationOperation } from "../../lib/scheduler";
import { syncVertexAiConnection } from "../services/vertex-ai-usage-sync.service";
import { syncGcpGpuCost } from "../services/gcp-gpu-cost-sync.service";
import { paramString } from "../utils/http-params";

function tenantId(req: Request): string | null {
  return req.user?.tenantId ?? null;
}

export async function listGcpConnections(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant) return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const data = await providerConnectionService.listForTenant(tenant, "gcp");
  // Never return the encrypted credential blob to the client.
  res.json({ success: true, data: data.map(({ encryptedCredential, ...rest }) => rest) });
}

/**
 * Connect flow needs a GCP service-account JSON key (not a simple API key —
 * GCP's usage/cost story runs through Billing Export to BigQuery, see
 * gcp-billing-export.client.ts) plus the dataset/table the customer's
 * Billing Export already writes to. We cannot enable Billing Export on
 * their behalf — the frontend must tell them to do that first.
 */
export async function createGcpConnection(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant) return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  if (!req.user?.id) return res.status(401).json({ success: false, error: "Not authenticated" });

  const { gcpProjectId, billingAccountId, bigQueryDataset, bigQueryTableSuffix, serviceAccountJson } = req.body ?? {};
  if (!gcpProjectId || !bigQueryDataset || !bigQueryTableSuffix || !serviceAccountJson) {
    return res.status(400).json({
      success: false,
      error: "gcpProjectId, bigQueryDataset, bigQueryTableSuffix and serviceAccountJson are required",
    });
  }
  let credential: string;
  try {
    // Validate it's actually JSON before encrypting — a copy/paste mistake here otherwise only surfaces at first sync.
    JSON.parse(typeof serviceAccountJson === "string" ? serviceAccountJson : JSON.stringify(serviceAccountJson));
    credential = typeof serviceAccountJson === "string" ? serviceAccountJson : JSON.stringify(serviceAccountJson);
  } catch {
    return res.status(400).json({ success: false, error: "serviceAccountJson is not valid JSON" });
  }

  try {
    const connection = await providerConnectionService.createConnection({
      tenantId: tenant,
      createdBy: req.user.id,
      vendor: "gcp",
      product: "vertex_ai_and_gpu_compute",
      externalAccountId: gcpProjectId,
      externalBillingAccountId: billingAccountId ?? null,
      credential,
      authType: "service_account_json",
      config: { bigQueryDataset, bigQueryTableSuffix },
    });
    const { encryptedCredential, ...safe } = connection;
    res.status(201).json({ success: true, data: safe });
  } catch (error) {
    res.status(409).json({ success: false, error: error instanceof Error ? error.message : "Failed to create connection" });
  }
}

export async function syncGcpNow(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant) return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const id = paramString(req.params.id);
  const connection = await providerConnectionService.getForTenant(tenant, id);
  if (!connection) return res.status(404).json({ success: false, error: "Connection not found" });

  const accepted = requestSyncNow(connection.id, async () => {
    await syncVertexAiConnection(connection);
    await syncGcpGpuCost(connection);
  });
  if (!accepted) return res.status(409).json({ success: false, error: "A sync for this connection is already running" });
  res.json({ success: true, message: "Sync started" });
}

export async function disconnectGcpConnection(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant) return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const id = paramString(req.params.id);
  const connection = await providerConnectionService.getForTenant(tenant, id);
  if (!connection) return res.status(404).json({ success: false, error: "Connection not found" });
  if (!reserveIntegrationOperation(id)) {
    return res.status(409).json({ success: false, error: "A synchronization is running. Wait for it to finish, then retry." });
  }
  try {
    await providerConnectionService.disconnect(id, tenant);
    res.json({ success: true });
  } finally {
    releaseIntegrationOperation(id);
  }
}
