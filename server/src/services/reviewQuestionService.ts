/**
 * reviewQuestionService.ts - 题目预生成服务
 * 功能：LLM 生成选择题、存储到 review_questions 表、查询分类
 * 依赖：database, llm/index, categoryService
 * 最后修改：2026-03-28 - 分类改为从数据库读取，不再硬编码
 */
import { nanoid } from 'nanoid';
import { getDb, saveDb } from '../db/database';
import { getActiveLLMProvider, recordTokenUsage } from './llm/index';
import { getAllCategories } from './categoryService';
import type { KnowledgeItem } from '@pkb/shared';

export interface PreGeneratedQuestion {
  id: string;
  item_id: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  category: string;
}

// ─── Prompt ──────────────────────────────────────────────────────────

async function getChoicePrompt(item: KnowledgeItem): Promise<string> {
  const typeMap: Record<string, string> = {
    classical_chinese: '文言文',
    idiom: '成语',
    poetry: '诗词',
    general: '通用知识',
  };
  const typeName = typeMap[item.type] || '通用知识';

  let contentSummary = item.raw_content || item.title;
  try {
    if (item.content) {
      const parsed = JSON.parse(item.content);
      contentSummary = JSON.stringify(parsed, null, 2);
    }
  } catch {
    contentSummary = item.content || item.raw_content || item.title;
  }

  // 如果知识点已有类别，直接用，不在 prompt 中要求 LLM 判断
  const hasCategory = item.category && item.category.trim() !== '';

  let categorySection = '';
  let responseFormat = '';

  if (hasCategory) {
    categorySection = '';
    responseFormat = `请严格按照以下 JSON 格式返回，不要添加任何其他文字：
{
  "questions": [
    {
      "question": "题目文字",
      "options": ["选项A内容", "选项B内容", "选项C内容", "选项D内容"],
      "correct_idx": 0,
      "explanation": "为什么这个答案正确，简要说明"
    }
  ]
}`;
  } else {
    // 知识点无类别，让 LLM 判断
    const categories = await getAllCategories();
    const categoryNames = categories.map((c) => c.name).join('、');
    categorySection = `

领域分类（只能从以下列表中选一个）：${categoryNames}`;
    responseFormat = `请严格按照以下 JSON 格式返回，不要添加任何其他文字：
{
  "category": "领域分类",
  "questions": [
    {
      "question": "题目文字",
      "options": ["选项A内容", "选项B内容", "选项C内容", "选项D内容"],
      "correct_idx": 0,
      "explanation": "为什么这个答案正确，简要说明"
    }
  ]
}`;
  }

  return `你是一位知识复习出题专家。请根据以下${typeName}知识点，生成 3-5 道四选一选择题。

知识点标题：${item.title}
类型：${typeName}
内容：
${contentSummary}

出题要求：
- 每道题 4 个选项，只有 1 个正确答案
- 干扰项要有一定迷惑性，但不能模棱两可
- 题目应考查对知识点核心内容的理解${categorySection}

${responseFormat}`;
}

// ─── 生成并存储 ─────────────────────────────────────────────────────

export async function generateAndStoreQuestions(item: KnowledgeItem): Promise<PreGeneratedQuestion[]> {
  let info;
  try {
    info = await getActiveLLMProvider();
  } catch {
    console.warn('No LLM provider, skip review question generation for:', item.title);
    return [];
  }

  const llm = info.provider;
  const prompt = await getChoicePrompt(item);

  let response;
  try {
    response = await llm.chat([
      { role: 'system', content: '你是出题助手，只输出 JSON。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.7 });
  } catch (e) {
    console.error('LLM call failed for review questions:', e);
    return [];
  }

  // Record token usage
  if (response.usage) {
    recordTokenUsage({
      model: info.model,
      provider_name: info.providerName,
      prompt_tokens: response.usage.promptTokens,
      completion_tokens: response.usage.completionTokens,
      total_tokens: response.usage.totalTokens,
      call_type: 'review_generate',
    });
  }

  // Parse
  let text = response.content.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  let parsed: { category?: string; questions?: Array<{ question: string; options: string[]; correct_idx: number; explanation: string }> };

  try {
    parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.questions)) return [];
  } catch {
    console.error('Failed to parse review questions JSON for:', item.title);
    return [];
  }

  // 优先用知识点自身的类别；无类别时才用 LLM 的判断
  const dbCategories = await getAllCategories();
  const validNames = dbCategories.map((c) => c.name);
  const hasItemCategory = item.category && item.category.trim() !== '';
  const category = hasItemCategory
    ? item.category!
    : (validNames.includes(parsed.category || '') ? parsed.category! : '其他');

  // Validate & store
  const db = await getDb();
  const stored: PreGeneratedQuestion[] = [];

  for (const q of parsed.questions.slice(0, 5)) {
    if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) continue;
    if (typeof q.correct_idx !== 'number' || q.correct_idx < 0 || q.correct_idx > 3) continue;

    const id = nanoid();
    db.run(
      `INSERT INTO review_questions (id, item_id, question, options, correct_idx, explanation, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, item.id, q.question, JSON.stringify(q.options), q.correct_idx, q.explanation || '', category],
    );

    stored.push({
      id,
      item_id: item.id,
      question: q.question,
      options: q.options,
      correct_idx: q.correct_idx,
      explanation: q.explanation || '',
      category,
    });
  }

  if (stored.length > 0) {
    saveDb();
  }

  return stored;
}

// ─── 查询 ───────────────────────────────────────────────────────────

export async function getQuestionsForItem(itemId: string): Promise<PreGeneratedQuestion[]> {
  const db = await getDb();
  const res = db.exec(
    'SELECT id, item_id, question, options, correct_idx, explanation, category FROM review_questions WHERE item_id = ?',
    [itemId],
  );

  if (res.length === 0) return [];

  return res[0].values.map((row) => ({
    id: row[0] as string,
    item_id: row[1] as string,
    question: row[2] as string,
    options: JSON.parse(row[3] as string),
    correct_idx: row[4] as number,
    explanation: row[5] as string,
    category: (row[6] as string) || '其他',
  }));
}

/**
 * 获取已有题目中实际用到的分类（只返回有题目的分类）
 */
export async function getUsedCategories(): Promise<string[]> {
  const db = await getDb();
  const res = db.exec('SELECT DISTINCT category FROM review_questions WHERE category IS NOT NULL ORDER BY category');
  if (res.length === 0 || res[0].values.length === 0) return [];
  return res[0].values.map((row) => row[0] as string);
}

/**
 * 获取还没有生成题目的知识条目
 */
export async function getItemsWithoutQuestions(): Promise<Array<{ id: string; title: string; type: string }>> {
  const db = await getDb();
  const res = db.exec(
    `SELECT ki.id, ki.title, ki.type FROM knowledge_items ki
     LEFT JOIN review_questions rq ON ki.id = rq.item_id
     WHERE rq.id IS NULL`,
  );
  if (res.length === 0) return [];
  return res[0].values.map((row) => ({
    id: row[0] as string,
    title: row[1] as string,
    type: row[2] as string,
  }));
}

/**
 * 为所有缺少题目的知识点批量生成复习题
 * @returns { generated: number, failed: number, total: number }
 */
export async function generateMissingQuestions(): Promise<{ generated: number; failed: number; total: number }> {
  const items = await getItemsWithoutQuestions();
  let generated = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const db = await getDb();
      const res = db.exec('SELECT * FROM knowledge_items WHERE id = ?', [item.id]);
      if (res.length === 0 || res[0].values.length === 0) continue;

      const row = res[0].values[0];
      const knowledgeItem = {
        id: row[0] as string,
        title: row[1] as string,
        content: row[2] as string,
        raw_content: row[3] as string,
        type: row[4] as any,
        tags: JSON.parse((row[5] as string) || '[]'),
        category: row[6] as string | null,
        source_file: row[7] as string | null,
        created_at: row[8] as string,
        updated_at: row[9] as string,
      };

      const questions = await generateAndStoreQuestions(knowledgeItem);
      if (questions.length > 0) {
        generated++;
      } else {
        failed++;
      }
    } catch (e) {
      console.error(`Failed to generate questions for: ${item.title}`, e);
      failed++;
    }
  }

  return { generated, failed, total: items.length };
}
