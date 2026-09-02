/**
 * Generic provider-connection lifecycle for every non-Anthropic pull-based
 * vendor (GCP Vertex AI/Gemini, and GPU-compute providers as they're added).
 * Reuses the ai_provider_connections table — its vendor/credential/config
 * columns are already generic — but not AiProviderConnectionService, which
 * hardcodes vendor:"anthropic" and requires Anthropic-only fields
 * (acquisitionChannel/planType/organizationName/collectionMode, now nullable
 * for exactly this reason). Sync bookkeeping (getDecryptedCredential,
 * recordSyncStart/Success/Error) is genuinely vendor-agnostic already, so
 * those are reused directly from that service rather than duplicated here.
 */
import { Prisma, type AiProviderConnection } from "@prisma/client";
import prisma from "../../lib/prisma";
import { encrypt } from "../../lib/encryption";
import aiProviderConnectionService from "./ai-provider-connection.service";

export const { getDecryptedCredential, recordSyncStart, recordSyncSuccess, recordSyncError } =
  aiProviderConnectionService;

export interface CreateProviderConnectionInput {
  tenantId: string;
  createdBy: string;
  vendor: string; // "gcp" | "aws" | "azure" ...
  product?: string;
  externalAccountId: string; // GCP project id, AWS account id, Azure subscription id
  externalBillingAccountId?: string | null; // GCP billing account id, AWS payer account id, etc.
  domain?: string | null;
  credential: string; // raw secret — a plain API key, or JSON.stringify()'d for multi-part credentials (GCP service-account JSON, AWS key+secret)
  authType?: string;
  config?: Record<string, unknown>; // non-secret structured config, e.g. { bigQueryDataset: "..." }
  capabilities?: Record<string, unknown>;
}

class ProviderConnectionConflictError extends Error {
  constructor(vendor: string, externalAccountId: string) {
    super(`A ${vendor} connection for account ${externalAccountId} already exists for this tenant.`);
  }
}

export class ProviderConnectionService {
  /**
   * The table's own unique index includes acquisitionChannel, which this
   * path never sets (NULL) — Postgres treats NULL as distinct from itself,
   * so that index can't catch a duplicate (tenantId, vendor,
   * externalAccountId) here. Check at the application level instead.
   */
  async createConnection(input: CreateProviderConnectionInput): Promise<AiProviderConnection> {
    const existing = await prisma.aiProviderConnection.findFirst({
      where: { tenantId: input.tenantId, vendor: input.vendor, externalAccountId: input.externalAccountId },
    });
    if (existing) throw new ProviderConnectionConflictError(input.vendor, input.externalAccountId);

    return prisma.aiProviderConnection.create({
      data: {
        tenantId: input.tenantId,
        createdBy: input.createdBy,
        vendor: input.vendor,
        product: input.product ?? "usage_sync",
        externalAccountId: input.externalAccountId,
        externalBillingAccountId: input.externalBillingAccountId ?? null,
        domain: input.domain ?? null,
        authType: input.authType ?? "service_credential",
        encryptedCredential: encrypt(input.credential),
        status: "connected",
        config: (input.config ?? {}) as Prisma.InputJsonValue,
        capabilities: (input.capabilities ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async listForTenant(tenantId: string, vendor?: string): Promise<AiProviderConnection[]> {
    return prisma.aiProviderConnection.findMany({
      where: { tenantId, isActive: true, ...(vendor ? { vendor } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async getForTenant(tenantId: string, id: string): Promise<AiProviderConnection | null> {
    return prisma.aiProviderConnection.findFirst({ where: { id, tenantId, isActive: true } });
  }

  /** Every active, credentialed connection due for a scheduled sync — any vendor except Anthropic (which has its own scheduler entry point). */
  async listDueForSync(vendor?: string): Promise<AiProviderConnection[]> {
    return prisma.aiProviderConnection.findMany({
      where: {
        vendor: vendor ? vendor : { not: "anthropic" },
        isActive: true,
        status: { in: ["connected", "error"] },
        encryptedCredential: { not: null },
      },
    });
  }

  async disconnect(id: string, tenantId: string): Promise<void> {
    await prisma.aiProviderConnection.updateMany({
      where: { id, tenantId },
      data: { isActive: false, status: "disconnected" },
    });
  }

  async rotateCredential(id: string, tenantId: string, credential: string): Promise<void> {
    await prisma.aiProviderConnection.updateMany({
      where: { id, tenantId },
      data: { encryptedCredential: encrypt(credential), status: "connected", lastSyncError: null },
    });
  }
}

export const providerConnectionService = new ProviderConnectionService();
export default providerConnectionService;
