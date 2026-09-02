/**
 * Per-tenant LLM connection for the PM/Leadership analytics assistant —
 * same shape as github-token.service.ts (encrypted-at-rest, validated live
 * before save, decrypted only when actually used). Tenant-owned and
 * tenant-billed: there is no platform-wide fallback key.
 */
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt, maskToken } from '../../lib/encryption';
import { buildModelProvider, AssistantNotConfiguredError, type ProviderConfig } from './assistant-providers';

const prisma = new PrismaClient();

const VALID_PROVIDERS = ['anthropic', 'openai', 'gemini'];

interface SaveConnectionInput {
  tenantId: string;
  userId: string;
  provider: string;
  apiKey: string;
  modelId?: string;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Every vendor SDK's error `.message` is either already a clean sentence or
 * a stringified JSON error body (e.g. Gemini's `{"error":{"message":"..."}}`)
 * — extract just the human-readable part so a PM configuring this doesn't
 * see a raw JSON blob for a simple "wrong key" mistake.
 */
function cleanErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw.replace(/^\d+\s*/, ''));
    return parsed?.error?.message ?? parsed?.message ?? raw;
  } catch {
    return raw;
  }
}

/** Cheap, real one-token probe call — same spirit as github-token.service.ts's live GET /user check. */
async function validateKey(provider: string, apiKey: string, modelId?: string): Promise<ValidationResult> {
  try {
    const model = buildModelProvider(provider, { apiKey, modelId });
    await model.respond({ system: 'Reply with the single word "ok".', messages: [{ role: 'user', content: 'ping' }], tools: [] });
    return { isValid: true };
  } catch (error) {
    if (error instanceof AssistantNotConfiguredError) return { isValid: false, error: error.message };
    return { isValid: false, error: error instanceof Error ? cleanErrorMessage(error.message) : 'Could not verify this key with the provider' };
  }
}

export async function saveConnection(input: SaveConnectionInput): Promise<{ success: boolean; message: string }> {
  const { tenantId, userId, provider, apiKey, modelId } = input;
  if (!VALID_PROVIDERS.includes(provider)) {
    return { success: false, message: `Unknown provider "${provider}" — expected anthropic, openai, or gemini.` };
  }

  const validation = await validateKey(provider, apiKey, modelId);
  if (!validation.isValid) {
    return { success: false, message: validation.error || 'That key could not be verified with the provider.' };
  }

  const encryptedApiKey = encrypt(apiKey);
  const data = { provider, encryptedApiKey, modelId, lastValidated: new Date(), isActive: true };

  await prisma.assistantProviderConnection.upsert({
    where: { tenantId },
    update: data,
    create: { ...data, tenantId, createdBy: userId },
  });

  return { success: true, message: `${provider} connected for the analytics assistant.` };
}

export async function getConnection(tenantId: string): Promise<ProviderConfig & { provider: string }> {
  const connection = await prisma.assistantProviderConnection.findUnique({ where: { tenantId, isActive: true } });
  if (!connection) {
    throw new AssistantNotConfiguredError('No LLM provider connected for this organization yet — ask a PM to connect one in Settings → AI Providers.');
  }

  await prisma.assistantProviderConnection.update({ where: { tenantId }, data: { lastUsed: new Date() } });

  return { provider: connection.provider, apiKey: decrypt(connection.encryptedApiKey), modelId: connection.modelId ?? undefined };
}

export async function getStatus(tenantId: string) {
  const connection = await prisma.assistantProviderConnection.findUnique({ where: { tenantId } });
  if (!connection || !connection.isActive) return { isConnected: false as const };

  return {
    isConnected: true as const,
    provider: connection.provider,
    maskedApiKey: maskToken(decrypt(connection.encryptedApiKey)),
    modelId: connection.modelId,
    lastValidated: connection.lastValidated?.toISOString(),
    lastUsed: connection.lastUsed?.toISOString(),
  };
}

export async function deleteConnection(tenantId: string): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.assistantProviderConnection.delete({ where: { tenantId } });
    return { success: true, message: 'Assistant provider connection removed.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to remove connection' };
  }
}
