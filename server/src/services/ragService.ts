import OpenAI from 'openai';
import { getDb, saveDb } from '../db/database';
import { getActiveProvider } from '../db/providerRepo';
import type { KnowledgeItem } from '@pkb/shared';

interface SimilarItem {
  id: string;
  title: string;
  content: string;
  raw_content: string;
  type: string;
  tags: string[];
  similarity: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class RagService {
  private getClient(): OpenAI | null {
    return null; // placeholder
  }

  private async getEmbeddingClient(): Promise<{ client: OpenAI; model: string } | null> {
    const provider = await getActiveProvider();
    if (!provider) return null;
    const client = new OpenAI({
      apiKey: provider.api_key,
      baseURL: provider.base_url,
    });
    return { client, model: provider.model };
  }

  async embed(text: string): Promise<number[] | null> {
    const config = await this.getEmbeddingClient();
    if (!config) return null;

    try {
      // Use the embeddings endpoint of the configured provider
      const response = await config.client.embeddings.create({
        model: config.model,
        input: text,
      });
      return response.data[0].embedding;
    } catch (err: any) {
      console.warn('[RAG] Embedding failed, falling back to keyword search:', err.message);
      return null;
    }
  }

  async embedAndStore(itemId: string, text: string): Promise<void> {
    const embedding = await this.embed(text);
    if (!embedding) return;

    const db = await getDb();
    db.run('UPDATE knowledge_items SET embedding = ? WHERE id = ?', [
      JSON.stringify(embedding),
      itemId,
    ]);
    saveDb();
  }

  async searchSimilar(query: string, topK: number = 5): Promise<SimilarItem[]> {
    const db = await getDb();
    const queryEmbedding = await this.embed(query);

    // Get all knowledge items with embeddings
    const res = db.exec(
      'SELECT id, title, content, raw_content, type, tags, embedding FROM knowledge_items'
    );
    if (res.length === 0 || res[0].values.length === 0) return [];

    const allItems = res[0].values.map((row) => ({
      id: row[0] as string,
      title: row[1] as string,
      content: row[2] as string,
      raw_content: row[3] as string,
      type: row[4] as string,
      tags: JSON.parse((row[5] as string) || '[]'),
      embeddingStr: row[6] as string | null,
    }));

    if (queryEmbedding) {
      // Vector similarity search
      const scored = allItems
        .filter((item) => item.embeddingStr)
        .map((item) => {
          const emb = JSON.parse(item.embeddingStr!) as number[];
          return {
            id: item.id,
            title: item.title,
            content: item.content,
            raw_content: item.raw_content,
            type: item.type,
            tags: item.tags,
            similarity: cosineSimilarity(queryEmbedding, emb),
          };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

      // If vector search returned good results, use them
      if (scored.length > 0 && scored[0].similarity > 0.3) {
        return scored;
      }
    }

    // Fallback: keyword-based search using tags and title
    return this.keywordSearch(query, allItems, topK);
  }

  private keywordSearch(
    query: string,
    items: Array<{
      id: string;
      title: string;
      content: string;
      raw_content: string;
      type: string;
      tags: string[];
    }>,
    topK: number
  ): SimilarItem[] {
    const queryLower = query.toLowerCase();
    const queryChars = queryLower.split('');

    const scored = items.map((item) => {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const rawLower = (item.raw_content || '').toLowerCase();

      // Title match (highest weight)
      if (titleLower.includes(queryLower)) score += 10;
      // Raw content match
      if (rawLower.includes(queryLower)) score += 5;
      // Tag match
      for (const tag of item.tags) {
        if (queryLower.includes(tag.toLowerCase()) || tag.toLowerCase().includes(queryLower)) {
          score += 3;
        }
      }
      // Character-level overlap
      for (const char of queryChars) {
        if (titleLower.includes(char)) score += 0.5;
        if (rawLower.includes(char)) score += 0.2;
      }

      return {
        id: item.id,
        title: item.title,
        content: item.content,
        raw_content: item.raw_content,
        type: item.type,
        tags: item.tags,
        similarity: score,
      };
    });

    return scored
      .filter((s) => s.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  async query(question: string): Promise<{
    answer: string;
    sources: Array<{ id: string; title: string }>;
    context: string;
  }> {
    // Find similar items
    const similarItems = await this.searchSimilar(question, 5);

    if (similarItems.length === 0) {
      return {
        answer: '知识库中没有找到相关信息，请尝试其他问题。',
        sources: [],
        context: '',
      };
    }

    // Build context
    const contextParts = similarItems.map((item, i) => {
      const contentObj = item.content ? safeJsonParse(item.content) : null;
      const summary = contentObj?.summary || contentObj?.白话译文 || item.raw_content?.substring(0, 500) || '';
      return `[${i + 1}] 标题: ${item.title}\n类型: ${item.type}\n标签: ${item.tags.join(', ')}\n内容摘要: ${summary}`;
    });
    const context = contextParts.join('\n\n---\n\n');

    return {
      answer: '',
      sources: similarItems.map((item) => ({ id: item.id, title: item.title })),
      context,
    };
  }
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
