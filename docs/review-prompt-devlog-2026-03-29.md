# 复习增强功能 + Prompt 统一管理 — 开发记录

> 日期：2026-03-29
> 开发者：萨娅（AI）

## 一、需求来源

玉郎提出复习功能需要增强：
1. 对解释不明白时可调用 LLM 追问
2. 对其他 3 个选项可请求进一步解释
3. 可延伸知识点（作者背景、时代状况等）
4. 延伸知识可选择保存（追加到当前 / 新建）
5. 所有 LLM 调用展示并记录 token 消耗
6. 统一管理所有 Prompt，前端可查看和编辑

## 二、设计方案

文档：[review-enhance-2026-03-29.md](./review-enhance-2026-03-29.md)

核心决策：
- 追问模式 = 轻量多轮对话（前端维护历史，不走 chat_sessions）
- 延伸知识 = 用户手动选择保存方式
- Token 记录 = 复用 token_usage 表，新增 call_type
- Prompt 管理 = 新建 system_prompts 表，统一存储所有 Prompt

## 三、开发过程

### Phase 1：数据库设计（server/src/db/database.ts）

**migration v9** 新增两张表：

```sql
-- 延伸知识暂存区
CREATE TABLE review_extensions (
  id, item_id, question_id, content, extension_type,
  is_saved, saved_item_id, tokens, created_at
);

-- 统一 Prompt 管理
CREATE TABLE system_prompts (
  id, key UNIQUE, name, category, description,
  prompt, variables, data_flow, logic_flow,
  is_active, updated_at
);
```

同时初始化 10 条内置 Prompt 数据。

### Phase 2：后端 Prompt 管理

新建文件：
- `server/src/db/promptRepo.ts` — CRUD 操作
- `server/src/routes/prompts.ts` — API 路由

```
GET    /api/prompts         — 列表（?category=xxx 筛选）
GET    /api/prompts/:key    — 按 key 获取
PUT    /api/prompts/:key    — 更新
POST   /api/prompts/reset   — 重置为内置
```

注册路由：修改 `routes/index.ts` + `index.ts`

### Phase 3：后端复习追问

修改 `server/src/routes/review.ts`，新增两个端点：

**POST /api/review/explain**（SSE 流式）
- 输入：question_id, item_id, messages[], context_type, option_index
- 从 DB 加载题目数据 + 从 system_prompts 读取对应 prompt
- 替换变量后调用 LLM 流式接口
- SSE 逐 token 返回，done 事件附带 tokens/time_ms
- 延伸模式自动写入 review_extensions 表

**POST /api/review/extend/save**
- 输入：extension_id, action (append|create)
- append：追加到 knowledge_items.content（JSON 结构化 or markdown 追加）
- create：新建 knowledge_items + 自动创建 knowledge_links 关联

### Phase 4：前后端解耦旧模板系统

发现旧模板管理（prompt_templates 表）和新 Prompt 管理（system_prompts 表）存在重复：
- 旧系统：TemplateManagement.tsx → /api/templates → prompt_templates 表
- 新系统：PromptManagement.tsx → /api/prompts → system_prompts 表
- **关键依赖**：knowledgeService.ts 用 templateRepo.findByType() 读取知识处理模板

处理方式：
1. knowledgeService.ts 改为从 system_prompts 表读取（通过 getPromptByKey）
2. 移除 templateRepo 依赖
3. 删除旧模板管理的前端路由/菜单/API
4. 保留 prompt_templates 表定义（不影响已有数据库）

修改的文件：
- `server/src/services/knowledgeService.ts` — 构造函数移除 templateRepo，processTextInput 改用 getPromptByKey
- `server/src/index.ts` — 移除 templateRepo 创建和 templateRoutes 注册
- `server/src/routes/index.ts` — 移除 templateRoutes 导出
- `server/src/db/index.ts` — 移除 createTemplateRepo 导出
- `client/src/App.tsx` — 移除 /templates 路由和菜单项
- `client/src/services/api.ts` — 移除 templateApi

### Phase 5：前端 Prompt 管理页面

新建 `client/src/pages/PromptManagement.tsx`：
- 按分类 Tab 切换（知识处理 / 复习 / 智能问答）
- 每个 Prompt 卡片展示：用途、变量、数据流、逻辑流、模板预览
- 支持编辑（Modal）和重置全部
- 修改后即时生效

### Phase 6：前端复习追问 UI

修改 `client/src/pages/Review.tsx`：
- 新增状态：chatMessages[], chatInput, extendContent, extendId 等
- 提交答案后展示"追问与延伸"面板
- 快捷按钮：错误选项解释 + 延伸知识
- 对话式追问（SSE 流式，逐字显示）
- 延伸知识卡片：展示 → 追加到当前知识点 / 新建知识点 / 不保存
- Token 消耗显示（每条回复下方）
- 切题时重置聊天状态

## 四、文件清单

### 新增文件（5 个）

| 文件 | 用途 |
|------|------|
| `server/src/db/promptRepo.ts` | system_prompts CRUD |
| `server/src/routes/prompts.ts` | Prompt 管理 API |
| `client/src/pages/PromptManagement.tsx` | Prompt 管理前端页面 |
| `docs/review-enhance-2026-03-29.md` | 设计方案文档 |
| `docs/review-prompt-devlog-2026-03-29.md` | 本文档 |

### 修改文件（9 个）

| 文件 | 改动 |
|------|------|
| `server/src/db/database.ts` | migration v9 + nanoid import |
| `server/src/routes/review.ts` | 新增 explain + extend/save |
| `server/src/routes/index.ts` | 移除 templateRoutes，新增 promptRoutes |
| `server/src/index.ts` | 移除 templateRepo/templateRoutes，注册 promptRoutes |
| `server/src/db/index.ts` | 移除 createTemplateRepo 导出 |
| `server/src/services/knowledgeService.ts` | 移除 templateRepo，改用 system_prompts |
| `client/src/services/api.ts` | 移除 templateApi，新增 promptApi + reviewApi 扩展 |
| `client/src/App.tsx` | 移除 /templates，新增 /prompts |
| `client/src/pages/Review.tsx` | 追问面板 UI |

### 保留但不再引用的文件

| 文件 | 说明 |
|------|------|
| `server/src/db/templateRepo.ts` | 旧模板 Repo，不再被引用 |
| `server/src/routes/templates.ts` | 旧模板路由，不再被注册 |
| `client/src/pages/TemplateManagement.tsx` | 旧模板页面，不再有路由 |

### 未改动的数据库表

| 表 | 状态 |
|----|------|
| `prompt_templates` | 保留定义，不再有代码读写。已有数据无影响 |
| 其他所有表 | 无影响 |

## 五、统一管理的 Prompt 列表

| key | 名称 | 分类 | 用途 |
|-----|------|------|------|
| knowledge_classical_chinese | 文言文处理 | knowledge | 文言文知识点解析 |
| knowledge_idiom | 成语处理 | knowledge | 成语知识点解析 |
| knowledge_poetry | 诗词处理 | knowledge | 诗词知识点解析 |
| knowledge_general | 通用处理 | knowledge | 通用知识点解析 |
| review_generate | 出题生成 | review | 根据知识点生成选择题 |
| review_explain | 解释追问 | review | 对题目解释进一步说明 |
| review_options | 选项解释 | review | 解释错误选项含义 |
| review_extend | 延伸知识 | review | 生成延伸背景知识 |
| agent_classify | 类型分类 | agent | 判断输入内容类型 |
| agent_rag | RAG 问答 | agent | 基于知识库回答问题 |

## 六、构建状态

- 后端：仅有 providerRepo.ts 预存 TS 错误（.prepare 方法），新代码零错误
- 前端：仅有 Review.tsx 的 shared 路径 TS6059 预存错误，新代码零错误

## 七、旧模板系统迁移（附：原逻辑与数据流梳理）

### 原系统架构

在新 Prompt 管理系统之前，项目有一套独立的"模板管理"系统：

```
┌─────────────────────────────────────────────────────────┐
│                    旧模板管理系统                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  数据库表：prompt_templates                              │
│  ┌──────────────────────────────────────────────┐       │
│  │ id | type | name | template | is_default     │       │
│  ├──────────────────────────────────────────────┤       │
│  │ xx | classical_chinese | 文言文处理 | ... | 1 │       │
│  │ xx | idiom            | 成语处理   | ... | 1 │       │
│  │ xx | poetry           | 诗词处理   | ... | 1 │       │
│  │ xx | general          | 通用处理   | ... | 1 │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  前端页面：TemplateManagement.tsx → 路由 /templates      │
│  后端路由：routes/templates.ts → /api/templates/*        │
│  后端 Repo：db/templateRepo.ts                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 原数据流（知识处理）

```
用户粘贴内容
    │
    ▼
detectType() 判断类型 → classical_chinese / idiom / poetry / general
    │
    ▼
templateRepo.findByType(type)  ←── 从 prompt_templates 表读取
    │
    ▼
renderTemplate(template, { raw_content })  ←── 替换 {{raw_content}} 变量
    │
    ▼
LLM.chat([prompt])  ←── 调用 AI 模型
    │
    ▼
parseJsonResponse()  ←── 解析 JSON
    │
    ▼
存入 knowledge_items 表
```

### 原模板管理页面功能

| 功能 | 说明 |
|------|------|
| 列表展示 | 显示所有 prompt_templates 记录 |
| 新建模板 | 指定 type + name + template + is_default |
| 编辑模板 | 修改 template 内容 |
| 删除模板 | 单条删除 |
| 重置 | 删除所有 is_default=1 的记录，重新插入内置模板 |

### 存在的问题

1. **只能管理 4 个知识处理 prompt**，不能管理复习/问答相关的 prompt
2. **type 字段是枚举**（classical_chinese/idiom/poetry/general），无法扩展
3. **没有用途说明、数据流、逻辑流**等文档信息
4. **前后端 prompt 硬编码在两处**：promptEngine.ts（内置）+ prompt_templates 表（用户可改）

### 迁移到新系统

新系统使用 `system_prompts` 表，用 `key` 字段唯一标识每个 prompt：

```
旧：prompt_templates                    新：system_prompts
┌─────────────────────────┐      ┌──────────────────────────────────┐
│ type=classical_chinese  │  →   │ key=knowledge_classical_chinese  │
│ type=idiom              │  →   │ key=knowledge_idiom              │
│ type=poetry             │  →   │ key=knowledge_poetry             │
│ type=general            │  →   │ key=knowledge_general            │
│ （无）                   │  →   │ key=review_generate              │
│ （无）                   │  →   │ key=review_explain               │
│ （无）                   │  →   │ key=review_options               │
│ （无）                   │  →   │ key=review_extend                │
│ （无）                   │  →   │ key=agent_classify               │
│ （无）                   │  →   │ key=agent_rag                    │
└─────────────────────────┘      └──────────────────────────────────┘
  4 个 prompt                      10 个 prompt
  只有模板内容                      模板 + 用途 + 变量 + 数据流 + 逻辑流
```

### 迁移改动

**后端：knowledgeService.ts**

```diff
- const template = await this.templateRepo.findByType(detectedType);
- const templateStr = template?.template || fallback;
+ const promptRecord = await getPromptByKey(`knowledge_${detectedType}`);
+ const templateStr = promptRecord?.prompt || fallback;
```

构造函数移除 `templateRepo` 参数。

**前端：App.tsx**

```diff
- <Route path="/templates" element={<TemplateManagement />} />
+ <Route path="/prompts" element={<PromptManagement />} />
```

菜单项从「模板管理」改为「Prompt 管理」。

### 安全措施

- `prompt_templates` 表定义**保留**，不影响已有数据库
- `system_prompts` 在 migration v9 中自动初始化 10 条内置数据
- 如果 system_prompts 中找不到对应 key，`knowledgeService` 回退到 `promptEngine.ts` 中的硬编码模板
- 旧文件（templateRepo.ts、routes/templates.ts、TemplateManagement.tsx）**未物理删除**，不再被引用

## 八、延伸知识 bug 修复（两轮迭代）

### 第一轮修复

原逻辑：用 `knowledge_items.content`（LLM 处理后的 JSON 结构化数据）+ 截断 1000 字符。
问题：截断 JSON 破坏结构，LLM 收到不完整的 JSON 片段。

修复：改用 `raw_content`（用户原始输入），上限 2000 字符。

### 第二轮修复（用户反馈）

用户指出：延伸知识应该从**当前题目和答案**出发，不是从知识点原文。

最终逻辑：
```typescript
const questionContext = `题目：${question}\n选项：A.xxx\nB.xxx...\n正确答案：A.xxx\n解释：xxx`;
const itemContentForPrompt = context_type === 'extend'
  ? questionContext          // 延伸：用题目+答案+解释
  : itemStructured.substring(0, 1000);  // 解释/选项：用结构化数据
```

### 同步修改

- `routes/prompts.ts` — review_extend 的 description/prompt/data_flow/logic_flow
- `database.ts` migration v9 — 内置 review_extend prompt

## 九、延伸知识 UI 优化

从固定 div 改为 Ant Design Collapse 组件：
- 默认**折叠**，显示 🌍 延伸知识 + 「点击展开」标签
- 生成中自动展开，生成完毕后收起
- 内容区高度 600px，可滚动
- 展开后可看到保存按钮（追加/新建/不保存）
