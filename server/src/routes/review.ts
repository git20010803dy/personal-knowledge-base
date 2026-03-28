/**
 * review.ts - 复习相关 API 路由
 * GET  /api/review/stats       - 今日统计
 * GET  /api/review/categories  - 可用分类列表（从数据库读取）
 * GET  /api/review/start?category=历史 - 开始复习
 * POST /api/review/submit      - 提交答案
 * GET  /api/review/history     - 复习历史
 * 最后修改：2026-03-28 - 分类改为从 categories 表读取
 */
import type { FastifyInstance } from 'fastify';
import { startReview, submitAnswer, getTodayStats, getReviewHistory } from '../services/reviewService';
import { getUsedCategories, getItemsWithoutQuestions, generateMissingQuestions } from '../services/reviewQuestionService';
import { getAllCategories } from '../services/categoryService';

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
}
