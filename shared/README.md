# shared/ — 前后端共享类型

> 最后更新：2026-03-28

## 说明

定义前端和后端共用的 TypeScript 类型，确保类型一致性。

## 导出内容

| 类型 | 说明 |
|------|------|
| `KnowledgeItem` | 知识条目 |
| `KnowledgeType` | 知识类型枚举 (`classical_chinese` / `idiom` / `poetry` / `general`) |
| `KnowledgeLink` | 知识关联 |
| `ReviewRecord` | 复习记录 |
| `ReviewQuestion` | 复习题目（旧版，已被 review_questions 表替代） |
| `ReviewStats` | 复习统计 |
| `ReviewItem` | 复习项 |
| `Category` | 分类 |
| `PromptTemplate` | Prompt 模板 |
| `AIProvider` | AI 提供商 |
| `LLMMessage` / `LLMConfig` / `LLMResponse` | LLM 通信类型 |
| `GraphNode` / `GraphEdge` / `GraphData` | 图谱数据 |
| `ClusterGroup` / `ClusteringResult` | 聚类结果 |
| `ChatSession` / `ChatMessage` | 对话类型 |
| `TokenUsageRecord` / `DailyTokenStats` | Token 统计 |
| `SplitPiece` / `SavePieceRequest` | 拆分/保存类型 |
| `ProcessingResult` | LLM 处理结果 |

## 构建

```bash
cd shared && pnpm build    # 编译到 dist/
```

## 使用

后端直接 `import { ... } from '@pkb/shared'`
前端通过 workspace 协议引用
