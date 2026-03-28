# client/ — 前端应用

> 最后更新：2026-03-28

## 启动

```bash
cd client && pnpm dev    # 开发模式（热重载）
pnpm build               # 构建
```

运行在 http://localhost:5173

## 目录结构

```
src/
├── App.tsx                     # 路由 + 侧边栏布局
├── main.tsx                    # 入口
├── pages/
│   ├── KnowledgeInput.tsx      # 知识输入（文本/文件，支持拆分预览）
│   ├── KnowledgeList.tsx       # 知识列表 + 分类管理（增删改）
│   ├── KnowledgeGraph.tsx      # 知识图谱（vis.js Network 力导向图）
│   ├── AgentChat.tsx           # AI 问答（RAG + 流式 SSE）
│   ├── Review.tsx              # 复习系统（分类筛选 + 选择题）
│   ├── TemplateManagement.tsx  # Prompt 模板管理
│   ├── ProviderManagement.tsx  # AI 模型配置
│   └── TokenUsage.tsx          # Token 消耗统计
└── services/
    └── api.ts                  # API 调用层（axios 封装）
```

## 页面说明

### KnowledgeInput — 知识输入
- 支持文本输入和文件上传（PDF/Markdown/图片）
- LLM 自动识别类型（文言文/成语/诗词/通用）
- 预览模式：先看处理结果再入库
- 拆分模式：检测到多知识点时拆分，支持合并保存或逐个保存
- 高级参数：选择模型、调整 temperature / top_p

### KnowledgeList — 知识列表
- 分页浏览 + 搜索 + 类型筛选
- 分类管理面板：添加/编辑/删除分类
- 表格中直接选择分类（Select 下拉）
- 点击查看知识详情（结构化内容 + 原文）

### KnowledgeGraph — 知识图谱
- vis.js Network 力导向图
- 节点按类型着色（蓝=文言文、绿=成语、紫=诗词、琥珀=通用）
- 边来自知识关联识别 + Louvain 聚类
- 支持搜索、类型筛选、物理模拟开关
- 聚类参数面板：调整相似度阈值和权重

### Review — 复习系统
- 统计卡片：待复习数/今日完成/正确率/连续天数
- 分类筛选：从数据库获取分类列表
- 纯选择题（四选一），题目来自预生成题库
- 答题后显示正确答案 + 解释
- SM-2 间隔重复算法管理复习节奏

### AgentChat — AI 问答
- RAG 检索增强：从知识库中检索相关内容作为上下文
- SSE 流式输出
- 多轮对话 + 会话管理
- 引用来源展示

## 关键依赖

- `react` + `react-router-dom` — 框架 + 路由
- `antd` — UI 组件库
- `vis-network` + `vis-data` — 知识图谱可视化
- `axios` — HTTP 客户端
- `react-markdown` + `remark-gfm` — Markdown 渲染
- `@ant-design/icons` — 图标
