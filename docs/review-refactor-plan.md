# 复习功能重构设计方案

> 日期：2026-03-28
> 状态：待执行

---

## 一、需求变更

### 原方案问题
1. 前端本地判分，后端 `review_records` 未同步，间隔重复机制不生效
2. 每次复习都调 LLM 生成题目，延迟高、浪费 token
3. 题型过多（选择/填空/简答），体验复杂

### 新方案
1. **只要选择题**，出题 Prompt 只生成 `choice` 类型
2. **复习前可选分类筛选**，用 `tags` 做筛选维度（比 `type` 更细粒度）
3. **存入时预生成题目**，复习时直接读表，零延迟

---

## 二、数据结构设计

### 新表：review_questions

```sql
CREATE TABLE review_questions (
  id          TEXT PRIMARY KEY,        -- nanoid
  item_id     TEXT NOT NULL,           -- 关联 knowledge_items.id
  question    TEXT NOT NULL,           -- 题目文字
  options     TEXT NOT NULL,           -- JSON: ["选项A", "选项B", "选项C", "选项D"]
  correct_idx INTEGER NOT NULL,       -- 正确选项索引 (0-3)
  explanation TEXT,                    -- 解释说明
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_rq_item ON review_questions(item_id);
```

### 修改 review_records 表

新增 `question_id` 字段，关联预生成的题目：

```sql
ALTER TABLE review_records ADD COLUMN question_id TEXT;
CREATE INDEX idx_rr_question ON review_records(question_id);
```

---

## 三、流程对比

### 存入流程（新增预生成）

```
原：processAndStore → clustering_features（同步）
新：processAndStore → clustering_features（同步）
                    → review_questions（异步，LLM 生成 3-5 道选择题）
```

### 复习流程

```
原：startReview → 调 LLM 生成题目 → 前端答题 → 本地判分（不回写）
新：getDueQuestions → 从 review_questions 表读 → 前端答题 → submitAnswer 回写后端
```

---

## 四、改动清单

| # | 文件 | 改动内容 |
|---|------|---------|
| 1 | `server/src/db/database.ts` | 新增 `review_questions` 表 + 修改 `review_records` 表 |
| 2 | `server/src/services/reviewQuestionService.ts` | **新建** - 题目生成 + 存储 |
| 3 | `server/src/services/knowledgeService.ts` | `processAndStore` 后触发预生成 |
| 4 | `server/src/services/reviewService.ts` | `startReview` 改为从表读题；`submitAnswer` 简化判分 |
| 5 | `server/src/routes/review.ts` | 新增 GET tags 接口；修改 start/submit 逻辑 |
| 6 | `shared/src/index.ts` | 新增 `PreGeneratedQuestion` 类型 |
| 7 | `client/src/pages/Review.tsx` | 标签筛选器 + 简化选择题界面 + 修正回写逻辑 |

---

## 五、前端交互设计

```
┌─────────────────────────────────────────┐
│  复习中心                                │
├─────────────────────────────────────────┤
│  📊 今日统计：待复习 XX | 已完成 XX | 正确率 XX% │
├─────────────────────────────────────────┤
│  🏷️ 选择分类：[全部] [历史] [文学] [人物] ...  │
│  (从已有知识点的 tags 中动态提取)            │
├─────────────────────────────────────────┤
│          [ 开始复习 ]                     │
├─────────────────────────────────────────┤
│  题目：以下关于 XXX 的说法，正确的是？       │
│  ┌─────────────────────────────────┐     │
│  │ ○ A. ...                        │     │
│  │ ○ B. ...                        │     │
│  │ ○ C. ...                        │     │
│  │ ○ D. ...                        │     │
│  └─────────────────────────────────┘     │
│          [ 提交答案 ]                     │
├─────────────────────────────────────────┤
│  ✅ 正确！ / ❌ 错误，正确答案是 B          │
│  解释：...                                │
│          [ 下一题 ]                       │
└─────────────────────────────────────────┘
```

---

*文档路径：`E:\workSpace_openclaw\personal-knowledge-base\docs\review-refactor-plan.md`*
