/**
 * searchService.ts - jieba + FTS5 BM25 全文搜索服务
 * 使用独立的 search.db (better-sqlite3) 做 FTS5 索引
 * 不影响主数据库 knowledge.db (sql.js) 的 CRUD 操作
 */
import Database from 'better-sqlite3';
import { Jieba } from '@node-rs/jieba';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDb as getMainDb } from '../db/database';
import { config } from '../config';

// ─── 初始化 ─────────────────────────────────────────────────────────

let jieba: Jieba | null = null;
let searchDb: Database.Database | null = null;

function getJieba(): Jieba {
  if (!jieba) {
    const dictPath = require.resolve('@node-rs/jieba/dict.txt');
    const dict = readFileSync(dictPath);
    jieba = Jieba.withDict(dict);
  }
  return jieba;
}

function getSearchDbPath(): string {
  return config.dbPath.replace(/\.db$/, '_search.db');
}

export function getSearchDb(): Database.Database {
  if (!searchDb) {
    const dbPath = getSearchDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    searchDb = new Database(dbPath);
    searchDb.pragma('journal_mode = WAL');
  }
  return searchDb;
}

/**
 * 初始化搜索引擎：建表 + FTS5 + 全量同步
 */
export async function initSearchDb(): Promise<void> {
  const db = getSearchDb();

  // 主数据表
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      title TEXT,
      raw_content TEXT,
      search_text TEXT
    );
  `);

  // FTS5 虚拟表（直接存储，不用 content 模式）
  const hasFts = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='fts_items'"
  ).get();

  if (!hasFts) {
    db.exec(`CREATE VIRTUAL TABLE fts_items USING fts5(search_text);`);
    console.log('[Search] FTS5 virtual table created');
  }

  // 检查是否需要全量同步
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM knowledge_items').get() as any).cnt;
  const mainDb = await getMainDb();
  const mainCount = mainDb.exec('SELECT COUNT(*) FROM knowledge_items');
  const mainTotal = mainCount[0]?.values[0]?.[0] as number || 0;

  if (count !== mainTotal) {
    await rebuildAll();
    console.log(`[Search] Rebuilt ${mainTotal} items`);
  }
}

// ─── 分词 ───────────────────────────────────────────────────────────

/**
 * 分词用于索引：原文 → 空格分隔的分词结果
 */
export function segmentForIndex(text: string): string {
  if (!text) return '';
  const j = getJieba();
  return j.cut(text, true).join(' ');
}

/**
 * 分词用于搜索：查询词 → FTS5 查询表达式
 */
export function segmentForSearch(query: string): string {
  if (!query?.trim()) return '';
  const j = getJieba();
  const tokens = j.cut(query.trim(), true)
    .filter((t) => t.trim().length > 0)
    .map((t) => {
      if (/^[\u4e00-\u9fff]+$/.test(t)) {
        return `"${t}"`;
      }
      return t;
    });

  if (tokens.length === 0) return '';
  return tokens.join(' OR ');
}

// ─── 搜索 ───────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  title: string;
  score: number; // BM25 score（越小越相关）
}

/**
 * FTS5 BM25 全文搜索
 */
export function search(query: string, topK: number = 5): SearchResult[] {
  const db = getSearchDb();
  const ftsQuery = segmentForSearch(query);

  if (!ftsQuery) return [];

  try {
    // FTS5 搜索
    const rows = db.prepare(`
      SELECT rowid, rank
      FROM fts_items
      WHERE fts_items MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, topK) as any[];

    // 用 rowid 关联 knowledge_items 拿 id 和 title
    return rows.map((r) => {
      const item = db.prepare('SELECT id, title FROM knowledge_items WHERE rowid = ?').get(r.rowid) as any;
      return {
        id: item?.id || '',
        title: item?.title || '',
        score: r.rank,
      };
    }).filter(r => r.id);
  } catch (e: any) {
    console.warn('[Search] FTS5 search error:', e.message);
    return [];
  }
}

// ─── 数据同步 ───────────────────────────────────────────────────────

/**
 * 同步单条数据到 search.db
 */
export function syncItem(id: string, title: string, rawContent: string): void {
  const db = getSearchDb();
  const searchText = segmentForIndex(`${title} ${rawContent || ''}`);

  // 先删旧数据
  const existing = db.prepare('SELECT rowid FROM knowledge_items WHERE id = ?').get(id) as any;
  if (existing) {
    db.prepare('DELETE FROM fts_items WHERE rowid = ?').run(existing.rowid);
    db.prepare('DELETE FROM knowledge_items WHERE id = ?').run(id);
  }

  // 插入新数据
  const info = db.prepare(
    'INSERT INTO knowledge_items (id, title, raw_content, search_text) VALUES (?, ?, ?, ?)'
  ).run(id, title, rawContent || '', searchText);

  // 同步到 FTS5
  db.prepare(
    'INSERT INTO fts_items (rowid, search_text) VALUES (?, ?)'
  ).run(info.lastInsertRowid, searchText);
}

/**
 * 从 search.db 删除一条数据
 */
export function deleteItem(id: string): void {
  const db = getSearchDb();
  const existing = db.prepare('SELECT rowid FROM knowledge_items WHERE id = ?').get(id) as any;
  if (existing) {
    db.prepare('DELETE FROM fts_items WHERE rowid = ?').run(existing.rowid);
    db.prepare('DELETE FROM knowledge_items WHERE id = ?').run(id);
  }
}

/**
 * 全量重建 search.db
 */
export async function rebuildAll(): Promise<void> {
  const db = getSearchDb();
  const mainDb = await getMainDb();

  // 清空
  db.exec('DELETE FROM fts_items');
  db.exec('DELETE FROM knowledge_items');

  // 从主库读取所有数据
  const res = mainDb.exec('SELECT id, title, raw_content FROM knowledge_items');
  if (!res.length || !res[0].values.length) return;

  const insert = db.prepare(
    'INSERT INTO knowledge_items (id, title, raw_content, search_text) VALUES (?, ?, ?, ?)'
  );
  const insertFts = db.prepare(
    'INSERT INTO fts_items (rowid, search_text) VALUES (?, ?)'
  );

  const insertMany = db.transaction((items: any[][]) => {
    for (const row of items) {
      const [id, title, rawContent] = row;
      const searchText = segmentForIndex(`${title || ''} ${rawContent || ''}`);
      const info = insert.run(id, title || '', rawContent || '', searchText);
      insertFts.run(info.lastInsertRowid, searchText);
    }
  });

  insertMany(res[0].values);
}

/**
 * 关闭搜索引擎
 */
export function closeSearchDb(): void {
  if (searchDb) {
    searchDb.close();
    searchDb = null;
  }
}
