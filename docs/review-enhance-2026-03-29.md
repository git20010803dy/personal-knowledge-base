# 复习增强功能 — 设计方案

> 创建时间：2026-03-29
> 状态：开发中

## 一、功能概述

在复习过程中增加 AI 交互能力：

| 功能 | 说明 |
|------|------|
| 解释追问 | 对题目的 explanation 不明白时，调用 LLM 进一步解释 |
| 选项解释 | 对其他 3 个干扰项不了解时，可单独请求解释 |
| 延伸知识 | 围绕知识点延伸（作者背景、时代状况、文化关联等） |
| Token 记录 | 所有 LLM 调用展示并记录 token 消耗 |

## 二、核心设计决策

### 2.1 追问模式：轻量多轮对话

- 前端在每道题的 `submitted` 状态下维护本地 `chatMessages[]`
- 每次请求带上完整对话历史，后端拼装上下文后调 LLM
- 不走 `chat_sessions` 表，不持久化对话（题目切走即丢弃）
- API：`POST /api/review/explain`

### 2.2 延伸知识持久化：用户手动选择

三种方案对比后选择 **方案 B（用户手动保存）**：

| 方案 | 风险 |
|------|------|
| A. 不存 | 好内容丢失 |
| B. 手动存 ✅ | 无 |
| C. 自动存 | 知识库膨胀、幻觉污染 |

保存时给用户两个选择：
- **追加到当前知识点**（更新 `knowledge_items.content`）
- **新建知识点**（独立条目 + 自动链接到原知识点）

### 2.3 Token 消耗

复用现有 `token_usage` 表，新增 `call_type`：
- `review_explain` — 解释追问
- `review_options` — 选项解释
- `review_extend` — 延伸知识

## 三、数据库变更

### 新表：review_extensions（延伸知识暂存区）

```sql
CREATE TABLE IF NOT EXISTS review_extensions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  question_id TEXT,
  content TEXT NOT NULL,
  extension_type TEXT NOT NULL,     -- 'author' | 'era' | 'background' | 'other'
  is_saved INTEGER DEFAULT 0,
  saved_item_id TEXT,
  tokens INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
);
```

### 新表：system_prompts（统一 Prompt 管理）

```sql
CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,           -- 'knowledge' | 'review' | 'agent'
  description TEXT,
  prompt TEXT NOT NULL,
  variables TEXT DEFAULT '[]',      -- 变量列表 JSON
  data_flow TEXT,                   -- 数据流说明
  logic_flow TEXT,                  -- 逻辑流说明
  is_active INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 四、API 设计

### 4.1 POST /api/review/explain

```json
// 请求
{
  "question_id": "string",
  "item_id": "string",
  "messages": [{ "role": "user", "content": "..." }],
  "context_type": "explanation | options | extend",
  "option_index": 0              // context_type=options 时必填
}

// 响应（SSE 流式）
data: {"type":"token","data":"..."}
data: {"type":"done","data":{"tokens":234,"time_ms":1200}}
```

### 4.2 POST /api/review/extend/save

```json
// 请求
{
  "extension_id": "string",
  "action": "append | create"
}

// 响应
{ "success": true, "item_id": "string" }
```

### 4.3 Prompt 管理 API

- `GET /api/prompts` — 列表
- `GET /api/prompts/:key` — 按 key 获取
- `PUT /api/prompts/:key` — 更新
- `POST /api/prompts/reset` — 重置为内置

## 五、Prompt 统一管理

### 管理的 Prompt 列表

| key | 名称 | 分类 | 用途 |
|-----|------|------|------|
| knowledge_classical_chinese | 文言文处理 | knowledge | 文言文知识点解析 |
| knowledge_idiom | 成语处理 | knowledge | 成语知识点解析 |
| knowledge_poetry | 诗词处理 | knowledge | 诗词知识点解析 |
| knowledge_general | 通用处理 | knowledge | 通用知识点解析 |
| review_generate | 出题生成 | review | 根据知识点生成选择题 |
| review_explain | 解释追问 | review | 对题目解释进一步说明 |
| review_options | 选项解释 | review | 解释错误选项的含义 |
| review_extend | 延伸知识 | review | 生成延伸背景知识 |
| agent_classify | 类型分类 | agent | 判断输入内容类型 |
| agent_rag | RAG 问答 | agent | 基于知识库回答问题 |

### 前端页面

- 路由：`/prompts`
- 按分类折叠面板展示
- 每个 Prompt 显示：名称、描述、数据流图、逻辑流图
- 可编辑模板内容
- 变量用 `{{var}}` 标记，下方列出说明

## 六、前端交互

### 复习界面增强

提交答案后，在解释下方增加：

```
💬 追问区域（可折叠）
├── 对话历史
├── 输入框 + 发送按钮
└── 快捷按钮行：
    ├── [📖 A选项解释] [📖 B选项解释] [📖 C选项解释]
    └── [🌍 延伸知识]
```

延伸知识生成后弹出卡片：
- [💾 追加到当前知识点]
- [📄 新建知识点]
- [❌ 不保存]

### Prompt 管理页面

- 路由 `/prompts`
- 按分类 Tab 切换：知识处理 / 复习 / 智能问答
- 每个 Prompt 卡片：描述 → 数据流 → 逻辑流 → 模板编辑器
- 保存后自动同步前后端

## 七、开发顺序

| Phase | 内容 | 文件 |
|-------|------|------|
| 1 | DB: system_prompts 表 + review_extensions 表 + 初始化数据 | database.ts |
| 2 | 后端: promptRepo + prompt 路由 | db/promptRepo.ts, routes/prompts.ts |
| 3 | 后端: review/explain 路由 (SSE) | routes/review.ts |
| 4 | 后端: review/extend/save 路由 | routes/review.ts |
| 5 | 前端: API 接口 | services/api.ts |
| 6 | 前端: Prompt 管理页面 | pages/PromptManagement.tsx |
| 7 | 前端: 复习追问 UI | pages/Review.tsx |
| 8 | 前端: 路由注册 | App.tsx |
