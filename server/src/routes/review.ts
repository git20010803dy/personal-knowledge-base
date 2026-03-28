/**
 * review.ts - 复习相关 API 路由
 * GET  /api/review/stats    - 今日统计
 * GET  /api/review/categories - 可用分类列表
 * GET  /api/review/start?category=历史 - 开始复习
 * POST /api/review/submit   - 提交答案
 * GET  /api/review/history  - 复习历史
 * 最后修改：2026-03-28 - 改为 category 筛选
 */
import type { FastifyInstance } from 'fastify';
import { startReview, submitAnswer, getTodayStats, getReviewHistory } from '../services/reviewService';
import { getUsedCategories, REVIEW_CATEGORIES } from '../services/reviewQuestionService';

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

  // Get available categories (fixed list + which ones have questions)
  app.get('/api/review/categories', async (req, reply) => {
    try {
      const used = await getUsedCategories();
      // Return all fixed categories, mark which ones have questions
      const categories = REVIEW_CATEGORIES.map((c) => ({
        name: c,
        hasQuestions: used.includes(c),
      }));
      return categories;
    } catch (error: any) {
      app.log.error(error, 'Failed to get categories');
      return reply.status(500).send({ error: error.message || '获取分类失败' });
    }
  });

  // Start a review session (GET with optional ?category=历史)
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
}
