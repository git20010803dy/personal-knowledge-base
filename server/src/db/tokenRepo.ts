import { nanoid } from 'nanoid';
import { getDb, saveDb } from './database';

export interface TokenUsageInput {
  model: string;
  provider_name?: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  call_type: string;
}

export interface ModelStat {
  model: string;
  total_tokens: number;
  calls: number;
}

export interface TypeStat {
  call_type: string;
  total_tokens: number;
  calls: number;
}

export interface DailyStats {
  date: string;
  total_tokens: number;
  total_calls: number;
  by_model: ModelStat[];
  by_type: TypeStat[];
}

export async function insertUsage(record: TokenUsageInput): Promise<void> {
  const db = await getDb();
  const id = nanoid();
  db.run(
    `INSERT INTO token_usage (id, model, provider_name, prompt_tokens, completion_tokens, total_tokens, call_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, record.model, record.provider_name || null, record.prompt_tokens, record.completion_tokens, record.total_tokens, record.call_type],
  );
  saveDb();
}

export async function getDailyStats(date?: string): Promise<DailyStats> {
  const db = await getDb();
  const targetDate = date || new Date().toISOString().slice(0, 10);

  // Total for the day
  const totalRes = db.exec(
    `SELECT COALESCE(SUM(total_tokens), 0) as total_tokens, COUNT(*) as total_calls
     FROM token_usage
     WHERE date(created_at) = ?`,
    [targetDate],
  );
  const totalTokens = totalRes.length > 0 ? (totalRes[0].values[0][0] as number) : 0;
  const totalCalls = totalRes.length > 0 ? (totalRes[0].values[0][1] as number) : 0;

  // By model
  const modelRes = db.exec(
    `SELECT model, SUM(total_tokens) as total_tokens, COUNT(*) as calls
     FROM token_usage
     WHERE date(created_at) = ?
     GROUP BY model
     ORDER BY total_tokens DESC`,
    [targetDate],
  );
  const byModel: ModelStat[] = modelRes.length > 0
    ? modelRes[0].values.map((row) => ({
        model: row[0] as string,
        total_tokens: row[1] as number,
        calls: row[2] as number,
      }))
    : [];

  // By type
  const typeRes = db.exec(
    `SELECT call_type, SUM(total_tokens) as total_tokens, COUNT(*) as calls
     FROM token_usage
     WHERE date(created_at) = ?
     GROUP BY call_type
     ORDER BY total_tokens DESC`,
    [targetDate],
  );
  const byType: TypeStat[] = typeRes.length > 0
    ? typeRes[0].values.map((row) => ({
        call_type: row[0] as string,
        total_tokens: row[1] as number,
        calls: row[2] as number,
      }))
    : [];

  return { date: targetDate, total_tokens: totalTokens, total_calls: totalCalls, by_model: byModel, by_type: byType };
}

export async function getDateRange(startDate: string, endDate: string): Promise<DailyStats[]> {
  const db = await getDb();

  // Get all dates in range that have data
  const dateRes = db.exec(
    `SELECT DISTINCT date(created_at) as d
     FROM token_usage
     WHERE date(created_at) >= ? AND date(created_at) <= ?
     ORDER BY d ASC`,
    [startDate, endDate],
  );

  if (dateRes.length === 0) return [];

  const dates = dateRes[0].values.map((row) => row[0] as string);
  const results: DailyStats[] = [];

  for (const d of dates) {
    results.push(await getDailyStats(d));
  }

  return results;
}

export async function getTotalStats(): Promise<{
  total_tokens: number;
  total_calls: number;
  first_call: string | null;
  last_call: string | null;
}> {
  const db = await getDb();
  const res = db.exec(
    `SELECT COALESCE(SUM(total_tokens), 0) as total_tokens, COUNT(*) as total_calls,
            MIN(created_at) as first_call, MAX(created_at) as last_call
     FROM token_usage`,
  );
  if (res.length === 0) return { total_tokens: 0, total_calls: 0, first_call: null, last_call: null };
  const row = res[0].values[0];
  return {
    total_tokens: row[0] as number,
    total_calls: row[1] as number,
    first_call: row[2] as string | null,
    last_call: row[3] as string | null,
  };
}

export async function getSummary(): Promise<{
  total_tokens_7d: number;
  total_calls_7d: number;
  daily_average: number;
  top_model: string | null;
  breakdown: DailyStats[];
}> {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const startDate = sevenDaysAgo.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  const breakdown = await getDateRange(startDate, endDate);

  const totalTokens7d = breakdown.reduce((sum, d) => sum + d.total_tokens, 0);
  const totalCalls7d = breakdown.reduce((sum, d) => sum + d.total_calls, 0);
  const daysWithData = breakdown.length || 1;
  const dailyAverage = Math.round(totalTokens7d / daysWithData);

  // Find top model across all days
  const modelTotals = new Map<string, number>();
  for (const day of breakdown) {
    for (const m of day.by_model) {
      modelTotals.set(m.model, (modelTotals.get(m.model) || 0) + m.total_tokens);
    }
  }
  let topModel: string | null = null;
  let maxTokens = 0;
  for (const [model, tokens] of modelTotals) {
    if (tokens > maxTokens) {
      maxTokens = tokens;
      topModel = model;
    }
  }

  return {
    total_tokens_7d: totalTokens7d,
    total_calls_7d: totalCalls7d,
    daily_average: dailyAverage,
    top_model: topModel,
    breakdown,
  };
}
