/**
 * categoryService.ts - 分类管理服务
 * 功能：分类的增删改查，供复习和知识列表共用
 * 最后修改：2026-03-28 - 新建
 */
import { nanoid } from 'nanoid';
import { getDb, saveDb } from '../db/database';

export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

// ─── CRUD ────────────────────────────────────────────────────────────

export async function getAllCategories(): Promise<Category[]> {
  const db = await getDb();
  const res = db.exec('SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC, name ASC');
  if (res.length === 0) return [];
  return res[0].values.map((row) => ({
    id: row[0] as string,
    name: row[1] as string,
    sort_order: row[2] as number,
  }));
}

export async function createCategory(name: string, sortOrder?: number): Promise<Category> {
  const db = await getDb();
  const id = nanoid();
  const order = sortOrder ?? 999;

  // Check duplicate
  const existing = db.exec('SELECT id FROM categories WHERE name = ?', [name]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    throw new Error(`分类「${name}」已存在`);
  }

  db.run('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)', [id, name, order]);
  saveDb();

  return { id, name, sort_order: order };
}

export async function updateCategory(id: string, name: string, sortOrder?: number): Promise<Category> {
  const db = await getDb();

  // Check duplicate (exclude self)
  const existing = db.exec('SELECT id FROM categories WHERE name = ? AND id != ?', [name, id]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    throw new Error(`分类「${name}」已存在`);
  }

  if (sortOrder !== undefined) {
    db.run('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?', [name, sortOrder, id]);
  } else {
    db.run('UPDATE categories SET name = ? WHERE id = ?', [name, id]);
  }
  saveDb();

  // Also update review_questions that used the old name
  const oldName = db.exec('SELECT name FROM categories WHERE id = ?', [id]);
  if (oldName.length > 0 && oldName[0].values.length > 0) {
    const old = oldName[0].values[0][0] as string;
    if (old !== name) {
      db.run('UPDATE review_questions SET category = ? WHERE category = ?', [name, old]);
      saveDb();
    }
  }

  return { id, name, sort_order: sortOrder ?? 999 };
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  // Get the name before deleting
  const res = db.exec('SELECT name FROM categories WHERE id = ?', [id]);
  if (res.length === 0 || res[0].values.length === 0) return;
  const name = res[0].values[0][0] as string;

  db.run('DELETE FROM categories WHERE id = ?', [id]);
  // Reset review_questions with this category to '其他'
  db.run("UPDATE review_questions SET category = '其他' WHERE category = ?", [name]);
  saveDb();
}

/**
 * Initialize default categories if table is empty
 */
export async function initDefaultCategories(): Promise<void> {
  const db = await getDb();
  const res = db.exec('SELECT COUNT(*) FROM categories');
  const count = res.length > 0 ? (res[0].values[0][0] as number) : 0;
  if (count > 0) return;

  const defaults = ['历史', '地理', '文学', '成语', '诗词', '哲学', '科学', '数码', '常识', '其他'];
  for (let i = 0; i < defaults.length; i++) {
    db.run('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)', [nanoid(), defaults[i], i]);
  }
  saveDb();
}
