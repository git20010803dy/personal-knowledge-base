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
  sources?: string[]
): Promise<ChatMessage> {
  const db = await getDb();
  const id = nanoid();
  db.run(
    `INSERT INTO chat_messages (id, session_id, role, content, sources) VALUES (?, ?, ?, ?, ?)`,
    [id, sessionId, role, content, sources ? JSON.stringify(sources) : null]
  );
  saveDb();
  await updateChatSessionTimestamp(sessionId);
  return {
    id,
    session_id: sessionId,
    role,
    content,
    sources: sources || null,
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
  return res[0].values.map((row) => ({
    id: row[0] as string,
    session_id: row[1] as string,
    role: row[2] as 'user' | 'assistant',
    content: row[3] as string,
    sources: row[4] ? JSON.parse(row[4] as string) : null,
    created_at: row[5] as string,
  }));
}
