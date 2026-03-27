import type { FastifyInstance } from 'fastify';
import type { TemplateRepository } from '../db/templateRepo';
import { getBuiltInTemplates } from '../services/promptEngine';
import { nanoid } from 'nanoid';

export async function templateRoutes(
  app: FastifyInstance,
  deps: { repo: TemplateRepository }
) {
  const { repo } = deps;

  // List all templates
  app.get('/api/templates', async () => {
    const templates = await repo.findAll();
    return { data: templates };
  });

  // Get single template
  app.get('/api/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const template = await repo.findById(id);
    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }
    return { data: template };
  });

  // Create template
  app.post('/api/templates', async (req, reply) => {
    const body = req.body as {
      type: string;
      name: string;
      template: string;
      is_default?: boolean;
    };

    if (!body.type || !body.name || !body.template) {
      return reply.status(400).send({ error: 'type, name, and template are required' });
    }

    const created = await repo.create({
      id: nanoid(),
      type: body.type,
      name: body.name,
      template: body.template,
      is_default: body.is_default || false,
    });

    return { success: true, data: created };
  });

  // Update template
  app.put('/api/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const updated = await repo.update(id, body);
    if (!updated) {
      return reply.status(404).send({ error: 'Template not found' });
    }
    return { data: updated };
  });

  // Delete template
  app.delete('/api/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await repo.delete(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Template not found' });
    }
    return { success: true };
  });

  // Reset to built-in templates
  app.post('/api/templates/reset', async () => {
    const existing = await repo.findAll();
    for (const t of existing) {
      if (t.is_default) await repo.delete(t.id);
    }
    for (const tpl of getBuiltInTemplates()) {
      await repo.create(tpl);
    }
    return { success: true, message: '已重置为内置模板' };
  });
}
