# 复习功能实现分析

> 分析日期：2026-03-28
> 文件位置：`client/src/pages/Review.tsx` + `server/src/services/reviewService.ts`

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Review.tsx)                        │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ 统计卡片  │  │ 开始复习按钮  │  │  复习会话 (逐题答题流程)   │  │
│  │ 4个指标   │  │  + 历史记录表 │  │  选择/填空/简答 三种题型   │  │
│  └──────────┘  └──────────────┘  └───────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────────┐
│                       后端 (reviewService.ts)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ getDueItems   │  │ startReview  │  │ submitAnswer           │ │
│  │ 获取到期复习项 │  │ 生成题目+入库 │  │ 判分 + SM-2 间隔计算   │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │ getTodayStats│  │ getHistory   │                              │
│  │ 今日统计     │  │ 复习历史分页  │                              │
│  └──────────────┘  └──────────────┘                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    SQLite 数据库                                 │
│  review_records 表                                               │
│  (id, item_id, question, answer, user_answer, is_correct,      │
│   score, next_review, interval_days, review_count, created_at)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、核心流程

### 2.1 开始复习 (handleStartReview)

```
用户点击"开始复习"
    │
    ▼
POST /api/review/start { count: 10 }
    │
    ▼
server: getDueItems(10)
    │  ├── SQL 查询：获取 "到期" 的知识项
    │  │   到期条件 = review_records.next_review <= now
    │  │             OR 从未被复习过（LEFT JOIN 无记录）
    │  │   按到期时间 / 创建时间升序排列
    │  └── 返回最多 10 个 KnowledgeItem
    │
    ▼
server: 对每个 item 调用 LLM 生成题目
    │  ├── getQuestionPrompt(item) → 构建出题提示词
    │  │   根据类型（文言文/成语/诗词/通用）定制出题规则
    │  ├── llm.chat() → 调用 AI 生成 3-5 道题目
    │  │   返回 JSON 数组：[{ type, question, answer, options }]
    │  ├── 解析 JSON，写入 review_records 表
    │  └── fallback：解析失败则生成简答题
    │
    ▼
返回 ReviewItem[] → 前端构建答题队列 (questionQueue)
```

### 2.2 答题流程 (handleSubmit → handleNext)

```
用户作答 → 点击"提交答案"
    │
    ▼
前端本地判分（不调用后端 submit API）
    │  ├── 选择题：normalize 后精确匹配
    │  ├── 填空题：normalize 后精确匹配
    │  └── 简答题：先精确匹配，失败则按字集重叠率 >30% 判对
    │
    ▼
计算下次复习间隔
    │  ├── 正确：interval × 2.5（上限 365 天）
    │  └── 错误：interval 重置为 1 天
    │
    ▼
展示反馈 → 用户点击"下一题" → 更新索引，循环
    │
    ▼
所有题目答完 → 展示结果页（总题数/正确数/正确率）
```

### 2.3 SM-2 间隔重复算法（简化版）

```typescript
// server/src/services/reviewService.ts
function calculateNextReview(isCorrect, currentInterval, reviewCount) {
  if (isCorrect) {
    interval = Math.min(currentInterval * 2.5, 365);  // 翻 2.5 倍，最高 1 年
  } else {
    interval = 1;  // 答错重置为 1 天
  }
  nextReview = today + interval 天;
}
```

**与经典 SM-2 的对比：**

| 特性 | 经典 SM-2 | 本项目简化版 |
|------|----------|------------|
| 正确反馈因子 | EF (易度因子)，2.5 起步，根据质量动态调整 | 固定 ×2.5 |
| 错误处理 | EF 降低，interval 重置 | interval 重置为 1 天 |
| 间隔公式 | interval(n) = interval(n-1) × EF | interval = interval × 2.5 |
| 上限 | 无硬上限 | 365 天 |
| 复习质量评分 | 0-5 分制 | 二元（对/错） |

---

## 三、题型系统

### 3.1 三种题型

| 题型 | type 值 | 前端组件 | 判分逻辑 |
|------|---------|---------|---------|
| 选择题 | `choice` | `Radio.Group` + `Radio.Button` | 精确匹配（normalize 后） |
| 填空题 | `fill` | `Input` | 精确匹配（normalize 后） |
| 简答题 | `essay` | `TextArea` | 精确匹配 + 字集重叠 >30% |

### 3.2 题目生成 Prompt 策略

根据知识类型定制出题规则：

| 知识类型 | 出题方向 |
|---------|---------|
| 文言文 | 翻译题、字词解释题 |
| 成语 | 填空题、选择释义题 |
| 诗词 | 默写题、赏析问答题 |
| 通用知识 | 关键词匹配题、简答题 |

每次生成 3-5 题，LLM 温度 0.7，严格要求 JSON 格式输出。

---

## 四、前端状态机

```
                    ┌──────────────┐
                    │  loading     │  加载统计 + 历史
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  main view   │  统计卡片 + 开始按钮 + 历史表
                    └──────┬───────┘
                           │ 点击"开始复习"
                    ┌──────▼───────┐
                    │  session     │  答题会话
                    │  (逐题循环)   │
                    │              │
                    │  currentIndex │ → 当前题目
                    │  answered    │ → 已答数
                    │  correctCount│ → 正确数
                    │  finished    │ → 是否结束
                    └──────┬───────┘
                           │ 所有题答完
                    ┌──────▼───────┐
                    │  result      │  结果页（统计 + 返回按钮）
                    └──────────────┘
```

---

## 五、数据流详解

### 5.1 review_records 表结构

```sql
CREATE TABLE review_records (
  id            TEXT PRIMARY KEY,     -- nanoid
  item_id       TEXT NOT NULL,        -- 关联 knowledge_items.id
  question      TEXT NOT NULL,        -- 题目文字
  answer        TEXT,                 -- 正确答案
  user_answer   TEXT,                 -- 用户回答
  is_correct    INTEGER,             -- 0/1
  score         INTEGER,             -- 0 或 100
  next_review   TEXT,                -- ISO 时间戳
  interval_days INTEGER DEFAULT 1,   -- 间隔天数
  review_count  INTEGER DEFAULT 0,   -- 复习次数
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### 5.2 核心 SQL

**获取到期知识项：**
```sql
SELECT ki.* FROM knowledge_items ki
LEFT JOIN (
  SELECT item_id, MIN(next_review) as min_next
  FROM review_records
  GROUP BY item_id
) rr ON ki.id = rr.item_id
WHERE rr.min_next IS NULL OR rr.min_next <= datetime('now')
ORDER BY COALESCE(rr.min_next, ki.created_at) ASC
LIMIT ?
```

**今日统计：**
- `due_count`: 待复习数量（next_review <= now 或从未复习）
- `completed_today`: 今日已作答数
- `accuracy_rate`: 今日正确率
- `streak_days`: 连续复习天数（逐天回溯查询）

---

## 六、⚠️ 当前实现的问题

### 6.1 前后端不一致

前端 `handleSubmit` 做了**本地判分**，但并没有调用后端 `POST /api/review/submit`。这意味着：

- 前端展示了正确/错误反馈，但**后端 review_records 表不会更新**
- `next_review`、`interval_days`、`review_count` 永远不会被更新
- 下次复习时，所有题目仍会被重新选中（因为 `next_review` 从未改变）

**影响：** 复习间隔机制形同虚设，每次都是"从头开始"。

### 6.2 临时 ID 问题

```typescript
review_id: `${item.item_id}_${qi}`, // temporary local ID
```

前端用 `item_id_questionIndex` 作为临时 ID，但后端实际存储的是 nanoid 生成的 ID，两者不对应。即使前端调用 submit API，也无法正确匹配到 review_record。

### 6.3 改进建议

1. **后端 startReview 返回 review_ids**：让每个 question 关联到真实的 review_record.id
2. **前端 submit 调用后端 API**：改为 `POST /api/review/submit`，由后端统一判分和更新间隔
3. **或改为批量提交**：会话结束后一次性提交所有答案

---

## 七、总结

| 维度 | 评价 |
|------|------|
| **核心理念** | SM-2 间隔重复，理念正确 |
| **题目生成** | LLM 智能出题，按类型定制 Prompt，有 fallback |
| **题型覆盖** | 选择 / 填空 / 简答三种，体验丰富 |
| **前端体验** | 进度条 + 反馈 + 结果页 + 历史表，流程完整 |
| **间隔执行** | ⚠️ 前端本地判分未同步到后端，间隔机制未生效 |
| **判分准确度** | 简答题 30% 字重叠阈值偏宽松，可能有误判 |

---

*文档路径：`E:\workSpace_openclaw\personal-knowledge-base\docs\review-feature-analysis.md`*
