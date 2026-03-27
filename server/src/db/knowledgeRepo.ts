import { nanoid } from 'nanoid';
import type { KnowledgeItem, KnowledgeType } from '@pkb/shared';
import { getDb, saveDb } from './database';

function rowToKnowledgeItem(row: any[]): KnowledgeItem {
  return {
    id: row[0] as string,
    title: row[1] as string,
    content: row[2] as string,
    raw_content: row[3] as string,
    type: row[4] as KnowledgeType,
    tags: JSON.parse(row[5] as string || '[]'),
    category: row[6] as string | null,
    source_file: row[7] as string | null,
    created_at: row[8] as string,
    updated_at: row[9] as string,
  };
}

export interface KnowledgeRepository {
  create(data: Omit<KnowledgeItem, 'created_at' | 'updated_at'>): Promise<KnowledgeItem>;
  findById(id: string): Promise<KnowledgeItem | undefined>;
  findAll(params: {
    page?: number;
    pageSize?: number;
    type?: KnowledgeType;
    category?: string;
    search?: string;
    tags?: string[];
  }): Promise<{ data: KnowledgeItem[]; total: number }>;
  update(id: string, data: Partial<KnowledgeItem>): Promise<KnowledgeItem | undefined>;
  delete(id: string): Promise<boolean>;
  getAllTitles(): Promise<Array<{ id: string; title: string; type: string }>>;
}

export function createKnowledgeRepo(): KnowledgeRepository {
  return {
    async create(data) {
      const db = await getDb();
      const id = data.id || nanoid();
      const tags = JSON.stringify(data.tags || []);

      db.run(
        'INSERT INTO knowledge_items (id, title, content, raw_content, type, tags, category, source_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, data.title, data.content, data.raw_content, data.type, tags, data.category, data.source_file],
      );
      saveDb();
      return this.findById(id) as Promise<KnowledgeItem>;
    },

    async findById(id) {
      const db = await getDb();
      const res = db.exec('SELECT * FROM knowledge_items WHERE id = ?', [id]);
      if (res.length === 0 || res[0].values.length === 0) return undefined;
      const item = rowToKnowledgeItem(res[0].values[0]);
      if (typeof item.tags === 'string') {
        item.tags = JSON.parse(item.tags);
      }
      return item;
    },

    async findAll({ page = 1, pageSize = 20, type, category, search, tags }) {
      const db = await getDb();
      const conditions: string[] = [];
      const params: any[] = [];

      if (type) {
        conditions.push('type = ?');
        params.push(type);
      }
      if (category) {
        conditions.push('category = ?');
        params.push(category);
      }
      if (search) {
        conditions.push('(title LIKE ? OR raw_content LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }

      const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

      // Count
      const countRes = db.exec(`SELECT COUNT(*) as count FROM knowledge_items${where}`, params);
      let total = countRes.length > 0 ? (countRes[0].values[0][0] as number) : 0;

      // Data
      const dataSql = `SELECT * FROM knowledge_items${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      const dataRes = db.exec(dataSql, [...params, pageSize, (page - 1) * pageSize]);

      let data: KnowledgeItem[] = [];
      if (dataRes.length > 0) {
        const cols = dataRes[0].columns;
        data = dataRes[0].values.map((row: any[]) => {
          return rowToKnowledgeItem(row);
        });
      }

      // Tags filter in memory
      if (tags && tags.length > 0) {
        data = data.filter((item) =>
          tags.some((t) => (Array.isArray(item.tags) ? item.tags : []).includes(t)),
        );
      }

      return { data, total };
    },

    async update(id, data) {
      const db = await getDb();
      const fields: string[] = [];
      const values: any[] = [];

      if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
      if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
      if (data.raw_content !== undefined) { fields.push('raw_content = ?'); values.push(data.raw_content); }
      if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
      if (data.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(data.tags)); }
      if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
      if (data.source_file !== undefined) { fields.push('source_file = ?'); values.push(data.source_file); }

      if (fields.length === 0) return this.findById(id);

      fields.push("updated_at = datetime('now')");
      values.push(id);

      db.run(`UPDATE knowledge_items SET ${fields.join(', ')} WHERE id = ?`, values);
      saveDb();
      return this.findById(id);
    },

    async delete(id) {
      const db = await getDb();
      db.run('DELETE FROM knowledge_items WHERE id = ?', [id]);
      saveDb();
      return true;
    },

    async getAllTitles() {
      const db = await getDb();
      const res = db.exec('SELECT id, title, type FROM knowledge_items ORDER BY created_at DESC');
      if (res.length === 0) return [];
      return res[0].values.map((row: any[]) => ({
        id: row[0] as string,
        title: row[1] as string,
        type: row[2] as string,
      }));
    },
  };
}
