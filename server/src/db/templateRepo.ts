import { nanoid } from 'nanoid';
import type { PromptTemplate } from '@pkb/shared';
import { getDb, saveDb } from './database';

function rowToTemplate(row: any[]): PromptTemplate {
  return {
    id: row[0] as string,
    type: row[1] as string,
    name: row[2] as string,
    template: row[3] as string,
    is_default: Boolean(row[4]),
    created_at: row[5] as string,
  };
}

export interface TemplateRepository {
  create(data: Omit<PromptTemplate, 'created_at'>): Promise<PromptTemplate>;
  findById(id: string): Promise<PromptTemplate | undefined>;
  findByType(type: string): Promise<PromptTemplate | undefined>;
  findAll(): Promise<PromptTemplate[]>;
  update(id: string, data: Partial<PromptTemplate>): Promise<PromptTemplate | undefined>;
  delete(id: string): Promise<boolean>;
}

export function createTemplateRepo(): TemplateRepository {
  return {
    async create(data) {
      const db = await getDb();
      const id = data.id || nanoid();
      db.run(
        'INSERT INTO prompt_templates (id, type, name, template, is_default) VALUES (?, ?, ?, ?, ?)',
        [id, data.type, data.name, data.template, data.is_default ? 1 : 0],
      );
      saveDb();
      return this.findById(id) as Promise<PromptTemplate>;
    },

    async findById(id) {
      const db = await getDb();
      const res = db.exec('SELECT * FROM prompt_templates WHERE id = ?', [id]);
      if (res.length === 0 || res[0].values.length === 0) return undefined;
      return rowToTemplate(res[0].values[0]);
    },

    async findByType(type) {
      const db = await getDb();
      const res = db.exec('SELECT * FROM prompt_templates WHERE type = ? AND is_default = 1 LIMIT 1', [type]);
      if (res.length === 0 || res[0].values.length === 0) return undefined;
      return rowToTemplate(res[0].values[0]);
    },

    async findAll() {
      const db = await getDb();
      const res = db.exec('SELECT * FROM prompt_templates ORDER BY created_at DESC');
      if (res.length === 0) return [];
      return res[0].values.map(rowToTemplate);
    },

    async update(id, data) {
      const db = await getDb();
      const fields: string[] = [];
      const values: any[] = [];

      if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
      if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
      if (data.template !== undefined) { fields.push('template = ?'); values.push(data.template); }
      if (data.is_default !== undefined) { fields.push('is_default = ?'); values.push(data.is_default ? 1 : 0); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.run(`UPDATE prompt_templates SET ${fields.join(', ')} WHERE id = ?`, values);
      saveDb();
      return this.findById(id);
    },

    async delete(id) {
      const db = await getDb();
      db.run('DELETE FROM prompt_templates WHERE id = ?', [id]);
      saveDb();
      return true;
    },
  };
}
