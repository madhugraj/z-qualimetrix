import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { AssistantNotConfiguredError, type ModelProvider, type NeutralMessage, type ProviderConfig, type ProviderResponse, type ToolSchema } from './types';

function toGeminiContents(messages: NeutralMessage[]): Content[] {
  const result: Content[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      result.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant' && 'content' in m) {
      result.push({ role: 'model', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant' && 'toolCalls' in m) {
      result.push({
        role: 'model',
        parts: m.toolCalls.map((tc): Part => ({ functionCall: { id: tc.id, name: tc.name, args: tc.args } })),
      });
    } else if (m.role === 'tool_result') {
      const part: Part = { functionResponse: { id: m.toolCallId, name: m.toolName, response: { output: safeJsonParse(m.content) } } };
      // Gemini expects consecutive function responses grouped into one
      // "user" content with multiple parts, same shape as the request.
      const last = result[result.length - 1];
      if (last?.role === 'user' && last.parts?.every((p) => 'functionResponse' in p)) {
        last.parts.push(part);
      } else {
        result.push({ role: 'user', parts: [part] });
      }
    }
  }
  return result;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class GeminiProvider implements ModelProvider {
  readonly vendor = 'Google';
  readonly modelId: string;
  private client: GoogleGenAI;

  constructor({ apiKey, modelId }: ProviderConfig) {
    if (!apiKey || !apiKey.startsWith('AIza')) {
      throw new AssistantNotConfiguredError('That key does not look like a real Gemini key (expected AIza...).');
    }
    this.client = new GoogleGenAI({ apiKey });
    this.modelId = modelId ?? 'gemini-2.5-flash';
  }

  async respond({ system, messages, tools }: { system: string; messages: NeutralMessage[]; tools: ToolSchema[] }): Promise<ProviderResponse> {
    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents: toGeminiContents(messages),
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
      },
    });

    const toolCalls = (response.functionCalls ?? []).map((c) => ({
      id: c.id ?? crypto.randomUUID(),
      name: c.name ?? '',
      args: c.args ?? {},
    }));

    return {
      toolCalls,
      text: response.text ?? '',
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
