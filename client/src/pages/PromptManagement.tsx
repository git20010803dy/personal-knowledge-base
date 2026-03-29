/**
 * PromptManagement.tsx - 系统 Prompt 统一管理
 * 功能：按分类展示所有 Prompt（用途说明、数据流、逻辑流），支持编辑
 * 路由：/prompts
 * 最后修改：2026-03-29
 */
import React, { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Tabs,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Switch,
  Popconfirm,
  message,
  Tag,
  Descriptions,
  Collapse,
  Spin,
  Alert,
} from 'antd';
import {
  EditOutlined,
  UndoOutlined,
  InfoCircleOutlined,
  CodeOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { promptApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface SystemPrompt {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  variables: string[];
  data_flow: string;
  logic_flow: string;
  is_active: boolean;
  updated_at: string;
}

const categoryLabels: Record<string, { label: string; color: string; icon: string }> = {
  knowledge: { label: '知识处理', color: '#1890ff', icon: '📚' },
  review: { label: '复习', color: '#52c41a', icon: '📝' },
  agent: { label: '智能问答', color: '#722ed1', icon: '🤖' },
};

export default function PromptManagement() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('knowledge');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const res = await promptApi.list();
      setPrompts(res.data || []);
    } catch (err: any) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleEdit = (prompt: SystemPrompt) => {
    setEditingKey(prompt.key);
    form.setFieldsValue({
      prompt: prompt.prompt,
      description: prompt.description,
      data_flow: prompt.data_flow,
      logic_flow: prompt.logic_flow,
      is_active: prompt.is_active,
    });
    setEditModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingKey) return;
    try {
      const values = await form.validateFields();
      await promptApi.update(editingKey, values);
      message.success('已保存');
      setEditModalOpen(false);
      fetchPrompts();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '保存失败');
    }
  };

  const handleReset = async () => {
    try {
      await promptApi.reset();
      message.success('已重置为内置 Prompt');
      fetchPrompts();
    } catch (err: any) {
      message.error(err.message || '重置失败');
    }
  };

  const renderPromptCard = (prompt: SystemPrompt) => {
    const catInfo = categoryLabels[prompt.category] || { label: prompt.category, color: '#888', icon: '📄' };

    return (
      <Card
        key={prompt.key}
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <span>{catInfo.icon} {prompt.name}</span>
            <Tag color={catInfo.color}>{catInfo.label}</Tag>
            {!prompt.is_active && <Tag color="red">已禁用</Tag>}
          </Space>
        }
        extra={
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(prompt)}>
            编辑
          </Button>
        }
      >
        {/* 描述 */}
        <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
          <Descriptions.Item label={<><InfoCircleOutlined /> 用途</>}>
            {prompt.description}
          </Descriptions.Item>
          <Descriptions.Item label={<><CodeOutlined /> 变量</>}>
            {prompt.variables.map((v) => (
              <Tag key={v} color="orange" style={{ fontFamily: 'monospace' }}>{`{{${v}}}`}</Tag>
            ))}
          </Descriptions.Item>
        </Descriptions>

        {/* 数据流 & 逻辑流 */}
        <Collapse
          size="small"
          style={{ marginBottom: 12 }}
          items={[
            {
              key: 'data_flow',
              label: <><BranchesOutlined /> 数据流</>,
              children: (
                <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#555', margin: 0 }}>
                  {prompt.data_flow || '未填写'}
                </Paragraph>
              ),
            },
            {
              key: 'logic_flow',
              label: <><BranchesOutlined /> 逻辑流</>,
              children: (
                <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#555', margin: 0 }}>
                  {prompt.logic_flow || '未填写'}
                </Paragraph>
              ),
            },
          ]}
        />

        {/* Prompt 模板预览 */}
        <Collapse
          size="small"
          items={[
            {
              key: 'prompt',
              label: 'Prompt 模板（点击展开）',
              children: (
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: 12,
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 6,
                  maxHeight: 300,
                  overflow: 'auto',
                  margin: 0,
                }}>
                  {prompt.prompt}
                </pre>
              ),
            },
          ]}
        />
      </Card>
    );
  };

  const categories = ['knowledge', 'review', 'agent'];
  const tabItems = categories.map((cat) => {
    const catInfo = categoryLabels[cat];
    const catPrompts = prompts.filter((p) => p.category === cat);
    return {
      key: cat,
      label: `${catInfo.icon} ${catInfo.label}（${catPrompts.length}）`,
      children: (
        <div>
          {catPrompts.length === 0 && <Text type="secondary">暂无 Prompt</Text>}
          {catPrompts.map(renderPromptCard)}
        </div>
      ),
    };
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>🧠 Prompt 管理</Title>
          <Text type="secondary">统一管理系统中所有 AI Prompt，查看用途、数据流、逻辑流，并支持自定义修改</Text>
        </div>
        <Popconfirm
          title="确定重置？"
          description="所有 Prompt 将恢复为内置默认值，自定义修改将丢失"
          onConfirm={handleReset}
        >
          <Button icon={<UndoOutlined />}>重置全部</Button>
        </Popconfirm>
      </div>

      <Alert
        message="修改说明"
        description="修改 Prompt 后会立即生效于后续的 AI 调用。变量用 {{变量名}} 标记，请勿修改变量名，只修改周围的文本内容。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Spin spinning={loading}>
        <Tabs activeKey={activeCategory} onChange={setActiveCategory} items={tabItems} />
      </Spin>

      {/* Edit Modal */}
      <Modal
        title={`编辑 Prompt：${editingKey}`}
        open={editModalOpen}
        onOk={handleSave}
        onCancel={() => setEditModalOpen(false)}
        width={800}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="description" label="用途描述">
            <Input placeholder="简要说明这个 Prompt 的用途" />
          </Form.Item>
          <Form.Item name="prompt" label="Prompt 模板" rules={[{ required: true, message: 'Prompt 内容不能为空' }]}>
            <TextArea
              rows={12}
              placeholder="使用 {{变量名}} 作为占位符"
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </Form.Item>
          <Form.Item name="data_flow" label="数据流说明">
            <TextArea rows={3} placeholder="描述数据从输入到输出的流转过程" />
          </Form.Item>
          <Form.Item name="logic_flow" label="逻辑流说明">
            <TextArea rows={5} placeholder="描述处理的步骤和逻辑" />
          </Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
