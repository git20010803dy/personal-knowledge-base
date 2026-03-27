# 个人知识库 — 设计文档

> 日期：2026-03-27
> 作者：萨娅 × 玉郎

## 1. 项目概述

AI 驱动的个人知识管理系统。用户输入杂乱知识（文本、PDF、Markdown、图片），经过 LLM 按类型提取关键词、分类后存入数据库，再通过聚类算法以力导向图展示知识点关联，集成 Agent 问答和复习功能。

## 2. 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | React 18 + TypeScript + Ant Design | 组件成熟，D3/Cytoscape 集成好 |
| 后端 | Node.js (Fastify) + TypeScript | 轻量高性能，前后端同语言 |
| 数据库 | SQLite (better-sqlite3) | 单文件，零配置，够用 |
| 文件存储 | 本地文件系统 `data/uploads/` | 原始文档存放 |
| 图谱可视化 | Cytoscape.js | 力导向图、交互丰富 |
| LLM | 可配置 API（OpenAI / Claude / 国产） | 通过统一适配层接入 |
| 构建工具 | Vite + pnpm | 快速开发体验 |

## 3. 系统架构

```
┌─────────────────────────────────────────────┐
│                   前端 (React)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ 知识输入  │ │ 知识图谱  │ │ Agent 对话   │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────┐ ┌──────────┐                  │
│  │ 复习系统  │ │ 分类管理  │                  │
│  └──────────┘ └──────────┘                  │
└──────────────────┬──────────────────────────┘
                   │ REST API / SSE (流式)
┌──────────────────┴──────────────────────────┐
│                  后端 (Fastify)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ 知识处理  │ │ Prompt   │ │ Agent/RAG    │ │
│  │ 管道      │ │ 模板引擎  │ │ 引擎         │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ 文件解析  │ │ 图谱计算  │ │ 复习调度     │ │
│  │ (PDF/OCR) │ │ (聚类)   │ │              │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└──────────┬───────────────────┬──────────────┘
           │                   │
    ┌──────┴──────┐    ┌──────┴──────┐
    │   SQLite    │    │  文件系统    │
    │ (元数据/图谱) │    │ (原始文档)   │
    └─────────────┘    └─────────────┘
```

## 4. 核心模块设计

### 4.1 知识输入

支持的输入方式：
- **文本输入**：直接在编辑器中粘贴/输入
- **文件上传**：PDF、Markdown、图片（OCR）
- **批量导入**：文件夹批量上传

文件解析：
- PDF → 提取文本（pdf-parse）
- 图片 → OCR 识别（调用 LLM 视觉能力或 Tesseract）
- Markdown → 直接解析

### 4.2 Prompt 模板引擎

根据知识类型走不同处理管线：

| 类型 | Prompt 处理内容 | 输出字段 |
|------|----------------|----------|
| 文言文 | 原文校对 + 白话翻译 + 重点字词注释 | 原文、译文、注释 |
| 成语 | 释义 + 出处 + 典故 + 正确使用示例 | 释义、出处、典故、例句 |
| 诗词 | 诗题解读 + 创作背景 + 作者生平心境 + 全诗逐句赏析 | 诗题、背景、作者、赏析 |
| 通用 | 关键词提取 + 自动分类 + 摘要 | 关键词、分类、摘要 |

模板存储在 `prompt_templates` 表中，支持用户自定义新增模板。

### 4.3 分类系统

- LLM 自动识别知识类型并分类
- 默认行为可配置：**静默归档** 或 **确认后归档**
- 用户可手动调整分类、添加自定义标签
- 分类支持层级结构（如：文学 > 诗词 > 唐诗）

### 4.4 知识图谱

**数据模型：**
- 节点 = 知识条目（带类型、标签、权重）
- 边 = LLM 识别的语义关联（带关系类型和强度）

**关联识别：**
- LLM 在处理新知识时，自动识别与已有知识的关联
- 关联类型：包含、相关、因果、对比、同源等

**可视化：**
- Cytoscape.js 力导向图布局
- 节点颜色/大小按类型和权重区分
- 交互：缩放、拖拽、点击展开详情、搜索定位
- 聚类自动分组（Louvain 算法或 LLM 标签聚类）

### 4.5 Agent 问答

- 基于知识库的 RAG（检索增强生成）
- 流式输出（SSE）
- 支持上下文追问
- 回答时标注引用的知识条目来源

### 4.6 复习系统

**题目生成：**
- 根据知识条目类型自动生成题目
- 支持题型：选择题、填空题、简答题

**复习策略：**
- 间隔重复（类 Anki 算法）
- 正确 → 延长间隔，错误 → 缩短间隔
- 每日复习计划

## 5. 数据库设计

```sql
-- 知识条目
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,              -- LLM 处理后的结构化内容 (JSON)
  raw_content TEXT,          -- 原始输入文本
  type TEXT NOT NULL,        -- 文言文/成语/诗词/通用
  tags TEXT,                 -- JSON 数组
  category TEXT,
  source_file TEXT,          -- 原始文件路径
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 知识关联
CREATE TABLE knowledge_links (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT,        -- 包含/相关/因果/对比/同源
  strength REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES knowledge_items(id),
  FOREIGN KEY (target_id) REFERENCES knowledge_items(id)
);

-- Prompt 模板
CREATE TABLE prompt_templates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- 对应知识类型
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  is_default BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 复习记录
CREATE TABLE review_records (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  user_answer TEXT,
  is_correct BOOLEAN,
  score INTEGER,
  next_review DATETIME,
  interval_days REAL DEFAULT 1,
  review_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES knowledge_items(id)
);

-- 分类
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES categories(id)
);
```

## 6. API 设计（概要）

```
POST   /api/knowledge              -- 添加知识（文本/文件上传）
GET    /api/knowledge              -- 知识列表（分页、筛选、搜索）
GET    /api/knowledge/:id          -- 知识详情
PUT    /api/knowledge/:id          -- 更新知识
DELETE /api/knowledge/:id          -- 删除知识

GET    /api/graph                   -- 获取图谱数据（节点+边）
GET    /api/graph/cluster           -- 获取聚类结果

POST   /api/agent/chat              -- Agent 问答（SSE 流式）
GET    /api/agent/history/:session  -- 对话历史

POST   /api/review/generate         -- 生成复习题目
POST   /api/review/submit           -- 提交答案
GET    /api/review/today            -- 今日复习计划

GET    /api/categories              -- 分类列表
POST   /api/categories              -- 新建分类
PUT    /api/categories/:id          -- 更新分类

GET    /api/templates               -- Prompt 模板列表
POST   /api/templates               -- 新建模板
PUT    /api/templates/:id           -- 更新模板
```

## 7. 项目结构

```
personal-knowledge-base/
├── client/                    # 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── KnowledgeInput/    -- 知识输入组件
│   │   │   ├── KnowledgeGraph/    -- 图谱可视化
│   │   │   ├── AgentChat/         -- Agent 对话
│   │   │   ├── Review/            -- 复习系统
│   │   │   └── Layout/            -- 布局组件
│   │   ├── pages/
│   │   ├── services/              -- API 调用
│   │   ├── stores/                -- 状态管理
│   │   └── types/
│   ├── package.json
│   └── vite.config.ts
├── server/                    # 后端
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── knowledge.ts       -- 知识处理
│   │   │   ├── llm.ts             -- LLM 适配层
│   │   │   ├── graph.ts           -- 图谱计算
│   │   │   ├── review.ts          -- 复习调度
│   │   │   └── agent.ts           -- Agent/RAG
│   │   ├── db/                    -- SQLite 初始化和查询
│   │   ├── prompts/               -- Prompt 模板
│   │   └── utils/
│   ├── data/                      -- SQLite + uploads
│   ├── package.json
│   └── tsconfig.json
├── shared/                    # 前后端共享类型
│   └── types.ts
├── docs/
│   └── 2026-03-27-personal-knowledge-base-design.md
├── package.json               -- 根 package.json (monorepo)
└── pnpm-workspace.yaml
```

## 8. 开发计划（概要）

1. **Phase 1**：项目脚手架 + 知识输入 + LLM 处理 + SQLite 存储
2. **Phase 2**：力导向图可视化 + 关联识别 + 聚类
3. **Phase 3**：Agent 问答（RAG）
4. **Phase 4**：复习系统
5. **Phase 5**：Prompt 模板自定义 + UI 打磨

---

_文档版本 1.0 — 2026-03-27_
