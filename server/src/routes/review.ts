import type { FastifyInstance } from 'fastify';
import { startReview, submitAnswer, getTodayStats, getReviewHistory } from '../services/reviewService';

export async function reviewRoutes(app: FastifyInstance) {
  // Start a review session
  app.post('/api/review/start', async (req, reply) => {
    const body = (req.body || {}) as { count?: number };
    const count = body.count || 10;

    try {
      const items = await startReview(count);
      return { data: items };
    } catch (error: any) {
      app.log.error(error, 'Failed to start review');
      return reply.status(500).send({ error: error.message || '启动复习失败' });
    }
  });

  // Submit answer for a review question
  app.post('/api/review/submit', async (req, reply) => {
    const body = req.body as { review_id: string; question_index?: number; user_answer: string };

    if (!body.review_id || !body.user_answer) {
      return reply.status(400).send({ error: 'review_id and user_answer are required' });
    }

    try {
      const result = await submitAnswer(body.review_id, body.user_answer);
      return result;
    } catch (error: any) {
      app.log.error(error, 'Failed to submit answer');
      return reply.status(500).send({ error: error.message || '提交答案失败' });
    }
  });

  // Get today's review stats
  app.get('/api/review/today', async (req, reply) => {
    try {
      const stats = await getTodayStats();
      return stats;
    } catch (error: any) {
      app.log.error(error, 'Failed to get review stats');
      return reply.status(500).send({ error: error.message || '获取复习统计失败' });
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
