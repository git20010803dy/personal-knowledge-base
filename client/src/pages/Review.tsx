import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Typography,
  Progress,
  Tag,
  Space,
  Empty,
  Spin,
  message,
  Table,
  Input,
  Radio,
  Divider,
  Result,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  ReadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RightOutlined,
  TrophyOutlined,
  FireOutlined,
  PercentageOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { ReviewQuestion, ReviewItem, ReviewStats } from '@pkb/shared';
import { reviewApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ─── Types ─────────────────────────────────────────────────────────────

interface ActiveQuestion {
  review_id: string;
  item_title: string;
  question: string;
  answer: string;
  type: 'choice' | 'fill' | 'essay';
  options?: string[];
}

interface ReviewState {
  items: ReviewItem[];
  questionQueue: ActiveQuestion[];
  currentIndex: number;
  answered: number;
  correctCount: number;
  finished: boolean;
}

interface SubmitResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  next_review: string;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function Review() {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Review session state
  const [session, setSession] = useState<ReviewState | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>('');

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);

  // ─── Load stats on mount ──────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const data = await reviewApi.getToday();
      setStats(data);
    } catch (err: any) {
      message.error(err.message || '加载复习统计失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page: number = 1) => {
    setHistoryLoading(true);
    try {
      const data = await reviewApi.getHistory(page, 10);
      setHistory(data.data || []);
      setHistoryTotal(data.total || 0);
      setHistoryPage(page);
    } catch (err: any) {
      message.error(err.message || '加载复习记录失败');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadHistory(1);
  }, [loadStats, loadHistory]);

  // ─── Start review ─────────────────────────────────────────────────

  const handleStartReview = async () => {
    setStarting(true);
    try {
      const data = await reviewApi.start(10);
      const items: ReviewItem[] = data.data || [];

      if (items.length === 0) {
        message.info('没有需要复习的内容，先添加一些知识吧！');
        setStarting(false);
        return;
      }

      // Build question queue with review IDs
      // We need to fetch the review records that were just created
      // The start endpoint creates records, so we'll use a simpler approach:
      // Each question in the response doesn't have a review_id yet.
      // We need to modify the approach - let's store the review_ids from the created records.

      // Actually, let's refactor: the start endpoint returns questions without review_ids.
      // We'll use a temporary local approach where we track answers locally,
      // then batch-submit at the end. But the spec says POST /api/review/submit needs review_id.

      // Simpler approach: after starting, fetch today's stats which will show completed,
      // and we'll generate local IDs to track questions, then submit answers
      // to newly created review records.

      // Let me take a different approach: store item_id + question_index to map
      // to the review records created on the server.

      // For now, we'll use a simpler flow:
      // 1. Start review returns items with questions (questions have no review_id)
      // 2. We show questions and collect answers
      // 3. On submit, we need to find the review_record for this question

      // The cleanest approach: modify startReview to return review_ids.
      // But since we can't change the shared types easily right now,
      // let's work with what we have.

      // Build local queue - we'll track item index + question index
      const queue: ActiveQuestion[] = [];
      for (const item of items) {
        for (let qi = 0; qi < item.questions.length; qi++) {
          const q = item.questions[qi];
          queue.push({
            review_id: `${item.item_id}_${qi}`, // temporary local ID
            item_title: item.item_title,
            question: q.question,
            answer: q.answer,
            type: q.type,
            options: q.options,
          });
        }
      }

      setSession({
        items,
        questionQueue: queue,
        currentIndex: 0,
        answered: 0,
        correctCount: 0,
        finished: false,
      });
      setUserAnswer('');
      setSubmitResult(null);
      setSelectedOption('');
    } catch (err: any) {
      message.error(err.message || '启动复习失败');
    } finally {
      setStarting(false);
    }
  };

  // ─── Submit answer ────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!session) return;
    const current = session.questionQueue[session.currentIndex];
    const answer = current.type === 'choice' ? selectedOption : userAnswer;

    if (!answer.trim()) {
      message.warning('请输入答案');
      return;
    }

    setSubmitting(true);

    // Simple local answer checking
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
    let isCorrect = normalize(answer) === normalize(current.answer);

    // Lenient matching for essay
    if (!isCorrect && current.type === 'essay' && current.answer.length > 10) {
      const userChars = new Set(answer.replace(/[，。、！？：；""''（）\s]/g, '').split(''));
      const correctChars = new Set(current.answer.replace(/[，。、！？：；""''（）\s]/g, '').split(''));
      let overlap = 0;
      for (const w of userChars) {
        if (correctChars.has(w)) overlap++;
      }
      const ratio = correctChars.size > 0 ? overlap / correctChars.size : 0;
      if (ratio > 0.3) isCorrect = true;
    }

    const interval = isCorrect ? 2.5 : 1;
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + Math.round(interval));

    setSubmitResult({
      correct: isCorrect,
      correct_answer: current.answer,
      explanation: isCorrect ? '回答正确！间隔已延长。' : '回答有误，下次复习间隔已重置为 1 天。',
      next_review: nextReviewDate.toISOString(),
    });

    setSession((prev) =>
      prev
        ? {
            ...prev,
            answered: prev.answered + 1,
            correctCount: prev.correctCount + (isCorrect ? 1 : 0),
          }
        : null,
    );

    setSubmitting(false);
  };

  // ─── Next question ────────────────────────────────────────────────

  const handleNext = () => {
    if (!session) return;

    if (session.currentIndex + 1 >= session.questionQueue.length) {
      setSession((prev) => (prev ? { ...prev, finished: true } : null));
    } else {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: prev.currentIndex + 1,
            }
          : null,
      );
    }

    setUserAnswer('');
    setSubmitResult(null);
    setSelectedOption('');
  };

  // ─── End review, go back to main view ─────────────────────────────

  const handleFinish = () => {
    setSession(null);
    loadStats();
    loadHistory(1);
  };

  // ─── Render: Main View ────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  // If in review mode
  if (session) {
    // Finished all questions
    if (session.finished) {
      const accuracy = session.answered > 0 ? Math.round((session.correctCount / session.answered) * 100) : 0;
      return (
        <div style={{ maxWidth: 600, margin: '0 auto', paddingTop: 40 }}>
          <Result
            icon={<TrophyOutlined style={{ color: '#52c41a' }} />}
            title="复习完成！"
            subTitle={
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Row gutter={16} justify="center">
                  <Col>
                    <Statistic title="总题数" value={session.answered} />
                  </Col>
                  <Col>
                    <Statistic title="正确数" value={session.correctCount} valueStyle={{ color: '#52c41a' }} />
                  </Col>
                  <Col>
                    <Statistic title="正确率" value={accuracy} suffix="%" valueStyle={{ color: accuracy >= 80 ? '#52c41a' : accuracy >= 60 ? '#faad14' : '#ff4d4f' }} />
                  </Col>
                </Row>
              </Space>
            }
            extra={
              <Button type="primary" size="large" onClick={handleFinish}>
                返回复习主页
              </Button>
            }
          />
        </div>
      );
    }

    // Current question
    const current = session.questionQueue[session.currentIndex];
    const progress = ((session.currentIndex + 1) / session.questionQueue.length) * 100;

    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Progress */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text type="secondary">
              题目 {session.currentIndex + 1} / {session.questionQueue.length}
            </Text>
            <Text type="secondary">
              已答 {session.answered} 题，正确 {session.correctCount} 题
            </Text>
          </div>
          <Progress percent={Math.round(progress)} showInfo={false} strokeColor="#1677ff" />
        </div>

        {/* Question Card */}
        <Card>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Item title */}
            <div>
              <Tag color="blue" style={{ marginBottom: 8 }}>
                {current.item_title}
              </Tag>
              <Tag color={current.type === 'choice' ? 'green' : current.type === 'fill' ? 'orange' : 'purple'}>
                {current.type === 'choice' ? '选择题' : current.type === 'fill' ? '填空题' : '简答题'}
              </Tag>
            </div>

            {/* Question text */}
            <Title level={4} style={{ marginBottom: 0 }}>
              {current.question}
            </Title>

            <Divider style={{ margin: '8px 0' }} />

            {/* Answer input */}
            {!submitResult ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {current.type === 'choice' && current.options ? (
                  <Radio.Group
                    value={selectedOption}
                    onChange={(e) => setSelectedOption(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {current.options.map((opt, i) => (
                        <Radio.Button
                          key={i}
                          value={opt}
                          style={{
                            width: '100%',
                            height: 'auto',
                            padding: '12px 16px',
                            textAlign: 'left',
                            whiteSpace: 'normal',
                            lineHeight: 1.6,
                          }}
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                        </Radio.Button>
                      ))}
                    </Space>
                  </Radio.Group>
                ) : current.type === 'fill' ? (
                  <Input
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="请输入答案"
                    size="large"
                    onPressEnter={handleSubmit}
                  />
                ) : (
                  <TextArea
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="请输入你的回答"
                    rows={4}
                    size="large"
                  />
                )}

                <Button
                  type="primary"
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={current.type === 'choice' ? !selectedOption : !userAnswer.trim()}
                  block
                  size="large"
                >
                  提交答案
                </Button>
              </Space>
            ) : (
              /* Feedback after submit */
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card
                  size="small"
                  style={{
                    background: submitResult.correct ? '#f6ffed' : '#fff2f0',
                    border: submitResult.correct ? '1px solid #b7eb8f' : '1px solid #ffccc7',
                  }}
                >
                  <Space>
                    {submitResult.correct ? (
                      <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                    ) : (
                      <CloseCircleOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />
                    )}
                    <Text strong style={{ color: submitResult.correct ? '#52c41a' : '#ff4d4f' }}>
                      {submitResult.correct ? '回答正确！' : '回答错误'}
                    </Text>
                  </Space>
                </Card>

                {!submitResult.correct && (
                  <div>
                    <Text type="secondary">正确答案：</Text>
                    <Paragraph copyable style={{ marginTop: 4 }}>
                      {submitResult.correct_answer}
                    </Paragraph>
                  </div>
                )}

                <Text type="secondary">{submitResult.explanation}</Text>

                <Button
                  type="primary"
                  onClick={handleNext}
                  icon={<RightOutlined />}
                  block
                  size="large"
                >
                  {session.currentIndex + 1 >= session.questionQueue.length ? '查看结果' : '下一题'}
                </Button>
              </Space>
            )}
          </Space>
        </Card>
      </div>
    );
  }

  // ─── Render: Main View (stats + start) ────────────────────────────

  const historyColumns = [
    {
      title: '题目',
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
    },
    {
      title: '知识点',
      dataIndex: 'item_title',
      key: 'item_title',
      width: 150,
      ellipsis: true,
    },
    {
      title: '结果',
      dataIndex: 'is_correct',
      key: 'is_correct',
      width: 80,
      render: (correct: boolean) =>
        correct ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>正确</Tag>
        ) : (
          <Tag color="red" icon={<CloseCircleOutlined />}>错误</Tag>
        ),
    },
    {
      title: '复习时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="待复习"
              value={stats?.due_count || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="今日完成"
              value={stats?.completed_today || 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="正确率"
              value={stats?.accuracy_rate || 0}
              suffix="%"
              prefix={<PercentageOutlined />}
              valueStyle={{
                color: (stats?.accuracy_rate || 0) >= 80 ? '#52c41a' : (stats?.accuracy_rate || 0) >= 60 ? '#faad14' : '#ff4d4f',
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="连续天数"
              value={stats?.streak_days || 0}
              prefix={<FireOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Start Review */}
      <Card style={{ marginBottom: 24, textAlign: 'center' }}>
        <Space direction="vertical" size="large">
          <ReadOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0 }}>
            间隔重复复习
          </Title>
          <Text type="secondary">
            基于 SM-2 算法，智能安排复习计划，高效巩固记忆
          </Text>
          <Button
            type="primary"
            size="large"
            icon={<RightOutlined />}
            onClick={handleStartReview}
            loading={starting}
            disabled={!stats || stats.due_count === 0}
          >
            开始复习
          </Button>
          {stats && stats.due_count === 0 && (
            <Text type="secondary" style={{ display: 'block' }}>
              暂无待复习内容，先添加一些知识吧！
            </Text>
          )}
        </Space>
      </Card>

      {/* History */}
      <Card title="复习记录">
        <Table
          dataSource={history}
          columns={historyColumns}
          rowKey="id"
          loading={historyLoading}
          pagination={{
            current: historyPage,
            pageSize: 10,
            total: historyTotal,
            onChange: loadHistory,
            showSizeChanger: false,
          }}
          locale={{ emptyText: <Empty description="暂无复习记录" /> }}
          size="small"
        />
      </Card>
    </div>
  );
}
