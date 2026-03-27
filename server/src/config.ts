import { env } from 'node:process';

export const config = {
  port: parseInt(env.PORT || '3001', 10),
  host: env.HOST || '0.0.0.0',
  dbPath: env.DB_PATH || './data/knowledge.db',
  uploadsDir: env.UPLOADS_DIR || './data/uploads',

  llm: {
    apiKey: env.LLM_API_KEY || '',
    model: env.LLM_MODEL || 'gpt-4o-mini',
    baseUrl: env.LLM_BASE_URL || 'https://api.openai.com/v1',
  },
};
