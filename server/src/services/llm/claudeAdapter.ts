import type { LLMProvider, LLMCallOptions } from './provider';
import type { LLMMessage, LLMResponse } from '@pkb/shared';

export class ClaudeAdapter implements LLMProvider {
  constructor(private config: { apiKey: string; baseUrl: string; model: string }) {}

  async chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model || this.config.model,
        max_tokens: 4096,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.top_p,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.content?.[0]?.text ?? '',
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined,
    };
  }

  async *chatStream(messages: LLMMessage[], options?: LLMCallOptions): AsyncIterable<string> {
    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model || this.config.model,
        max_tokens: 4096,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.top_p,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.delta?.text;
            if (text) yield text;
          } catch { /* skip */ }
        }
      }
    }
  }

  async chatWithVision(messages: Array<{ role: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> }>): Promise<LLMResponse> {
    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content.map(c => {
            if (c.type === 'image_url' && c.image_url) {
              // Claude expects base64 images in a different format
              return { type: 'image', source: { type: 'url', url: c.image_url.url } };
            }
            return { type: 'text', text: c.text || '' };
          }),
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.content?.[0]?.text ?? '',
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined,
    };
  }
}
