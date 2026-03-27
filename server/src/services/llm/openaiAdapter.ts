import OpenAI from 'openai';
import type { LLMMessage, LLMResponse, LLMConfig } from '@pkb/shared';
import type { LLMProvider, LLMCallOptions } from './provider';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAIAdapter implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(private config: LLMConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model;
  }

  async chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7,
        top_p: options?.top_p,
      });

      const choice = response.choices[0];
      return {
        content: choice.message.content || '',
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    });
  }

  async *chatStream(messages: LLMMessage[], options?: LLMCallOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: options?.model || this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      top_p: options?.top_p,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  async chatWithVision(
    messages: Array<{ role: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> }>
  ): Promise<LLMResponse> {
    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any,
        max_tokens: 4096,
      });

      const choice = response.choices[0];
      return {
        content: choice.message.content || '',
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Handle rate limiting
        if (error.status === 429) {
          const retryAfter = error.headers?.['retry-after'];
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY_MS * attempt;
          console.warn(`[LLM] Rate limited. Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }

        // Handle server errors
        if (error.status >= 500) {
          console.warn(`[LLM] Server error ${error.status}. Retrying (attempt ${attempt}/${MAX_RETRIES})`);
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }

        // Non-retryable error
        throw error;
      }
    }

    throw lastError || new Error('LLM request failed after retries');
  }
}
