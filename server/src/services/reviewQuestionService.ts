/**
 * reviewQuestionService.ts - 题目预生成服务
 * 功能：LLM 生成选择题、存储到 review_questions 表、查询分类
 * 依赖：database, llm/index
 * 最后修改：2026-03-28 - 新增固定分类字段，替代动态 tags
 */
import { nanoid } from 'nanoid';
import { getDb, saveDb } from '../db/database';
import { getActiveLLMProvider, recordTokenUsage } from './llm/index';
import type { KnowledgeItem } from '@pkb/shared';

// ─── 固定分类枚举 ─────────────────────────────────────────────────────

export const REVIEW_CATEGORIES = [
  '历史', '地理', '文学', '成语', '诗词',
  '哲学', '科学', '数码', '常识', '其他',
] as const;

export type ReviewCategory = typeof REVIEW_CATEGORIES[number];

export interface PreGeneratedQuestion {
  id: string;
  item_id: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  category: ReviewCategory;
}

// ─── Prompt ──────────────────────────────────────────────────────────

function getChoicePrompt(item: KnowledgeItem): string {
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

  return `你是一位知识复习出题专家。请根据以下${typeName}知识点，生成 3-5 道四选一选择题，并判断该知识点的领域分类。

知识点标题：${item.title}
类型：${typeName}
内容：
${contentSummary}

出题要求：
- 每道题 4 个选项，只有 1 个正确答案
- 干扰项要有一定迷惑性，但不能模棱两可
- 题目应考查对知识点核心内容的理解

领域分类（只能选一个）：历史、地理、文学、成语、诗词、哲学、科学、数码、常识、其他

请严格按照以下 JSON 格式返回，不要添加任何其他文字：
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
  const prompt = getChoicePrompt(item);

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

  // Validate category
  const category: ReviewCategory = REVIEW_CATEGORIES.includes(parsed.category as ReviewCategory)
    ? (parsed.category as ReviewCategory)
    : '其他';

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
    category: (row[6] as ReviewCategory) || '其他',
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
