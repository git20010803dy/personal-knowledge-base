import type { LLMMessage, LLMResponse, LLMConfig } from '@pkb/shared';

export interface LLMCallOptions {
  model?: string;
  temperature?: number;
  top_p?: number;
}

export interface LLMProvider {
  chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse>;
  chatStream(messages: LLMMessage[], options?: LLMCallOptions): AsyncIterable<string>;
  chatWithVision(messages: Array<{ role: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> }>): Promise<LLMResponse>;
}
