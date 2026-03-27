# 个人知识库 — Personal Knowledge Base

AI 驱动的个人知识管理系统。输入杂乱知识，经 LLM 智能提取、分类、关联，以知识图谱可视化呈现，集成 Agent 问答和间隔重复复习。

## 功能概览

| 模块 | 说明 |
|------|------|
| 📝 **知识输入** | 文本输入 / 上传 PDF、Markdown、图片，LLM 按类型处理 |
| 📋 **知识列表** | 分页浏览、搜索、筛选、查看详情 |
| 🕸️ **知识图谱** | Cytoscape.js 力导向图，展示知识关联和聚类 |
| 🤖 **AI 问答** | RAG 检索增强问答，流式输出，引用来源 |
| 📚 **复习系统** | SM-2 间隔重复算法，自动生成题目 |
| 📑 **模板管理** | 自定义 Prompt 模板（文言文/成语/诗词/通用） |
| ⚙️ **模型配置** | 前端管理多个 AI 提供商，支持 OpenAI 兼容接口 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Ant Design + Cytoscape.js |
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
# 双击 start.bat 或命令行运行：
start.bat
```

### 手动启动

```bash
# 安装依赖
pnpm install

# 启动（前端 + 后端同时运行）
pnpm dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

### 配置 AI 模型

1. 打开 http://localhost:5173
2. 点击侧栏「模型配置」
3. 添加你的 API Key（支持 OpenAI、智谱、通义千问等兼容接口）
4. 点击「激活」设为默认模型

## 项目结构

```
personal-knowledge-base/
├── client/                    # 前端 (React)
│   └── src/
│       ├── pages/             # 页面组件
│       │   ├── KnowledgeInput.tsx      # 知识输入
│       │   ├── KnowledgeList.tsx       # 知识列表
│       │   ├── KnowledgeGraph.tsx      # 知识图谱
│       │   ├── AgentChat.tsx           # AI 问答
│       │   ├── Review.tsx              # 复习系统
│       │   ├── TemplateManagement.tsx  # 模板管理
│       │   └── ProviderManagement.tsx  # 模型配置
│       ├── services/api.ts    # API 调用层
│       └── App.tsx            # 路由 + 布局
├── server/                    # 后端 (Fastify)
│   └── src/
│       ├── routes/            # API 路由
│       ├── services/          # 业务逻辑
│       │   ├── llm/           # LLM 适配层
│       │   ├── knowledgeService.ts    # 知识处理
│       │   ├── promptEngine.ts        # Prompt 模板
│       │   ├── graphService.ts        # 图谱计算
│       │   ├── ragService.ts          # RAG 引擎
│       │   └── reviewService.ts       # 复习调度
│       ├── db/                # 数据库层
│       └── index.ts           # 服务入口
├── shared/                    # 前后端共享类型
│   └── src/index.ts
├── start.bat                  # Windows 一键启动
├── start.sh                   # Mac/Linux 一键启动
└── docs/                      # 设计文档
```

## 数据库设计

SQLite 单文件存储于 `server/data/knowledge.db`，共 8 张表：

### knowledge_items — 知识条目

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识 |
| title | TEXT NOT NULL | 标题 |
| content | TEXT | LLM 处理后的结构化内容（JSON） |
| raw_content | TEXT | 原始输入文本 |
| type | TEXT NOT NULL | 类型：classical_chinese / idiom / poetry / general |
| tags | TEXT DEFAULT '[]' | 标签（JSON 数组） |
| category | TEXT | 分类 |
| source_file | TEXT | 原始文件路径 |
| embedding | TEXT | 向量嵌入（JSON 数组，用于 RAG 检索） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**索引：** type, category, created_at

### knowledge_links — 知识关联

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识 |
| source_id | TEXT FK → knowledge_items | 源节点 |
| target_id | TEXT FK → knowledge_items | 目标节点 |
| relation_type | TEXT | 关系类型：相关/包含/因果/对比/同源 |
| strength | REAL DEFAULT 1.0 | 关联强度 |
| created_at | DATETIME | 创建时间 |

**索引：** source_id, target_id

### ai_providers — AI 提供商

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识 |
| name | TEXT NOT NULL | 显示名称 |
| provider_type | TEXT NOT NULL | 类型：openai / claude / custom |
| api_key | TEXT NOT NULL | API 密钥 |
| base_url | TEXT NOT NULL | API 地址 |
| model | TEXT NOT NULL | 默认模型名 |
| is_active | INTEGER DEFAULT 0 | 是否为当前活跃提供商（唯一） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### prompt_templates — Prompt 模板

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识 |
| type | TEXT NOT NULL | 对应知识类型 |
| name | TEXT NOT NULL | 模板名称 |
| template | TEXT NOT NULL | 模板内容（支持 {{variable}} 变量） |
| is_default | INTEGER DEFAULT 0 | 是否为内置模板 |
| created_at | DATETIME | 创建时间 |

### chat_sessions — 对话会话

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识 |
| title | TEXT | 会话标题（首条消息截取） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 最后活跃时间 |

### chat_messages — 对话消息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识 |
| session_id | TEXT FK → chat_sessions | 所属会话 |
| role | TEXT NOT NULL | 角色：user / assistant |
| content | TEXT NOT NULL | 消息内容 |
| sources | TEXT | 引用的知识条目 ID（JSON 数组） |
| created_at | DATETIME | 创建时间 |

**索引：** session_id

### review_records — 复习记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识 |
| item_id | TEXT FK → knowledge_items | 关联知识条目 |
| question | TEXT NOT NULL | 题目 |
| answer | TEXT | 正确答案 |
| user_answer | TEXT | 用户答案 |
| is_correct | INTEGER | 是否正确 |
| score | INTEGER | 评分 |
| next_review | DATETIME | 下次复习时间 |
| interval_days | REAL DEFAULT 1 | 复习间隔（天） |
| review_count | INTEGER DEFAULT 0 | 已复习次数 |
| created_at | DATETIME | 创建时间 |

**索引：** item_id, next_review

### categories — 分类

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识 |
| name | TEXT NOT NULL | 分类名称 |
| parent_id | TEXT FK → categories | 父分类（支持层级） |
| sort_order | INTEGER DEFAULT 0 | 排序权重 |

### schema_migrations — 数据库版本

| 字段 | 类型 | 说明 |
|------|------|------|
| version | INTEGER PK | 迁移版本号 |
| applied_at | DATETIME | 应用时间 |

## API 接口

```
# 知识管理
POST   /api/knowledge              添加知识（文本/文件）
GET    /api/knowledge              知识列表（分页/搜索/筛选）
GET    /api/knowledge/:id          知识详情
PUT    /api/knowledge/:id          更新知识
DELETE /api/knowledge/:id          删除知识
POST   /api/knowledge/preview      预览处理结果
POST   /api/knowledge/upload       文件上传

# 知识图谱
GET    /api/graph                  图谱数据（节点+边）
GET    /api/graph/cluster          聚类结果
GET    /api/graph/stats            统计信息

# AI 问答
POST   /api/agent/chat             对话（SSE 流式）
GET    /api/agent/sessions         会话列表
GET    /api/agent/sessions/:id     会话详情
DELETE /api/agent/sessions/:id     删除会话

# 复习系统
POST   /api/review/start           开始复习
POST   /api/review/submit          提交答案
GET    /api/review/today           今日统计
GET    /api/review/history         复习历史

# 模板管理
GET    /api/templates              模板列表
POST   /api/templates              新建模板
PUT    /api/templates/:id          更新模板
DELETE /api/templates/:id          删除模板

# 模型配置
GET    /api/providers              提供商列表
POST   /api/providers              添加提供商
PUT    /api/providers/:id          更新提供商
DELETE /api/providers/:id          删除提供商
POST   /api/providers/:id/activate 激活提供商
POST   /api/providers/test         测试连接
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式（前后端热重载）
pnpm dev

# 前端单独启动
cd client && pnpm dev

# 后端单独启动
cd server && pnpm dev
```

## License

MIT
