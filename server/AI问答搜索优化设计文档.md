# AI 问答搜索优化：jieba + FTS5 BM25 全文搜索

## 背景

原有搜索逻辑使用 Embedding API + 向量相似度，只搜标题+标签（几十字），几千字的原文没用上。

## 方案

jieba 分词 + FTS5 BM25 全文搜索（独立 search.db，不改现有 CRUD）

## 实施完成 - 2026-03-29

### 新增依赖
- `better-sqlite3` ^12.8.0
- `@node-rs/jieba` ^2.0.1
- `@types/better-sqlite3` ^7.6.13

### 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/searchService.ts` | **新建** | jieba 分词 + FTS5 BM25 搜索 + search.db 管理 |
| `src/services/ragService.ts` | **重写** | 删除 Embedding 逻辑，改为调用 searchService |
| `src/routes/knowledge.ts` | **修改** | 4 处 embedAndStore → syncToSearch，删除时 deleteFromSearch，更新时 syncToSearch |
| `src/index.ts` | **修改** | 启动时 initSearchDb()，关闭时 closeSearchDb() |

### 不变的文件
- `src/db/database.ts` — 不动
- `src/db/knowledgeRepo.ts` — 不动
- `src/routes/agent.ts` — 不动
- 所有其他 CRUD 代码 — 不动

### 数据库
- 新增 `knowledge_search.db` (better-sqlite3)
  - `knowledge_items` 表：id, title, raw_content, search_text
  - `fts_items` FTS5 虚拟表：search_text
- 启动时自动全量同步

### 搜索流程
```
用户问题 → jieba 分词查询词 → FTS5 BM25 搜索 search.db → 拿到 ID → 从 knowledge.db 拿完整数据 → LLM
```

### 已知问题
- `providerRepo.ts` 有 2 个类型错误（之前残留，tsx 运行时不影响）
