# 个人知识库 — Personal Knowledge Base

AI 驱动的个人知识管理系统。输入杂乱知识，经 LLM 智能提取、分类、关联，以知识图谱可视化呈现，集成 Agent 问答和间隔重复复习。

> 最后更新：2026-03-28

## 功能概览

| 模块 | 说明 |
|------|------|
| 📝 **知识输入** | 文本输入 / 上传 PDF、Markdown、图片，LLM 按类型处理（文言文/成语/诗词/通用） |
| 📋 **知识列表** | 分页浏览、搜索、筛选、查看详情、管理分类 |
| 🕸️ **知识图谱** | vis.js 力导向图，展示知识关联，Louvain 聚类算法发现社区 |
| 🤖 **AI 问答** | RAG 检索增强问答，流式输出，引用来源 |
| 📚 **复习系统** | SM-2 间隔重复，存入时预生成选择题，按分类筛选复习 |
| 📑 **模板管理** | 自定义 Prompt 模板，控制 LLM 处理知识的方式 |
| ⚙️ **模型配置** | 前端管理多个 AI 提供商，支持 OpenAI 兼容接口 |
| 🏷️ **分类管理** | 自由增删改分类，知识点与复习题目共用分类体系 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Ant Design + vis.js Network |
| 后端 | Node.js (Fastify) + TypeScript |
| 数据库 | sql.js（纯 JS SQLite，单文件，零配置） |
| LLM | 可配置 API（OpenAI / Claude / 国产兼容接口） |
| 构建 | Vite + pnpm monorepo |

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm（`npm install -g pnpm`）

### 一键启动（Windows）

```bash
start.bat
```

### 手动启动

```bash
pnpm install
pnpm dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

### 配置 AI 模型

1. 打开 http://localhost:5173
2. 点击侧栏「模型配置」
3. 添加 API Key（支持 OpenAI、智谱、通义千问等兼容接口）
4. 点击「激活」设为默认模型

## 项目结构

```
personal-knowledge-base/
├── client/                         # 前端 (React + Vite)
│   └── src/
│       ├── pages/
│       │   ├── KnowledgeInput.tsx      # 知识输入（文本/文件上传，支持拆分预览）
│       │   ├── KnowledgeList.tsx       # 知识列表 + 分类管理
│       │   ├── KnowledgeGraph.tsx      # 知识图谱（vis.js 力导向图）
│       │   ├── AgentChat.tsx           # AI 问答（RAG + 流式输出）
│       │   ├── Review.tsx              # 复习系统（选择题 + 分类筛选）
│       │   ├── TemplateManagement.tsx  # Prompt 模板管理
│       │   ├── ProviderManagement.tsx  # AI 模型配置
│       │   └── TokenUsage.tsx          # Token 消耗统计
│       ├── services/api.ts             # API 调用层
│       └── App.tsx                     # 路由 + 布局
│
├── server/                         # 后端 (Fastify)
│   └── src/
│       ├── routes/                   # API 路由
│       │   ├── knowledge.ts              知识 CRUD + 拆分/合并
│       │   ├── review.ts                 复习系统
│       │   ├── graph.ts                  图谱 + 聚类
│       │   ├── agent.ts                  AI 问答
│       │   ├── categories.ts             分类管理
│       │   ├── templates.ts              模板管理
│       │   ├── providers.ts              模型配置
│       │   └── tokens.ts                 Token 统计
│       ├── services/                 # 业务逻辑
│       │   ├── llm/                      LLM 适配层（OpenAI/Claude）
│       │   ├── knowledgeService.ts       知识处理 + 存储
│       │   ├── promptEngine.ts           Prompt 模板引擎
│       │   ├── reviewService.ts          复习核心逻辑（SM-2）
│       │   ├── reviewQuestionService.ts  题目预生成
│       │   ├── categoryService.ts        分类 CRUD
│       │   ├── graphService.ts           图谱数据查询
│       │   ├── clusteringService.ts      Louvain 聚类
│       │   └── ragService.ts             RAG 检索引擎
│       ├── db/                       # 数据库层
│       │   ├── database.ts              初始化 + 迁移
│       │   ├── knowledgeRepo.ts         知识条目仓储
│       │   └── ...                      其他仓储
│       └── index.ts                  # 服务入口
│
├── shared/                         # 前后端共享类型
│   └── src/index.ts
│
├── docs/                           # 设计文档
├── start.bat                       # Windows 一键启动
├── start.sh                        # Mac/Linux 一键启动
└── pnpm-workspace.yaml             # monorepo 配置
```

## 数据库设计

SQLite 单文件存储于 `server/data/knowledge.db`。

### 核心表

| 表名 | 说明 |
|------|------|
| `knowledge_items` | 知识条目（标题、内容、类型、标签、分类） |
| `knowledge_links` | 知识关联（来源识别 + 聚类生成） |
| `categories` | 分类体系（用户自定义，支持增删改） |
| `review_questions` | 预生成复习题目（存入时 LLM 生成） |
| `review_records` | 复习记录（SM-2 间隔数据） |
| `ai_providers` | AI 提供商配置 |
| `prompt_templates` | Prompt 模板 |
| `chat_sessions` / `chat_messages` | AI 问答会话 |
| `clustering_features` | 聚类特征缓存 |
| `clustering_cache` | 聚类结果缓存 |
| `token_usage` | Token 消耗记录 |

### knowledge_items

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid |
| title | TEXT | 标题 |
| content | TEXT | LLM 结构化内容（JSON） |
| raw_content | TEXT | 原始输入 |
| type | TEXT | classical_chinese / idiom / poetry / general |
| tags | TEXT | 标签数组（JSON） |
| category | TEXT | 用户选择的分类 |
| source_file | TEXT | 原始文件名 |
| embedding | TEXT | 向量嵌入（RAG 用） |

### review_questions（预生成题目）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid |
| item_id | TEXT FK | 关联知识条目 |
| question | TEXT | 题目文字 |
| options | TEXT | 四选一选项（JSON 数组） |
| correct_idx | INTEGER | 正确答案索引 (0-3) |
| explanation | TEXT | 解释说明 |
| category | TEXT | 所属分类 |

### review_records（复习记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid |
| item_id | TEXT FK | 关联知识条目 |
| question_id | TEXT | 关联预生成题目 |
| is_correct | INTEGER | 是否正确 |
| next_review | TEXT | 下次复习时间 |
| interval_days | REAL | 复习间隔（天） |
| review_count | INTEGER | 已复习次数 |

## 核心流程

### 知识存入

```
输入文本/文件
  → LLM 处理（按 Prompt 模板提取结构化内容）
  → 存入 knowledge_items
  → 同步 clustering_features
  → 异步 LLM 生成复习题目 → 存入 review_questions
  → 异步 LLM 识别关联 → 存入 knowledge_links
```

### 复习系统

```
选择分类 → GET /api/review/start?category=历史
  → 从 review_questions 表读预生成题目（零延迟）
  → 展示四选一选择题
  → 用户选择 → POST /api/review/submit
  → 后端判分 + SM-2 间隔计算
  → 返回正确答案 + 解释
```

### 知识图谱聚类

```
点击「重新聚类」→ POST /api/graph/cluster/run
  → 读取 clustering_features（keywords, tags, category）
  → 计算两两 Jaccard 相似度
  → Louvain 社区检测
  → 高相似度节点对写入 knowledge_links（relation_type=聚类）
  → 图谱自动显示关联连线
```

## API 接口

### 知识管理
```
POST   /api/knowledge              添加知识
GET    /api/knowledge              知识列表（?page=&pageSize=&type=&search=&tags=）
GET    /api/knowledge/:id          知识详情
PUT    /api/knowledge/:id          更新知识（含分类）
DELETE /api/knowledge/:id          删除知识
POST   /api/knowledge/preview      预览处理结果（支持拆分）
POST   /api/knowledge/upload       文件上传
POST   /api/knowledge/save-pieces  保存拆分后的知识点
```

### 复习系统
```
GET    /api/review/stats           今日统计
GET    /api/review/categories      分类列表（含是否有题目标记）
GET    /api/review/start?category= 开始复习
POST   /api/review/submit          提交答案 { question_id, item_id, selected_idx }
GET    /api/review/history         复习历史
```

### 分类管理
```
GET    /api/categories             获取所有分类
POST   /api/categories             新增分类 { name }
PUT    /api/categories/:id         修改分类 { name }
DELETE /api/categories/:id         删除分类
```

### 知识图谱
```
GET    /api/graph                  图谱数据（节点+边）
GET    /api/graph/stats            统计信息
POST   /api/graph/cluster/run      运行聚类 { keywordWeight, tagWeight, categoryWeight, threshold }
GET    /api/graph/cluster/params   获取聚类参数
```

### AI 问答
```
POST   /api/agent/chat             对话（SSE 流式）
GET    /api/agent/sessions         会话列表
GET    /api/agent/sessions/:id     会话详情
DELETE /api/agent/sessions/:id     删除会话
```

### 模板 / 模型 / Token
```
GET/POST/PUT/DELETE  /api/templates      Prompt 模板管理
GET/POST/PUT/DELETE  /api/providers      AI 提供商管理
GET    /api/tokens/usage                Token 消耗统计
GET    /api/tokens/daily                每日统计
```

## 开发

```bash
pnpm install        # 安装依赖
pnpm dev            # 前后端同时启动
```

## 文档

详见 `docs/` 目录：
- `review-refactor-2026-03-28.md` — 复习功能重构记录
- `category-system-2026-03-28.md` — 分类系统重构记录
- `graph-visjs-migration-2026-03-28.md` — 图谱迁移 vis.js 记录
- `review-feature-analysis.md` — 原始复习功能分析

## License

MIT
