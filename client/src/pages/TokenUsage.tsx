import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Spin } from 'antd';
import {
  ThunderboltOutlined,
  CalendarOutlined,
  FieldTimeOutlined,
  NumberOutlined,
} from '@ant-design/icons';
import { tokenApi } from '../services/api';

const { Title } = Typography;

interface ModelStat {
  model: string;
  total_tokens: number;
  calls: number;
}

interface TypeStat {
  call_type: string;
  total_tokens: number;
  calls: number;
}

interface DailyData {
  date: string;
  total_tokens: number;
  total_calls: number;
  by_model: ModelStat[];
  by_type: TypeStat[];
}

interface SummaryData {
  total_tokens_7d: number;
  total_calls_7d: number;
  daily_average: number;
  top_model: string | null;
  breakdown: DailyData[];
}

interface TotalData {
  total_tokens: number;
  total_calls: number;
}

const CALL_TYPE_LABELS: Record<string, string> = {
  knowledge_process: '知识处理',
  chat: 'AI 问答',
  link_recognition: '关联识别',
  review: '复习',
  classify: '分类',
};

const BAR_COLORS = ['#1677ff', '#13c2c2', '#52c41a', '#faad14', '#722ed1', '#eb2f96', '#fa541c'];

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}

function getDayLabels(breakdown: DailyData[]): string[] {
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return breakdown.map((d) => {
    const dt = new Date(d.date + 'T00:00:00');
    return weekDays[dt.getDay()];
  });
}

export default function TokenUsage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [today, setToday] = useState<DailyData | null>(null);
  const [total, setTotal] = useState<TotalData | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [summaryRes, todayRes, totalRes] = await Promise.all([
          tokenApi.getSummary(),
          tokenApi.getToday(),
          tokenApi.getTotal(),
        ]);
        setSummary(summaryRes.data);
        setToday(todayRes.data);
        setTotal(totalRes.data);
      } catch (err) {
        console.error('Failed to load token stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  const breakdown = summary?.breakdown || [];
  const maxTokens = Math.max(...breakdown.map((d) => d.total_tokens), 1);
  const dayLabels = getDayLabels(breakdown);

  // Aggregate model stats across all days in the 7-day range
  const modelMap = new Map<string, { total_tokens: number; calls: number }>();
  for (const day of breakdown) {
    for (const m of day.by_model) {
      const existing = modelMap.get(m.model) || { total_tokens: 0, calls: 0 };
      existing.total_tokens += m.total_tokens;
      existing.calls += m.calls;
      modelMap.set(m.model, existing);
    }
  }
  const modelRows = Array.from(modelMap.entries())
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.total_tokens - a.total_tokens);
  const totalTokensAll = modelRows.reduce((s, r) => s + r.total_tokens, 0);

  // Aggregate type stats
  const typeMap = new Map<string, { total_tokens: number; calls: number }>();
  for (const day of breakdown) {
    for (const t of day.by_type) {
      const existing = typeMap.get(t.call_type) || { total_tokens: 0, calls: 0 };
      existing.total_tokens += t.total_tokens;
      existing.calls += t.calls;
      typeMap.set(t.call_type, existing);
    }
  }
  const typeRows = Array.from(typeMap.entries())
    .map(([call_type, stats]) => ({ call_type, ...stats }))
    .sort((a, b) => b.total_tokens - a.total_tokens);

  // Today's model and type breakdowns
  const todayModelRows = (today?.by_model || []).map((m) => ({
    ...m,
    percentage: today && today.total_tokens > 0
      ? ((m.total_tokens / today.total_tokens) * 100).toFixed(1) + '%'
      : '0%',
  }));

  const todayTypeRows = (today?.by_type || []).map((t) => ({
    ...t,
    type_label: CALL_TYPE_LABELS[t.call_type] || t.call_type,
  }));

  const modelColumns = [
    { title: '模型', dataIndex: 'model', key: 'model' },
    {
      title: '调用',
      dataIndex: 'calls',
      key: 'calls',
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '总 tokens',
      dataIndex: 'total_tokens',
      key: 'total_tokens',
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '占比',
      key: 'percentage',
      render: (_: unknown, record: { total_tokens: number }) =>
        totalTokensAll > 0
          ? ((record.total_tokens / totalTokensAll) * 100).toFixed(1) + '%'
          : '0%',
    },
  ];

  const typeColumns = [
    {
      title: '用途',
      dataIndex: 'call_type',
      key: 'call_type',
      render: (v: string) => CALL_TYPE_LABELS[v] || v,
    },
    {
      title: '调用',
      dataIndex: 'calls',
      key: 'calls',
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: 'Tokens',
      dataIndex: 'total_tokens',
      key: 'total_tokens',
      render: (v: number) => v.toLocaleString(),
    },
  ];

  const todayModelColumns = [
    { title: '模型', dataIndex: 'model', key: 'model' },
    {
      title: '调用',
      dataIndex: 'calls',
      key: 'calls',
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '总 tokens',
      dataIndex: 'total_tokens',
      key: 'total_tokens',
      render: (v: number) => v.toLocaleString(),
    },
    { title: '占比', dataIndex: 'percentage', key: 'percentage' },
  ];

  const todayTypeColumns = [
    {
      title: '用途',
      dataIndex: 'type_label',
      key: 'type_label',
    },
    {
      title: '调用',
      dataIndex: 'calls',
      key: 'calls',
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: 'Tokens',
      dataIndex: 'total_tokens',
      key: 'total_tokens',
      render: (v: number) => v.toLocaleString(),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        <ThunderboltOutlined style={{ marginRight: 8 }} />
        Token 消耗统计
      </Title>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="今日消耗"
              value={today?.total_tokens || 0}
              formatter={(v) => formatNumber(Number(v))}
              prefix={<ThunderboltOutlined />}
              suffix="tokens"
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="近7天"
              value={summary?.total_tokens_7d || 0}
              formatter={(v) => formatNumber(Number(v))}
              prefix={<CalendarOutlined />}
              suffix="tokens"
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="日均消耗"
              value={summary?.daily_average || 0}
              formatter={(v) => formatNumber(Number(v))}
              prefix={<FieldTimeOutlined />}
              suffix="tokens"
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="总调用"
              value={total?.total_calls || 0}
              formatter={(v) => formatNumber(Number(v))}
              prefix={<NumberOutlined />}
              suffix="次"
            />
          </Card>
        </Col>
      </Row>

      {/* 7-Day Bar Chart */}
      <Card title="近7天每日消耗" style={{ marginBottom: 24 }}>
        {breakdown.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>暂无数据</div>
        ) : (
          <div style={{ padding: '16px 0' }}>
            {breakdown.map((day, i) => (
              <div
                key={day.date}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <div style={{ width: 60, textAlign: 'right', marginRight: 12, fontSize: 13, color: '#666' }}>
                  {dayLabels[i]}
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <div
                    style={{
                      height: 28,
                      borderRadius: 4,
                      background: BAR_COLORS[i % BAR_COLORS.length],
                      width: `${Math.max((day.total_tokens / maxTokens) * 100, 2)}%`,
                      minWidth: day.total_tokens > 0 ? 4 : 0,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 8,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 500,
                      transition: 'width 0.3s ease',
                    }}
                  >
                    {day.total_tokens > 0 ? day.total_tokens.toLocaleString() : ''}
                  </div>
                </div>
                <div style={{ width: 50, textAlign: 'right', marginLeft: 8, fontSize: 12, color: '#999' }}>
                  {day.total_calls}次
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Today's Breakdown */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="今日 · 按模型分布" size="small">
            <Table
              dataSource={todayModelRows}
              columns={todayModelColumns}
              rowKey="model"
              pagination={false}
              size="small"
              locale={{ emptyText: '今日暂无数据' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="今日 · 按用途分布" size="small">
            <Table
              dataSource={todayTypeRows}
              columns={todayTypeColumns}
              rowKey="call_type"
              pagination={false}
              size="small"
              locale={{ emptyText: '今日暂无数据' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 7-Day Breakdown */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="近7天 · 按模型分布" size="small">
            <Table
              dataSource={modelRows}
              columns={modelColumns}
              rowKey="model"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="近7天 · 按用途分布" size="small">
            <Table
              dataSource={typeRows}
              columns={typeColumns}
              rowKey="call_type"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
