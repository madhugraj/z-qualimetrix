import { AssistantNotConfiguredError, type ModelProvider, type ProviderConfig } from './types';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';

export * from './types';

const PROVIDER_CLASSES: Record<string, new (config: ProviderConfig) => ModelProvider> = {
  anthropic: AnthropicProvider,
  openai: OpenAiProvider,
  gemini: GeminiProvider,
};

/**
 * Constructs the model provider from an already-resolved tenant credential
 * (assistant-provider-connection.service.ts.getConnection). Tenant-owned,
 * tenant-billed — there is no platform-wide fallback key; a tenant with no
 * connection configured simply can't use the assistant yet.
 */
export function buildModelProvider(provider: string, config: ProviderConfig): ModelProvider {
  const ProviderClass = PROVIDER_CLASSES[provider];
  if (!ProviderClass) {
    throw new AssistantNotConfiguredError(`Unknown assistant provider "${provider}" — expected "anthropic", "openai", or "gemini".`);
  }
  return new ProviderClass(config);
}
