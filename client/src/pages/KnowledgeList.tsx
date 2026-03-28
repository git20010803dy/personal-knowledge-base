import React, { useState, useEffect } from 'react';
import {
  Typography,
  Table,
  Tag,
  Input,
  Select,
  Button,
  Space,
  Popconfirm,
  message,
  Modal,
  Descriptions,
  Card,
  Collapse,
} from 'antd';
import {
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  EditOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { knowledgeApi } from '../services/api';
import axios from 'axios';

const { Title, Text } = Typography;
const { Search } = Input;

const typeLabelMap: Record<string, { label: string; color: string }> = {
  classical_chinese: { label: '文言文', color: 'blue' },
  idiom: { label: '成语', color: 'green' },
  poetry: { label: '诗词', color: 'purple' },
  general: { label: '通用', color: 'default' },
};

export default function KnowledgeList() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [detailItem, setDetailItem] = useState<any>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<{ id: string; name: string } | null>(null);
  const [catInputValue, setCatInputValue] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
      };
      if (searchText) params.search = searchText;
      if (typeFilter) params.type = typeFilter;

      const res = await knowledgeApi.list(params);
      setData(res.data);
      setTotal(res.total);
    } catch (err: any) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/categories');
      setCategories(res.data);
    } catch {}
  };

  const handleCategoryChange = async (id: string, newCategory: string) => {
    try {
      await knowledgeApi.update(id, { category: newCategory });
      message.success('分类已更新');
      setData((prev) => prev.map((item) => item.id === id ? { ...item, category: newCategory } : item));
    } catch (err: any) {
      message.error(err.message || '更新分类失败');
    }
  };

  // ─── Category CRUD ───────────────────────────────────────────

  const handleAddCategory = async () => {
    if (!catInputValue.trim()) return;
    try {
      const res = await axios.post('/api/categories', { name: catInputValue.trim() });
      setCategories((prev) => [...prev, res.data]);
      setCatInputValue('');
      setCatModalOpen(false);
      message.success('分类已添加');
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || '添加失败');
    }
  };

  const handleEditCategory = async () => {
    if (!editingCat || !catInputValue.trim()) return;
    try {
      const res = await axios.put(`/api/categories/${editingCat.id}`, { name: catInputValue.trim() });
      setCategories((prev) => prev.map((c) => c.id === editingCat.id ? res.data : c));
      setEditingCat(null);
      setCatInputValue('');
      setCatModalOpen(false);
      message.success('分类已更新');
      // Refresh data since category names may have changed
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || '更新失败');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await axios.delete(`/api/categories/${id}`);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      message.success('分类已删除');
      fetchData();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, typeFilter]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await knowledgeApi.delete(id);
      message.success('已删除');
      fetchData();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleViewDetail = async (id: string) => {
    try {
      const res = await knowledgeApi.get(id);
      setDetailItem(res.data);
    } catch (err: any) {
      message.error(err.message || '加载详情失败');
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => {
        const info = typeLabelMap[type] || { label: type, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      render: (tags: string | string[]) => {
        const tagArr = typeof tags === 'string' ? JSON.parse(tags) : tags;
        return tagArr?.slice(0, 3).map((t: string) => <Tag key={t}>{t}</Tag>) || '-';
      },
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 140,
      render: (cat: string, record: any) => (
        <Select
          value={cat || undefined}
          placeholder="选择分类"
          allowClear
          size="small"
          style={{ width: '100%' }}
          onChange={(v) => handleCategoryChange(record.id, v || '')}
          options={categories.map((c) => ({ value: c.name, label: c.name }))}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (d: string) => new Date(d).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.id)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>📚 知识列表</Title>

      {/* Categories Management */}
      <Collapse
        size="small"
        style={{ marginBottom: 16 }}
        items={[{
          key: 'cats',
          label: <span><TagsOutlined /> 分类管理（{categories.length} 个分类）</span>,
          children: (
            <div>
              <Space wrap style={{ marginBottom: 12 }}>
                {categories.map((cat) => (
                  <Tag
                    key={cat.id}
                    closable
                    color="blue"
                    onClose={(e) => {
                      e.preventDefault();
                      handleDeleteCategory(cat.id);
                    }}
                    style={{ cursor: 'default', fontSize: 13, padding: '4px 10px' }}
                  >
                    <EditOutlined
                      style={{ marginRight: 4, cursor: 'pointer' }}
                      onClick={() => {
                        setEditingCat(cat);
                        setCatInputValue(cat.name);
                        setCatModalOpen(true);
                      }}
                    />
                    {cat.name}
                  </Tag>
                ))}
              </Space>
              <Button
                size="small"
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingCat(null);
                  setCatInputValue('');
                  setCatModalOpen(true);
                }}
              >
                添加分类
              </Button>
            </div>
          ),
        }]}
      />

      {/* Add/Edit Category Modal */}
      <Modal
        title={editingCat ? '编辑分类' : '添加分类'}
        open={catModalOpen}
        onOk={editingCat ? handleEditCategory : handleAddCategory}
        onCancel={() => { setCatModalOpen(false); setEditingCat(null); setCatInputValue(''); }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          placeholder="分类名称"
          value={catInputValue}
          onChange={(e) => setCatInputValue(e.target.value)}
          onPressEnter={editingCat ? handleEditCategory : handleAddCategory}
          maxLength={20}
          showCount
        />
      </Modal>

      <Space style={{ marginBottom: 16 }} wrap>
        <Search
          placeholder="搜索标题或内容"
          allowClear
          onSearch={(v) => {
            setSearchText(v);
            setPage(1);
            setTimeout(fetchData, 0);
          }}
          style={{ width: 300 }}
        />
        <Select
          placeholder="筛选类型"
          allowClear
          style={{ width: 150 }}
          onChange={(v) => {
            setTypeFilter(v || '');
            setPage(1);
          }}
          options={[
            { value: 'classical_chinese', label: '文言文' },
            { value: 'idiom', label: '成语' },
            { value: 'poetry', label: '诗词' },
            { value: 'general', label: '通用' },
          ]}
        />
        <Button onClick={fetchData}>刷新</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <Modal
        title="知识详情"
        open={!!detailItem}
        onCancel={() => setDetailItem(null)}
        footer={null}
        width={860}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        {detailItem && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="标题">{detailItem.title}</Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color={typeLabelMap[detailItem.type]?.color}>
                  {typeLabelMap[detailItem.type]?.label || detailItem.type}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="标签">
                {(typeof detailItem.tags === 'string'
                  ? JSON.parse(detailItem.tags)
                  : detailItem.tags
                )?.map((t: string) => <Tag key={t}>{t}</Tag>) || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="分类">{detailItem.category || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {new Date(detailItem.created_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {new Date(detailItem.updated_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16 }}>
              <Text strong>原始内容</Text>
              <div
                style={{
                  maxHeight: 250,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: '#fafafa',
                  padding: 12,
                  borderRadius: 6,
                  marginTop: 8,
                  border: '1px solid #f0f0f0',
                  fontSize: 13,
                  lineHeight: 1.8,
                }}
              >
                {detailItem.raw_content || '-'}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <Text strong>结构化内容</Text>
              <pre
                style={{
                  maxHeight: 350,
                  overflow: 'auto',
                  background: '#f6f8fa',
                  padding: 12,
                  borderRadius: 6,
                  marginTop: 8,
                  border: '1px solid #f0f0f0',
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {detailItem.content ? JSON.stringify(JSON.parse(detailItem.content), null, 2) : '-'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
