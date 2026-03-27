import type { FastifyInstance } from 'fastify';
import { getDailyStats, getDateRange, getTotalStats, getSummary } from '../db/tokenRepo';

export async function tokenRoutes(app: FastifyInstance) {
  // GET /api/tokens/today — today's usage stats
  app.get('/api/tokens/today', async () => {
    const stats = await getDailyStats();
    return { data: stats };
  });

  // GET /api/tokens/range?start=2026-03-20&end=2026-03-27 — range query
  app.get('/api/tokens/range', async (req) => {
    const query = req.query as { start?: string; end?: string };
    const today = new Date().toISOString().slice(0, 10);
    const start = query.start || today;
    const end = query.end || today;
    const data = await getDateRange(start, end);
    return { data };
  });

  // GET /api/tokens/summary — last 7 days summary
  app.get('/api/tokens/summary', async () => {
    const data = await getSummary();
    return { data };
  });

  // GET /api/tokens/total — overall totals
  app.get('/api/tokens/total', async () => {
    const data = await getTotalStats();
    return { data };
  });
}
