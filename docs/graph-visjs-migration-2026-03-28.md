# 知识图谱可视化 — Cytoscape → vis.js 迁移记录

> 日期：2026-03-28
> 状态：已完成

---

## 一、迁移原因

Cytoscape.js 的默认样式比较朴素，力导向图的视觉效果不够吸引人。vis.js Network 的默认样式更精美，物理引擎更自然，且支持节点 tooltip、更好的阴影/发光效果。

## 二、依赖变更

```
移除：cytoscape ^3.33.1, @types/cytoscape ^3.31.0
新增：vis-network ^10.0.2, vis-data ^8.0.3
```

## 三、核心差异

| 特性 | Cytoscape.js | vis.js Network |
|------|-------------|----------------|
| 物理引擎 | cose (Compound Spring Embedder) | forceAtlas2Based |
| 节点样式 | 通过 selector + style 函数 | 节点数据对象直接配置 |
| 事件 | cy.on('tap', 'node', ...) | network.on('click', (params) => ...) |
| 聚焦节点 | cy.animate({ center: ... }) | network.focus(nodeId, { scale, animation }) |
| 切换物理 | 无内置支持 | network.setOptions({ physics: { enabled } }) |
| Tooltip | 无内置支持 | 内置 HTML title 支持 |
| 过滤 | 手动设置 display | DataSet 的 hidden 属性 |

## 四、关键实现

### 4.1 容器高度问题

vis.js 要求容器在初始化时有确定的像素高度。使用动态测量解决：

```typescript
// 测量容器实际高度
const [graphHeight, setGraphHeight] = useState(500);

useEffect(() => {
  const measureHeight = () => {
    if (containerRef.current) {
      const parent = containerRef.current.parentElement;
      if (parent && parent.clientHeight > 100) {
        setGraphHeight(parent.clientHeight);
        return;
      }
    }
    setGraphHeight(Math.max(window.innerHeight - 380, 400));
  };
  const timer = setTimeout(measureHeight, 100);
  window.addEventListener('resize', measureHeight);
  return () => { clearTimeout(timer); window.removeEventListener('resize', measureHeight); };
}, [graphData]);
```

### 4.2 延迟初始化

Network 初始化包裹在 setTimeout(50ms) 中，确保容器尺寸已生效。

### 4.3 节点标签

- 全局 font 配置：白色描边 + 13px + 显示在节点下方 (`vadjust: -20`)
- 通过 `network.setOptions({ nodes: { font: { size: 0|13 } } })` 切换标签显示

### 4.4 物理参数

```typescript
physics: {
  solver: 'forceAtlas2Based',
  forceAtlas2Based: {
    gravitationalConstant: -60,
    centralGravity: 0.008,
    springLength: 160,
    springConstant: 0.04,
    damping: 0.4,
    avoidOverlap: 0.6,
  },
}
```

## 五、文件改动

| 文件 | 改动 |
|------|------|
| `client/src/pages/KnowledgeGraph.tsx` | 完全重写，从 Cytoscape API 迁移到 vis.js API |
| `client/package.json` | 依赖替换 |

---

*文档路径：`E:\workSpace_openclaw\personal-knowledge-base\docs\graph-visjs-migration-2026-03-28.md`*
