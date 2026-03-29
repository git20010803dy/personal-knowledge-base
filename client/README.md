# client/ - 前端应用

> 更新：2026-03-29

## 技术栈

- React 18 + TypeScript
- Ant Design 5
- Vite
- React Router
- Cytoscape.js（知识图谱可视化）
- Axios

## 目录结构

```
client/src/
├── App.tsx                  # 主应用，路由与侧栏菜单
├── pages/
│   ├── KnowledgeInput.tsx   # 知识输入（文本/文件）
│   ├── KnowledgeList.tsx    # 知识列表（分页、搜索、筛选）
│   ├── KnowledgeGraph.tsx   # 知识图谱可视化
│   ├── AgentChat.tsx        # AI 问答（SSE 流式）
│   ├── Review.tsx           # 间隔复习
│   ├── PromptManagement.tsx # Prompt 管理
│   ├── ProviderManagement.tsx # AI 模型配置
│   └── TokenUsage.tsx       # Token 消耗统计
└── services/
    └── api.ts               # API 请求封装
```

## 页面功能

| 页面 | 路由 | 说明 |
|------|------|------|
| 知识输入 | /input | 粘贴文本或上传文件，LLM 自动处理 |
| 知识列表 | /list | 分页浏览、搜索、编辑、删除、分类 |
| 知识图谱 | /graph | Cytoscape.js 可视化知识关联 |
| AI 问答 | /chat | RAG 问答，SSE 流式响应 |
| 复习 | /review | 选择分类，四选一选择题复习 |
| Prompt 管理 | /prompts | 编辑各类处理的提示词模板 |
| 模型配置 | /providers | 添加/编辑 AI 模型 |
| Token 统计 | /tokens | 按模型/日期统计 Token 消耗 |

## 启动

```bash
pnpm install
pnpm dev        # 开发模式 (Vite, 默认 http://localhost:5173)
pnpm build      # 编译到 dist/
```
