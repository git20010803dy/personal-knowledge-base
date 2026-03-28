# 分类系统重构 — 修改记录

> 日期：2026-03-28
> 状态：已完成

---

## 一、需求变更

### 原始问题
- 复习功能的分类是硬编码的 10 个固定值，无法扩展
- 知识列表页无法给知识点指定分类
- 用户希望能自由管理分类

### 新方案
- 分类存储在数据库 `categories` 表中，支持增删改
- 知识列表页新增分类管理面板 + 每行可选分类
- 复习页从 API 动态获取分类列表

---

## 二、数据结构

复用已有的 `categories` 表：

```sql
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
)
```

启动时自动初始化默认分类（如果表为空）：
`历史、地理、文学、成语、诗词、哲学、科学、数码、常识、其他`

---

## 三、新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/categories | 获取所有分类 |
| POST | /api/categories | 新增分类 `{ name, sort_order? }` |
| PUT | /api/categories/:id | 修改分类 `{ name, sort_order? }` |
| DELETE | /api/categories/:id | 删除分类（关联的 review_questions 重置为"其他"） |

---

## 四、文件改动清单

| # | 文件 | 改动内容 |
|---|------|---------|
| 1 | `server/src/services/categoryService.ts` | **新建** — 分类 CRUD 服务 + 默认分类初始化 |
| 2 | `server/src/routes/categories.ts` | **新建** — 分类管理 API 路由 |
| 3 | `server/src/routes/index.ts` | 导出 categoryRoutes |
| 4 | `server/src/index.ts` | 注册分类路由 + 启动时 initDefaultCategories |
| 5 | `server/src/services/reviewQuestionService.ts` | 分类从数据库读取；Prompt 动态传入可用分类列表 |
| 6 | `server/src/services/reviewService.ts` | 移除 ReviewCategory 硬编码类型 |
| 7 | `server/src/routes/review.ts` | /api/review/categories 从数据库读取 |
| 8 | `client/src/pages/Review.tsx` | 分类从 API 动态获取；无题目的分类显示灰色 |
| 9 | `client/src/pages/KnowledgeList.tsx` | 新增分类管理面板；表格"分类"列改为 Select 下拉 |

---

## 五、前端交互

### 5.1 知识列表页 — 分类管理

```
┌─────────────────────────────────────────┐
│ ▼ 🏷️ 分类管理（10 个分类）               │
├─────────────────────────────────────────┤
│  ✕ ✂历史  ✂地理  ✂文学  ✂成语  ✂诗词 ...  │
│  [ + 添加分类 ]                          │
└─────────────────────────────────────────┘
```

- 点击 ✂ 可编辑分类名
- 点击 ✕ 可删除分类
- 点击 + 可添加新分类

### 5.2 知识列表页 — 表格中选分类

每行的"分类"列是一个 Select 下拉框，选择后自动保存。

### 5.3 复习页 — 分类筛选

从 API 获取分类列表，无题目的分类显示为灰色不可选。

---

*文档路径：`E:\workSpace_openclaw\personal-knowledge-base\docs\category-system-2026-03-28.md`*
