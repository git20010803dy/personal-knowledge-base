import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape, { type Core, type NodeSingular, type EdgeSingular } from 'cytoscape';
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
  Collapse,
  message,
} from 'antd';
import {
  SearchOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  BorderOutlined,
  AppstoreOutlined,
  NodeIndexOutlined,
  SyncOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { graphApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;

// Node color by type
const TYPE_COLORS: Record<string, string> = {
  classical_chinese: '#1677ff',
  idiom: '#52c41a',
  poetry: '#722ed1',
  general: '#fa8c16',
};

const TYPE_LABELS: Record<string, string> = {
  classical_chinese: '文言文',
  idiom: '成语',
  poetry: '诗词',
  general: '通用',
};

const RELATION_COLORS: Record<string, string> = {
  '相关': '#8c8c8c',
  '包含': '#1677ff',
  '因果': '#ff4d4f',
  '对比': '#faad14',
  '同源': '#722ed1',
};

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

export default function KnowledgeGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [searchText, setSearchText] = useState('');
  const [layout, setLayout] = useState<string>('cose');
  const [filterType, setFilterType] = useState<string>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Fetch graph data
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

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const elements: cytoscape.ElementDefinition[] = [];

    for (const node of graphData.nodes) {
      elements.push({
        data: {
          id: node.id,
          label: node.title.length > 12 ? node.title.substring(0, 12) + '…' : node.title,
          fullTitle: node.title,
          type: node.type,
          tags: node.tags,
          category: node.category,
          importance: node.importance,
        },
        classes: node.type,
      });
    }

    for (const edge of graphData.edges) {
      elements.push({
        data: {
          id: edge.id,
          source: edge.source_id,
          target: edge.target_id,
          relation: edge.relation_type || '相关',
          strength: edge.strength,
        },
      });
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: NodeSingular) => TYPE_COLORS[ele.data('type')] || '#8c8c8c',
            'label': showLabels ? 'data(label)' : '',
            'color': '#333',
            'font-size': '11px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'width': (ele: NodeSingular) => {
              const imp = ele.data('importance') || 0;
              return 30 + Math.min(imp * 8, 40);
            },
            'height': (ele: NodeSingular) => {
              const imp = ele.data('importance') || 0;
              return 30 + Math.min(imp * 8, 40);
            },
            'border-width': 2,
            'border-color': '#fff',
            // @ts-ignore
            'shadow-blur': 6,
            // @ts-ignore
            'shadow-color': '#00000033',
            // @ts-ignore
            'shadow-offset-x': 1,
            // @ts-ignore
            'shadow-offset-y': 1,
          },
        },
        {
          selector: 'node:active',
          style: {
            'overlay-opacity': 0.2,
            'overlay-color': '#1677ff',
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 3,
            'border-color': '#1677ff',
            // @ts-ignore
            'shadow-blur': 12,
            // @ts-ignore
            'shadow-color': '#1677ff66',
          },
        },
        {
          selector: 'node.dimmed',
          style: {
            'opacity': 0.25,
          },
        },
        {
          selector: 'edge',
          style: {
            'width': (ele: EdgeSingular) => Math.max(ele.data('strength') * 3, 1.5),
            'line-color': (ele: EdgeSingular) => RELATION_COLORS[ele.data('relation')] || '#8c8c8c',
            'target-arrow-color': (ele: EdgeSingular) => RELATION_COLORS[ele.data('relation')] || '#8c8c8c',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.6,
            'arrow-scale': 0.8,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'width': 4,
            'opacity': 1,
            'z-index': 999,
          },
        },
        {
          selector: 'edge.dimmed',
          style: {
            'opacity': 0.1,
          },
        },
      ],
      layout: {
        name: layout,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 40,
        randomize: false,
        ...(layout === 'cose' ? {
          nodeRepulsion: () => 8000,
          idealEdgeLength: () => 120,
          edgeElasticity: () => 100,
          nestingFactor: 0.5,
        } : {}),
      } as any,
      minZoom: 0.2,
      maxZoom: 4,
      wheelSensitivity: 0.3,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const data = node.data();
      const graphNode: GraphNode = {
        id: data.id,
        title: data.fullTitle,
        type: data.type,
        tags: data.tags,
        category: data.category,
        importance: data.importance,
      };
      setSelectedNode(graphNode);
      setDrawerOpen(true);
    });

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const connectedEdges = node.connectedEdges();
      const connectedNodes = connectedEdges.connectedNodes().union(node);
      cy.elements().addClass('dimmed');
      connectedNodes.removeClass('dimmed').addClass('highlighted');
      connectedEdges.removeClass('dimmed').addClass('highlighted');
    });

    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('dimmed highlighted');
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setDrawerOpen(false);
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData, layout, showLabels]);

  // Apply type filter
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (filterType === 'all') {
      cy.nodes().style('display', 'element');
    } else {
      cy.nodes().forEach((node) => {
        if (node.data('type') === filterType) {
          node.style('display', 'element');
        } else {
          node.style('display', 'none');
        }
      });
    }
    cy.edges().forEach((edge) => {
      if (edge.source().style('display') === 'none' || edge.target().style('display') === 'none') {
        edge.style('display', 'none');
      } else {
        edge.style('display', 'element');
      }
    });
  }, [filterType]);

  const handleSearch = () => {
    const cy = cyRef.current;
    if (!cy || !searchText.trim()) return;

    const found = cy.nodes().filter((n) => {
      const title: string = n.data('fullTitle') || '';
      return title.toLowerCase().includes(searchText.toLowerCase());
    });

    if (found.length > 0) {
      cy.animate({
        center: { eles: found.first() },
        zoom: 2,
        duration: 500,
      });
      found.first().emit('tap');
    }
  };

  // Clustering controls
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
      // Refresh graph data
      await fetchData();
    } catch (err: any) {
      message.error('聚类失败: ' + (err.message || '未知错误'));
    } finally {
      setClustering(false);
    }
  };

  // Toolbar actions
  const handleZoomFit = () => cyRef.current?.fit(undefined, 40);
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.7);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="加载图谱数据..." />
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <Empty
        description="暂无图谱数据"
        style={{ marginTop: 80 }}
      >
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
            <Card size="small">
              <Statistic title="节点数" value={stats.totalNodes} prefix={<NodeIndexOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="关联数" value={stats.totalEdges} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="聚类数" value={stats.clusters} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="平均关联" value={stats.avgConnections} precision={1} />
            </Card>
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
          <Button type="primary" onClick={handleSearch} icon={<SearchOutlined />}>
            搜索
          </Button>
          <Divider type="vertical" />
          <Select
            value={layout}
            onChange={setLayout}
            style={{ width: 140 }}
            options={[
              { value: 'cose', label: '力导向图' },
              { value: 'circle', label: '环形布局' },
              { value: 'grid', label: '网格布局' },
              { value: 'concentric', label: '同心圆' },
            ]}
          />
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
          <Tooltip title="显示标签">
            <Switch checked={showLabels} onChange={setShowLabels} checkedChildren="标签" unCheckedChildren="标签" />
          </Tooltip>
          <Divider type="vertical" />
          <Button onClick={handleZoomIn} icon={<ZoomInOutlined />} />
          <Button onClick={handleZoomOut} icon={<ZoomOutOutlined />} />
          <Button onClick={handleZoomFit} icon={<BorderOutlined />} title="适应画布" />
        </Space>
      </Card>

      {/* Clustering Parameters Panel */}
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
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={clusterParams.threshold}
                    onChange={(v) => updateParam('threshold', v)}
                    marks={{ 0: '0', 0.5: '0.5', 1: '1' }}
                  />
                  <Text type="secondary">{clusterParams.threshold.toFixed(2)}</Text>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text>关键词权重</Text>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={clusterParams.keywordWeight}
                    onChange={(v) => updateParam('keywordWeight', v)}
                    marks={{ 0: '0', 0.5: '0.5', 1: '1' }}
                  />
                  <Text type="secondary">{clusterParams.keywordWeight.toFixed(2)}</Text>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 12 }}>
                  <Text>标签权重</Text>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={clusterParams.tagWeight}
                    onChange={(v) => updateParam('tagWeight', v)}
                    marks={{ 0: '0', 0.5: '0.5', 1: '1' }}
                  />
                  <Text type="secondary">{clusterParams.tagWeight.toFixed(2)}</Text>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text>分类权重</Text>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={clusterParams.categoryWeight}
                    onChange={(v) => updateParam('categoryWeight', v)}
                    marks={{ 0: '0', 0.5: '0.5', 1: '1' }}
                  />
                  <Text type="secondary">{clusterParams.categoryWeight.toFixed(2)}</Text>
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

            <Button
              type="primary"
              icon={<SyncOutlined spin={clustering} />}
              onClick={handleRunClustering}
              loading={clustering}
            >
              重新聚类
            </Button>

            {clusterInfo && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary">
                  上次聚类: {clusterInfo.lastRun} | 条目数: {clusterInfo.itemCount} | 聚类数: {clusterInfo.clusterCount} | 耗时: {clusterInfo.computationTime}ms
                </Text>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Graph container */}
      <Card
        style={{ flex: 1, minHeight: 400, position: 'relative' }}
        bodyStyle={{ padding: 0, height: '100%' }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 500 }} />

        {/* Legend */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            background: '#ffffffdd',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <Text strong style={{ fontSize: 12 }}>图例</Text>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <span key={type}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: TYPE_COLORS[type],
                    marginRight: 4,
                    verticalAlign: 'middle',
                  }}
                />
                <span style={{ verticalAlign: 'middle' }}>{label}</span>
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
        onClose={() => {
          setDrawerOpen(false);
          setSelectedNode(null);
        }}
        destroyOnClose
      >
        {selectedNode && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Tag color={TYPE_COLORS[selectedNode.type]}>
                {TYPE_LABELS[selectedNode.type] || selectedNode.type}
              </Tag>
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
                  {selectedNode.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
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
