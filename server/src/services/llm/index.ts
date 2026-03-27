import type { LLMProvider } from './provider';
import { OpenAIAdapter } from './openaiAdapter';
import { ClaudeAdapter } from './claudeAdapter';
import { getActiveProvider } from '../../db/providerRepo';
import { insertUsage } from '../../db/tokenRepo';
import { config } from '../../config';

export type { LLMProvider } from './provider';
export { OpenAIAdapter } from './openaiAdapter';
export { ClaudeAdapter } from './claudeAdapter';

export interface ProviderConfig {
  provider_type: 'openai' | 'claude' | 'custom';
  api_key: string;
  base_url: string;
  model: string;
}

export interface ActiveProviderInfo {
  provider: LLMProvider;
  model: string;
  providerName: string;
}

export function createProvider(pConfig: ProviderConfig): LLMProvider {
  switch (pConfig.provider_type) {
    case 'claude':
      return new ClaudeAdapter({
        apiKey: pConfig.api_key,
        baseUrl: pConfig.base_url,
        model: pConfig.model,
      });
    case 'openai':
    case 'custom':
    default:
      return new OpenAIAdapter({
        apiKey: pConfig.api_key,
        baseUrl: pConfig.base_url,
        model: pConfig.model,
      });
  }
}

export async function getActiveLLMProvider(): Promise<ActiveProviderInfo> {
  const dbProvider = await getActiveProvider();
  if (dbProvider) {
    return {
      provider: createProvider({
        provider_type: dbProvider.provider_type,
        api_key: dbProvider.api_key,
        base_url: dbProvider.base_url,
        model: dbProvider.model,
      }),
      model: dbProvider.model,
      providerName: dbProvider.name,
    };
  }
  // Fallback to .env config
  if (config.llm.apiKey) {
    return {
      provider: new OpenAIAdapter(config.llm),
      model: config.llm.model,
      providerName: 'env-config',
    };
  }
  throw new Error('No LLM provider configured. Please add one in 模型配置 or set LLM_API_KEY in .env');
}

/**
 * Record token usage to the database.
 * Fire-and-forget: logs errors but does not throw.
 */
export async function recordTokenUsage(opts: {
  model: string;
  provider_name?: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  call_type: string;
}): Promise<void> {
  try {
    await insertUsage(opts);
  } catch (err) {
    console.error('[TokenUsage] Failed to record:', err);
  }
}

/**
 * Estimate token count from text (rough: ~4 chars per token for mixed CJK/English).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // CJK characters are roughly 1 token each, English ~4 chars per token
  const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length || 0;
  const otherChars = text.length - cjkChars;
  return Math.ceil(cjkChars + otherChars / 4);
}
