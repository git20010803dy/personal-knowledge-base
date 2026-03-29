/**
 * ragService.ts - RAG 检索增强生成服务
 * 使用 jieba + FTS5 BM25 全文搜索
 * 最后修改：2026-03-29 - 替换 Embedding 向量搜索为 FTS5 全文搜索
 */
import { getDb, saveDb } from '../db/database';
import { search as ftsSearch, SearchResult } from './searchService';
import type { KnowledgeItem } from '@pkb/shared';

interface SimilarItem {
  id: string;
  title: string;
  content: string;
  raw_content: string;
  type: string;
  tags: string[];
  similarity: number; // 这里保留字段名兼容现有调用，实际是 BM25 score
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export class RagService {
  async searchSimilar(query: string, topK: number = 5): Promise<SimilarItem[]> {
    const db = await getDb();

    // FTS5 BM25 搜索（返回 id, title, score）
    const results = ftsSearch(query, topK);
    if (results.length === 0) return [];

    // 从主库获取完整数据
    const items: SimilarItem[] = [];
    for (const result of results) {
      const res = db.exec(
        'SELECT id, title, content, raw_content, type, tags FROM knowledge_items WHERE id = ?',
        [result.id]
      );
      if (res.length > 0 && res[0].values.length > 0) {
        const row = res[0].values[0];
        items.push({
          id: row[0] as string,
          title: row[1] as string,
          content: row[2] as string,
          raw_content: row[3] as string,
          type: row[4] as string,
          tags: JSON.parse((row[5] as string) || '[]'),
          similarity: result.score, // BM25 score（越小越相关）
        });
      }
    }

    return items;
  }

  async query(question: string): Promise<{
    answer: string;
    sources: Array<{ id: string; title: string }>;
    context: string;
  }> {
    // FTS5 全文搜索
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
