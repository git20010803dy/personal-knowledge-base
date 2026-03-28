import React, { useState, useEffect } from 'react';
import {
  Typography,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  message,
  Tag,
  Alert,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ApiOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { providerApi } from '../services/api';

const { Title, Text } = Typography;

const typeOptions = [
  { value: 'openai', label: 'OpenAI兼容' },
  { value: 'claude', label: 'Claude' },
  { value: 'custom', label: '自定义' },
];

const defaultBaseUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com',
  custom: '',
};

export default function ProviderManagement() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const res = await providerApi.list();
      setProviders(res);
    } catch (err: any) {
      message.error(err.message || '获取失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const hasActiveProvider = providers.some((p) => p.is_active);

  const handleCreate = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      provider_type: record.provider_type,
      api_key: record.api_key,
      base_url: record.base_url,
      model: record.model,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await providerApi.delete(id);
      message.success('已删除');
      fetchProviders();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await providerApi.activate(id);
      message.success('已激活');
      fetchProviders();
    } catch (err: any) {
      message.error(err.message || '激活失败');
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      const res = await providerApi.test({
        id: editingId || undefined,  // pass ID so backend can use stored key if masked
        provider_type: values.provider_type,
        api_key: values.api_key,
        base_url: values.base_url,
        model: values.model,
      });

      if (res.success) {
        message.success(`连接成功: ${res.response}`);
      } else {
        message.error(`连接失败: ${res.error}`);
      }
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await providerApi.update(editingId, values);
        message.success('已更新');
      } else {
        await providerApi.create(values);
        message.success('已创建');
      }
      setModalOpen(false);
      fetchProviders();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '操作失败');
    }
  };

  const handleTypeChange = (type: string) => {
    if (defaultBaseUrls[type]) {
      form.setFieldsValue({ base_url: defaultBaseUrls[type] });
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'provider_type',
      key: 'provider_type',
      width: 120,
      render: (type: string) => {
        const opt = typeOptions.find((o) => o.value === type);
        return <Tag color="blue">{opt?.label || type}</Tag>;
      },
    },
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
      width: 150,
    },
    {
      title: 'API地址',
      dataIndex: 'base_url',
      key: 'base_url',
      ellipsis: true,
      render: (url: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {url}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active: boolean) =>
        active ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>已激活</Tag>
        ) : (
          <Tag>未激活</Tag>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: any) => (
        <Space>
          {!record.is_active && (
            <Tooltip title="设为当前使用的模型">
              <Button
                size="small"
                type="primary"
                ghost
                icon={<CheckCircleOutlined />}
                onClick={() => handleActivate(record.id)}
              >
                激活
              </Button>
            </Tooltip>
          )}
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除此提供商？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>
        <SettingOutlined style={{ marginRight: 8 }} />
        模型配置
      </Title>
      <Text type="secondary">管理AI模型提供商，支持OpenAI兼容接口和Claude</Text>

      {!hasActiveProvider && (
        <Alert
          message="未配置活跃模型"
          description="请添加并激活一个AI模型提供商，否则知识处理功能将无法正常使用。"
          type="warning"
          showIcon
          style={{ marginTop: 16, marginBottom: 16 }}
        />
      )}

      <Space style={{ marginTop: 16, marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          添加提供商
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={providers}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingId ? '编辑提供商' : '添加提供商'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={640}
        footer={[
          <Button key="test" icon={<ApiOutlined />} loading={testing} onClick={handleTest}>
            测试连接
          </Button>,
          <Button key="cancel" onClick={() => setModalOpen(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleSubmit}>
            {editingId ? '更新' : '创建'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：OpenAI、智谱AI、通义千问" />
          </Form.Item>
          <Form.Item
            name="provider_type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select options={typeOptions} placeholder="选择提供商类型" onChange={handleTypeChange} />
          </Form.Item>
          <Form.Item
            name="api_key"
            label="API Key"
            rules={[{ required: true, message: '请输入API Key' }]}
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Form.Item
            name="base_url"
            label="API地址"
            rules={[{ required: true, message: '请输入API地址' }]}
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item
            name="model"
            label="模型名称"
            rules={[{ required: true, message: '请输入模型名称' }]}
          >
            <Input placeholder="gpt-4o-mini, claude-3-5-sonnet-20241022" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
