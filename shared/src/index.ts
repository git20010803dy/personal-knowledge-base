// Knowledge types
export type KnowledgeType = 'classical_chinese' | 'idiom' | 'poetry' | 'general';

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;        // LLM processed structured content (JSON string)
  raw_content: string;    // Original input text
  type: KnowledgeType;
  tags: string[];         // JSON array stored as string in DB
  category: string | null;
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeLink {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string | null;  // 包含/相关/因果/对比/同源
  strength: number;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  type: KnowledgeType | string;
  name: string;
  template: string;
  is_default: boolean;
  created_at: string;
}

export interface ReviewRecord {
  id: string;
  item_id: string;
  question: string;
  answer: string | null;
  user_answer: string | null;
  is_correct: boolean | null;
  score: number | null;
  next_review: string | null;
  interval_days: number;
  review_count: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

// LLM types
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  id: string;
  name: string;
  provider_type: 'openai' | 'claude' | 'custom';
  api_key: string;
  base_url: string;
  model: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// API request/response types
export interface CreateKnowledgeRequest {
  title?: string;
  raw_content: string;
  type?: KnowledgeType;
  auto_classify?: boolean;
}

export interface KnowledgeListQuery {
  page?: number;
  pageSize?: number;
  type?: KnowledgeType;
  category?: string;
  search?: string;
  tags?: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProcessingResult {
  title: string;
  type: KnowledgeType;
  content: Record<string, unknown>;
  tags: string[];
  category: string | null;
  keywords: string[];
}

export interface TemplateRenderContext {
  raw_content: string;
  [key: string]: unknown;
}

// File upload
export interface UploadedFile {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  buffer: Uint8Array;
  size: number;
}

// Review types
export interface ReviewQuestion {
  question: string;
  answer: string;
  type: 'choice' | 'fill' | 'essay';
  options?: string[];  // for choice type
}

export interface ReviewItem {
  item_id: string;
  item_title: string;
  questions: ReviewQuestion[];
}

export interface ReviewSubmitRequest {
  review_id: string;
  question_index: number;
  user_answer: string;
}

export interface ReviewStats {
  due_count: number;
  completed_today: number;
  accuracy_rate: number;
  streak_days: number;
}

// Graph types
export interface GraphNode {
  id: string;
  title: string;
  type: KnowledgeType;
  tags: string[];
  category: string | null;
  importance: number; // degree centrality
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string | null;
  strength: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ClusterGroup {
  name: string;
  nodeIds: string[];
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  clusters: number;
  avgConnections: number;
}

// Chat types
export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Array<{ id: string; title: string }> | null;  // referenced knowledge items
  tokens: number;   // LLM tokens used (assistant messages only)
  time_ms: number;  // response time in ms (assistant messages only)
  created_at: string;
}

export interface LLMCallOptions {
  model?: string;
  temperature?: number;
  top_p?: number;
}

export interface ChatRequest {
  session_id?: string;
  message: string;
  model?: string;
  temperature?: number;
  top_p?: number;
}

// Token usage types
export interface TokenUsageRecord {
  id: string;
  model: string;
  provider_name: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  call_type: string;
  created_at: string;
}

export interface DailyTokenStats {
  date: string;
  total_tokens: number;
  total_calls: number;
  by_model: Array<{
    model: string;
    total_tokens: number;
    calls: number;
  }>;
  by_type: Array<{
    call_type: string;
    total_tokens: number;
    calls: number;
  }>;
}

// Split-merge types
export interface SplitPiece {
  id: string;
  content: string;
  suggested_type?: string;
  processing: ProcessingResult;
}

export interface SavePieceRequest {
  raw_content: string;
  title?: string;
  type?: string;
  keywords: string[];
  tags: string[];
  category?: string;
}

// Clustering types
export interface ClusteringParams {
  keywordWeight: number;
  tagWeight: number;
  categoryWeight: number;
  threshold: number;
}

export interface ClusteringResult {
  clusters: ClusterGroup[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    totalClusters: number;
    avgClusterSize: number;
  };
  params: ClusteringParams;
  computationTime: number;
}
