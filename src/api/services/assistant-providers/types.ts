/**
 * Vendor-neutral types for the PM/Leadership analytics assistant's LLM
 * layer. Tool-calling is structurally the same concept across Anthropic,
 * OpenAI, and Gemini — each just wants a JSON-schema tool list and returns
 * "call this function with these args" instead of text. The valuable,
 * safety-critical part (the tool catalog + tenant scoping in
 * assistant-tools.service.ts) is 100% vendor-neutral; only the ~request/
 * response shape differs, which is what these adapters translate.
 */

export interface ToolSchema {
  name: string;
  description: string;
  /** Plain JSON Schema object, e.g. { type: 'object', properties: {...} }. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type NeutralMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'assistant'; toolCalls: ToolCall[] }
  | { role: 'tool_result'; toolCallId: string; toolName: string; content: string };

export interface ProviderResponse {
  /** Empty when the model is done and `text` holds the final answer. */
  toolCalls: ToolCall[];
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ModelProvider {
  readonly modelId: string;
  /** Matches the `vendor` hint passed to ensureModelCatalogEntry for cost lookup. */
  readonly vendor: string;
  respond(params: { system: string; messages: NeutralMessage[]; tools: ToolSchema[] }): Promise<ProviderResponse>;
}

/** Tenant-supplied credential, decrypted from AssistantProviderConnection — never read from process.env. */
export interface ProviderConfig {
  apiKey: string;
  modelId?: string;
}

export class AssistantNotConfiguredError extends Error {}
