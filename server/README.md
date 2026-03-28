# server/ — 后端服务

> 最后更新：2026-03-28

## 启动

```bash
cd server && pnpm dev    # 开发模式（热重载）
pnpm build               # 构建
```

运行在 http://localhost:3001

## 目录结构

```
src/
├── index.ts                    # 入口：注册路由、初始化服务
├── config.ts                   # 配置（端口、LLM、数据库路径）
├── db/                         # 数据库层
│   ├── database.ts             #   SQLite 初始化 + 迁移（5个版本）
│   ├── knowledgeRepo.ts        #   知识条目 CRUD
│   ├── providerRepo.ts         #   AI 提供商 CRUD
│   ├── templateRepo.ts         #   Prompt 模板 CRUD
│   ├── chatRepo.ts             #   会话/消息 CRUD
│   └── tokenRepo.ts            #   Token 使用记录
├── routes/                     # API 路由
│   ├── knowledge.ts            #   知识 CRUD + 拆分/合并
│   ├── review.ts               #   复习（开始/提交/统计/历史）
│   ├── categories.ts           #   分类 CRUD
│   ├── graph.ts                #   图谱 + 聚类
│   ├── agent.ts                #   AI 问答
│   ├── templates.ts            #   Prompt 模板
│   ├── providers.ts            #   AI 提供商
│   └── tokens.ts               #   Token 统计
├── services/                   # 业务逻辑
│   ├── llm/
│   │   ├── provider.ts         #     LLM 接口定义
│   │   ├── openaiAdapter.ts    #     OpenAI 兼容适配器
│   │   ├── claudeAdapter.ts    #     Claude 适配器
│   │   └── index.ts            #     提供商管理 + token 记录
│   ├── knowledgeService.ts     #   知识处理全流程
│   ├── promptEngine.ts         #   Prompt 模板引擎 + 类型检测
│   ├── reviewService.ts        #   复习核心（SM-2 间隔 + 判分）
│   ├── reviewQuestionService.ts#   题目预生成（LLM 出题 + 分类）
│   ├── categoryService.ts      #   分类 CRUD + 默认初始化
│   ├── graphService.ts         #   图谱数据查询
│   ├── clusteringService.ts    #   Louvain 聚类 + 边同步
│   └── ragService.ts           #   RAG 检索增强
└── types/
    └── sql.js.d.ts             # sql.js 类型声明
```

## 数据库

SQLite 文件：`data/knowledge.db`（自动创建，零配置）

迁移版本：
- v1: 基础索引
- v2: embedding 字段 + chat 表
- v3: clustering_features + clustering_cache
- v4: token_usage
- v5: review_questions 表

## 关键依赖

- `fastify` — HTTP 框架
- `sql.js` — 纯 JS SQLite
- `nanoid` — ID 生成
- `@fastify/multipart` — 文件上传
- `@fastify/cors` — 跨域
