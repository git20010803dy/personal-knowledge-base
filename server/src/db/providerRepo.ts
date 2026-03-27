import { v4 as uuidv4 } from 'uuid';
import { getDb, saveDb } from './database';
import type { AIProvider } from '@pkb/shared';

function rowToProvider(row: any[]): AIProvider {
  return {
    id: row[0] as string,
    name: row[1] as string,
    provider_type: row[2] as 'openai' | 'claude' | 'custom',
    api_key: row[3] as string,
    base_url: row[4] as string,
    model: row[5] as string,
    is_active: (row[6] as number) === 1,
    created_at: row[7] as string,
    updated_at: row[8] as string,
  };
}

export async function getAllProviders(): Promise<AIProvider[]> {
  const db = await getDb();
  const res = db.exec('SELECT * FROM ai_providers ORDER BY created_at DESC');
  if (res.length === 0) return [];
  return res[0].values.map(rowToProvider);
}

export async function getProviderById(id: string): Promise<AIProvider | null> {
  const db = await getDb();
  const stmt = db.prepare('SELECT * FROM ai_providers WHERE id = :id');
  stmt.bind({ ':id': id });
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    return rowToProvider(row);
  }
  stmt.free();
  return null;
}

export async function getActiveProvider(): Promise<AIProvider | null> {
  const db = await getDb();
  const stmt = db.prepare('SELECT * FROM ai_providers WHERE is_active = 1 LIMIT 1');
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    return rowToProvider(row);
  }
  stmt.free();
  return null;
}

export async function createProvider(data: {
  name: string;
  provider_type: 'openai' | 'claude' | 'custom';
  api_key: string;
  base_url: string;
  model: string;
}): Promise<AIProvider> {
  const db = await getDb();
  const id = uuidv4();
  db.run(
    `INSERT INTO ai_providers (id, name, provider_type, api_key, base_url, model) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.provider_type, data.api_key, data.base_url, data.model]
  );
  saveDb();
  const provider = await getProviderById(id);
  return provider!;
}

export async function updateProvider(
  id: string,
  data: {
    name?: string;
    provider_type?: 'openai' | 'claude' | 'custom';
    api_key?: string;
    base_url?: string;
    model?: string;
  }
): Promise<AIProvider | null> {
  const db = await getDb();
  const existing = await getProviderById(id);
  if (!existing) return null;

  const updated = {
    name: data.name ?? existing.name,
    provider_type: data.provider_type ?? existing.provider_type,
    api_key: data.api_key ?? existing.api_key,
    base_url: data.base_url ?? existing.base_url,
    model: data.model ?? existing.model,
  };

  db.run(
    `UPDATE ai_providers SET name = ?, provider_type = ?, api_key = ?, base_url = ?, model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [updated.name, updated.provider_type, updated.api_key, updated.base_url, updated.model, id]
  );
  saveDb();
  return getProviderById(id);
}

export async function deleteProvider(id: string): Promise<boolean> {
  const db = await getDb();
  const existing = await getProviderById(id);
  if (!existing) return false;
  db.run('DELETE FROM ai_providers WHERE id = ?', [id]);
  saveDb();
  return true;
}

export async function activateProvider(id: string): Promise<AIProvider | null> {
  const db = await getDb();
  const existing = await getProviderById(id);
  if (!existing) return null;

  // Deactivate all providers first
  db.run('UPDATE ai_providers SET is_active = 0, updated_at = CURRENT_TIMESTAMP');
  // Activate the target
  db.run('UPDATE ai_providers SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  saveDb();
  return getProviderById(id);
}
