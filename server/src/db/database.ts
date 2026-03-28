import initSqlJs, { type Database } from 'sql.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    mkdirSync(dirname(config.dbPath), { recursive: true });

    const SQL = await initSqlJs();

    if (existsSync(config.dbPath)) {
      const buffer = readFileSync(config.dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    initTables(db);
    runMigrations(db);
    saveDb();
  }
  return db;
}

export function saveDb(): void {
  if (db) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(config.dbPath, buffer);
  }
}

function initTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      raw_content TEXT,
      type TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      category TEXT,
      source_file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_links (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT,
      strength REAL DEFAULT 1.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES knowledge_items(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      template TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS review_records (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      question_id TEXT,
      question TEXT NOT NULL,
      answer TEXT,
      user_answer TEXT,
      is_correct INTEGER,
      score INTEGER,
      next_review DATETIME,
      interval_days REAL DEFAULT 1,
      review_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS review_questions (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_idx INTEGER NOT NULL,
      explanation TEXT,
      category TEXT DEFAULT '其他',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function runMigrations(db: Database): void {
  const res = db.exec('SELECT MAX(version) as v FROM schema_migrations');
  const currentVersion = res.length > 0 && res[0].values[0][0] ? (res[0].values[0][0] as number) : 0;

  const migrations: Array<{ version: number; sql: string; extra?: (db: Database) => void }> = [
    {
      version: 1,
      sql: `
        CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_items(type);
        CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_items(category);
        CREATE INDEX IF NOT EXISTS idx_knowledge_created ON knowledge_items(created_at);
        CREATE INDEX IF NOT EXISTS idx_links_source ON knowledge_links(source_id);
        CREATE INDEX IF NOT EXISTS idx_links_target ON knowledge_links(target_id);
        CREATE INDEX IF NOT EXISTS idx_review_item ON review_records(item_id);
        CREATE INDEX IF NOT EXISTS idx_review_next ON review_records(next_review);
      `,
    },
    {
      version: 2,
      sql: `
        ALTER TABLE knowledge_items ADD COLUMN embedding TEXT;

        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          title TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          sources TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
      `,
    },
    {
      version: 3,
      sql: `
        CREATE TABLE IF NOT EXISTS clustering_features (
          item_id TEXT PRIMARY KEY,
          keywords TEXT NOT NULL DEFAULT '[]',
          tags TEXT NOT NULL DEFAULT '[]',
          category TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS clustering_cache (
          id TEXT PRIMARY KEY DEFAULT 'latest',
          clusters TEXT NOT NULL,
          params TEXT NOT NULL,
          item_count INTEGER NOT NULL,
          computed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      version: 4,
      sql: `
        CREATE TABLE IF NOT EXISTS token_usage (
          id TEXT PRIMARY KEY,
          model TEXT NOT NULL,
          provider_name TEXT,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          call_type TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(created_at);
        CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
      `,
    },
    {
      version: 5,
      sql: `
        -- review_questions table created in initTables
        -- Add category column for existing installs
      `,
      extra: (db: Database) => {
        try { db.run("ALTER TABLE review_questions ADD COLUMN category TEXT DEFAULT '其他'"); } catch {}
      },
    },
  ];

  for (const m of migrations) {
    if (m.version > currentVersion) {
      db.run(m.sql);
      if (m.extra) m.extra(db);
      db.run('INSERT INTO schema_migrations (version) VALUES (?)', [m.version]);
    }
  }

  saveDb();
}

export function closeDb(): void {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
