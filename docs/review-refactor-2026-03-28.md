# 复习功能重构 — 修改记录

> 日期：2026-03-28
> 状态：已完成

---

## 一、需求变更

### 1.1 原始问题
- 前端本地判分，后端 review_records 未同步，SM-2 间隔重复不生效
- 每次复习都调 LLM 生成题目，延迟高、浪费 token
- 题型过多（选择/填空/简答），体验复杂
- 动态 tags 做分类筛选，标签太多太散

### 1.2 新方案
- **只保留选择题**，出题 Prompt 只生成四选一
- **存入时预生成题目**，复习时直接读表，零延迟
- **固定分类**替代动态 tags：历史、地理、文学、成语、诗词、哲学、科学、数码、常识、其他
- **后端统一判分**，前端不再本地判分

---

## 二、数据结构变更

### 2.1 新表：review_questions

```sql
CREATE TABLE review_questions (
  id          TEXT PRIMARY KEY,        -- nanoid
  item_id     TEXT NOT NULL,           -- 关联 knowledge_items.id
  question    TEXT NOT NULL,           -- 题目文字
  options     TEXT NOT NULL,           -- JSON: ["选项A", "选项B", "选项C", "选项D"]
  correct_idx INTEGER NOT NULL,       -- 正确选项索引 (0-3)
  explanation TEXT,                    -- 解释说明
  category    TEXT DEFAULT '其他',     -- 固定分类字段
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_rq_item ON review_questions(item_id);
```

### 2.2 review_records 表新增字段

```sql
-- review_records 新增 question_id 列（在 CREATE TABLE 中已加）
question_id TEXT  -- 关联 review_questions.id
```

### 2.3 migration v5 改进

- 支持 `extra` 回调，用于执行 ALTER TABLE 等非 SQL 字符串操作
- 新数据库在 initTables 中直接创建 review_questions 表
- 已有数据库通过 migration 的 extra 回调添加 category 列

---

## 三、流程对比

### 3.1 存入流程

```
原：processAndStore → clustering_features（同步）
新：processAndStore → clustering_features（同步）
                    → review_questions（异步，LLM 生成 3-5 道选择题 + 分类判断）
```

### 3.2 复习流程

```
原：startReview → 调 LLM 生成题目 → 前端答题 → 本地判分（不回写）
新：GET /api/review/start?category=历史
    → 从 review_questions 表读题（零延迟）
    → 前端展示选择题
    → 用户选择 → POST /api/review/submit
    → 后端判分 + SM-2 间隔更新 → 返回正确答案 + 解释
```

---

## 四、文件改动清单

| # | 文件 | 改动内容 |
|---|------|---------|
| 1 | `server/src/db/database.ts` | review_questions 表新增 category 列；migration 支持 extra 回调 |
| 2 | `server/src/services/reviewQuestionService.ts` | **新建** — 题目预生成服务，定义 REVIEW_CATEGORIES 枚举 |
| 3 | `server/src/services/reviewService.ts` | 重写：从 review_questions 表读题；按 category 筛选；后端判分 |
| 4 | `server/src/routes/review.ts` | 新增 GET /categories；GET /start 改为 category 参数 |
| 5 | `server/src/services/knowledgeService.ts` | processAndStore 后异步触发 generateAndStoreQuestions |
| 6 | `server/src/services/promptEngine.ts` | 诗词模板增加 ci_pattern_name；文言文模板增加 author/dynasty；keywords 要求包含作者名 |
| 7 | `client/src/pages/Review.tsx` | 完全重写：固定分类选择器 + 纯选择题界面 + 后端判分 |
| 8 | `client/src/App.tsx` | prettier 格式化 |

---

## 五、API 变更

| 接口 | 原 | 新 |
|------|----|----|
| 开始复习 | POST /api/review/start `{ count }` | GET /api/review/start?category=历史&count=10 |
| 提交答案 | POST /api/review/submit `{ review_id, user_answer }` | POST /api/review/submit `{ question_id, item_id, selected_idx }` |
| 今日统计 | GET /api/review/today | GET /api/review/stats |
| 标签/分类 | — | GET /api/review/categories |

---

## 六、Prompt 变更

### 6.1 文言文模板

新增字段：`author`（作者）、`dynasty`（朝代）
keywords 说明：作者名必须包含

### 6.2 诗词模板

新增字段：`ci_pattern_name`（词牌名，如《水调歌头》《念奴娇》）
keywords 说明：作者名必须包含；有词牌名时词牌名也必须包含

### 6.3 复习出题 Prompt

只生成选择题，返回格式：
```json
{
  "category": "历史",
  "questions": [
    {
      "question": "题目文字",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correct_idx": 0,
      "explanation": "解释说明"
    }
  ]
}
```

---

## 七、前端交互

### 7.1 复习中心页面

```
┌─────────────────────────────────────────────┐
│  📚 复习中心                                 │
├─────────────────────────────────────────────┤
│  📊 统计卡片：待复习 | 已完成 | 正确率 | 连续天数 │
├─────────────────────────────────────────────┤
│  📚 选择分类                                 │
│  [全部] [历史] [地理] [文学] [成语] [诗词] ... │
│  [ 开始复习（历史）]                          │
├─────────────────────────────────────────────┤
│  答题会话                                    │
│  来自：XXX        [历史]  1/15               │
│  ████████░░░░░░░░ 67%                       │
│                                              │
│  以下关于 XXX 的说法，正确的是？               │
│  ○ A. ...    ○ B. ...                       │
│  ○ C. ...    ○ D. ...                       │
│  [ 提交答案 ]                                │
├─────────────────────────────────────────────┤
│  ✅ 正确！ / ❌ 错误，正确答案是 B             │
│  💡 解释说明                                  │
│  [ 下一题 ]                                  │
└─────────────────────────────────────────────┘
```

---

## 八、Bug 修复记录

### 8.1 问题：复习页面报错"加载复习数据失败"

**现象：** 点击侧栏「复习」，弹窗提示"加载复习数据失败"。

**排查过程：**
1. 服务在线 ✓（`/api/health` 正常）
2. `GET /api/review/stats` 正常返回
3. `GET /api/review/categories` 返回 `{"error":"no such column: category"}` ✗

**根因：** `review_questions` 表在早期版本创建时没有 `category` 列。后来添加 category 字段时，initTables 中的 CREATE TABLE 已经生效（表已存在，不会重建），而 migration v5 虽然代码里写了 `extra` 回调来 ALTER TABLE，但 v5 已经被标记为已执行（因为之前创建表时版本号已经到了），所以 extra 回调从未执行。

**修复：** 新增 migration v6，同样包含 `extra` 回调尝试添加 category 列（try-catch 防止重复添加）。重启服务器后 v6 自动执行。

**代码变更：**
```typescript
// database.ts - 新增 v6 迁移
{
  version: 6,
  sql: `-- Ensure review_questions has category column (idempotent)`,
  extra: (db: Database) => {
    try { db.run("ALTER TABLE review_questions ADD COLUMN category TEXT DEFAULT '其他'"); } catch {}
  },
},
```

**教训：** 对于已有数据库的表结构变更，不能依赖 initTables 的 CREATE TABLE IF NOT EXISTS（已有表不会重建）。必须通过 migration + ALTER TABLE 处理，且要考虑 migration 版本已执行的情况。

### 8.2 问题：已有知识点没有复习题目

**现象：** `review_questions` 只在新存入知识点时生成，已有知识点没有题目，复习时无题可做。

**根因：** 题目预生成逻辑写在 `knowledgeService.processAndStore()` 中，只在新知识点存入时触发。存量数据从未经过这个流程。

**修复：**
1. 新增 `reviewQuestionService.getItemsWithoutQuestions()` — 查询没有题目的知识点
2. 新增 `reviewQuestionService.generateMissingQuestions()` — 批量调 LLM 生成题目
3. 新增 `GET /api/review/missing` — 查询缺少题目的数量
4. 新增 `POST /api/review/generate` — 触发批量生成
5. 前端复习页：有缺少题目时显示黄色提示卡片 +「批量生成题目」按钮

### 8.3 问题：知识列表修改分类不同步到复习系统

**现象：** 在知识列表页修改知识点分类后，复习页的分类筛选仍按旧分类过滤，题目显示不出来。

**根因：** category 字段存在于两张表中：
- `knowledge_items.category` — 知识列表修改的
- `review_questions.category` — 复习筛选读取的
- 两者没有同步机制

**修复：** 在 `PUT /api/knowledge/:id` 路由中，当 category 变更时，同步执行：
```sql
UPDATE review_questions SET category = ? WHERE item_id = ?
```

### 8.4 问题：AI 问答知识点链接退出重进后失效

**现象：** AI 回答中引用了知识点，点击可正常查看详情。但退出该会话再重新进入，点击知识点链接显示"加载知识详情失败"。

**根因：** sources 存储格式不一致。

| 阶段 | sources 格式 |
|------|-------------|
| SSE 实时推送 | `[{ id: "abc", title: "赤壁赋" }]` — 对象数组 |
| 写入数据库 | `["abc", "def"]` — 纯 ID 字符串数组（只存了 id） |
| 从数据库加载 | `["abc", "def"]` — 原样返回，没解析 |
| 前端渲染 | `src.id` = undefined（字符串没有 .id 属性）|
| 点击调用 | `GET /api/knowledge/undefined` → 404 |

**修复：**

1. `chatRepo.ts` `getMessagesBySession()` — 加载消息时：
   - 收集所有 source ID
   - 批量查询 `knowledge_items` 表获取 title
   - 把 `["abc", "def"]` 解析为 `[{ id: "abc", title: "赤壁赋" }, { id: "def", title: "已删除" }]`

2. `shared/src/index.ts` — `ChatMessage.sources` 类型从 `string[]` 改为 `Array<{ id: string; title: string }>`

### 8.5 问题：AI 问答知识详情展示改为弹窗

**现象：** AI 问答中点击知识点链接，详情展示在 520px 侧栏 Drawer 中，与知识列表页的弹窗格式不一致。

**修复：** AgentChat.tsx 中将 Drawer 替换为 Modal（860px），内容布局与 KnowledgeList 详情弹窗一致。导入移除 Drawer 改为 Modal，Descriptions 增加时间字段，结构化内容增加 JSON 解析安全处理。

---

*文档路径：`E:\workSpace_openclaw\personal-knowledge-base\docs\review-refactor-2026-03-28.md`*

### 8.6 知识图谱节点详情改为按需加载 Modal

**现象：** 知识图谱点击节点后侧栏只展示少量信息（类型、标题、关联数、标签、分类），没有原始内容和结构化内容。如果一开始就加载全部详情数据，会增加内存和性能开销。

**修复：** 分两步交互：
1. 点击节点 → 侧栏 Drawer 展示基本信息（来自 vis.js 内存数据，零请求）
2. 点击「查看详情」按钮 → 调用 GET /api/knowledge/:id 获取完整数据 → 860px Modal 展示（与知识列表/AI 问答格式一致）

**改动：**
- KnowledgeGraph.tsx — 新增 detailItem 状态 + handleViewDetail 函数
- 导入新增 knowledgeApi
- Drawer 底部新增「查看详情」按钮
- 新增 Modal 组件，展示完整知识详情（Descriptions + 原始内容 + 结构化内容）


### 8.7 知识图谱页面白屏 — Modal 导入缺失

**现象：** 点击侧栏「知识图谱」后页面加载失败，白屏。

**根因：** 8.6 的改动中新增了 Modal 和 Descriptions 组件的使用，但忘了在 import 语句中导入这两个组件。运行时找不到 Modal/Descriptions 导致 React 渲染报错。

**修复：** 在 antd 的 import 中添加 Modal 和 Descriptions。

**教训：** 添加新组件使用时必须同步检查导入语句。Vite 构建时不会报错（因为 import 是动态的），但运行时会崩溃。


### 8.8 复习页面报错"加载复习数据失败" — question_id 列缺失

**现象：** 点击侧栏「复习」，弹窗提示"加载复习数据失败"。

**排查过程：**
1. 测试 API：GET /api/review/stats 返回 {"error":"no such column: question_id"}
2. review_records 表在早期创建时没有 question_id 列
3. 虽然 initTables 中的 CREATE TABLE 包含了 question_id，但已有数据库的表不会重建
4. migration v6 只添加了 review_questions.category，没有处理 review_records

**根因：** 与 8.1 类似的问题 — 已有数据库的表结构变更必须通过 migration 处理。review_records 表缺少 question_id 列，而 getTodayStats 的 SQL 查询引用了该列。

**修复：** 新增 migration v7，通过 extra 回调尝试添加 question_id 列（try-catch 防止重复添加）：
`	ypescript
{
  version: 7,
  extra: (db: Database) => {
    try { db.run("ALTER TABLE review_records ADD COLUMN question_id TEXT"); } catch {}
  },
},
`

**教训：** 修改已有表结构时，必须同时：1) 更新 initTables 中的 CREATE TABLE（新数据库用），2) 添加 migration（已有数据库用）。两者缺一不可。


## 九、功能增强记录

### 9.1 显示大模型调用消耗（Token + 耗时）

**需求：** 在调用大模型返回的结果中显示本次调用消耗的 tokens 数和时间，但不影响原有的 token_usage 统计功能。

**涉及位置：**
- 知识输入预览（processTextInput → 预览结果）
- AI 问答（agent chat → 流式/非流式回答）
- 知识拆分预览（split-preview → 聚合多个 piece 的消耗）

**后端改动：**
- knowledgeService.processTextInput() 返回值新增 _usage: { total_tokens, time_ms }
- split-preview 路由聚合所有 piece 的 _usage 返回顶层
- agent.ts 聊天 SSE done 事件新增 tokens 和 time_ms 字段

**前端改动：**
- KnowledgeInput.tsx — 新增 previewUsage 状态，预览结果卡片下方显示
- AgentChat.tsx — 新增 lastUsage 状态，AI 回答下方显示
- api.ts — onDone 回调类型新增 tokens 和 time_ms

**显示格式：**
- 知识预览：🔢 Token 消耗: XXX | ⏱️ 耗时: X.Xs
- AI 问答：🔢 XXX tokens | ⏱️ X.Xs


### 9.2 AI 问答时间戳显示

**需求：** AI 回答下方显示回答生成的时间（24小时制年月日），不只是耗时时间。

**改动：**
- AgentChat.tsx Message 接口新增 created_at 字段
- 创建新消息时设置 created_at: new Date().toISOString()
- 显示格式从 🔢 tokens | ⏱️ 耗时 改为 📅 2026/03/28 16:18 | 🔢 tokens | ⏱️ 耗时
- 历史消息使用数据库中的 created_at，新消息使用当前时间


### 8.9 AI 问答报错 HTTP 500 — chat_messages 缺少列

**现象：** AI 问答发送消息返回 500 错误：	able chat_messages has no column named tokens

**根因：** 迁移版本号复用问题。

时间线：
1. 添加 v7 迁移，extra 回调只写了 ALTER TABLE review_records ADD COLUMN question_id
2. 服务器启动，v7 执行，版本号记为 7
3. 后来需要给 chat_messages 加 tokens/time_ms，我把这两个 ALTER TABLE 加到了 v7 的 extra 回调里
4. 重启服务器，发现当前版本已是 7，跳过 v7 → 新加的 ALTER TABLE 永远不会执行

**教训：** 迁移版本号不可复用。已经执行过的版本号，即使代码变了也不会重新执行。新增表结构变更必须用新的版本号。

**修复：** 拆分为 v7（question_id）和 v8（tokens + time_ms），新增 v8 迁移。

### 8.10 已配置模型测试连接失败 — API Key 遮蔽值被当成真实值

**现象：** 模型配置页面，编辑已保存的配置后点击「测试连接」，显示 连接失败: 401 incorrect api key。

**根因：** 两个问题叠加。

**问题 1：GET 返回遮蔽值**
- GET /api/providers 返回时，api_key 被 maskApiKey() 遮蔽为 k_2****4O25
- 前端编辑表单填充的是遮蔽值
- 测试按钮用表单值发送请求 → 遮蔽 key 不是真实 key → 401

**问题 2：更新时遮蔽值被保存**
- 原始检查 if (body.api_key && /^\*+$/.test(body.api_key)) 只匹配全星号如 ****
- maskApiKey() 返回的格式是 k_2****4O25（带前后缀），不匹配正则
- 导致遮蔽值被当成真实 key 保存到数据库（此 bug 在 8.10 前已修复，改为 includes('****')）

**修复：**
1. 后端 PUT：检查条件改为 includes('****')，匹配任何包含遮蔽标记的 key
2. 后端 POST /test：支持可选 id 参数，如果 key 包含 **** 且有 id，从数据库读真实 key 再测试
3. 前端 handleTest：传递 id: editingId 给测试接口

