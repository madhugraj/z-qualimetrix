import OpenAI from 'openai';
import type { ChatCompletionMessageFunctionToolCall, ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions';
import { AssistantNotConfiguredError, type ModelProvider, type NeutralMessage, type ProviderConfig, type ProviderResponse, type ToolSchema } from './types';

function toOpenAiMessages(system: string, messages: NeutralMessage[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') {
      result.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant' && 'content' in m) {
      result.push({ role: 'assistant', content: m.content });
    } else if (m.role === 'assistant' && 'toolCalls' in m) {
      result.push({
        role: 'assistant',
        content: null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });
    } else if (m.role === 'tool_result') {
      result.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return result;
}

function isFunctionToolCall(tc: { type: string }): tc is ChatCompletionMessageFunctionToolCall {
  return tc.type === 'function';
}

export class OpenAiProvider implements ModelProvider {
  readonly vendor = 'OpenAI';
  readonly modelId: string;
  private client: OpenAI;

  constructor({ apiKey, modelId }: ProviderConfig) {
    if (!apiKey || !apiKey.startsWith('sk-')) {
      throw new AssistantNotConfiguredError('That key does not look like a real OpenAI key (expected sk-...).');
    }
    this.client = new OpenAI({ apiKey });
    this.modelId = modelId ?? 'gpt-5.1';
  }

  async respond({ system, messages, tools }: { system: string; messages: NeutralMessage[]; tools: ToolSchema[] }): Promise<ProviderResponse> {
    const response = await this.client.chat.completions.create({
      model: this.modelId,
      messages: toOpenAiMessages(system, messages),
      tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    });

    const choice = response.choices[0];
    const toolCalls = (choice.message.tool_calls ?? [])
      .filter(isFunctionToolCall)
      .map((tc) => ({ id: tc.id, name: tc.function.name, args: safeJsonParse(tc.function.arguments) }));

    return {
      toolCalls,
      text: choice.message.content ?? '',
      usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
    };
  }
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}
