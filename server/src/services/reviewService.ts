/**
 * reviewService.ts - 复习核心逻辑
 * 功能：SM-2间隔计算、从预生成题库读题、提交判分
 * 依赖：reviewQuestionService, database
 * 最后修改：2026-03-28 - 改为按固定 category 筛选，从 review_questions 表读题
 */
import { nanoid } from 'nanoid';
import { getDb, saveDb } from '../db/database';
import type { ReviewStats } from '@pkb/shared';
import type { PreGeneratedQuestion, ReviewCategory } from './reviewQuestionService';

// ─── SM-2 Spaced Repetition ───────────────────────────────────────────

export function calculateNextReview(
  isCorrect: boolean,
  currentInterval: number,
): { interval: number; nextReview: string } {
  let interval: number;

  if (isCorrect) {
    interval = Math.min(currentInterval * 2.5, 365);
  } else {
    interval = 1;
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + Math.round(interval));
  nextReview.setHours(0, 0, 0, 0);

  return { interval, nextReview: nextReview.toISOString() };
}

// ─── Get due item IDs ────────────────────────────────────────────────

export async function getDueItems(
  count: number = 10,
  category?: string,
): Promise<string[]> {
  const db = await getDb();

  let sql = `
    SELECT DISTINCT rq.item_id FROM review_questions rq
    LEFT JOIN (
      SELECT item_id, MAX(next_review) as max_next
      FROM review_records
      WHERE user_answer IS NOT NULL
      GROUP BY item_id
    ) rr ON rq.item_id = rr.item_id
    WHERE (rr.max_next IS NULL OR rr.max_next <= datetime('now'))
  `;
  const params: any[] = [];

  if (category && category !== '全部') {
    sql += ` AND rq.category = ?`;
    params.push(category);
  }

  sql += ` ORDER BY COALESCE(rr.max_next, rq.created_at) ASC LIMIT ?`;
  params.push(count);

  const res = db.exec(sql, params);
  if (res.length === 0) return [];

  return [...new Set(res[0].values.map((row) => row[0] as string))];
}

// ─── Start review ────────────────────────────────────────────────────

export interface ReviewSessionItem {
  item_id: string;
  item_title: string;
  questions: PreGeneratedQuestion[];
}

export async function startReview(
  count: number = 10,
  category?: string,
): Promise<ReviewSessionItem[]> {
  const db = await getDb();
  const itemIds = await getDueItems(count, category);
  if (itemIds.length === 0) return [];

  const results: ReviewSessionItem[] = [];

  for (const itemId of itemIds) {
    const itemRes = db.exec('SELECT title FROM knowledge_items WHERE id = ?', [itemId]);
    if (itemRes.length === 0 || itemRes[0].values.length === 0) continue;
    const itemTitle = itemRes[0].values[0][0] as string;

    let qSql = 'SELECT id, item_id, question, options, correct_idx, explanation, category FROM review_questions WHERE item_id = ?';
    const qParams: any[] = [itemId];

    if (category && category !== '全部') {
      qSql += ' AND category = ?';
      qParams.push(category);
    }

    const qRes = db.exec(qSql, qParams);
    if (qRes.length === 0 || qRes[0].values.length === 0) continue;

    const questions: PreGeneratedQuestion[] = qRes[0].values.map((row) => ({
      id: row[0] as string,
      item_id: row[1] as string,
      question: row[2] as string,
      options: JSON.parse(row[3] as string),
      correct_idx: row[4] as number,
      explanation: row[5] as string,
      category: (row[6] as ReviewCategory) || '其他',
    }));

    results.push({ item_id: itemId, item_title: itemTitle, questions });
  }

  return results;
}

// ─── Submit answer ───────────────────────────────────────────────────

export async function submitAnswer(
  questionId: string,
  itemId: string,
  selectedIdx: number,
): Promise<{ correct: boolean; correct_idx: number; explanation: string; next_review: string }> {
  const db = await getDb();

  const qRes = db.exec(
    'SELECT correct_idx, explanation FROM review_questions WHERE id = ?',
    [questionId],
  );

  if (qRes.length === 0 || qRes[0].values.length === 0) {
    throw new Error('Question not found');
  }

  const correctIdx = qRes[0].values[0][0] as number;
  const explanation = (qRes[0].values[0][1] as string) || '';
  const isCorrect = selectedIdx === correctIdx;

  const rrRes = db.exec(
    'SELECT interval_days FROM review_records WHERE item_id = ? ORDER BY created_at DESC LIMIT 1',
    [itemId],
  );
  const currentInterval =
    rrRes.length > 0 && rrRes[0].values.length > 0
      ? (rrRes[0].values[0][0] as number) || 1
      : 1;

  const { interval, nextReview } = calculateNextReview(isCorrect, currentInterval);

  const recordId = nanoid();
  db.run(
    `INSERT INTO review_records (id, item_id, question_id, question, answer, user_answer, is_correct, score, next_review, interval_days, review_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [recordId, itemId, questionId, '', String(correctIdx), String(selectedIdx), isCorrect ? 1 : 0, isCorrect ? 100 : 0, nextReview, interval],
  );
  saveDb();

  return { correct: isCorrect, correct_idx: correctIdx, explanation, next_review: nextReview };
}

// ─── Review Stats ─────────────────────────────────────────────────────

export async function getTodayStats(): Promise<ReviewStats> {
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const dueRes = db.exec(
    `SELECT COUNT(DISTINCT rq.item_id) FROM review_questions rq
     LEFT JOIN (
       SELECT item_id, MAX(next_review) as max_next
       FROM review_records WHERE user_answer IS NOT NULL
       GROUP BY item_id
     ) rr ON rq.item_id = rr.item_id
     WHERE rr.max_next IS NULL OR rr.max_next <= datetime('now')`,
  );
  const dueCount = dueRes.length > 0 ? (dueRes[0].values[0][0] as number) : 0;

  const completedRes = db.exec(
    'SELECT COUNT(*) FROM review_records WHERE created_at >= ? AND user_answer IS NOT NULL',
    [todayStr],
  );
  const completedToday = completedRes.length > 0 ? (completedRes[0].values[0][0] as number) : 0;

  const correctRes = db.exec(
    'SELECT COUNT(*) FROM review_records WHERE created_at >= ? AND is_correct = 1',
    [todayStr],
  );
  const correctCount = correctRes.length > 0 ? (correctRes[0].values[0][0] as number) : 0;
  const accuracyRate = completedToday > 0 ? Math.round((correctCount / completedToday) * 100) : 0;

  let streak = 0;
  const checkDate = new Date(today);
  for (let i = 0; i < 365; i++) {
    const dayStart = new Date(checkDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(checkDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dayRes = db.exec(
      'SELECT COUNT(*) FROM review_records WHERE user_answer IS NOT NULL AND created_at >= ? AND created_at <= ?',
      [dayStart.toISOString(), dayEnd.toISOString()],
    );
    const dayCount = dayRes.length > 0 ? (dayRes[0].values[0][0] as number) : 0;

    if (dayCount > 0) {
      streak++;
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
