import { nanoid } from 'nanoid';
import { getDb, saveDb } from '../db/database';
import { getActiveLLMProvider, recordTokenUsage } from './llm/index';
import type { ActiveProviderInfo } from './llm/index';
import type { LLMProvider } from './llm/provider';
import type { KnowledgeItem, ReviewQuestion, ReviewItem, ReviewStats } from '@pkb/shared';

// ─── SM-2 Spaced Repetition ───────────────────────────────────────────

export function calculateNextReview(
  isCorrect: boolean,
  currentInterval: number,
  reviewCount: number,
): { interval: number; nextReview: string } {
  let interval: number;

  if (isCorrect) {
    interval = Math.min(currentInterval * 2.5, 365);
  } else {
    interval = 1; // reset to 1 day
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + Math.round(interval));
  nextReview.setHours(0, 0, 0, 0);

  return { interval, nextReview: nextReview.toISOString() };
}

// ─── Question Generation ──────────────────────────────────────────────

function getQuestionPrompt(item: KnowledgeItem): string {
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

  return `你是一位知识复习出题专家。请根据以下${typeName}知识点，生成 3-5 道复习题目。

知识点标题：${item.title}
类型：${typeName}
内容：
${contentSummary}

出题要求：
- 文言文：出翻译题和字词解释题
- 成语：出填空题和选择释义题
- 诗词：出默写题和赏析问答题
- 通用知识：出关键词匹配题和简答题

每道题必须包含以下字段：
- type: 题目类型，只能是 "choice"（选择题）、"fill"（填空题）、"essay"（简答题）之一
- question: 题目文字
- answer: 正确答案
- options: 如果是选择题，提供 4 个选项（数组），其中一个是正确答案

请严格按照以下 JSON 格式返回，不要添加任何其他文字：
[
  {
    "type": "choice",
    "question": "...",
    "answer": "...",
    "options": ["A...", "B...", "C...", "D..."]
  }
]`;
}

async function generateQuestionsForItem(
  info: ActiveProviderInfo,
  item: KnowledgeItem,
): Promise<ReviewQuestion[]> {
  const llm = info.provider;
  const prompt = getQuestionPrompt(item);
  const response = await llm.chat([
    { role: 'system', content: '你是出题助手，只输出 JSON 数组。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.7 });

  // Record token usage
  if (response.usage) {
    recordTokenUsage({
      model: info.model,
      provider_name: info.providerName,
      prompt_tokens: response.usage.promptTokens,
      completion_tokens: response.usage.completionTokens,
      total_tokens: response.usage.totalTokens,
      call_type: 'review',
    });
  }

  // Parse JSON from response
  let text = response.content.trim();
  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    const questions = JSON.parse(text);
    if (Array.isArray(questions)) {
      return questions.slice(0, 5).map((q) => ({
        question: q.question || '',
        answer: q.answer || '',
        type: q.type || 'essay',
        options: q.options || undefined,
      }));
    }
  } catch {
    // fallback: generate simple questions manually
  }

  // Fallback: simple questions if LLM output fails to parse
  return [
    {
      question: `请简要说明「${item.title}」的含义。`,
      answer: item.raw_content?.slice(0, 200) || '见知识库原文',
      type: 'essay' as const,
    },
  ];
}

export async function generateQuestions(item: KnowledgeItem): Promise<ReviewQuestion[]> {
  const info = await getActiveLLMProvider();
  return generateQuestionsForItem(info, item);
}

// ─── Review Workflow ──────────────────────────────────────────────────

export async function getDueItems(count: number = 10): Promise<KnowledgeItem[]> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Items due for review: have a review_record with next_review <= now
  // Also include items that have NEVER been reviewed
  const res = db.exec(
    `SELECT ki.* FROM knowledge_items ki
     LEFT JOIN (
       SELECT item_id, MIN(next_review) as min_next
       FROM review_records
       GROUP BY item_id
     ) rr ON ki.id = rr.item_id
     WHERE rr.min_next IS NULL OR rr.min_next <= ?
     ORDER BY COALESCE(rr.min_next, ki.created_at) ASC
     LIMIT ?`,
    [now, count],
  );

  if (res.length === 0) return [];

  return res[0].values.map((row) => ({
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
  }));
}

export async function startReview(count: number = 10): Promise<ReviewItem[]> {
  const items = await getDueItems(count);
  if (items.length === 0) return [];

  const llm = await getActiveLLMProvider();
  const db = await getDb();
  const reviewItems: ReviewItem[] = [];

  for (const item of items) {
    let questions: ReviewQuestion[];
    try {
      questions = await generateQuestionsForItem(llm, item);
    } catch {
      // Fallback if LLM fails
      questions = [
        {
          question: `请简要说明「${item.title}」的含义。`,
          answer: item.raw_content?.slice(0, 200) || '见知识库原文',
          type: 'essay' as const,
        },
      ];
    }

    // Store each question as a review_record
    for (const q of questions) {
      const id = nanoid();
      db.run(
        `INSERT INTO review_records (id, item_id, question, answer, next_review, interval_days, review_count)
         VALUES (?, ?, ?, ?, ?, 1, 0)`,
        [id, item.id, q.question, q.answer, new Date().toISOString()],
      );
    }
    saveDb();

    reviewItems.push({
      item_id: item.id,
      item_title: item.title,
      questions,
    });
  }

  return reviewItems;
}

export async function submitAnswer(
  reviewId: string,
  userAnswer: string,
): Promise<{ correct: boolean; correct_answer: string; explanation: string; next_review: string }> {
  const db = await getDb();
  const res = db.exec('SELECT * FROM review_records WHERE id = ?', [reviewId]);

  if (res.length === 0 || res[0].values.length === 0) {
    throw new Error('Review record not found');
  }

  const row = res[0].values[0];
  const correctAnswer = (row[3] as string) || '';
  const currentInterval = (row[8] as number) || 1;
  const reviewCount = (row[9] as number) || 0;

  // Simple answer matching: normalize whitespace and case
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  const isCorrect = normalize(userAnswer) === normalize(correctAnswer);

  // Or for essay type: if user answer contains key parts of correct answer (>30% overlap)
  const question = row[2] as string;
  let correct = isCorrect;
  if (!correct && correctAnswer.length > 10) {
    // Check if it's an essay - be more lenient
    const userWords = new Set(userAnswer.replace(/[，。、！？：；""''（）\s]/g, '').split(''));
    const correctWords = new Set(correctAnswer.replace(/[，。、！？：；""''（）\s]/g, '').split(''));
    let overlap = 0;
    for (const w of userWords) {
      if (correctWords.has(w)) overlap++;
    }
    const ratio = correctWords.size > 0 ? overlap / correctWords.size : 0;
    if (ratio > 0.3) correct = true;
  }

  const { interval, nextReview } = calculateNextReview(correct, currentInterval, reviewCount);

  // Update review record
  db.run(
    `UPDATE review_records SET user_answer = ?, is_correct = ?, score = ?, next_review = ?, interval_days = ?, review_count = review_count + 1
     WHERE id = ?`,
    [userAnswer, correct ? 1 : 0, correct ? 100 : 0, nextReview, interval, reviewId],
  );
  saveDb();

  return {
    correct,
    correct_answer: correctAnswer,
    explanation: correct ? '回答正确！间隔已延长。' : '回答有误，下次复习间隔已重置为 1 天。',
    next_review: nextReview,
  };
}

// ─── Review Stats ─────────────────────────────────────────────────────

export async function getTodayStats(): Promise<ReviewStats> {
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  // Due count: items where next_review <= now (or never reviewed)
  const dueRes = db.exec(
    `SELECT COUNT(DISTINCT ki.id) FROM knowledge_items ki
     LEFT JOIN (
       SELECT item_id, MIN(next_review) as min_next
       FROM review_records
       GROUP BY item_id
     ) rr ON ki.id = rr.item_id
     WHERE rr.min_next IS NULL OR rr.min_next <= datetime('now')`,
  );
  const dueCount = dueRes.length > 0 ? (dueRes[0].values[0][0] as number) : 0;

  // Completed today
  const completedRes = db.exec(
    `SELECT COUNT(*) FROM review_records
     WHERE created_at >= ? AND user_answer IS NOT NULL`,
    [todayStr],
  );
  const completedToday = completedRes.length > 0 ? (completedRes[0].values[0][0] as number) : 0;

  // Accuracy rate (today)
  const correctRes = db.exec(
    `SELECT COUNT(*) FROM review_records
     WHERE created_at >= ? AND is_correct = 1`,
    [todayStr],
  );
  const correctCount = correctRes.length > 0 ? (correctRes[0].values[0][0] as number) : 0;
  const accuracyRate = completedToday > 0 ? Math.round((correctCount / completedToday) * 100) : 0;

  // Streak: count consecutive days with at least 1 review
  let streak = 0;
  const checkDate = new Date(today);
  for (let i = 0; i < 365; i++) {
    const dayStart = new Date(checkDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(checkDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dayRes = db.exec(
      `SELECT COUNT(*) FROM review_records
       WHERE user_answer IS NOT NULL AND created_at >= ? AND created_at <= ?`,
      [dayStart.toISOString(), dayEnd.toISOString()],
    );
    const dayCount = dayRes.length > 0 ? (dayRes[0].values[0][0] as number) : 0;

    if (dayCount > 0) {
      streak++;
    } else if (streak > 0) {
      break;
    } else {
      break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return {
    due_count: dueCount,
    completed_today: completedToday,
    accuracy_rate: accuracyRate,
    streak_days: streak,
  };
}

// ─── Review History ───────────────────────────────────────────────────

export async function getReviewHistory(
  page: number = 1,
  pageSize: number = 20,
): Promise<{ data: any[]; total: number }> {
  const db = await getDb();

  const countRes = db.exec('SELECT COUNT(*) FROM review_records WHERE user_answer IS NOT NULL');
  const total = countRes.length > 0 ? (countRes[0].values[0][0] as number) : 0;

  const res = db.exec(
    `SELECT rr.id, rr.item_id, ki.title, rr.question, rr.answer, rr.user_answer,
            rr.is_correct, rr.score, rr.next_review, rr.interval_days, rr.review_count, rr.created_at
     FROM review_records rr
     LEFT JOIN knowledge_items ki ON rr.item_id = ki.id
     WHERE rr.user_answer IS NOT NULL
     ORDER BY rr.created_at DESC
     LIMIT ? OFFSET ?`,
    [pageSize, (page - 1) * pageSize],
  );

  const data =
    res.length > 0
      ? res[0].values.map((row) => ({
          id: row[0],
          item_id: row[1],
          item_title: row[2],
          question: row[3],
          answer: row[4],
          user_answer: row[5],
          is_correct: row[6] === 1,
          score: row[7],
          next_review: row[8],
          interval_days: row[9],
          review_count: row[10],
          created_at: row[11],
        }))
      : [];

  return { data, total };
}
