/**
 * PM/Leadership analytics assistant — chat orchestration. This is the first
 * backend code in this app that calls an LLM to power a feature (as opposed
 * to `AiUsageEvent`/`AiProviderConnection`, which only track a tenant's own
 * usage of AI coding tools). The underlying model is each tenant's own
 * connection (assistant-provider-connection.service.ts — encrypted API key,
 * PM-configured from Settings, tenant-billed). There is no platform-wide
 * fallback key: a tenant with no connection simply can't use the assistant
 * yet, rather than silently billing the platform.
 *
 * No streaming for V1 — this app has no existing SSE/WebSocket
 * infrastructure anywhere; the whole tool-use loop runs server-side and
 * returns one JSON response.
 */
import prisma from '../../lib/prisma';
import { AuthenticatedUser, ScopeError } from '../middleware/auth.middleware';
import { getToolSchemas, executeAssistantTool } from './assistant-tools.service';
import { ensureModelCatalogEntry } from '../../lib/ai-usage.server';
import { getConnection } from './assistant-provider-connection.service';
import { buildModelProvider, AssistantNotConfiguredError, type ModelProvider, type NeutralMessage, type ToolCall } from './assistant-providers';

export { AssistantNotConfiguredError };

const MAX_TOOL_ROUNDS = 4;
const HISTORY_TURNS = 40;

const SYSTEM_PROMPT = `You are the QualiMetrix analytics assistant, available only to PM and Leadership/executive users.

Rules:
- Answer ONLY using data returned by your tools. Never estimate, guess, or fill in a plausible-sounding number.
- If a tool result has "hasData": false, or is empty/null/zero because nothing has synced yet, say plainly that the data isn't available — do not invent a number to fill the gap.
- Every tool is already scoped to the caller's own organization; you never need to (and cannot) ask for a tenant id.
- Be concise and quantitative. Cite the actual figures the tools returned.
- If a question needs a specific product and none was given, ask which product, or call the tenant-wide tool if one exists and that's a reasonable reading of the question.`;

export class RateLimitError extends Error {}

// Simple in-memory per-tenant token bucket. No rate-limit middleware exists
// anywhere in this app yet; this is deliberately minimal (single-process,
// resets on restart) — enough to bound external API cost exposure for V1.
const RATE_LIMIT_PER_HOUR = Number(process.env.ASSISTANT_RATE_LIMIT_PER_HOUR ?? 20);
const requestLog = new Map<string, number[]>();

function checkRateLimit(tenantId: string) {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const timestamps = (requestLog.get(tenantId) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_PER_HOUR) {
    throw new RateLimitError(`Rate limit reached (${RATE_LIMIT_PER_HOUR} messages/hour for your organization). Try again later.`);
  }
  timestamps.push(now);
  requestLog.set(tenantId, timestamps);
}

// Matches the pricing conventions already used elsewhere in this codebase
// (openai-usage-sync.service.ts, vertex-ai-usage-sync.service.ts) — $ per
// million tokens. Placeholders until an admin verifies actual negotiated
// rates, same caveat ensureModelCatalogEntry already documents.
const DEFAULT_PRICING: Record<string, { priceIn: number; priceOut: number }> = {
  Anthropic: { priceIn: 3, priceOut: 15 },
  OpenAI: { priceIn: 2.5, priceOut: 10 },
  Google: { priceIn: 1.25, priceOut: 5 },
};

async function costFor(provider: ModelProvider, inputTokens: number, outputTokens: number): Promise<number> {
  const pricing = DEFAULT_PRICING[provider.vendor] ?? { priceIn: 3, priceOut: 15 };
  await ensureModelCatalogEntry(provider.modelId, { vendor: provider.vendor, ...pricing });
  const catalog = await prisma.aiModelCatalog.findFirst({ where: { modelId: provider.modelId, tenantId: null } });
  if (!catalog) return 0;
  return (inputTokens / 1_000_000) * Number(catalog.priceIn) + (outputTokens / 1_000_000) * Number(catalog.priceOut);
}

export async function listConversations(user: AuthenticatedUser) {
  if (!user.tenantId) throw new ScopeError('No tenant associated with this account');
  return prisma.chatConversation.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { startedBy: { select: { id: true, name: true, email: true } } },
  });
}

async function loadOwnedConversation(user: AuthenticatedUser, conversationId: string) {
  if (!user.tenantId) throw new ScopeError('No tenant associated with this account');
  const conversation = await prisma.chatConversation.findFirst({ where: { id: conversationId, tenantId: user.tenantId } });
  if (!conversation) throw new ScopeError('Conversation not found');
  return conversation;
}

export async function getConversationMessages(user: AuthenticatedUser, conversationId: string) {
  await loadOwnedConversation(user, conversationId);
  return prisma.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
}

export async function createConversation(user: AuthenticatedUser) {
  if (!user.tenantId) throw new ScopeError('No tenant associated with this account');
  return prisma.chatConversation.create({ data: { tenantId: user.tenantId, startedByUserId: user.id } });
}

export async function sendMessage(user: AuthenticatedUser, conversationId: string, content: string) {
  if (!user.tenantId) throw new ScopeError('No tenant associated with this account');
  checkRateLimit(user.tenantId);
  const conversation = await loadOwnedConversation(user, conversationId);
  // Fail fast on a missing/misconfigured connection before writing anything
  // — avoids leaving a dangling user message with no assistant reply.
  const { provider: providerName, apiKey, modelId } = await getConnection(user.tenantId);
  const provider = buildModelProvider(providerName, { apiKey, modelId });

  const priorMessages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: HISTORY_TURNS,
  });

  await prisma.chatMessage.create({
    data: { conversationId, tenantId: user.tenantId, userId: user.id, role: 'user', content },
  });

  const messages: NeutralMessage[] = [
    ...priorMessages.map((m): NeutralMessage => (m.role === 'user' ? { role: 'user', content: m.content } : { role: 'assistant', content: m.content })),
    { role: 'user', content },
  ];

  const toolCallLog: Array<{ tool: string; args: unknown; resultSummary: string }> = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalText = "I wasn't able to finish answering within the tool-call budget for this request — try narrowing the question.";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await provider.respond({ system: SYSTEM_PROMPT, messages, tools: getToolSchemas() });
    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    if (response.toolCalls.length === 0) {
      finalText = response.text;
      break;
    }

    messages.push({ role: 'assistant', toolCalls: response.toolCalls });
    for (const call of response.toolCalls) {
      const resultPayload = await runTool(call, user);
      toolCallLog.push({ tool: call.name, args: call.args, resultSummary: JSON.stringify(resultPayload).slice(0, 500) });
      messages.push({ role: 'tool_result', toolCallId: call.id, toolName: call.name, content: JSON.stringify(resultPayload) });
    }
  }

  const costUsd = await costFor(provider, totalInputTokens, totalOutputTokens);

  const assistantMessage = await prisma.chatMessage.create({
    data: {
      conversationId,
      tenantId: user.tenantId,
      role: 'assistant',
      content: finalText,
      toolCalls: toolCallLog.length > 0 ? (toolCallLog as any) : undefined,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd,
    },
  });

  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date(), title: conversation.title ?? content.slice(0, 60) },
  });

  return assistantMessage;
}

async function runTool(call: ToolCall, user: AuthenticatedUser): Promise<unknown> {
  try {
    return await executeAssistantTool(call.name, call.args, user);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Tool execution failed' };
  }
}
