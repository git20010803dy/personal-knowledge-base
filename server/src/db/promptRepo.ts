/**
 * promptRepo.ts - system_prompts 表的 CRUD 操作
 * 功能：增删改查系统 Prompt，支持按 key 或 category 查询
 */
import { getDb, saveDb } from './database';

export interface SystemPrompt {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  variables: string[];       // parsed from JSON
  data_flow: string;
  logic_flow: string;
  is_active: boolean;
  updated_at: string;
}

function rowToPrompt(row: any[]): SystemPrompt {
  let variables: string[] = [];
  try { variables = JSON.parse(row[6] as string || '[]'); } catch {}
  return {
    id: row[0] as string,
    key: row[1] as string,
    name: row[2] as string,
    category: row[3] as string,
    description: (row[4] as string) || '',
    prompt: row[5] as string,
    variables,
    data_flow: (row[7] as string) || '',
    logic_flow: (row[8] as string) || '',
    is_active: (row[9] as number) === 1,
    updated_at: row[10] as string,
  };
}

export async function getAllPrompts(): Promise<SystemPrompt[]> {
  const db = await getDb();
  const res = db.exec('SELECT * FROM system_prompts ORDER BY category, key');
  if (res.length === 0) return [];
  return res[0].values.map(rowToPrompt);
}

export async function getPromptByKey(key: string): Promise<SystemPrompt | undefined> {
  const db = await getDb();
  const res = db.exec('SELECT * FROM system_prompts WHERE key = ?', [key]);
  if (res.length === 0 || res[0].values.length === 0) return undefined;
  return rowToPrompt(res[0].values[0]);
}

export async function getPromptsByCategory(category: string): Promise<SystemPrompt[]> {
  const db = await getDb();
  const res = db.exec('SELECT * FROM system_prompts WHERE category = ? ORDER BY key', [category]);
  if (res.length === 0) return [];
  return res[0].values.map(rowToPrompt);
}

export async function updatePrompt(key: string, data: { prompt?: string; description?: string; data_flow?: string; logic_flow?: string; is_active?: boolean }): Promise<SystemPrompt | undefined> {
  const db = await getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.prompt !== undefined) { fields.push('prompt = ?'); values.push(data.prompt); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.data_flow !== undefined) { fields.push('data_flow = ?'); values.push(data.data_flow); }
  if (data.logic_flow !== undefined) { fields.push('logic_flow = ?'); values.push(data.logic_flow); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }

  if (fields.length === 0) return getPromptByKey(key);

  fields.push("updated_at = datetime('now')");
  values.push(key);

  db.run(`UPDATE system_prompts SET ${fields.join(', ')} WHERE key = ?`, values);
  saveDb();
  return getPromptByKey(key);
}

/**
 * 重置某个 prompt 为内置默认值（通过重新执行 migration 中的初始化数据）
 * 这里只重置 prompt 字段，保留用户修改的 description/data_flow/logic_flow
 */
export async function resetPrompt(key: string): Promise<boolean> {
  // 找到内置默认值 - 从数据库中删除后让 migration 重建
  // 简单方案：不做单独重置，用 resetAll
  const db = await getDb();
  db.run('DELETE FROM system_prompts WHERE key = ?', [key]);
  saveDb();
  return true;
}

export async function resetAllPrompts(): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM system_prompts');
  saveDb();
  // 需要重新初始化 — 在 route 层处理
}
