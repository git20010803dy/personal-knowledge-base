import { nanoid } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import type { KnowledgeRepository } from '../db/knowledgeRepo';
import type { KnowledgeService } from '../services/knowledgeService';
import type { RagService } from '../services/ragService';
import type { KnowledgeType, SavePieceRequest } from '@pkb/shared';
import { getDb, saveDb } from '../db/database';

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

    // Sync category to review_questions if category changed
    if (body.category !== undefined) {
      try {
        const db = await getDb();
        db.run(
          'UPDATE review_questions SET category = ? WHERE item_id = ?',
          [(body.category as string) || '其他', id],
        );
        saveDb();
      } catch (e) {
        // Non-critical, don't fail the request
        console.error('Failed to sync category to review_questions:', e);
      }
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

  // Split-preview: split content and process each piece (preview only, no save)
  app.post('/api/knowledge/split-preview', async (req, reply) => {
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

      // Step 1: Split into pieces
      const rawPieces = await service.splitKnowledge(body.raw_content, options);

      // Step 2: Process each piece to get structured results
      const pieces = [];
      let totalTokens = 0;
      let totalTimeMs = 0;
      for (const rawPiece of rawPieces) {
        const pieceType = body.type || (rawPiece.suggested_type as KnowledgeType) || undefined;
        const processing = await service.processTextInput(rawPiece.content, pieceType, options);
        if (processing._usage) {
          totalTokens += processing._usage.total_tokens;
          totalTimeMs += processing._usage.time_ms;
        }
        pieces.push({
          id: nanoid(),
          content: rawPiece.content,
          suggested_type: rawPiece.suggested_type,
          processing,
        });
      }

      return { success: true, pieces, _usage: { total_tokens: totalTokens, time_ms: totalTimeMs } };
    } catch (error: any) {
      app.log.error(error, 'Failed to split-preview');
      return reply.status(500).send({ error: error.message });
    }
  });

  // Save pieces: save split-preview results (merge or individually)
  app.post('/api/knowledge/save-pieces', async (req, reply) => {
    const body = req.body as {
      pieces: SavePieceRequest[];
      merge: boolean;
    };

    if (!body.pieces || !Array.isArray(body.pieces) || body.pieces.length === 0) {
      return reply.status(400).send({ error: 'pieces array is required' });
    }

    try {
      const items: any[] = [];

      if (body.merge && body.pieces.length > 1) {
        // Merge mode: combine all pieces into one item
        const pieces = body.pieces;

        // Union keywords (case-insensitive dedup)
        const keywordSet = new Set<string>();
        for (const p of pieces) {
          for (const kw of (p.keywords || [])) {
            const lower = kw.toLowerCase();
            if (![...keywordSet].some(k => k.toLowerCase() === lower)) {
              keywordSet.add(kw);
            }
          }
        }
        const mergedKeywords = [...keywordSet];

        // Union tags (case-insensitive dedup)
        const tagSet = new Set<string>();
        for (const p of pieces) {
          for (const tag of (p.tags || [])) {
            const lower = tag.toLowerCase();
            if (![...tagSet].some(t => t.toLowerCase() === lower)) {
              tagSet.add(tag);
            }
          }
        }
        const mergedTags = [...tagSet];

        // Merge raw_content
        const mergedRawContent = pieces.map(p => p.raw_content).join('\n\n---\n\n');

        // Use first piece's title or generate combined
        const mergedTitle = pieces[0].title || pieces.map(p => p.title || p.raw_content.substring(0, 20)).join(' / ');

        // Build merged content from processing results (each piece was already processed in preview)
        const mergedContent = {
          merged: true,
          pieces: pieces.map(p => ({
            title: p.title,
            type: p.type,
            keywords: p.keywords,
            tags: p.tags,
          })),
        };

        const db = await getDb();
        const itemId = nanoid();
        const now = new Date().toISOString();

        const item: any = {
          id: itemId,
          title: mergedTitle,
          content: JSON.stringify(mergedContent),
          raw_content: mergedRawContent,
          type: pieces[0].type || 'general',
          tags: JSON.stringify(mergedTags),
          category: pieces[0].category || null,
          source_file: null,
          created_at: now,
          updated_at: now,
        };

        db.run(
          'INSERT INTO knowledge_items (id, title, content, raw_content, type, tags, category, source_file, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [item.id, item.title, item.content, item.raw_content, item.type, item.tags, item.category, item.source_file, item.created_at, item.updated_at],
        );

        // Sync clustering features
        db.run(
          'INSERT OR REPLACE INTO clustering_features (item_id, keywords, tags, category, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
          [itemId, JSON.stringify(mergedKeywords), JSON.stringify(mergedTags), item.category],
        );
        saveDb();

        items.push({ ...item, tags: mergedTags });

        // Embed (non-blocking)
        const embedText = mergedTitle + ' ' + mergedTags.join(' ');
        ragService.embedAndStore(itemId, embedText).catch(() => {});

      } else {
        // Save each piece independently
        const db = await getDb();

        for (const piece of body.pieces) {
          const itemId = nanoid();
          const now = new Date().toISOString();
          const pieceType = piece.type || 'general';

          const item: any = {
            id: itemId,
            title: piece.title || piece.raw_content.substring(0, 50),
            content: JSON.stringify({ raw: piece.raw_content, keywords: piece.keywords, tags: piece.tags }),
            raw_content: piece.raw_content,
            type: pieceType,
            tags: JSON.stringify(piece.tags || []),
            category: piece.category || null,
            source_file: null,
            created_at: now,
            updated_at: now,
          };

          db.run(
            'INSERT INTO knowledge_items (id, title, content, raw_content, type, tags, category, source_file, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [item.id, item.title, item.content, item.raw_content, item.type, item.tags, item.category, item.source_file, item.created_at, item.updated_at],
          );

          // Sync clustering features
          db.run(
            'INSERT OR REPLACE INTO clustering_features (item_id, keywords, tags, category, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [itemId, JSON.stringify(piece.keywords || []), JSON.stringify(piece.tags || []), item.category],
          );

          items.push({ ...item, tags: piece.tags || [] });

          // Embed (non-blocking)
          const embedText = item.title + ' ' + (piece.tags || []).join(' ');
          ragService.embedAndStore(itemId, embedText).catch(() => {});
        }

        saveDb();
      }

      return { success: true, saved_count: items.length, items };
    } catch (error: any) {
      app.log.error(error, 'Failed to save pieces');
      return reply.status(500).send({ error: error.message });
    }
  });
}
