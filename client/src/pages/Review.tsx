/**
 * Review.tsx - 复习中心页面
 * 功能：标签筛选、选择题作答、结果展示
 * 最后修改：2026-03-28 - 改为固定分类筛选 + 纯选择题
 */
import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Tag,
  Radio,
  Space,
  Progress,
  message,
  Spin,
} from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TrophyOutlined,
  BookOutlined,
  FireOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import type { ReviewStats } from '../../../shared/src/index';

// ─── Types ───────────────────────────────────────────────────────────

interface PreGeneratedQuestion {
  id: string;
  item_id: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  category: string;
}

interface ReviewItemWithQuestions {
  item_id: string;
  item_title: string;
  questions: PreGeneratedQuestion[];
}

type Phase = 'loading' | 'main' | 'review' | 'result';

// ─── Constants ───────────────────────────────────────────────────────

const CATEGORIES = ['全部', '历史', '地理', '文学', '成语', '诗词', '哲学', '科学', '数码', '常识', '其他'];

// ─── Component ───────────────────────────────────────────────────────

const Review: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');

  // Review session state
  const [queue, setQueue] = useState<Array<{ item: ReviewItemWithQuestions; question: PreGeneratedQuestion }>>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);

  // ─── Load data on mount ──────────────────────────────────────────

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setPhase('loading');
    try {
      const statsRes = await axios.get('/api/review/stats');
      setStats(statsRes.data);
      setPhase('main');
    } catch (err) {
      console.error('Failed to load review data:', err);
      message.error('加载复习数据失败');
      setPhase('main');
    }
  }

  // ─── Start review ───────────────────────────────────────────────

  async function handleStart() {
    setPhase('loading');
    try {
      const catParam =
        selectedCategory !== '全部' ? `?category=${encodeURIComponent(selectedCategory)}` : '';
      const res = await axios.get(`/api/review/start${catParam}`);
      const items: ReviewItemWithQuestions[] = res.data;

      if (!items || items.length === 0) {
        message.info('没有需要复习的知识点');
        setPhase('main');
        return;
      }

      // Build flat queue of all questions
      const q: typeof queue = [];
      for (const item of items) {
        for (const question of item.questions) {
          q.push({ item, question });
        }
      }

      // Shuffle
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }

      setQueue(q);
      setCurrentIdx(0);
      setSelectedAnswer(null);
      setSubmitted(false);
      setTotalAnswered(0);
      setTotalCorrect(0);
      setPhase('review');
    } catch (err) {
      console.error('Failed to start review:', err);
      message.error('开始复习失败');
      setPhase('main');
    }
  }

  // ─── Submit answer ──────────────────────────────────────────────

  async function handleSubmit() {
    if (selectedAnswer === null) return;

    const current = queue[currentIdx];
    const isCorrect = selectedAnswer === current.question.correct_idx;

    // Record to backend
    try {
      await axios.post('/api/review/submit', {
        question_id: current.question.id,
        item_id: current.item.item_id,
        selected_idx: selectedAnswer,
      });
    } catch (err) {
      console.error('Submit failed:', err);
    }

    setSubmitted(true);
    setTotalAnswered((prev) => prev + 1);
    if (isCorrect) setTotalCorrect((prev) => prev + 1);
  }

  // ─── Next question ──────────────────────────────────────────────

  function handleNext() {
    if (currentIdx + 1 >= queue.length) {
      setPhase('result');
    } else {
      setCurrentIdx((prev) => prev + 1);
      setSelectedAnswer(null);
      setSubmitted(false);
    }
  }

  // ─── Back to main ───────────────────────────────────────────────

  async function handleBackToMain() {
    await loadData();
  }

  // ─── Render: Stat cards ─────────────────────────────────────────

  function renderStatCards() {
    if (!stats) return null;

    const cards = [
      { icon: <BookOutlined />, label: '待复习', value: stats.due_count, color: '#1890ff' },
      { icon: <CheckCircleOutlined />, label: '今日已完成', value: stats.completed_today, color: '#52c41a' },
      { icon: <TrophyOutlined />, label: '正确率', value: `${stats.accuracy_rate}%`, color: '#faad14' },
      { icon: <FireOutlined />, label: '连续天数', value: stats.streak_days, color: '#ff4d4f' },
    ];

    return (
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {cards.map((card, i) => (
          <Col span={6} key={i}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, color: card.color, marginBottom: 8 }}>{card.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 'bold', color: card.color }}>{card.value}</div>
                <div style={{ color: '#888', marginTop: 4 }}>{card.label}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  // ─── Render: Category filter ────────────────────────────────────

  function renderCategoryFilter() {
    return (
      <Card title="📚 选择分类" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 12 }}>
          {CATEGORIES.map((cat) => (
            <Tag
              key={cat}
              color={selectedCategory === cat ? 'blue' : 'default'}
              style={{ cursor: 'pointer', marginBottom: 4, fontSize: 14, padding: '4px 12px' }}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Tag>
          ))}
        </div>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={handleStart}
          size="large"
          disabled={stats?.due_count === 0}
        >
          开始复习 {selectedCategory !== '全部' ? `（${selectedCategory}）` : ''}
        </Button>
      </Card>
    );
  }

  // ─── Render: Review session ─────────────────────────────────────

  function renderReviewSession() {
    const current = queue[currentIdx];
    if (!current) return null;

    const { question, item } = current;
    const isCorrect = selectedAnswer === question.correct_idx;
    const progress = ((currentIdx + 1) / queue.length) * 100;
    const optionLetters = ['A', 'B', 'C', 'D'];

    return (
      <Card>
        {/* Header */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#888' }}>来自：{item.item_title}</span>
          <Space>
            <Tag color="blue">{question.category}</Tag>
            <span style={{ color: '#888' }}>{currentIdx + 1} / {queue.length}</span>
          </Space>
        </div>

        <Progress percent={Math.round(progress)} showInfo={false} style={{ marginBottom: 24 }} />

        {/* Question */}
        <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 24, lineHeight: 1.6 }}>
          {question.question}
        </div>

        {/* Options */}
        <Radio.Group
          value={selectedAnswer}
          onChange={(e) => !submitted && setSelectedAnswer(e.target.value)}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {question.options.map((opt, idx) => {
              let bgColor = '#fff';
              let borderColor = '#d9d9d9';

              if (submitted) {
                if (idx === question.correct_idx) {
                  bgColor = '#f6ffed';
                  borderColor = '#52c41a';
                } else if (idx === selectedAnswer && !isCorrect) {
                  bgColor = '#fff2f0';
                  borderColor = '#ff4d4f';
                }
              }

              return (
                <Radio
                  key={idx}
                  value={idx}
                  style={{
                    display: 'block',
                    padding: '12px 16px',
                    margin: '4px 0',
                    borderRadius: 8,
                    border: `1px solid ${borderColor}`,
                    backgroundColor: bgColor,
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontWeight: 'bold', marginRight: 8 }}>{optionLetters[idx]}.</span>
                  {opt}
                </Radio>
              );
            })}
          </Space>
        </Radio.Group>

        {/* Feedback */}
        {submitted && (
          <div style={{ marginTop: 24, padding: 16, borderRadius: 8, backgroundColor: isCorrect ? '#f6ffed' : '#fff2f0' }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
              {isCorrect ? (
                <span style={{ color: '#52c41a' }}><CheckCircleOutlined /> 正确！</span>
              ) : (
                <span style={{ color: '#ff4d4f' }}>
                  <CloseCircleOutlined /> 错误，正确答案是 {optionLetters[question.correct_idx]}
                </span>
              )}
            </div>
            {question.explanation && (
              <div style={{ color: '#666', lineHeight: 1.6 }}>💡 {question.explanation}</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          {!submitted ? (
            <Button type="primary" size="large" onClick={handleSubmit} disabled={selectedAnswer === null}>
              提交答案
            </Button>
          ) : (
            <Button type="primary" size="large" onClick={handleNext}>
              {currentIdx + 1 >= queue.length ? '查看结果' : '下一题'}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // ─── Render: Result ─────────────────────────────────────────────

  function renderResult() {
    const rate = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    return (
      <Card style={{ textAlign: 'center', padding: 40 }}>
        <TrophyOutlined style={{ fontSize: 64, color: '#faad14', marginBottom: 16 }} />
        <h2 style={{ fontSize: 24, marginBottom: 8 }}>复习完成！</h2>
        <p style={{ color: '#888', fontSize: 16, marginBottom: 24 }}>本次共答 {totalAnswered} 题</p>

        <Row gutter={24} style={{ marginBottom: 32 }}>
          <Col span={8}>
            <div style={{ fontSize: 36, fontWeight: 'bold', color: '#52c41a' }}>{totalCorrect}</div>
            <div style={{ color: '#888' }}>正确</div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 36, fontWeight: 'bold', color: '#ff4d4f' }}>{totalAnswered - totalCorrect}</div>
            <div style={{ color: '#888' }}>错误</div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 36, fontWeight: 'bold', color: '#1890ff' }}>{rate}%</div>
            <div style={{ color: '#888' }}>正确率</div>
          </Col>
        </Row>

        <Progress
          percent={rate}
          strokeColor={rate >= 80 ? '#52c41a' : rate >= 50 ? '#faad14' : '#ff4d4f'}
          style={{ marginBottom: 24 }}
        />

        <Button type="primary" size="large" onClick={handleBackToMain}>
          返回复习中心
        </Button>
      </Card>
    );
  }

  // ─── Main render ────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
        <p style={{ marginTop: 16, color: '#888' }}>加载中...</p>
      </div>
    );
  }

  if (phase === 'review') return renderReviewSession();
  if (phase === 'result') return renderResult();

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>📚 复习中心</h2>
      {renderStatCards()}
      {renderCategoryFilter()}
    </div>
  );
};

export default Review;
