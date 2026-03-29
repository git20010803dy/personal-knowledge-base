/**
 * review.ts - 复习相关 API 路由
 * GET  /api/review/stats       - 今日统计
 * GET  /api/review/categories  - 可用分类列表（从数据库读取）
 * GET  /api/review/start?category=历史 - 开始复习
 * POST /api/review/submit      - 提交答案
 * GET  /api/review/history     - 复习历史
 * POST /api/review/explain     - 复习追问（SSE 流式）
 * POST /api/review/extend/save - 保存延伸知识
 * 最后修改：2026-03-29 - 新增追问和延伸功能
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import { startReview, submitAnswer, getTodayStats, getReviewHistory } from '../services/reviewService';
import { getUsedCategories, getItemsWithoutQuestions, generateMissingQuestions } from '../services/reviewQuestionService';
import { getAllCategories } from '../services/categoryService';
import { getActiveLLMProvider, recordTokenUsage, estimateTokens } from '../services/llm/index';
import { getPromptByKey } from '../db/promptRepo';
import { getDb, saveDb } from '../db/database';

function sseWrite(reply: FastifyReply, data: object) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function reviewRoutes(app: FastifyInstance) {
  // Get today's review stats
  app.get('/api/review/stats', async (req, reply) => {
    try {
      const stats = await getTodayStats();
      return stats;
    } catch (error: any) {
      app.log.error(error, 'Failed to get review stats');
      return reply.status(500).send({ error: error.message || '获取复习统计失败' });
    }
  });

  // Get available categories for review (from database, with hasQuestions flag)
  app.get('/api/review/categories', async (req, reply) => {
    try {
      const [allCats, usedCats] = await Promise.all([
        getAllCategories(),
        getUsedCategories(),
      ]);
      // Return "全部" + database categories, mark which ones have questions
      const categories = [
        { name: '全部', hasQuestions: usedCats.length > 0 },
        ...allCats.map((c) => ({
          name: c.name,
          hasQuestions: usedCats.includes(c.name),
        })),
      ];
      return categories;
    } catch (error: any) {
      app.log.error(error, 'Failed to get categories');
      return reply.status(500).send({ error: error.message || '获取分类失败' });
    }
  });

  // Start a review session
  app.get('/api/review/start', async (req, reply) => {
    const query = req.query as { category?: string; count?: string };
    const count = parseInt(query.count || '10', 10);
    const category = query.category || undefined;

    try {
      const items = await startReview(count, category);
      return items;
    } catch (error: any) {
      app.log.error(error, 'Failed to start review');
      return reply.status(500).send({ error: error.message || '启动复习失败' });
    }
  });

  // Submit answer
  app.post('/api/review/submit', async (req, reply) => {
    const body = req.body as { question_id: string; item_id: string; selected_idx: number };

    if (!body.question_id || !body.item_id || body.selected_idx === undefined) {
      return reply.status(400).send({ error: 'question_id, item_id, and selected_idx are required' });
    }

    try {
      const result = await submitAnswer(body.question_id, body.item_id, body.selected_idx);
      return result;
    } catch (error: any) {
      app.log.error(error, 'Failed to submit answer');
      return reply.status(500).send({ error: error.message || '提交答案失败' });
    }
  });

  // Get review history (paginated)
  app.get('/api/review/history', async (req) => {
    const query = req.query as { page?: string; pageSize?: string };
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);

    const result = await getReviewHistory(page, pageSize);
    return {
      data: result.data,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    };
  });

  // Get count of items without review questions
  app.get('/api/review/missing', async () => {
    const items = await getItemsWithoutQuestions();
    return { count: items.length, items: items.slice(0, 5) };  // Return first 5 titles as preview
  });

  // Batch generate review questions for items that don't have them
  app.post('/api/review/generate', async (req, reply) => {
    try {
      const result = await generateMissingQuestions();
      return result;
    } catch (error: any) {
      app.log.error(error, 'Failed to generate review questions');
      return reply.status(500).send({ error: error.message || '生成题目失败' });
    }
  });

  // ─── 复习追问（SSE 流式）────────────────────────────────────────

  app.post('/api/review/explain', async (req, reply) => {
    const body = req.body as {
      question_id: string;
      item_id: string;
      messages: Array<{ role: string; content: string }>;
      context_type: 'explanation' | 'options' | 'extend';
      option_index?: number;
    };

    if (!body.question_id || !body.item_id || !body.messages?.length || !body.context_type) {
      return reply.status(400).send({ error: 'question_id, item_id, messages, and context_type are required' });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      // Load question data
      const db = await getDb();
      const qRes = db.exec(
        'SELECT question, options, correct_idx, explanation, category FROM review_questions WHERE id = ?',
        [body.question_id],
      );
      if (qRes.length === 0 || qRes[0].values.length === 0) {
        sseWrite(reply, { type: 'error', data: '题目不存在' });
        reply.raw.end();
        return;
      }

      const row = qRes[0].values[0];
      const question = row[0] as string;
      const options: string[] = JSON.parse(row[1] as string);
      const correctIdx = row[2] as number;
      const explanation = row[3] as string;

      // Load item data
      const itemRes = db.exec('SELECT title, content, raw_content FROM knowledge_items WHERE id = ?', [body.item_id]);
      const itemTitle = itemRes.length > 0 && itemRes[0].values.length > 0 ? (itemRes[0].values[0][0] as string) : '';
      const itemStructured = itemRes.length > 0 && itemRes[0].values.length > 0 ? (itemRes[0].values[0][1] as string || '') : '';

      // Context for prompt variable replacement
      // explain/options: use structured content for richer context
      // extend: use question + answer as the starting point
      const optionLetters = ['A', 'B', 'C', 'D'];
      const questionContext = `题目：${question}\n选项：${options.map((o, i) => `${optionLetters[i]}. ${o}`).join('\n')}\n正确答案：${optionLetters[correctIdx]}. ${options[correctIdx]}\n解释：${explanation || '无'}`;
      const itemContentForPrompt = body.context_type === 'extend'
        ? questionContext
        : itemStructured.substring(0, 1000);

      // Get prompt template from DB
      const promptKey = body.context_type === 'options' ? 'review_options'
        : body.context_type === 'extend' ? 'review_extend'
        : 'review_explain';

      let systemPrompt = '';
      const promptRecord = await getPromptByKey(promptKey);
      if (promptRecord) {
        systemPrompt = promptRecord.prompt;
        // Replace variables
        systemPrompt = systemPrompt.replace(/\{\{question\}\}/g, question);
        systemPrompt = systemPrompt.replace(/\{\{optionLetters\}\}/g, optionLetters[correctIdx]);
        systemPrompt = systemPrompt.replace(/\{\{correctOption\}\}/g, options[correctIdx] || '');
        systemPrompt = systemPrompt.replace(/\{\{explanation\}\}/g, explanation || '无');
        systemPrompt = systemPrompt.replace(/\{\{itemTitle\}\}/g, itemTitle);
        systemPrompt = systemPrompt.replace(/\{\{itemContent\}\}/g, itemContentForPrompt);

        if (body.context_type === 'options' && body.option_index !== undefined) {
          systemPrompt = systemPrompt.replace(/\{\{askedOptionLetter\}\}/g, optionLetters[body.option_index] || '');
          systemPrompt = systemPrompt.replace(/\{\{askedOptionText\}\}/g, options[body.option_index] || '');
        }
      } else {
        // Fallback prompts
        if (body.context_type === 'explanation') {
          systemPrompt = `你是一个知识库复习助手。用户正在复习一道选择题，对题目的解释有疑问，请进一步说明。\n\n题目：${question}\n正确答案：${['A','B','C','D'][correctIdx]}. ${options[correctIdx]}\n原始解释：${explanation || '无'}\n知识点标题：${itemTitle}\n\n请用简洁清晰的语言回答。保持在200字以内。`;
        } else if (body.context_type === 'options') {
          const optIdx = body.option_index ?? 0;
          systemPrompt = `你是一个知识库复习助手。用户想了解某个选项为什么对或错。\n\n题目：${question}\n正确答案：${['A','B','C','D'][correctIdx]}. ${options[correctIdx]}\n用户询问的选项：${['A','B','C','D'][optIdx]}. ${options[optIdx]}\n\n请解释这个选项。保持在150字以内。`;
        } else {
          systemPrompt = `你是一个知识库助手。用户希望了解更多背景知识。\n\n知识点：${itemTitle}\n原始内容：${itemContentForPrompt}\n\n请进行知识延伸，用Markdown格式，500字以内。`;
        }
      }

      // Build messages for LLM
      const llmMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...body.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      // Call LLM
      const info = await getActiveLLMProvider();
      const llm = info.provider;
      let fullContent = '';
      let usedFallback = false;
      let totalTokens = 0;
      const startTime = Date.now();

      try {
        for await (const token of llm.chatStream(llmMessages)) {
          fullContent += token;
          sseWrite(reply, { type: 'token', data: token });
        }
      } catch (streamErr: any) {
        app.log.warn(streamErr, 'Stream failed, falling back to non-stream');
        const response = await llm.chat(llmMessages);
        fullContent = response.content;
        usedFallback = true;
        sseWrite(reply, { type: 'token', data: fullContent });

        if (response.usage) {
          totalTokens = response.usage.totalTokens;
          recordTokenUsage({
            model: info.model,
            provider_name: info.providerName,
            prompt_tokens: response.usage.promptTokens,
            completion_tokens: response.usage.completionTokens,
            total_tokens: response.usage.totalTokens,
            call_type: promptKey,
          });
        }
      }

      const timeMs = Date.now() - startTime;

      // For streaming, estimate tokens
      if (!usedFallback) {
        const promptText = llmMessages.map((m) => m.content).join('\n');
        const estimatedPromptTokens = estimateTokens(promptText);
        const estimatedCompletionTokens = estimateTokens(fullContent);
        totalTokens = estimatedPromptTokens + estimatedCompletionTokens;
        recordTokenUsage({
          model: info.model,
          provider_name: info.providerName,
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: estimatedCompletionTokens,
          total_tokens: totalTokens,
          call_type: promptKey,
        });
      }

      // If extend, save to review_extensions
      if (body.context_type === 'extend' && fullContent) {
        const extId = nanoid();
        db.run(
          `INSERT INTO review_extensions (id, item_id, question_id, content, extension_type, tokens)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [extId, body.item_id, body.question_id, fullContent, 'background', totalTokens],
        );
        saveDb();
        sseWrite(reply, { type: 'done', data: { tokens: totalTokens, time_ms: timeMs, extension_id: extId } });
      } else {
        sseWrite(reply, { type: 'done', data: { tokens: totalTokens, time_ms: timeMs } });
      }

      reply.raw.end();
    } catch (err: any) {
      app.log.error(err, 'Review explain error');
      sseWrite(reply, { type: 'token', data: '抱歉，处理您的问题时出现了错误，请稍后重试。' });
      sseWrite(reply, { type: 'done', data: { error: true } });
      reply.raw.end();
    }
  });

  // ─── 保存延伸知识 ─────────────────────────────────────────────────

  app.post('/api/review/extend/save', async (req, reply) => {
    const body = req.body as {
      extension_id: string;
      action: 'append' | 'create';
    };

    if (!body.extension_id || !body.action) {
      return reply.status(400).send({ error: 'extension_id and action are required' });
    }

    try {
      const db = await getDb();

      // Get extension record
      const extRes = db.exec('SELECT * FROM review_extensions WHERE id = ?', [body.extension_id]);
      if (extRes.length === 0 || extRes[0].values.length === 0) {
        return reply.status(404).send({ error: '延伸记录不存在' });
      }

      const extRow = extRes[0].values[0];
      const itemId = extRow[1] as string;
      const content = extRow[3] as string;

      if (body.action === 'append') {
        // Append to existing knowledge item's content
        const itemRes = db.exec('SELECT content, raw_content FROM knowledge_items WHERE id = ?', [itemId]);
        if (itemRes.length > 0 && itemRes[0].values.length > 0) {
          const existingContent = itemRes[0].values[0][0] as string || '';
          let parsed: any;
          try {
            parsed = JSON.parse(existingContent);
            if (parsed && typeof parsed === 'object') {
              parsed._extensions = parsed._extensions || [];
              parsed._extensions.push({ content, saved_at: new Date().toISOString() });
              db.run('UPDATE knowledge_items SET content = ? WHERE id = ?', [JSON.stringify(parsed), itemId]);
            } else {
              throw new Error('not object');
            }
          } catch {
            // If content is not structured JSON, append as markdown
            const newContent = existingContent + '\n\n---\n## 延伸知识\n\n' + content;
            db.run('UPDATE knowledge_items SET content = ? WHERE id = ?', [newContent, itemId]);
          }
        }

        db.run('UPDATE review_extensions SET is_saved = 1, saved_item_id = ? WHERE id = ?', [itemId, body.extension_id]);
        saveDb();
        return { success: true, item_id: itemId, action: 'appended' };

      } else {
        // Create new knowledge item
        const newItemId = nanoid();
        const itemRes = db.exec('SELECT title, category FROM knowledge_items WHERE id = ?', [itemId]);
        const origTitle = itemRes.length > 0 && itemRes[0].values.length > 0 ? (itemRes[0].values[0][0] as string) : '未知';
        const origCategory = itemRes.length > 0 && itemRes[0].values.length > 0 ? (itemRes[0].values[0][1] as string) : null;

        const newTitle = `${origTitle} — 延伸知识`;
        const newContent = JSON.stringify({ summary: content, source_item_id: itemId });

        db.run(
          `INSERT INTO knowledge_items (id, title, content, raw_content, type, category)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [newItemId, newTitle, newContent, content, 'general', origCategory],
        );

        // Create link to original item
        const linkId = nanoid();
        db.run(
          `INSERT INTO knowledge_links (id, source_id, target_id, relation_type, strength)
           VALUES (?, ?, ?, ?, ?)`,
          [linkId, itemId, newItemId, '延伸', 0.8],
        );

        db.run('UPDATE review_extensions SET is_saved = 1, saved_item_id = ? WHERE id = ?', [newItemId, body.extension_id]);
        saveDb();
        return { success: true, item_id: newItemId, action: 'created' };
      }
    } catch (error: any) {
      app.log.error(error, 'Failed to save extension');
      return reply.status(500).send({ error: error.message || '保存失败' });
    }
  });
}
