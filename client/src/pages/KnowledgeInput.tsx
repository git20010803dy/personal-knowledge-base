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
  Tag,
  Alert,
  Tabs,
  Collapse,
  Slider,
  Checkbox,
  Drawer,
} from 'antd';
import {
  SendOutlined,
  EyeOutlined,
  UploadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  MergeCellsOutlined,
  SaveOutlined,
  TagsOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { knowledgeApi, providerApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const knowledgeTypes = [
  { value: 'auto', label: '自动识别' },
  { value: 'classical_chinese', label: '文言文' },
  { value: 'idiom', label: '成语' },
  { value: 'poetry', label: '诗词' },
  { value: 'general', label: '通用' },
];

const typeLabelMap: Record<string, string> = {
  classical_chinese: '文言文',
  idiom: '成语',
  poetry: '诗词',
  general: '通用',
};

const typeColorMap: Record<string, string> = {
  classical_chinese: '#1677ff',
  idiom: '#52c41a',
  poetry: '#722ed1',
  general: '#fa8c16',
};

const typeGradientMap: Record<string, string> = {
  classical_chinese: 'linear-gradient(135deg, #69b1ff, #1677ff)',
  idiom: 'linear-gradient(135deg, #95de64, #52c41a)',
  poetry: 'linear-gradient(135deg, #b37feb, #722ed1)',
  general: 'linear-gradient(135deg, #ffc069, #fa8c16)',
};

export default function KnowledgeInput() {
  const [rawContent, setRawContent] = useState('');
  const [selectedType, setSelectedType] = useState('auto');
  const [fileList, setFileList] = useState<File[]>([]);

  // Split-merge state
  const [splitPieces, setSplitPieces] = useState<any[]>([]);
  const [savedPieceIds, setSavedPieceIds] = useState<Set<string>>(new Set());
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [checkedPieceIds, setCheckedPieceIds] = useState<Set<string>>(new Set());

  // Single preview fallback
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewUsage, setPreviewUsage] = useState<{ total_tokens: number; time_ms: number } | null>(null);

  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<any>(null);

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

  const resetAll = () => {
    setSplitPieces([]);
    setSavedPieceIds(new Set());
    setIsSplitMode(false);
    setCheckedPieceIds(new Set());
    setPreviewResult(null);
    setPreviewUsage(null);
    setRawContent('');
  };

  const handlePreview = async () => {
    if (!rawContent.trim()) {
      message.warning('请输入内容');
      return;
    }
    setPreviewing(true);
    setSplitPieces([]);
    setSavedPieceIds(new Set());
    setIsSplitMode(false);
    setPreviewResult(null);
    try {
      const res = await knowledgeApi.splitPreview({
        raw_content: rawContent,
        type: selectedType === 'auto' ? undefined : selectedType,
        ...getLLMOptions(),
      });

      const pieces = res.pieces || [];
      if (pieces.length > 1) {
        setSplitPieces(pieces);
        setIsSplitMode(true);
        setCheckedPieceIds(new Set(pieces.map((p: any) => p.id)));
        setPreviewUsage(res._usage || null);
        message.success(`内容已拆分为 ${pieces.length} 个知识点，请选择保存方式`);
      } else if (pieces.length === 1) {
        setPreviewResult(pieces[0].processing);
        setPreviewUsage(pieces[0].processing?._usage || res._usage || null);
        setSplitPieces([]);
        setIsSplitMode(false);
        message.success('预览成功');
      }
    } catch (err: any) {
      message.error(err.message || '预览失败');
    } finally {
      setPreviewing(false);
    }
  };

  const handleMergeAndSave = async () => {
    const checkedPieces = splitPieces.filter(
      (p) => checkedPieceIds.has(p.id) && !savedPieceIds.has(p.id)
    );
    if (checkedPieces.length === 0) {
      message.warning('请选择至少一个未保存的知识点');
      return;
    }

    setSaving(true);
    try {
      const res = await knowledgeApi.savePieces({
        pieces: checkedPieces.map((p) => ({
          raw_content: p.content,
          title: p.processing?.title,
          type: p.processing?.type || p.suggested_type,
          keywords: p.processing?.keywords || [],
          tags: p.processing?.tags || [],
          category: p.processing?.category,
        })),
        merge: true,
      });

      const newSaved = new Set(savedPieceIds);
      for (const p of checkedPieces) {
        newSaved.add(p.id);
      }
      setSavedPieceIds(newSaved);
      message.success(`已合并保存 ${checkedPieces.length} 个知识点`);
    } catch (err: any) {
      message.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSelected = async () => {
    const checkedPieces = splitPieces.filter(
      (p) => checkedPieceIds.has(p.id) && !savedPieceIds.has(p.id)
    );
    if (checkedPieces.length === 0) {
      message.warning('请选择至少一个未保存的知识点');
      return;
    }

    setSaving(true);
    try {
      const res = await knowledgeApi.savePieces({
        pieces: checkedPieces.map((p) => ({
          raw_content: p.content,
          title: p.processing?.title,
          type: p.processing?.type || p.suggested_type,
          keywords: p.processing?.keywords || [],
          tags: p.processing?.tags || [],
          category: p.processing?.category,
        })),
        merge: false,
      });

      const newSaved = new Set(savedPieceIds);
      for (const p of checkedPieces) {
        newSaved.add(p.id);
      }
      setSavedPieceIds(newSaved);
      message.success(`已保存 ${checkedPieces.length} 个知识点`);
    } catch (err: any) {
      message.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!rawContent.trim() && fileList.length === 0) {
      message.warning('请输入内容或上传文件');
      return;
    }
    setSaving(true);
    try {
      if (fileList.length > 0) {
        const res = await knowledgeApi.upload(
          fileList[0],
          selectedType === 'auto' ? undefined : selectedType,
        );
        setPreviewResult(res.processing);
        message.success('文件处理成功，知识已入库');
        setRawContent('');
        setFileList([]);
      } else {
        const res = await knowledgeApi.splitPreview({
          raw_content: rawContent,
          type: selectedType === 'auto' ? undefined : selectedType,
          ...getLLMOptions(),
        });

        const pieces = res.pieces || [];
        if (pieces.length > 1) {
          setSplitPieces(pieces);
          setIsSplitMode(true);
          setCheckedPieceIds(new Set(pieces.map((p: any) => p.id)));
          message.success(`内容已拆分为 ${pieces.length} 个知识点，请选择保存方式`);
        } else if (pieces.length === 1) {
          const saveRes = await knowledgeApi.savePieces({
            pieces: [{
              raw_content: pieces[0].content,
              title: pieces[0].processing?.title,
              type: pieces[0].processing?.type || pieces[0].suggested_type,
              keywords: pieces[0].processing?.keywords || [],
              tags: pieces[0].processing?.tags || [],
              category: pieces[0].processing?.category,
            }],
            merge: false,
          });
          setPreviewResult(pieces[0].processing);
          message.success('知识已入库');
          setRawContent('');
        }
      }
    } catch (err: any) {
      message.error(err.message || '处理失败');
    } finally {
      setSaving(false);
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

  const handlePieceCheck = (pieceId: string, checked: boolean) => {
    const newChecked = new Set(checkedPieceIds);
    if (checked) {
      newChecked.add(pieceId);
    } else {
      newChecked.delete(pieceId);
    }
    setCheckedPieceIds(newChecked);
  };

  const handleCheckAll = (checked: boolean) => {
    if (checked) {
      setCheckedPieceIds(new Set(splitPieces.map((p) => p.id)));
    } else {
      setCheckedPieceIds(new Set());
    }
  };

  const openPieceDrawer = (piece: any) => {
    setSelectedPiece(piece);
    setDrawerOpen(true);
  };

  const modelOptions = [
    { value: '', label: '使用默认' },
    ...providers.map((p) => ({
      value: p.model,
      label: `${p.name} (${p.model})`,
    })),
  ];

  const uncheckedAll = splitPieces.every((p) => savedPieceIds.has(p.id));
  const unsavedCount = splitPieces.filter((p) => !savedPieceIds.has(p.id)).length;

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
                    loading={saving}
                    disabled={!rawContent.trim() || isSplitMode}
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
                  loading={saving}
                  disabled={fileList.length === 0}
                >
                  上传并处理
                </Button>
              </Space>
            ),
          },
        ]}
      />

      {/* ═══════════════════════════════════════════════════════════════
          Split Mode: Card Deck
          ═══════════════════════════════════════════════════════════════ */}
      {isSplitMode && splitPieces.length > 0 && (
        <>
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <Title level={4} style={{ margin: 0 }}>📦 检测到 {splitPieces.length} 个知识点</Title>
            <Space wrap>
              {!uncheckedAll && (
                <>
                  <Text type="secondary">
                    剩余 {unsavedCount} 个知识点待保存
                  </Text>
                  <Button
                    icon={<MergeCellsOutlined />}
                    onClick={handleMergeAndSave}
                    loading={saving}
                    disabled={checkedPieceIds.size === 0}
                    type="primary"
                    ghost
                  >
                    合并选中并保存
                  </Button>
                  <Button
                    icon={<SaveOutlined />}
                    onClick={handleSaveSelected}
                    loading={saving}
                    disabled={checkedPieceIds.size === 0}
                  >
                    逐个保存
                  </Button>
                </>
              )}
              {uncheckedAll && (
                <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontSize: 14, padding: '4px 12px' }}>
                  全部保存完成
                </Tag>
              )}
              <Button
                icon={<ReloadOutlined />}
                onClick={resetAll}
                size="small"
              >
                重新分析
              </Button>
              <Checkbox
                indeterminate={checkedPieceIds.size > 0 && checkedPieceIds.size < splitPieces.length}
                checked={splitPieces.every((p) => checkedPieceIds.has(p.id) || savedPieceIds.has(p.id))}
                onChange={(e) => handleCheckAll(e.target.checked)}
              >
                ☑ 全选
              </Checkbox>
            </Space>
          </div>

          {/* Card Deck */}
          <div style={{
            display: 'flex',
            overflowX: 'auto',
            gap: 16,
            padding: '8px 0 16px',
            scrollBehavior: 'smooth',
          }}>
            {splitPieces.map((piece, idx) => {
              const isSaved = savedPieceIds.has(piece.id);
              const isChecked = checkedPieceIds.has(piece.id);
              const proc = piece.processing || {};
              const title = proc.title || `知识点 ${idx + 1}`;
              const pieceType = proc.type || piece.suggested_type || 'general';
              const tags: string[] = proc.tags || [];
              const keywords: string[] = proc.keywords || [];
              const summary = typeof proc.content === 'object'
                ? (proc.content as any)?.summary || ''
                : '';
              const gradient = typeGradientMap[pieceType] || typeGradientMap.general;

              return (
                <Card
                  key={piece.id}
                  hoverable={!isSaved}
                  onClick={() => openPieceDrawer(piece)}
                  style={{
                    minWidth: 240,
                    maxWidth: 280,
                    height: 220,
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    opacity: isSaved ? 0.5 : 1,
                    filter: isSaved ? 'grayscale(0.5)' : 'none',
                    flexShrink: 0,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                  styles={{
                    body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' },
                  }}
                  className="piece-card"
                  onMouseEnter={(e) => {
                    if (!isSaved) {
                      (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                  }}
                >
                  {/* Gradient header */}
                  <div style={{
                    background: gradient,
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <Tag
                      color={typeColorMap[pieceType]}
                      style={{ margin: 0, fontWeight: 600, fontSize: 13 }}
                    >
                      {typeLabelMap[pieceType] || pieceType}
                    </Tag>
                    <Checkbox
                      checked={isChecked}
                      disabled={isSaved}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        handlePieceCheck(piece.id, e.target.checked);
                      }}
                    />
                  </div>

                  {/* Saved overlay */}
                  {isSaved && (
                    <div style={{
                      position: 'absolute',
                      top: 42,
                      left: 0,
                      right: 0,
                      display: 'flex',
                      justifyContent: 'center',
                      zIndex: 2,
                    }}>
                      <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontSize: 13, padding: '2px 12px' }}>
                        已保存
                      </Tag>
                    </div>
                  )}

                  {/* Body */}
                  <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={title}>
                      {title}
                    </Text>
                    {summary && (
                      <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2 }}
                        style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}
                      >
                        {summary}
                      </Paragraph>
                    )}
                    <div style={{ marginTop: 'auto', display: 'flex', gap: 12, fontSize: 12, color: '#888' }}>
                      {tags.length > 0 && (
                        <span><TagsOutlined /> {tags.length}个标签</span>
                      )}
                      {keywords.length > 0 && (
                        <span><KeyOutlined /> {keywords.length}个关键词</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 4 }}>
            ▲ 点击任意卡片可展开查看详情
          </Text>

          {/* Detail Drawer */}
          <Drawer
            title="知识点详情"
            width={500}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            destroyOnClose
          >
            {selectedPiece && (() => {
              const proc = selectedPiece.processing || {};
              const idx = splitPieces.findIndex((p) => p.id === selectedPiece.id);
              const title = proc.title || `知识点 ${idx + 1}`;
              const pieceType = proc.type || selectedPiece.suggested_type || 'general';
              const tags: string[] = proc.tags || [];
              const keywords: string[] = proc.keywords || [];
              const summary = typeof proc.content === 'object'
                ? (proc.content as any)?.summary || ''
                : '';

              return (
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  {/* Title */}
                  <div>
                    <Text type="secondary">标题</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text strong style={{ fontSize: 16 }}>{title}</Text>
                    </div>
                  </div>

                  {/* Type */}
                  <div>
                    <Text type="secondary">类型</Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag color={typeColorMap[pieceType]} style={{ fontSize: 13 }}>
                        {typeLabelMap[pieceType] || pieceType}
                      </Tag>
                    </div>
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div>
                      <Text type="secondary">标签</Text>
                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tags.map((t: string) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Keywords */}
                  {keywords.length > 0 && (
                    <div>
                      <Text type="secondary">关键词</Text>
                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {keywords.map((k: string) => (
                          <Tag key={k} color="orange">{k}</Tag>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {summary && (
                    <div>
                      <Text type="secondary">摘要</Text>
                      <div style={{ marginTop: 4 }}>
                        <Text>{summary}</Text>
                      </div>
                    </div>
                  )}

                  {/* Structured content */}
                  {proc.content && (
                    <div>
                      <Text type="secondary">结构化内容</Text>
                      <pre style={{
                        background: '#f6f8fa',
                        padding: 16,
                        borderRadius: 8,
                        overflow: 'auto',
                        maxHeight: 250,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        marginTop: 8,
                        fontSize: 13,
                      }}>
                        {typeof proc.content === 'string'
                          ? proc.content
                          : JSON.stringify(proc.content, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Original content */}
                  {selectedPiece.content && (
                    <div>
                      <Text type="secondary">原始内容</Text>
                      <pre style={{
                        background: '#f6f8fa',
                        padding: 16,
                        borderRadius: 8,
                        overflow: 'auto',
                        maxHeight: 250,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        marginTop: 8,
                        fontSize: 13,
                      }}>
                        {selectedPiece.content}
                      </pre>
                    </div>
                  )}
                </Space>
              );
            })()}
          </Drawer>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          Single Item Mode (improved styling)
          ═══════════════════════════════════════════════════════════════ */}
      {!isSplitMode && previewResult && (
        <>
          <Divider />
          <Title level={4}>📋 处理结果</Title>
          <Card
            style={{
              borderRadius: 12,
              overflow: 'hidden',
            }}
            styles={{ body: { padding: 0 } }}
          >
            {/* Gradient header */}
            <div style={{
              background: typeGradientMap[previewResult.type] || typeGradientMap.general,
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <Tag
                color={typeColorMap[previewResult.type]}
                style={{ margin: 0, fontWeight: 600, fontSize: 14 }}
              >
                {typeLabelMap[previewResult.type] || '未知'}
              </Tag>
              <Text strong style={{ color: '#fff', fontSize: 16 }}>
                {previewResult.title}
              </Text>
            </div>

            <div style={{ padding: '16px 20px' }}>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {previewResult.tags?.length > 0 && (
                  <div>
                    <Text strong>标签：</Text>
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {previewResult.tags.map((t: string) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </div>
                  </div>
                )}
                {previewResult.keywords?.length > 0 && (
                  <div>
                    <Text strong>关键词：</Text>
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {previewResult.keywords.map((k: string) => (
                        <Tag key={k} color="orange">{k}</Tag>
                      ))}
                    </div>
                  </div>
                )}
                {previewResult.category && (
                  <div>
                    <Text strong>分类：</Text>
                    <Tag color="purple">{previewResult.category}</Tag>
                  </div>
                )}
                {previewResult.content && (
                  <div>
                    <Text strong>结构化内容：</Text>
                    <pre style={{
                      background: '#f6f8fa',
                      padding: 16,
                      borderRadius: 8,
                      overflow: 'auto',
                      maxHeight: 300,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      marginTop: 8,
                    }}>
                      {typeof previewResult.content === 'string'
                        ? previewResult.content
                        : JSON.stringify(previewResult.content, null, 2)}
                    </pre>
                  </div>
                )}
              </Space>
            </div>
          </Card>
          {previewUsage && (
            <div style={{ marginTop: 8, color: '#888', fontSize: 13, textAlign: 'right' }}>
              🔢 Token 消耗: <b>{previewUsage.total_tokens}</b> | ⏱️ 耗时: <b>{(previewUsage.time_ms / 1000).toFixed(1)}s</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}
