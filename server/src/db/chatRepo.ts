import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import { getDb, saveDb } from './database';
import type { ChatSession, ChatMessage } from '@pkb/shared';

// ---- Chat Sessions ----

export async function createChatSession(title?: string): Promise<ChatSession> {
  const db = await getDb();
  const id = nanoid();
  const sessionTitle = title || '新对话';
  db.run(
    `INSERT INTO chat_sessions (id, title) VALUES (?, ?)`,
    [id, sessionTitle]
  );
  saveDb();
  return getChatSession(id) as Promise<ChatSession>;
}

export async function getChatSession(id: string): Promise<ChatSession | null> {
  const db = await getDb();
  const res = db.exec('SELECT * FROM chat_sessions WHERE id = ?', [id]);
  if (res.length === 0 || res[0].values.length === 0) return null;
  const row = res[0].values[0];
  return {
    id: row[0] as string,
    title: row[1] as string,
    created_at: row[2] as string,
    updated_at: row[3] as string,
  };
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const db = await getDb();
  const res = db.exec('SELECT * FROM chat_sessions ORDER BY updated_at DESC');
  if (res.length === 0) return [];
  return res[0].values.map((row) => ({
    id: row[0] as string,
    title: row[1] as string,
    created_at: row[2] as string,
    updated_at: row[3] as string,
  }));
}

export async function updateChatSessionTitle(id: string, title: string): Promise<void> {
  const db = await getDb();
  db.run(
    `UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`,
    [title, id]
  );
  saveDb();
}

export async function updateChatSessionTimestamp(id: string): Promise<void> {
  const db = await getDb();
  db.run(
    `UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?`,
    [id]
  );
  saveDb();
}

export async function deleteChatSession(id: string): Promise<boolean> {
  const db = await getDb();
  db.run('DELETE FROM chat_messages WHERE session_id = ?', [id]);
  db.run('DELETE FROM chat_sessions WHERE id = ?', [id]);
  saveDb();
  return true;
}

// ---- Chat Messages ----

export async function addChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: string[],
  tokens?: number,
  timeMs?: number,
): Promise<ChatMessage> {
  const db = await getDb();
  const id = nanoid();
  db.run(
    `INSERT INTO chat_messages (id, session_id, role, content, sources, tokens, time_ms) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, role, content, sources ? JSON.stringify(sources) : null, tokens || 0, timeMs || 0]
  );
  saveDb();
  await updateChatSessionTimestamp(sessionId);
  return {
    id,
    session_id: sessionId,
    role,
    content,
    sources: null,
    tokens: tokens || 0,
    time_ms: timeMs || 0,
    created_at: new Date().toISOString(),
  };
}

export async function getMessagesBySession(sessionId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const res = db.exec(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
    [sessionId]
  );
  if (res.length === 0) return [];

  // Collect all source IDs for batch lookup
  const allSourceIds = new Set<string>();
  const rawMessages = res[0].values.map((row) => {
    const raw = row[4] ? JSON.parse(row[4] as string) : null;
    if (Array.isArray(raw)) {
      raw.forEach((s: any) => allSourceIds.add(typeof s === 'string' ? s : s.id));
    }
    return {
      id: row[0] as string,
      session_id: row[1] as string,
      role: row[2] as 'user' | 'assistant',
      content: row[3] as string,
      sources_raw: raw,
      created_at: row[5] as string,
      tokens: (row[6] as number) || 0,
      time_ms: (row[7] as number) || 0,
    };
  });

  // Batch resolve source IDs to { id, title }
  const titleMap = new Map<string, string>();
  if (allSourceIds.size > 0) {
    const placeholders = Array.from(allSourceIds).map(() => '?').join(',');
    const titleRes = db.exec(
      `SELECT id, title FROM knowledge_items WHERE id IN (${placeholders})`,
      Array.from(allSourceIds),
    );
    if (titleRes.length > 0) {
      for (const row of titleRes[0].values) {
        titleMap.set(row[0] as string, row[1] as string);
      }
    }
  }

  // Resolve sources in each message
  return rawMessages.map((m) => ({
    id: m.id,
    session_id: m.session_id,
    role: m.role,
    content: m.content,
    sources: m.sources_raw
      ? m.sources_raw.map((s: any) => {
          const id = typeof s === 'string' ? s : s.id;
          return { id, title: titleMap.get(id) || s.title || '已删除' };
        })
      : null,
    created_at: m.created_at,
    tokens: m.tokens,
    time_ms: m.time_ms,
  }));
}
