import type { FastifyInstance } from 'fastify';
import type { KnowledgeRepository } from '../db/knowledgeRepo';
import type { KnowledgeService } from '../services/knowledgeService';
import type { RagService } from '../services/ragService';
import type { KnowledgeType } from '@pkb/shared';

export async function knowledgeRoutes(
  app: FastifyInstance,
  deps: { repo: KnowledgeRepository; service: KnowledgeService; ragService: RagService }
) {
  const { repo, service, ragService } = deps;

  // Create knowledge item (text input)
  app.post('/api/knowledge', async (req, reply) => {
    const body = req.body as {
      title?: string;
      raw_content: string;
      type?: KnowledgeType;
      auto_classify?: boolean;
      model?: string;
      temperature?: number;
      top_p?: number;
    };

    if (!body.raw_content) {
      return reply.status(400).send({ error: 'raw_content is required' });
    }

    try {
      const options = { model: body.model, temperature: body.temperature, top_p: body.top_p };
      const result = await service.processStoreAndSplit(
        body.raw_content,
        body.auto_classify === false ? body.type : undefined,
        body.title,
        options,
      );

      // Embed all items on save (non-blocking)
      for (let i = 0; i < result.items.length; i++) {
        const embedText = result.items[i].title + ' ' + (result.processingResults[i]?.tags?.join(' ') || '');
        ragService.embedAndStore(result.items[i].id, embedText).catch(() => {});
      }

      // Return single item if only one, array if split
      if (result.items.length === 1) {
        return {
          success: true,
          data: result.items[0],
          processing: result.processingResults[0],
          links: result.totalLinks,
          split: false,
        };
      } else {
        return {
          success: true,
          data: result.items,
          processing: result.processingResults,
          links: result.totalLinks,
          split: true,
          split_count: result.items.length,
        };
      }
    } catch (error: any) {
      app.log.error(error, 'Failed to process knowledge');
      return reply.status(500).send({ error: error.message });
    }
  });

  // Upload file and process (also supports split)
  app.post('/api/knowledge/upload', async (req, reply) => {
    try {
      const data = await req.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const fields = data.fields as Record<string, any>;
      const type = fields?.type?.value as KnowledgeType | undefined;

      const fileObj = {
        fieldname: data.fieldname || 'file',
        filename: data.filename,
        encoding: data.encoding || '7bit',
        mimetype: data.mimetype,
        buffer: new Uint8Array(buffer),
        size: buffer.length,
      };
      const result = await service.processFileAndStore(fileObj, type);

      // Embed on save (non-blocking)
      const embedText = result.item.title + ' ' + (result.processingResult.tags?.join(' ') || '');
      ragService.embedAndStore(result.item.id, embedText).catch(() => {});

      // Find links
      let links: any[] = [];
      try {
        const suggestions = await service.findLinksForItem(result.item);
        links = await service.storeLinks(result.item.id, suggestions);
      } catch (e) { /* non-blocking */ }

      return { success: true, data: result.item, processing: result.processingResult, links };
    } catch (error: any) {
      app.log.error(error, 'Failed to upload and process');
      return reply.status(500).send({ error: error.message });
    }
  });

  // List knowledge items
  app.get('/api/knowledge', async (req) => {
    const query = req.query as {
      page?: string;
      pageSize?: string;
      type?: KnowledgeType;
      category?: string;
      search?: string;
      tags?: string;
    };

    const { data, total } = await repo.findAll({
      page: parseInt(query.page || '1', 10),
      pageSize: parseInt(query.pageSize || '20', 10),
      type: query.type,
      category: query.category,
      search: query.search,
      tags: query.tags ? query.tags.split(',') : undefined,
    });

    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

  // Get single knowledge item
  app.get('/api/knowledge/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await repo.findById(id);
    if (!item) {
      return reply.status(404).send({ error: 'Knowledge item not found' });
    }
    return { data: item };
  });

  // Update knowledge item
  app.put('/api/knowledge/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const updated = await repo.update(id, body);
    if (!updated) {
      return reply.status(404).send({ error: 'Knowledge item not found' });
    }
    return { data: updated };
  });

  // Delete knowledge item
  app.delete('/api/knowledge/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await repo.findById(id);
    if (!item) {
      return reply.status(404).send({ error: 'Knowledge item not found' });
    }

    // Manual cascade delete (sql.js doesn't enforce FK constraints)
    const { getDb, saveDb } = await import('../db/database');
    const db = await getDb();
    db.run('DELETE FROM knowledge_links WHERE source_id = ? OR target_id = ?', [id, id]);
    db.run('DELETE FROM clustering_features WHERE item_id = ?', [id]);
    db.run('DELETE FROM review_records WHERE item_id = ?', [id]);
    db.run('DELETE FROM token_usage WHERE 1=0'); // keep token stats
    saveDb();

    const deleted = await repo.delete(id);
    return { success: true };
  });

  // Preview processing without saving
  app.post('/api/knowledge/preview', async (req, reply) => {
    const body = req.body as {
      raw_content: string;
      type?: KnowledgeType;
      model?: string;
      temperature?: number;
      top_p?: number;
    };

    if (!body.raw_content) {
      return reply.status(400).send({ error: 'raw_content is required' });
    }

    try {
      const options = { model: body.model, temperature: body.temperature, top_p: body.top_p };
      const result = await service.processTextInput(body.raw_content, body.type, options);
      return { success: true, data: result };
    } catch (error: any) {
      app.log.error(error, 'Failed to preview');
      return reply.status(500).send({ error: error.message });
    }
  });
}
