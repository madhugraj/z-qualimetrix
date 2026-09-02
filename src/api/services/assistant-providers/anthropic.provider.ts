import Anthropic from '@anthropic-ai/sdk';
import { AssistantNotConfiguredError, type ModelProvider, type NeutralMessage, type ProviderConfig, type ProviderResponse, type ToolSchema } from './types';

function toAnthropicMessages(messages: NeutralMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      result.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant' && 'content' in m) {
      result.push({ role: 'assistant', content: m.content });
    } else if (m.role === 'assistant' && 'toolCalls' in m) {
      result.push({
        role: 'assistant',
        content: m.toolCalls.map((tc) => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })),
      });
    } else if (m.role === 'tool_result') {
      const block: Anthropic.ToolResultBlockParam = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      // Anthropic expects consecutive tool results grouped into one user
      // message with multiple tool_result blocks, not one message per result.
      const last = result[result.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) {
        (last.content as Anthropic.ToolResultBlockParam[]).push(block);
      } else {
        result.push({ role: 'user', content: [block] });
      }
    }
  }
  return result;
}

export class AnthropicProvider implements ModelProvider {
  readonly vendor = 'Anthropic';
  readonly modelId: string;
  private client: Anthropic;

  constructor({ apiKey, modelId }: ProviderConfig) {
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      throw new AssistantNotConfiguredError('That key does not look like a real Anthropic key (expected sk-ant-...).');
    }
    this.client = new Anthropic({ apiKey });
    this.modelId = modelId ?? 'claude-sonnet-5';
  }

  async respond({ system, messages, tools }: { system: string; messages: NeutralMessage[]; tools: ToolSchema[] }): Promise<ProviderResponse> {
    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 2048,
      system,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })),
      messages: toAnthropicMessages(messages),
    });

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, args: (b.input ?? {}) as Record<string, unknown> }));
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return {
      toolCalls,
      text,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}
