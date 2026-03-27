import { nanoid } from 'nanoid';
import type { LLMProvider } from './llm/provider';
import { OpenAIAdapter } from './llm/openaiAdapter';
import { createProvider, getActiveLLMProvider, recordTokenUsage } from './llm';
import type { ActiveProviderInfo } from './llm';
import { getActiveProvider } from '../db/providerRepo';
import { getBuiltInTemplates, detectType, renderTemplate, parseJsonResponse } from './promptEngine';
import { config } from '../config';
import type {
  KnowledgeItem,
  KnowledgeType,
  ProcessingResult,
  UploadedFile,
  KnowledgeLink,
} from '@pkb/shared';
import type { KnowledgeRepository } from '../db/knowledgeRepo';
import type { TemplateRepository } from '../db/templateRepo';
import { getDb, saveDb } from '../db/database';

const RELATION_TYPES = ['相关', '包含', '因果', '对比', '同源'] as const;

interface LinkSuggestion {
  target_title: string;
  relation_type: string;
  strength: number;
  reason?: string;
}

/**
 * Gets the active LLM provider from DB, falling back to .env config
 */
export { getActiveLLMProvider } from './llm';

// Re-export LLMCallOptions for local use
import type { LLMCallOptions } from '@pkb/shared';

export class KnowledgeService {
  private llm: LLMProvider | null;
  private repo: KnowledgeRepository;
  private templateRepo: TemplateRepository;

  constructor(llm: LLMProvider | null, repo: KnowledgeRepository, templateRepo: TemplateRepository) {
    this.llm = llm;
    this.repo = repo;
    this.templateRepo = templateRepo;
  }

  /**
   * Gets the LLM provider info, preferring DB-configured provider over constructor arg
   */
  private async getLLM(): Promise<ActiveProviderInfo> {
    try {
      return await getActiveLLMProvider();
    } catch {
      // If no DB provider and no .env config, fall back to constructor arg
      if (this.llm) return { provider: this.llm, model: config.llm.model, providerName: 'fallback' };
      throw new Error('No LLM provider available');
    }
  }

  async initTemplates(): Promise<void> {
    const builtIns = getBuiltInTemplates();
    for (const tmpl of builtIns) {
      const existing = await this.templateRepo.findByType(tmpl.type);
      if (!existing) {
        await this.templateRepo.create(tmpl);
      }
    }
  }

  async processTextInput(rawContent: string, type?: KnowledgeType, options?: LLMCallOptions): Promise<ProcessingResult> {
    const info = await this.getLLM();
    const llm = info.provider;
    const detectedType = type || detectType(rawContent);
    const template = await this.templateRepo.findByType(detectedType);

    // Truncate for LLM if too long (keep within context window limits)
    const MAX_LLM_INPUT = 8000; // ~2000 tokens safety margin
    const llmInput = rawContent.length > MAX_LLM_INPUT
      ? rawContent.substring(0, MAX_LLM_INPUT) + '\n\n[...内容过长，已截断...]'
      : rawContent;

    const templateStr = template?.template || getBuiltInTemplates().find((t) => t.type === detectedType)?.template || '';
    const prompt = renderTemplate(templateStr, { raw_content: llmInput });

    const response = await llm.chat([{ role: 'user', content: prompt }], options);

    // Record token usage
    if (response.usage) {
      recordTokenUsage({
        model: options?.model || info.model,
        provider_name: info.providerName,
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens: response.usage.totalTokens,
        call_type: 'knowledge_process',
      });
    }

    const parsed = parseJsonResponse(response.content);

    // Always preserve the full original text, not the truncated version
    if (parsed.original_text && rawContent.length > MAX_LLM_INPUT) {
      parsed.original_text = rawContent;
    }

    return {
      title: (parsed.title as string) || rawContent.substring(0, 50),
      type: detectedType,
      content: parsed,
      tags: (parsed.tags as string[]) || [],
      category: (parsed.category as string) || null,
      keywords: (parsed.keywords as string[]) || [],
    };
  }

  /**
   * Pre-analyze input to detect if it contains multiple distinct knowledge items.
   * Returns an array of { content, suggested_type? } for each split piece.
   */
  async splitKnowledge(rawContent: string, options?: LLMCallOptions): Promise<Array<{ content: string; suggested_type?: string }>> {
    // Skip splitting for short inputs
    if (rawContent.length < 200) return [{ content: rawContent }];

    const { provider: llm, model, providerName } = await this.getLLM();

    const prompt = `你是一个知识分析助手。请判断以下输入内容是否包含多个独立的知识点。

输入内容：
${rawContent.substring(0, 3000)}

判断规则：
1. 如果内容围绕同一个主题（如同一首诗的赏析、同一篇文章的翻译），返回 false
2. 如果内容包含明显不同的主题（如历史事件 + 英语语法、两首不同的诗），返回 true

请以 JSON 格式返回（不要包含 markdown 代码块标记）：
{
  "should_split": true/false,
  "pieces": [
    {"content": "第一个知识点的完整内容", "suggested_type": "general"},
    {"content": "第二个知识点的完整内容", "suggested_type": "idiom"}
  ]
}

suggested_type 可选值：classical_chinese, idiom, poetry, general。如果不确定就用 general。
如果 should_split 为 false，pieces 只返回一个元素（原始完整内容）。`;

    try {
      const response = await llm.chat([{ role: 'user', content: prompt }], options);

      if (response.usage) {
        recordTokenUsage({
          model: options?.model || model,
          provider_name: providerName,
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
          call_type: 'knowledge_process',
        });
      }

      const parsed = parseJsonResponse(response.content);

      if (parsed.should_split && Array.isArray(parsed.pieces) && parsed.pieces.length > 1) {
        return (parsed.pieces as Array<{ content: string; suggested_type?: string }>).filter(
          (p) => p.content && p.content.trim().length > 10,
        );
      }
    } catch (e) {
      console.error('Split analysis failed, treating as single item:', e);
    }

    return [{ content: rawContent }];
  }

  async processAndStore(
    rawContent: string,
    type?: KnowledgeType,
    title?: string,
    options?: LLMCallOptions,
  ): Promise<{ item: KnowledgeItem; processingResult: ProcessingResult }> {
    const processingResult = await this.processTextInput(rawContent, type, options);

    const item: Omit<KnowledgeItem, 'created_at' | 'updated_at'> = {
      id: nanoid(),
      title: title || processingResult.title,
      content: JSON.stringify(processingResult.content),
      raw_content: rawContent,
      type: processingResult.type,
      tags: processingResult.tags,
      category: processingResult.category,
      source_file: null,
    };

    const created = await this.repo.create(item);

    // Sync features to clustering_features table
    try {
      const db = await getDb();
      db.run(
        'INSERT OR REPLACE INTO clustering_features (item_id, keywords, tags, category, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [
          created.id,
          JSON.stringify(processingResult.keywords),
          JSON.stringify(processingResult.tags),
          processingResult.category,
        ],
      );
      saveDb();
    } catch (e) {
      console.error('Failed to sync clustering features:', e);
    }

    return { item: created, processingResult };
  }

  async processFileAndStore(
    file: UploadedFile,
    type?: KnowledgeType,
    options?: LLMCallOptions,
  ): Promise<{ item: KnowledgeItem; processingResult: ProcessingResult }> {
    // Extract text content from file
    let rawContent: string;
    if (file.mimetype.startsWith('text/') || file.filename.endsWith('.md')) {
      rawContent = Buffer.from(file.buffer).toString('utf-8');
    } else {
      rawContent = `[文件: ${file.filename}]`;
    }

    const detectedType = type || detectType(rawContent);
    const { item, processingResult } = await this.processAndStore(rawContent, detectedType, undefined, options);

    // Update with source file info
    await this.repo.update(item.id, { source_file: file.filename });

    return { item, processingResult };
  }

  /**
   * Use LLM to find links between a knowledge item and existing items.
   * Limits to top 50 most recent items for efficiency.
   */
  async findLinksForItem(
    item: KnowledgeItem,
    allItems?: Array<{ id: string; title: string; type: string }>,
  ): Promise<LinkSuggestion[]> {
    const info = await this.getLLM();
    const llm = info.provider;

    // Get existing items if not provided - limit to 50 most recent
    const existingItems = allItems || (await this.repo.getAllTitles()).slice(0, 50);

    if (existingItems.length === 0) return [];

    // Filter out the item itself
    const candidates = existingItems.filter((i) => i.id !== item.id);
    if (candidates.length === 0) return [];

    const itemContent = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);

    const prompt = `你是一个知识关联分析专家。请分析以下新知识条目与已有知识条目之间的关联。

## 新知识条目
标题: ${item.title}
类型: ${item.type}
标签: ${JSON.stringify(item.tags)}
内容摘要: ${itemContent.substring(0, 500)}

## 已有知识条目列表
${candidates.map((c, i) => `${i + 1}. [${c.type}] ${c.title}`).join('\n')}

## 关联类型说明
- 相关: 有主题或内容上的关联
- 包含: 一个概念包含另一个概念
- 因果: 存在因果关系
- 对比: 可以进行对比分析
- 同源: 来源相同或出自同一出处

请以 JSON 数组格式返回关联分析结果，每个元素包含:
- target_title: 已有条目标题（必须与上面列表中的标题完全一致）
- relation_type: 关联类型（必须是：相关/包含/因果/对比/同源 之一）
- strength: 关联强度（0.1-1.0 之间的小数）
- reason: 关联原因（简短说明）

只返回确实有关联的条目，如果没有关联则返回空数组 []。直接返回 JSON，不要加任何额外说明。`;

    try {
      const response = await llm.chat([{ role: 'user', content: prompt }]);
      const parsed = parseJsonResponse(response.content);

      // Record token usage
      if (response.usage) {
        recordTokenUsage({
          model: info.model,
          provider_name: info.providerName,
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
          call_type: 'link_recognition',
        });
      }

      if (Array.isArray(parsed)) {
        return parsed.filter(
          (s) =>
            s.target_title &&
            s.relation_type &&
            RELATION_TYPES.includes(s.relation_type) &&
            typeof s.strength === 'number',
        ) as LinkSuggestion[];
      }
      return [];
    } catch (error) {
      console.error('Failed to find links:', error);
      return [];
    }
  }

  /**
   * Store link suggestions in the database
   */
  async storeLinks(sourceId: string, suggestions: LinkSuggestion[]): Promise<KnowledgeLink[]> {
    const db = await getDb();
    const links: KnowledgeLink[] = [];

    // Get item IDs for target titles
    const allItems = await this.repo.getAllTitles();
    const titleToId = new Map(allItems.map((i) => [i.title, i.id]));

    for (const suggestion of suggestions) {
      const targetId = titleToId.get(suggestion.target_title);
      if (!targetId || targetId === sourceId) continue;

      // Check if link already exists (either direction)
      const existing = db.exec(
        'SELECT id FROM knowledge_links WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)',
        [sourceId, targetId, targetId, sourceId],
      );
      if (existing.length > 0 && existing[0].values.length > 0) continue;

      const linkId = nanoid();
      db.run(
        'INSERT INTO knowledge_links (id, source_id, target_id, relation_type, strength) VALUES (?, ?, ?, ?, ?)',
        [linkId, sourceId, targetId, suggestion.relation_type, suggestion.strength],
      );

      links.push({
        id: linkId,
        source_id: sourceId,
        target_id: targetId,
        relation_type: suggestion.relation_type,
        strength: suggestion.strength,
        created_at: new Date().toISOString(),
      });
    }

    if (links.length > 0) {
      saveDb();
    }

    return links;
  }

  /**
   * Process, store, AND find links in one flow
   */
  async processStoreAndLink(
    rawContent: string,
    type?: KnowledgeType,
    title?: string,
    options?: LLMCallOptions,
  ): Promise<{ item: KnowledgeItem; processingResult: ProcessingResult; links: KnowledgeLink[] }> {
    const { item, processingResult } = await this.processAndStore(rawContent, type, title, options);

    // Find links asynchronously (don't block the response)
    let links: KnowledgeLink[] = [];
    try {
      const suggestions = await this.findLinksForItem(item);
      links = await this.storeLinks(item.id, suggestions);
    } catch (error) {
      console.error('Link recognition failed (non-blocking):', error);
    }

    return { item, processingResult, links };
  }

  /**
   * Process with auto-split: first analyze if input contains multiple topics,
   * split if needed, process each individually, and link related pieces.
   */
  async processStoreAndSplit(
    rawContent: string,
    type?: KnowledgeType,
    title?: string,
    options?: LLMCallOptions,
  ): Promise<{ items: KnowledgeItem[]; processingResults: ProcessingResult[]; totalLinks: KnowledgeLink[] }> {
    // Step 1: Try to split
    const pieces = await this.splitKnowledge(rawContent, options);

    const items: KnowledgeItem[] = [];
    const processingResults: ProcessingResult[] = [];
    const totalLinks: KnowledgeLink[] = [];

    // Step 2: Process each piece independently
    for (const piece of pieces) {
      const pieceType = type || (piece.suggested_type as KnowledgeType) || undefined;
      const { item, processingResult, links } = await this.processStoreAndLink(
        piece.content,
        pieceType,
        pieces.length === 1 ? title : undefined, // Only use custom title for single items
        options,
      );
      items.push(item);
      processingResults.push(processingResult);
      totalLinks.push(...links);
    }

    // Step 3: If multiple pieces were split, create links between them (related)
    if (items.length > 1) {
      const db = await getDb();
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const linkId = nanoid();
          db.run(
            'INSERT INTO knowledge_links (id, source_id, target_id, relation_type, strength) VALUES (?, ?, ?, ?, ?)',
            [linkId, items[i].id, items[j].id, '相关', 0.8],
          );
          totalLinks.push({
            id: linkId,
            source_id: items[i].id,
            target_id: items[j].id,
            relation_type: '相关',
            strength: 0.8,
            created_at: new Date().toISOString(),
          });
        }
      }
      saveDb();
    }

    return { items, processingResults, totalLinks };
  }
}
