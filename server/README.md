# server/ - 后端服务

> 更新：2026-03-29

## 技术栈

- Runtime: Node.js + TypeScript
- Framework: Fastify
- Database: sql.js (主库) + better-sqlite3 (搜索引擎)
- Search: @node-rs/jieba 中文分词 + SQLite FTS5 BM25 全文搜索
- LLM: OpenAI-compatible API

## 目录结构

```
server/src/
├── config.ts              # 环境变量配置
├── index.ts               # 入口，注册路由与服务
├── db/
│   ├── database.ts        # sql.js 数据库初始化与迁移
│   ├── knowledgeRepo.ts   # 知识点 CRUD
│   ├── chatRepo.ts        # 对话会话管理
│   ├── providerRepo.ts    # AI 模型配置
│   ├── promptRepo.ts      # Prompt 模板
│   ├── templateRepo.ts    # 知识处理模板
│   └── tokenRepo.ts       # Token 消耗统计
├── routes/
│   ├── knowledge.ts       # /api/knowledge - 知识点 CRUD + 预览
│   ├── agent.ts           # /api/agent - AI 问答 (SSE 流式)
│   ├── review.ts          # /api/review - 间隔复习
│   ├── providers.ts       # /api/providers - AI 模型配置
│   ├── categories.ts      # /api/categories - 分类管理
│   ├── graph.ts           # /api/graph - 知识图谱
│   ├── prompts.ts         # /api/prompts - Prompt 管理
│   └── tokens.ts          # /api/tokens - Token 统计
└── services/
    ├── knowledgeService.ts        # 知识处理（LLM 提取、分类）
    ├── ragService.ts              # RAG 问答服务（调用 searchService）
    ├── searchService.ts           # jieba + FTS5 BM25 全文搜索
    ├── reviewService.ts           # 间隔复习算法
    ├── reviewQuestionService.ts   # 复习题生成（LLM 出题）
    ├── graphService.ts            # 知识图谱数据
    ├── clusteringService.ts       # 聚类分析
    ├── categoryService.ts         # 分类管理
    ├── promptEngine.ts            # Prompt 模板引擎
    └── llm/
        ├── index.ts               # LLM Provider 入口
        ├── provider.ts            # Provider 接口定义
        ├── openaiAdapter.ts       # OpenAI 兼容适配器
        └── claudeAdapter.ts       # Claude 适配器
```

## 数据库

### 主数据库 (knowledge.db - sql.js)

| 表 | 说明 |
|---|------|
| knowledge_items | 知识点（标题、内容、标签、分类等） |
| review_questions | 复习题（预生成的选择题） |
| review_records | 复习记录（间隔重复算法数据） |
| review_extensions | 复习延伸知识 |
| categories | 分类 |
| ai_providers | AI 模型配置 |
| prompt_templates | 知识处理模板 |
| system_prompts | 系统提示词 |
| chat_sessions | 对话会话 |
| chat_messages | 对话消息 |
| clustering_features | 聚类特征 |
| token_usage | Token 消耗记录 |
| schema_migrations | 数据库迁移版本 |

### 搜索数据库 (knowledge_search.db - better-sqlite3)

| 表 | 说明 |
|---|------|
| knowledge_items | 知识点索引（id, title, raw_content, search_text） |
| fts_items | FTS5 全文搜索索引 |

## 搜索架构

```
用户问题 → jieba 分词查询词 → FTS5 BM25 搜索 search.db → 拿到 ID 列表 → 从 knowledge.db 拿完整数据 → LLM
```

- 搜索范围覆盖全文（raw_content），不只搜标题+标签
- 不依赖外部 Embedding API，纯本地搜索
- jieba 使用完整词典（349,045 词）

## 环境变量

```env
# 可选，也可通过前端 UI 配置
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.example.com/v1
LLM_MODEL=model-name

# 服务配置
PORT=3001
HOST=0.0.0.0
DB_PATH=./data/knowledge.db
```

## 启动

```bash
pnpm install
pnpm dev        # 开发模式 (tsx)
pnpm build      # 编译
pnpm start      # 生产模式
```
