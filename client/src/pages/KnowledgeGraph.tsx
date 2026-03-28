/**
 * KnowledgeGraph.tsx - 知识图谱可视化
 * 使用 vis.js Network 渲染力导向图
 * 最后修改：2026-03-28 - 从 Cytoscape.js 迁移到 vis.js
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Network, type Options } from 'vis-network';
import { DataSet } from 'vis-data';
import {
  Card,
  Input,
  Select,
  Button,
  Space,
  Drawer,
  Tag,
  Typography,
  Statistic,
  Row,
  Col,
  Switch,
  Spin,
  Empty,
  Tooltip,
  Divider,
  Slider,
  message,
} from 'antd';
import {
  SearchOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  BorderOutlined,
  NodeIndexOutlined,
  SyncOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { graphApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;

// ─── Constants ───────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  classical_chinese: '#3b82f6',
  idiom: '#10b981',
  poetry: '#a855f7',
  general: '#f59e0b',
};

const TYPE_LABELS: Record<string, string> = {
  classical_chinese: '文言文',
  idiom: '成语',
  poetry: '诗词',
  general: '通用',
};

const TYPE_BORDERS: Record<string, string> = {
  classical_chinese: '#1d4ed8',
  idiom: '#047857',
  poetry: '#7e22ce',
  general: '#d97706',
};

const RELATION_COLORS: Record<string, string> = {
  '相关': '#94a3b8',
  '包含': '#3b82f6',
  '因果': '#ef4444',
  '对比': '#f59e0b',
  '同源': '#a855f7',
};

// ─── Types ───────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  title: string;
  type: string;
  tags: string[];
  category: string | null;
  importance: number;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string | null;
  strength: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  clusters: number;
  avgConnections: number;
}

interface ClusterParams {
  keywordWeight: number;
  tagWeight: number;
  categoryWeight: number;
  threshold: number;
}

const STORAGE_KEY = 'clustering_params';
const DEFAULT_PARAMS: ClusterParams = {
  keywordWeight: 0.5,
  tagWeight: 0.4,
  categoryWeight: 0.1,
  threshold: 0.2,
};

function loadParams(): ClusterParams {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_PARAMS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_PARAMS };
}

function saveParams(p: ClusterParams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

// ─── Component ───────────────────────────────────────────────────────

export default function KnowledgeGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphCardRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<any>>(new DataSet());
  const edgesRef = useRef<DataSet<any>>(new DataSet());

  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [searchText, setSearchText] = useState('');
  const [physics, setPhysics] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [graphHeight, setGraphHeight] = useState(500);

  // Clustering state
  const [clusterParams, setClusterParams] = useState<ClusterParams>(loadParams);
  const [clusterPanelOpen, setClusterPanelOpen] = useState(false);
  const [clustering, setClustering] = useState(false);
  const [clusterInfo, setClusterInfo] = useState<{
    lastRun: string;
    itemCount: number;
    clusterCount: number;
    computationTime: number;
  } | null>(null);

  // ─── Fetch data ────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [graph, statsRes] = await Promise.all([
        graphApi.getGraph(),
        graphApi.getStats(),
      ]);
      setGraphData(graph);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to load graph data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Measure container height ─────────────────────────────────

  useEffect(() => {
    const measureHeight = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const h = parent.clientHeight;
          if (h > 100) {
            setGraphHeight(h);
            return;
          }
        }
      }
      // Fallback: use viewport-based calculation
      setGraphHeight(Math.max(window.innerHeight - 380, 400));
    };

    // Delay to let layout settle
    const timer = setTimeout(measureHeight, 100);
    window.addEventListener('resize', measureHeight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measureHeight);
    };
  }, [graphData]);

  // ─── Build vis.js Network ──────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || !graphData || graphHeight < 100) return;

    // Delay init to ensure container has real dimensions
    const timer = setTimeout(() => {
      if (!containerRef.current) return;

    // Build nodes
    const nodes = new DataSet(
      graphData.nodes.map((node) => ({
        id: node.id,
        label: node.title.length > 14 ? node.title.substring(0, 14) + '…' : node.title,
        title: `<b>${node.title}</b><br/>类型: ${TYPE_LABELS[node.type] || node.type}${node.category ? '<br/>分类: ' + node.category : ''}`,
        color: {
          background: TYPE_COLORS[node.type] || '#8c8c8c',
          border: TYPE_BORDERS[node.type] || '#555',
          highlight: {
            background: TYPE_COLORS[node.type] || '#8c8c8c',
            border: '#fbbf24',
          },
          hover: {
            background: TYPE_COLORS[node.type] || '#8c8c8c',
            border: '#fbbf24',
          },
        },
        font: {
          color: '#374151',
          size: 13,
          face: 'system-ui, -apple-system, sans-serif',
          bold: { color: '#111827' },
        },
        size: 20 + Math.min((node.importance || 0) * 8, 35),
        shape: 'dot',
        borderWidth: 3,
        borderWidthSelected: 5,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.15)',
          size: 10,
          x: 2,
          y: 4,
        },
        // Store original data for filtering
        _type: node.type,
        _tags: node.tags,
        _category: node.category,
        _importance: node.importance,
        _title: node.title,
      }))
    );

    // Build edges
    const edges = new DataSet(
      graphData.edges.map((edge) => ({
        id: edge.id,
        from: edge.source_id,
        to: edge.target_id,
        label: edge.relation_type || '',
        color: {
          color: RELATION_COLORS[edge.relation_type || '相关'] || '#94a3b8',
          highlight: '#fbbf24',
          hover: '#fbbf24',
          opacity: 0.6,
        },
        width: Math.max((edge.strength || 0.5) * 3, 1),
        arrows: {
          to: { enabled: true, scaleFactor: 0.6 },
        },
        smooth: {
          enabled: true,
          type: 'dynamic',
          roundness: 0.3,
        },
        font: {
          size: 10,
          color: '#6b7280',
          strokeWidth: 2,
          strokeColor: '#ffffff',
          align: 'middle',
        },
        _relation: edge.relation_type,
      }))
    );

    nodesRef.current = nodes;
    edgesRef.current = edges;

    // vis.js options
    const options: Options = {
      nodes: {
        shape: 'dot',
        scaling: {
          min: 16,
          max: 40,
        },
      },
      edges: {
        smooth: {
          enabled: true,
          type: 'dynamic',
          roundness: 0.3,
        },
      },
      physics: {
        enabled: physics,
        forceAtlas2Based: {
          gravitationalConstant: -60,
          centralGravity: 0.008,
          springLength: 160,
          springConstant: 0.04,
          damping: 0.4,
          avoidOverlap: 0.6,
        },
        solver: 'forceAtlas2Based',
        stabilization: {
          enabled: true,
          iterations: 200,
          updateInterval: 25,
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true,
        dragView: true,
        navigationButtons: false,
        keyboard: { enabled: true },
      },
      layout: {
        improvedLayout: true,
      },
    };

    // Create network
    const network = new Network(containerRef.current, { nodes, edges }, options);

    // Events
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nodeData = nodes.get(nodeId);
        if (nodeData) {
          const graphNode: GraphNode = {
            id: String(nodeId),
            title: nodeData._title,
            type: nodeData._type,
            tags: nodeData._tags || [],
            category: nodeData._category,
            importance: nodeData._importance || 0,
          };
          setSelectedNode(graphNode);
          setDrawerOpen(true);
        }
      } else {
        setDrawerOpen(false);
        setSelectedNode(null);
      }
    });

    // Highlight connected nodes on hover
    network.on('hoverNode', (params) => {
      const connectedNodes = network.getConnectedNodes(params.node) as string[];
      const allNodeIds = nodes.getIds() as string[];

      // Dim unconnected nodes
      const updates = allNodeIds.map((id) => {
        if (id === params.node || connectedNodes.includes(id)) {
          return { id, opacity: 1 };
        }
        return { id, opacity: 0.15 };
      });
      // vis-network doesn't have per-node opacity, so we use color opacity instead
      // Alternative: just highlight the connected edges
    });

    network.on('blurNode', () => {
      // Reset — vis.js handles this with highlight colors automatically
    });

    networkRef.current = network;

    }, 50); // end setTimeout

    return () => {
      clearTimeout(timer);
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [graphData, showLabels, graphHeight]);

  // ─── Physics toggle ────────────────────────────────────────────

  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;
    network.setOptions({ physics: { enabled: physics } });
  }, [physics]);

  // ─── Type filter ───────────────────────────────────────────────

  useEffect(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (!nodes || !edges || nodes.length === 0) return;

    if (filterType === 'all') {
      // Show all
      const allIds = nodes.getIds();
      const updates = allIds.map((id) => ({ id, hidden: false }));
      nodes.update(updates);
    } else {
      const allIds = nodes.getIds();
      const updates = allIds.map((id) => {
        const node = nodes.get(id);
        return { id, hidden: node._type !== filterType };
      });
      nodes.update(updates);
    }

    // Hide edges connecting hidden nodes
    const visibleNodeIds = new Set(
      nodes.get({ filter: (n: any) => !n.hidden }).map((n: any) => n.id)
    );
    const edgeIds = edges.getIds();
    const edgeUpdates = edgeIds.map((id) => {
      const edge = edges.get(id);
      return { id, hidden: !visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to) };
    });
    edges.update(edgeUpdates);
  }, [filterType]);

  // ─── Search ────────────────────────────────────────────────────

  const handleSearch = () => {
    const network = networkRef.current;
    const nodes = nodesRef.current;
    if (!network || !nodes || !searchText.trim()) return;

    const found = nodes.get({
      filter: (n: any) => (n._title || '').toLowerCase().includes(searchText.toLowerCase()),
    });

    if (found.length > 0) {
      network.focus(found[0].id, { scale: 1.5, animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
      network.selectNodes([found[0].id]);
      // Trigger drawer
      const nodeData = found[0];
      setSelectedNode({
        id: String(found[0].id),
        title: nodeData._title,
        type: nodeData._type,
        tags: nodeData._tags || [],
        category: nodeData._category,
        importance: nodeData._importance || 0,
      });
      setDrawerOpen(true);
    }
  };

  // ─── Toolbar actions ───────────────────────────────────────────

  const handleZoomFit = () => networkRef.current?.fit({ animation: { duration: 400 } });
  const handleZoomIn = () => {
    const net = networkRef.current;
    if (net) net.moveTo({ scale: net.getScale() * 1.4, animation: { duration: 300 } });
  };
  const handleZoomOut = () => {
    const net = networkRef.current;
    if (net) net.moveTo({ scale: net.getScale() * 0.7, animation: { duration: 300 } });
  };

  // ─── Clustering ────────────────────────────────────────────────

  const updateParam = (key: keyof ClusterParams, value: number) => {
    const next = { ...clusterParams, [key]: value };
    setClusterParams(next);
    saveParams(next);
  };

  const weightSum = clusterParams.keywordWeight + clusterParams.tagWeight + clusterParams.categoryWeight;

  const handleRunClustering = async () => {
    setClustering(true);
    try {
      const res = await graphApi.runClustering(clusterParams);
      const data = res.data;
      setClusterInfo({
        lastRun: new Date().toLocaleString('zh-CN'),
        itemCount: data.stats?.totalNodes || 0,
        clusterCount: data.clusters?.length || 0,
        computationTime: data.computationTime || 0,
      });
      message.success(`聚类完成，耗时 ${data.computationTime}ms，发现 ${data.clusters?.length || 0} 个社区`);
      await fetchData();
    } catch (err: any) {
      message.error('聚类失败: ' + (err.message || '未知错误'));
    } finally {
      setClustering(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="加载图谱数据..." />
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <Empty description="暂无图谱数据" style={{ marginTop: 80 }}>
        <Text type="secondary">添加知识条目后，图谱将自动生成关联</Text>
      </Empty>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Stats bar */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small"><Statistic title="节点数" value={stats.totalNodes} prefix={<NodeIndexOutlined />} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="关联数" value={stats.totalEdges} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="聚类数" value={stats.clusters} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="平均关联" value={stats.avgConnections} precision={1} /></Card>
          </Col>
        </Row>
      )}

      {/* Toolbar */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索节点..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 200 }}
            allowClear
          />
          <Button type="primary" onClick={handleSearch} icon={<SearchOutlined />}>搜索</Button>
          <Divider type="vertical" />
          <Select
            value={filterType}
            onChange={setFilterType}
            style={{ width: 120 }}
            options={[
              { value: 'all', label: '全部类型' },
              { value: 'classical_chinese', label: '文言文' },
              { value: 'idiom', label: '成语' },
              { value: 'poetry', label: '诗词' },
              { value: 'general', label: '通用' },
            ]}
          />
          <Tooltip title="物理模拟">
            <Switch checked={physics} onChange={setPhysics} checkedChildren="物理" unCheckedChildren="静止" />
          </Tooltip>
          <Tooltip title="显示标签">
            <Switch checked={showLabels} onChange={(v) => {
              setShowLabels(v);
              const nodes = nodesRef.current;
              if (nodes && nodes.length > 0) {
                const updates = nodes.getIds().map((id) => ({
                  id,
                  font: { size: v ? 13 : 0 },
                }));
                nodes.update(updates);
              }
            }} checkedChildren="标签" unCheckedChildren="标签" />
          </Tooltip>
          <Divider type="vertical" />
          <Button onClick={handleZoomIn} icon={<ZoomInOutlined />} />
          <Button onClick={handleZoomOut} icon={<ZoomOutOutlined />} />
          <Button onClick={handleZoomFit} icon={<BorderOutlined />} title="适应画布" />
        </Space>
      </Card>

      {/* Clustering panel */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div
          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onClick={() => setClusterPanelOpen(!clusterPanelOpen)}
        >
          <Text strong>聚类参数</Text>
          {clusterPanelOpen ? <UpOutlined /> : <DownOutlined />}
        </div>

        {clusterPanelOpen && (
          <div style={{ marginTop: 16 }}>
            <Row gutter={24}>
              <Col span={12}>
                <div style={{ marginBottom: 12 }}>
                  <Text>相似度阈值</Text>
                  <Slider min={0} max={1} step={0.05} value={clusterParams.threshold}
                    onChange={(v) => updateParam('threshold', v)} marks={{ 0: '0', 0.5: '0.5', 1: '1' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text>关键词权重</Text>
                  <Slider min={0} max={1} step={0.05} value={clusterParams.keywordWeight}
                    onChange={(v) => updateParam('keywordWeight', v)} marks={{ 0: '0', 0.5: '0.5', 1: '1' }} />
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 12 }}>
                  <Text>标签权重</Text>
                  <Slider min={0} max={1} step={0.05} value={clusterParams.tagWeight}
                    onChange={(v) => updateParam('tagWeight', v)} marks={{ 0: '0', 0.5: '0.5', 1: '1' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text>分类权重</Text>
                  <Slider min={0} max={1} step={0.05} value={clusterParams.categoryWeight}
                    onChange={(v) => updateParam('categoryWeight', v)} marks={{ 0: '0', 0.5: '0.5', 1: '1' }} />
                </div>
              </Col>
            </Row>

            <div style={{ marginBottom: 12 }}>
              <Text>权重总和: {weightSum.toFixed(2)} </Text>
              {Math.abs(weightSum - 1.0) < 0.01 ? (
                <Tag color="success">✓</Tag>
              ) : (
                <Tag color="warning">将自动归一化</Tag>
              )}
            </div>

            <Button type="primary" icon={<SyncOutlined spin={clustering} />} onClick={handleRunClustering} loading={clustering}>
              重新聚类
            </Button>

            {clusterInfo && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary">
                  上次聚类: {clusterInfo.lastRun} | 条目: {clusterInfo.itemCount} | 社区: {clusterInfo.clusterCount} | 耗时: {clusterInfo.computationTime}ms
                </Text>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Graph canvas */}
      <Card
        style={{ flex: 1, position: 'relative', borderRadius: 12, overflow: 'hidden' }}
        bodyStyle={{ padding: 0, height: graphHeight, borderRadius: 12 }}
      >
        <div ref={containerRef} style={{
          width: '100%',
          height: graphHeight,
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        }} />

        {/* Legend */}
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: '#ffffffee',
          backdropFilter: 'blur(8px)',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <Text strong style={{ fontSize: 12 }}>图例</Text>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: TYPE_COLORS[type],
                  boxShadow: `0 0 6px ${TYPE_COLORS[type]}44`,
                }} />
                <span>{label}</span>
              </span>
            ))}
          </div>
        </div>
      </Card>

      {/* Detail drawer */}
      <Drawer
        title={selectedNode?.title || '知识详情'}
        placement="right"
        width={420}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedNode(null); }}
        destroyOnClose
      >
        {selectedNode && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Tag color={TYPE_COLORS[selectedNode.type]}>{TYPE_LABELS[selectedNode.type] || selectedNode.type}</Tag>
              {selectedNode.category && <Tag>{selectedNode.category}</Tag>}
            </div>

            <Title level={5}>{selectedNode.title}</Title>
            <Divider />

            <Paragraph>
              <Text strong>关联数: </Text>
              <Text>{selectedNode.importance}</Text>
            </Paragraph>

            {selectedNode.tags.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>标签: </Text>
                <div style={{ marginTop: 4 }}>
                  {selectedNode.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                </div>
              </div>
            )}

            {selectedNode.category && (
              <Paragraph>
                <Text strong>分类: </Text>
                <Text>{selectedNode.category}</Text>
              </Paragraph>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
