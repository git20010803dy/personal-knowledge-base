import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layout,
  List,
  Button,
  Typography,
  Avatar,
  Input,
  Tag,
  Spin,
  Empty,
  Popconfirm,
  message,
  Drawer,
  Descriptions,
  Collapse,
  Select,
  Slider,
  Alert,
} from 'antd';
import {
  RobotOutlined,
  UserOutlined,
  PlusOutlined,
  DeleteOutlined,
  SendOutlined,
  LinkOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { agentApi, knowledgeApi, providerApi } from '../services/api';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ id: string; title: string }>;
  isStreaming?: boolean;
}

export default function AgentChat() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Advanced params state
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(1);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  // Load sessions and providers on mount
  useEffect(() => {
    loadSessions();
    providerApi.list().then((data) => {
      setProviders(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await agentApi.listSessions();
      setSessions(res.data || []);
    } catch (err: any) {
      message.error(err.message || '加载会话列表失败');
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    setLoading(true);
    try {
      const res = await agentApi.getSession(sessionId);
      setCurrentSessionId(sessionId);
      const msgs: Message[] = (res.data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources,
      }));
      setMessages(msgs);
    } catch (err: any) {
      message.error(err.message || '加载会话失败');
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await agentApi.deleteSession(sessionId);
      message.success('会话已删除');
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
      loadSessions();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    // Add user message to UI
    const userMsg: Message = {
      id: 'temp-user-' + Date.now(),
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setSending(true);

    // Add placeholder assistant message for streaming
    const assistantMsgId = 'temp-assistant-' + Date.now();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    let streamedContent = '';
    let sourcesInfo: Array<{ id: string; title: string }> = [];
    let finalSessionId: string | null = currentSessionId;

    const options: Record<string, any> = {};
    if (selectedModel) options.model = selectedModel;
    options.temperature = temperature;
    options.top_p = topP;

    agentApi.chat(
      text,
      currentSessionId || undefined,
      // onToken
      (token: string) => {
        streamedContent += token;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: streamedContent } : m
          )
        );
      },
      // onSources
      (sources: Array<{ id: string; title: string }>) => {
        sourcesInfo = sources;
      },
      // onDone
      (data: { session_id: string; error?: boolean }) => {
        finalSessionId = data.session_id;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, isStreaming: false, sources: sourcesInfo.length > 0 ? sourcesInfo : undefined }
              : m
          )
        );
        setSending(false);

        // If new session, update and refresh sessions
        if (!currentSessionId && data.session_id) {
          setCurrentSessionId(data.session_id);
          loadSessions();
        }
      },
      // onError
      (err: Error) => {
        message.error('发送失败: ' + err.message);
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, isStreaming: false, content: streamedContent || '请求失败，请重试。' } : m
        ));
        setSending(false);
      },
      // options
      options,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSourceClick = async (sourceId: string) => {
    setDetailId(sourceId);
    setDetailLoading(true);
    try {
      const res = await knowledgeApi.get(sourceId);
      setDetailItem(res.data);
    } catch (err: any) {
      message.error('加载知识详情失败');
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const typeLabelMap: Record<string, { label: string; color: string }> = {
    classical_chinese: { label: '文言文', color: 'blue' },
    idiom: { label: '成语', color: 'green' },
    poetry: { label: '诗词', color: 'purple' },
    general: { label: '通用', color: 'default' },
  };

  const modelOptions = [
    { value: '', label: '使用默认' },
    ...providers.map((p) => ({
      value: p.model,
      label: `${p.name} (${p.model})`,
    })),
  ];

  return (
    <Layout style={{ height: 'calc(100vh - 112px)', background: '#fff' }}>
      {/* Left sidebar */}
      <Sider
        width={250}
        style={{
          background: '#fafafa',
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 12, borderBottom: '1px solid #f0f0f0' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleNewChat}
            block
          >
            新对话
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <List
            loading={loadingSessions}
            dataSource={sessions}
            renderItem={(session) => (
              <List.Item
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: currentSessionId === session.id ? '#e6f4ff' : 'transparent',
                  borderLeft: currentSessionId === session.id ? '3px solid #1677ff' : '3px solid transparent',
                }}
                onClick={() => loadSession(session.id)}
                actions={[
                  <Popconfirm
                    key="delete"
                    title="删除此对话？"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      danger
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Text ellipsis style={{ fontSize: 13 }}>
                      {session.title}
                    </Text>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(session.updated_at).toLocaleDateString('zh-CN')}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
          {sessions.length === 0 && !loadingSessions && (
            <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
              <Text type="secondary">暂无对话</Text>
            </div>
          )}
        </div>
      </Sider>

      {/* Main chat area */}
      <Layout style={{ display: 'flex', flexDirection: 'column' }}>
        <Content
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <Spin size="large" />
            </div>
          ) : messages.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <Empty
                description={
                  <span>
                    <RobotOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16, display: 'block' }} />
                    开始与 AI 助手对话
                    <br />
                    <Text type="secondary">基于知识库回答问题</Text>
                  </span>
                }
              />
            </div>
          ) : (
            <div style={{ flex: 1 }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ maxWidth: '75%', display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 8 }}>
                    <Avatar
                      icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                      style={{
                        backgroundColor: msg.role === 'user' ? '#1677ff' : '#52c41a',
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          background: msg.role === 'user' ? '#1677ff' : '#f5f5f5',
                          color: msg.role === 'user' ? '#fff' : '#333',
                        }}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="chat-markdown">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content || (msg.isStreaming ? '...' : '')}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        )}
                        {msg.isStreaming && (
                          <span style={{ display: 'inline-block', marginLeft: 4 }}>
                            <Spin size="small" />
                          </span>
                        )}
                      </div>
                      {/* Source references */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <LinkOutlined style={{ color: '#999', marginRight: 4, marginTop: 3 }} />
                          {msg.sources.map((src) => (
                            <Tag
                              key={src.id}
                              color="blue"
                              style={{ cursor: 'pointer', fontSize: 12 }}
                              onClick={() => handleSourceClick(src.id)}
                            >
                              {src.title}
                            </Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </Content>

        {/* Input area with advanced params */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #f0f0f0', background: '#fff' }}>
          {/* Advanced params collapse */}
          <Collapse
            size="small"
            style={{ marginBottom: 8 }}
            items={[
              {
                key: 'params',
                label: '⚙️ 高级参数',
                children: (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {providers.length === 0 && (
                      <Alert
                        type="warning"
                        message="尚未配置 AI 提供商"
                        icon={<WarningOutlined />}
                        showIcon
                        style={{ marginBottom: 4 }}
                      />
                    )}
                    <div style={{ minWidth: 280 }}>
                      <Text strong>模型：</Text>
                      <Select
                        value={selectedModel}
                        onChange={setSelectedModel}
                        options={modelOptions}
                        size="small"
                        style={{ width: 200, marginLeft: 8 }}
                      />
                    </div>
                    <div style={{ minWidth: 220 }}>
                      <Text strong>Temperature: {temperature}</Text>
                      <Slider
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={setTemperature}
                        style={{ width: 160, marginLeft: 8 }}
                      />
                    </div>
                    <div style={{ minWidth: 200 }}>
                      <Text strong>Top P: {topP}</Text>
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={topP}
                        onChange={setTopP}
                        style={{ width: 160, marginLeft: 8 }}
                      />
                    </div>
                  </div>
                ),
              },
            ]}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <TextArea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题... Enter 发送，Shift+Enter 换行"
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={sending}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={sending}
              disabled={!inputValue.trim()}
            >
              发送
            </Button>
          </div>
        </div>
      </Layout>

      {/* Knowledge detail drawer */}
      <Drawer
        title="知识详情"
        open={!!detailId}
        onClose={() => {
          setDetailId(null);
          setDetailItem(null);
        }}
        width={520}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : detailItem ? (
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
            <Descriptions.Item label="原始内容">
              <div style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {detailItem.raw_content}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="结构化内容">
              <pre style={{ maxHeight: 300, overflow: 'auto', background: '#f6f8fa', padding: 12 }}>
                {detailItem.content ? JSON.stringify(JSON.parse(detailItem.content), null, 2) : '-'}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </Layout>
  );
}
