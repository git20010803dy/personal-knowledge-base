/**
 * categories.ts - 分类管理 API 路由
 * GET    /api/categories      - 获取所有分类
 * POST   /api/categories      - 新增分类
 * PUT    /api/categories/:id  - 修改分类
 * DELETE /api/categories/:id  - 删除分类
 * 最后修改：2026-03-28 - 新建
 */
import type { FastifyInstance } from 'fastify';
import { getAllCategories, createCategory, updateCategory, deleteCategory } from '../services/categoryService';

export async function categoryRoutes(app: FastifyInstance) {
  // Get all categories
  app.get('/api/categories', async () => {
    return getAllCategories();
  });

  // Create category
  app.post('/api/categories', async (req, reply) => {
    const body = req.body as { name: string; sort_order?: number };
    if (!body.name?.trim()) {
      return reply.status(400).send({ error: '分类名称不能为空' });
    }
    try {
      const cat = await createCategory(body.name.trim(), body.sort_order);
      return cat;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // Update category
  app.put('/api/categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name: string; sort_order?: number };
    if (!body.name?.trim()) {
      return reply.status(400).send({ error: '分类名称不能为空' });
    }
    try {
      const cat = await updateCategory(id, body.name.trim(), body.sort_order);
      return cat;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // Delete category
  app.delete('/api/categories/:id', async (req) => {
    const { id } = req.params as { id: string };
    await deleteCategory(id);
    return { success: true };
  });
}
