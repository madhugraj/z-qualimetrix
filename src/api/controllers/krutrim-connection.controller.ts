import { Request, Response } from "express";
import providerConnectionService from "../services/provider-connection.service";
import { releaseIntegrationOperation, requestSyncNow, reserveIntegrationOperation } from "../../lib/scheduler";
import { syncKrutrimGpuCost } from "../services/krutrim-gpu-cost-sync.service";
import { paramString } from "../utils/http-params";

function tenantId(req: Request): string | null {
  return req.user?.tenantId ?? null;
}

export async function listKrutrimConnections(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant) return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const data = await providerConnectionService.listForTenant(tenant, "krutrim");
  res.json({ success: true, data: data.map(({ encryptedCredential, ...rest }) => rest) });
}

/**
 * Krutrim has no scoped API key for console/usage data (see
 * krutrim-gpu-cost-sync.service.ts header) — the stored credential is the
 * user's real account email+password, used to log in via a headless
 * browser on each sync.
 */
export async function createKrutrimConnection(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant) return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  if (!req.user?.id) return res.status(401).json({ success: false, error: "Not authenticated" });

  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "email and password are required" });
  }

  try {
    const connection = await providerConnectionService.createConnection({
      tenantId: tenant,
      createdBy: req.user.id,
      vendor: "krutrim",
      product: "gpu_compute",
      externalAccountId: email,
      credential: JSON.stringify({ email, password }),
      authType: "password_login",
    });
    const { encryptedCredential, ...safe } = connection;
    res.status(201).json({ success: true, data: safe });
  } catch (error) {
    res.status(409).json({ success: false, error: error instanceof Error ? error.message : "Failed to create connection" });
  }
}

export async function syncKrutrimNow(req: Request, res: Response) {
  const tenant = tenantId(req);
  if (!tenant) return res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
  const id = paramString(req.params.id);
  const connection = await providerConnectionService.getForTenant(tenant, id);
  if (!connection) return res.status(404).json({ success: false, error: "Connection not found" });

  const accepted = requestSyncNow(connection.id, () => syncKrutrimGpuCost(connection));
  if (!accepted) return res.status(409).json({ success: false, error: "A sync for this connection is already running" });
  res.json({ success: true, message: "Sync started" });
}

export async function disconnectKrutrimConnection(req: Request, res: Response) {
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
