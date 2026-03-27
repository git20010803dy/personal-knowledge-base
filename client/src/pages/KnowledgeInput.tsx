import React, { useState, useEffect } from 'react';
import {
  Typography,
  Input,
  Select,
  Button,
  Space,
  Card,
  Divider,
  message,
  Spin,
  Tag,
  Alert,
  Tabs,
  Collapse,
  Slider,
} from 'antd';
import { SendOutlined, EyeOutlined, UploadOutlined, WarningOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { knowledgeApi, providerApi } from '../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const knowledgeTypes = [
  { value: 'auto', label: '自动识别' },
  { value: 'classical_chinese', label: '文言文' },
  { value: 'idiom', label: '成语' },
  { value: 'poetry', label: '诗词' },
  { value: 'general', label: '通用' },
];

export default function KnowledgeInput() {
  const [rawContent, setRawContent] = useState('');
  const [selectedType, setSelectedType] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [fileList, setFileList] = useState<File[]>([]);

  // Advanced params state
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(1);

  // Fetch providers on mount
  useEffect(() => {
    providerApi.list().then((data) => {
      setProviders(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  const getLLMOptions = () => {
    const opts: Record<string, any> = {};
    if (selectedModel) opts.model = selectedModel;
    opts.temperature = temperature;
    opts.top_p = topP;
    return opts;
  };

  const handlePreview = async () => {
    if (!rawContent.trim()) {
      message.warning('请输入内容');
      return;
    }
    setPreviewing(true);
    try {
      const res = await knowledgeApi.preview({
        raw_content: rawContent,
        type: selectedType === 'auto' ? undefined : selectedType,
        ...getLLMOptions(),
      });
      setPreviewResult(res.data);
      message.success('预览成功');
    } catch (err: any) {
      message.error(err.message || '预览失败');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async () => {
    if (!rawContent.trim() && fileList.length === 0) {
      message.warning('请输入内容或上传文件');
      return;
    }
    setLoading(true);
    try {
      if (fileList.length > 0) {
        // Upload file (options not supported for upload yet)
        const res = await knowledgeApi.upload(
          fileList[0],
          selectedType === 'auto' ? undefined : selectedType,
        );
        setPreviewResult(res.processing);
        message.success('文件处理成功，知识已入库');
      } else {
        // Text input
        const res = await knowledgeApi.create({
          raw_content: rawContent,
          type: selectedType === 'auto' ? undefined : selectedType,
          auto_classify: selectedType === 'auto',
          ...getLLMOptions(),
        });

        if (res.split && res.split_count > 1) {
          // Multiple items were created
          setPreviewResult({
            _split: true,
            items: Array.isArray(res.data) ? res.data : [res.data],
            processing: res.processing,
          });
          message.success(`内容已拆分为 ${res.split_count} 个知识点入库`);
        } else {
          setPreviewResult(res.processing);
          message.success('知识已入库');
        }
      }
      setRawContent('');
      setFileList([]);
    } catch (err: any) {
      message.error(err.message || '处理失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setFileList(files);
    setPreviewResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setFileList(files);
    setPreviewResult(null);
  };

  const typeLabelMap: Record<string, string> = {
    classical_chinese: '文言文',
    idiom: '成语',
    poetry: '诗词',
    general: '通用',
  };

  const modelOptions = [
    { value: '', label: '使用默认' },
    ...providers.map((p) => ({
      value: p.model,
      label: `${p.name} (${p.model})`,
    })),
  ];

  return (
    <div>
      <Title level={3}>📝 知识输入</Title>
      <Text type="secondary">输入文本或上传文件，AI 将自动提取和分类知识</Text>

      <Divider />

      <Tabs
        defaultActiveKey="text"
        items={[
          {
            key: 'text',
            label: '文本输入',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div>
                  <Text strong>知识类型</Text>
                  <Select
                    value={selectedType}
                    onChange={setSelectedType}
                    options={knowledgeTypes}
                    style={{ width: 200, marginLeft: 12 }}
                  />
                </div>

                {/* Advanced params collapse */}
                <Collapse
                  size="small"
                  items={[
                    {
                      key: 'advanced',
                      label: '⚙️ 高级参数',
                      children: (
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                          {providers.length === 0 && (
                            <Alert
                              type="warning"
                              message="尚未配置 AI 提供商，将使用默认设置。请前往「模型配置」页面添加。"
                              icon={<WarningOutlined />}
                              showIcon
                            />
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 280 }}>
                              <Text strong>模型：</Text>
                              <Select
                                value={selectedModel}
                                onChange={setSelectedModel}
                                options={modelOptions}
                                style={{ width: 240, marginLeft: 8 }}
                              />
                            </div>
                            <div style={{ minWidth: 280 }}>
                              <Text strong>Temperature: {temperature}</Text>
                              <Slider
                                min={0}
                                max={2}
                                step={0.1}
                                value={temperature}
                                onChange={setTemperature}
                                style={{ width: 200, marginLeft: 8 }}
                              />
                            </div>
                            <div style={{ minWidth: 280 }}>
                              <Text strong>Top P: {topP}</Text>
                              <Slider
                                min={0}
                                max={1}
                                step={0.05}
                                value={topP}
                                onChange={setTopP}
                                style={{ width: 200, marginLeft: 8 }}
                              />
                            </div>
                          </div>
                        </Space>
                      ),
                    },
                  ]}
                />

                <TextArea
                  rows={10}
                  placeholder="在此粘贴或输入知识内容..."
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                />

                <Collapse
                  size="small"
                  items={[
                    {
                      key: 'preview',
                      label: 'Markdown 预览',
                      children: (
                        <div className="markdown-preview">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawContent || '*（空）*'}</ReactMarkdown>
                        </div>
                      ),
                    },
                  ]}
                />

                <Space>
                  <Button
                    icon={<EyeOutlined />}
                    onClick={handlePreview}
                    loading={previewing}
                    disabled={!rawContent.trim()}
                  >
                    预览处理结果
                  </Button>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSubmit}
                    loading={loading}
                    disabled={!rawContent.trim()}
                  >
                    提交入库
                  </Button>
                </Space>
              </Space>
            ),
          },
          {
            key: 'file',
            label: '文件上传',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div>
                  <Text strong>知识类型</Text>
                  <Select
                    value={selectedType}
                    onChange={setSelectedType}
                    options={knowledgeTypes}
                    style={{ width: 200, marginLeft: 12 }}
                  />
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  style={{
                    border: '2px dashed #d9d9d9',
                    borderRadius: 8,
                    padding: 40,
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: fileList.length > 0 ? '#f6ffed' : '#fafafa',
                  }}
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  <UploadOutlined style={{ fontSize: 32, color: '#999' }} />
                  <div style={{ marginTop: 8 }}>
                    <Text>拖拽文件到此处，或点击选择文件</Text>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary">支持 PDF、Markdown、图片格式</Text>
                  </div>
                  <input
                    id="file-input"
                    type="file"
                    accept=".pdf,.md,.txt,.png,.jpg,.jpeg,.gif,.webp"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </div>

                {fileList.length > 0 && (
                  <Card size="small">
                    <Text strong>已选择文件：</Text>
                    {fileList.map((f) => (
                      <Tag key={f.name} color="blue" style={{ marginLeft: 8 }}>
                        {f.name} ({(f.size / 1024).toFixed(1)} KB)
                      </Tag>
                    ))}
                  </Card>
                )}

                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSubmit}
                  loading={loading}
                  disabled={fileList.length === 0}
                >
                  上传并处理
                </Button>
              </Space>
            ),
          },
        ]}
      />

      {previewResult && (
        <>
          <Divider />
          <Title level={4}>📋 处理结果</Title>

          {previewResult._split ? (
            <Alert
              message={`内容已自动拆分为 ${previewResult.items.length} 个独立知识点`}
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
          ) : null}

          {(previewResult._split ? previewResult.items : [previewResult]).map((item: any, idx: number) => (
            <Card
              key={idx}
              style={{ marginBottom: 12 }}
              title={previewResult._split ? `知识点 ${idx + 1}` : undefined}
              size={previewResult._split ? 'small' : 'default'}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Text strong>标题：</Text>
                  <Text>{item.title}</Text>
                </div>
                <div>
                  <Text strong>类型：</Text>
                  <Tag color="green">
                    {typeLabelMap[item.type] || '未知'}
                  </Tag>
                </div>
                {item.tags?.length > 0 && (
                  <div>
                    <Text strong>标签：</Text>
                    {item.tags.map((t: string) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                )}
                {item.category && (
                  <div>
                    <Text strong>分类：</Text>
                    <Tag color="purple">{item.category}</Tag>
                  </div>
                )}
                {item.content && (
                  <div>
                    <Text strong>结构化内容：</Text>
                    <pre style={{ background: '#f6f8fa', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {typeof item.content === 'string'
                        ? item.content
                        : JSON.stringify(item.content, null, 2)}
                    </pre>
                  </div>
                )}
              </Space>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
