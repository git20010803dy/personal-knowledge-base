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
  Switch,
  Popconfirm,
  message,
  Tag,
  Card,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UndoOutlined } from '@ant-design/icons';
import { templateApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const typeOptions = [
  { value: 'classical_chinese', label: '文言文' },
  { value: 'idiom', label: '成语' },
  { value: 'poetry', label: '诗词' },
  { value: 'general', label: '通用' },
];

export default function TemplateManagement() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await templateApi.list();
      setTemplates(res.data);
    } catch (err: any) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ is_default: false });
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await templateApi.delete(id);
      message.success('已删除');
      fetchTemplates();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleReset = async () => {
    try {
      await templateApi.reset();
      message.success('已重置为内置模板');
      fetchTemplates();
    } catch (err: any) {
      message.error(err.message || '重置失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await templateApi.update(editingId, values);
        message.success('已更新');
      } else {
        await templateApi.create(values);
        message.success('已创建');
      }
      setModalOpen(false);
      fetchTemplates();
    } catch (err: any) {
      if (err.errorFields) return; // form validation error
      message.error(err.message || '操作失败');
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
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => {
        const opt = typeOptions.find((o) => o.value === type);
        return <Tag color="blue">{opt?.label || type}</Tag>;
      },
    },
    {
      title: '默认',
      dataIndex: 'is_default',
      key: 'is_default',
      width: 80,
      render: (v: number) => (v ? <Tag color="green">是</Tag> : '否'),
    },
    {
      title: '模板内容（预览）',
      dataIndex: 'template',
      key: 'template',
      ellipsis: true,
      render: (text: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {text.substring(0, 80)}...
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>⚙️ 模板管理</Title>
      <Text type="secondary">管理 Prompt 模板，控制 AI 处理知识的方式</Text>

      <Space style={{ marginTop: 16, marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建模板
        </Button>
        <Button icon={<UndoOutlined />} onClick={handleReset}>
          重置为内置模板
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={templates}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingId ? '编辑模板' : '新建模板'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input placeholder="例如：古诗处理" />
          </Form.Item>
          <Form.Item name="type" label="关联类型" rules={[{ required: true }]}>
            <Select options={typeOptions} placeholder="选择知识类型" />
          </Form.Item>
          <Form.Item name="template" label="模板内容" rules={[{ required: true }]}>
            <TextArea
              rows={12}
              placeholder="使用 {{变量名}} 作为占位符，例如：{{raw_content}}"
            />
          </Form.Item>
          <Form.Item name="is_default" label="设为默认" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
