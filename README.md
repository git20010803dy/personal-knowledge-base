# 个人知识库 - Personal Knowledge Base

AI 驱动的个人知识管理系统，支持输入知识文本、LLM 自动提取/分类/标签、知识图谱可视化、Agent 问答与间隔复习。

> 更新：2026-03-29

## 项目结构

```
personal-knowledge-base/
├── server/          # 后端服务 (Node.js + Fastify + SQLite)
├── client/          # 前端应用 (React + Ant Design + Vite)
├── shared/          # 前后端共享类型定义
├── docs/            # 项目文档
└── README.md
```

## 功能概览

| 功能 | 说明 |
|------|------|
| 知识输入 | 粘贴文本/上传文件，LLM 自动提取标题、类型、标签、关键词、摘要 |
| 知识列表 | 分页浏览、搜索、筛选、编辑、删除 |
| 知识图谱 | 可视化知识关联网络，支持聚类分析 |
| AI 问答 | 基于知识库的 RAG 问答（jieba + FTS5 BM25 全文搜索） |
| 间隔复习 | 基于遗忘曲线的智能复习系统，自动出题 |
| Prompt 管理 | 自定义各类 LLM 处理的提示词模板 |
| 模型配置 | 支持配置多个 LLM 提供商（OpenAI/DeepSeek/LongCat 等） |
| Token 统计 | 实时追踪 LLM 调用的 Token 消耗 |

## 技术栈

**后端：**
- Runtime: Node.js + TypeScript
- Framework: Fastify
- Database: sql.js (主库) + better-sqlite3 (搜索引擎)
- Search: jieba 中文分词 + SQLite FTS5 BM25 全文搜索
- LLM: OpenAI-compatible API

**前端：**
- React 18 + TypeScript
- Ant Design 5
- Vite
- Cytoscape.js (知识图谱)

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量（可选）
# 在 server/.env 中设置：
# LLM_API_KEY=your-api-key
# LLM_BASE_URL=https://api.example.com/v1
# LLM_MODEL=model-name

# 3. 启动后端
cd server && pnpm dev

# 4. 启动前端（新终端）
cd client && pnpm dev
```

后端默认运行在 `http://localhost:3001`，前端默认运行在 `http://localhost:5173`。

## 数据存储

| 文件 | 说明 |
|------|------|
| `server/data/knowledge.db` | 主数据库（sql.js） |
| `server/data/knowledge_search.db` | 搜索引擎数据库（better-sqlite3 + FTS5） |
| `server/data/uploads/` | 上传文件 |

> 所有 `.db` 文件已在 `.gitignore` 中排除，不会上传到 GitHub。

## 查看数据库

推荐使用 [DB Browser for SQLite](https://sqlitebrowser.org) 打开 `server/data/knowledge.db`。

> 注意：需要先停止服务器再打开数据库文件，否则可能报 "malformed" 错误。

## 更新日志

### 2026-03-29
- AI 问答搜索从 Embedding 向量搜索改为 jieba + FTS5 BM25 全文搜索
- 新增 `searchService.ts`（独立搜索数据库）
- 新增 `@node-rs/jieba` 中文分词 + `better-sqlite3` FTS5 支持
- 知识点类别与复习题类别同步联动
- 修复拆分预览功能（已禁用）
- 服务器关闭时自动清理 WAL 文件

### 2026-03-28
- 复习功能增强：追问、选项解释、延伸知识
- Prompt 统一管理页面
- 复习题类别从数据库读取
- 知识点类别修改自动同步到复习题
