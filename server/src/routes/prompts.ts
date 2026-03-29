/**
 * routes/prompts.ts - 系统 Prompt 管理 API
 * GET    /api/prompts        - 列表（可按 category 筛选）
 * GET    /api/prompts/:key   - 按 key 获取
 * PUT    /api/prompts/:key   - 更新
 * POST   /api/prompts/reset  - 重置全部为内置默认值
 */
import type { FastifyInstance } from 'fastify';
import {
  getAllPrompts,
  getPromptByKey,
  updatePrompt,
  type SystemPrompt,
} from '../db/promptRepo';
import { getDb, saveDb } from '../db/database';

export async function promptRoutes(app: FastifyInstance) {
  // List all prompts, optional ?category=xxx filter
  app.get('/api/prompts', async (req) => {
    const query = req.query as { category?: string };
    const all = await getAllPrompts();
    if (query.category) {
      return { data: all.filter((p) => p.category === query.category) };
    }
    return { data: all };
  });

  // Get single prompt by key
  app.get('/api/prompts/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const prompt = await getPromptByKey(key);
    if (!prompt) {
      return reply.status(404).send({ error: 'Prompt not found' });
    }
    return { data: prompt };
  });

  // Update prompt
  app.put('/api/prompts/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const body = req.body as {
      prompt?: string;
      description?: string;
      data_flow?: string;
      logic_flow?: string;
      is_active?: boolean;
    };

    const existing = await getPromptByKey(key);
    if (!existing) {
      return reply.status(404).send({ error: 'Prompt not found' });
    }

    const updated = await updatePrompt(key, body);
    return { success: true, data: updated };
  });

  // Reset all prompts to built-in defaults
  // For simplicity: re-run the migration init logic by re-inserting
  app.post('/api/prompts/reset', async () => {
    const db = await getDb();
    // Delete all and re-insert from built-in data
    db.run('DELETE FROM system_prompts');

    // Re-import built-in prompts (same as in database.ts migration v9)
    const { nanoid } = await import('nanoid');
    const builtInPrompts = getBuiltInSystemPrompts();
    for (const p of builtInPrompts) {
      try {
        db.run(
          `INSERT INTO system_prompts (id, key, name, category, description, prompt, variables, data_flow, logic_flow)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [nanoid(), p.key, p.name, p.category, p.description, p.prompt, p.variables, p.data_flow, p.logic_flow],
        );
      } catch (e) {
        app.log.warn(e, `Failed to insert prompt: ${p.key}`);
      }
    }
    saveDb();
    return { success: true, message: '已重置为内置 Prompt' };
  });
}

/**
 * Built-in system prompts (duplicated from database.ts migration for reset functionality)
 */
function getBuiltInSystemPrompts() {
  return [
    {
      key: 'knowledge_classical_chinese',
      name: '文言文处理',
      category: 'knowledge',
      description: '将文言文内容解析为结构化数据，包含翻译、注释、赏析',
      prompt: `你是一位古典文学专家。请分析以下文言文内容，严格按照 JSON 格式返回结果。

原文：
{{raw_content}}

请返回以下 JSON（不要包含 markdown 代码块标记）：
{
  "title": "文章标题",
  "author": "作者姓名（如能从内容推断）",
  "dynasty": "朝代（如能推断）",
  "original_text": "校对后的原文",
  "translation": "白话文翻译",
  "annotations": [
    {"word": "重点字词", "meaning": "释义"}
  ],
  "summary": "简要赏析",
  "keywords": ["关键词1", "关键词2", ...],
  "tags": ["标签1", "标签2", ...]
}

说明：
- keywords: 根据内容提取适当数量的关键词（通常3-10个），涵盖核心概念、人物、事件。**如果能识别出作者，作者名必须包含在 keywords 中**
- tags: 2-5个相关标签`,
      variables: '["raw_content"]',
      data_flow: '输入：用户粘贴的文言文原文 → LLM 处理 → 输出 JSON 结构化数据 → 存入 knowledge_items（content 字段存 JSON，title/type/category 等字段拆分存储）',
      logic_flow: '1. 用户输入原始文本\n2. 检测类型为 classical_chinese\n3. 填充 prompt 模板中的 {{raw_content}}\n4. 调用 LLM 获取 JSON 响应\n5. 解析 JSON，提取标题、翻译、注释等字段\n6. 生成 keywords 和 tags\n7. 存入数据库并生成复习题目',
    },
    {
      key: 'knowledge_idiom',
      name: '成语处理',
      category: 'knowledge',
      description: '将成语内容解析为结构化数据，包含释义、出处、典故',
      prompt: `你是一位成语词典编纂专家。请分析以下成语内容，严格按照 JSON 格式返回结果。

内容：
{{raw_content}}

请返回以下 JSON（不要包含 markdown 代码块标记）：
{
  "title": "成语名称",
  "meaning": "释义",
  "origin": "出处原文",
  "story": "典故故事",
  "examples": ["正确的使用示例1", "正确的使用示例2"],
  "synonyms": ["近义成语"],
  "antonyms": ["反义成语"],
  "keywords": ["关键词1", "关键词2", ...],
  "tags": ["标签1", "标签2", ...]
}

说明：
- keywords: 根据内容提取适当数量的关键词（通常3-8个）
- tags: 2-5个相关标签`,
      variables: '["raw_content"]',
      data_flow: '输入：用户粘贴的成语内容 → LLM 处理 → 输出 JSON（释义/出处/典故）→ 存入 knowledge_items',
      logic_flow: '1. 用户输入成语相关内容\n2. 检测类型为 idiom\n3. 填充 prompt 模板\n4. 调用 LLM 获取 JSON\n5. 解析并存储\n6. 自动生成复习题目',
    },
    {
      key: 'knowledge_poetry',
      name: '诗词处理',
      category: 'knowledge',
      description: '将诗词内容解析为结构化数据，包含赏析、创作背景、主题思想',
      prompt: `你是一位诗词鉴赏专家。请分析以下诗词内容，严格按照 JSON 格式返回结果。

内容：
{{raw_content}}

请返回以下 JSON（不要包含 markdown 代码块标记）：
{
  "title": "诗题/词题",
  "author": "作者",
  "dynasty": "朝代",
  "ci_pattern_name": "词牌名（仅词需要，诗则留空字符串）",
  "original_text": "原文",
  "background": "创作背景",
  "appreciation": "逐句赏析",
  "theme": "主题思想",
  "keywords": ["关键词1", "关键词2", ...],
  "tags": ["标签1", "标签2", ...]
}

说明：
- ci_pattern_name: 如果是词（如《水调歌头》《念奴娇》《浣溪沙》等），填写词牌名；如果是诗，填空字符串 ""
- keywords: 根据内容提取适当数量的关键词和核心意象（通常3-10个）。**作者名必须包含在 keywords 中；如果有词牌名，词牌名也必须包含在 keywords 中**
- tags: 2-5个相关标签`,
      variables: '["raw_content"]',
      data_flow: '输入：用户粘贴的诗词 → LLM 处理 → 输出 JSON（赏析/背景/主题）→ 存入 knowledge_items',
      logic_flow: '1. 用户输入诗词\n2. 检测类型为 poetry\n3. 填充 prompt 模板\n4. 调用 LLM 获取 JSON\n5. 解析词牌名、作者、朝代等\n6. 存入数据库并生成复习题目',
    },
    {
      key: 'knowledge_general',
      name: '通用处理',
      category: 'knowledge',
      description: '通用知识内容的结构化提取，适用于非文言文/成语/诗词的内容',
      prompt: `你是一位知识管理助手。请分析以下内容，提取关键信息，严格按照 JSON 格式返回结果。

内容：
{{raw_content}}

请返回以下 JSON（不要包含 markdown 代码块标记）：
{
  "title": "标题（简明概括）",
  "original_text": "原文内容（完整保留原始文本，包括 markdown 格式）",
  "summary": "摘要（不超过200字）",
  "keywords": ["关键词1", "关键词2", ...],
  "category": "分类",
  "tags": ["标签1", "标签2", ...]
}

说明：
- keywords: 根据内容丰富程度提取适当数量的关键词（通常5-20个），内容越丰富数量越多，涵盖核心概念、人物、地点、事件、术语等
- tags: 2-5个相关标签`,
      variables: '["raw_content"]',
      data_flow: '输入：用户粘贴的任意内容 → LLM 处理 → 输出 JSON（标题/摘要/关键词）→ 存入 knowledge_items',
      logic_flow: '1. 用户输入内容\n2. 检测类型为 general\n3. 填充 prompt 模板\n4. 调用 LLM 获取 JSON\n5. 解析并存储\n6. 自动生成复习题目',
    },
    {
      key: 'review_generate',
      name: '出题生成',
      category: 'review',
      description: '根据知识点内容自动生成四选一选择题，同时判断知识点的领域分类',
      prompt: `你是一位知识复习出题专家。请根据以下{{typeName}}知识点，生成 3-5 道四选一选择题，并判断该知识点的领域分类。

知识点标题：{{item_title}}
类型：{{typeName}}
内容：
{{contentSummary}}

出题要求：
- 每道题 4 个选项，只有 1 个正确答案
- 干扰项要有一定迷惑性，但不能模棱两可
- 题目应考查对知识点核心内容的理解

领域分类（只能从以下列表中选一个）：{{categoryNames}}

请严格按照以下 JSON 格式返回，不要添加任何其他文字：
{
  "category": "领域分类",
  "questions": [
    {
      "question": "题目文字",
      "options": ["选项A内容", "选项B内容", "选项C内容", "选项D内容"],
      "correct_idx": 0,
      "explanation": "为什么这个答案正确，简要说明"
    }
  ]
}`,
      variables: '["typeName","item_title","contentSummary","categoryNames"]',
      data_flow: '输入：知识点对象（标题/类型/内容）→ LLM 生成题目 JSON → 解析并校验 → 存入 review_questions 表',
      logic_flow: '1. 知识点存入时自动触发（或批量补全时触发）\n2. 根据知识点类型选择 typeName\n3. 解析知识点内容为 contentSummary\n4. 从 categories 表读取可用分类列表\n5. 填充 prompt 模板\n6. 调用 LLM 获取题目 JSON\n7. 校验格式（4 个选项、correct_idx 范围）\n8. 存入 review_questions 表\n9. 记录 token 消耗',
    },
    {
      key: 'review_explain',
      name: '解释追问',
      category: 'review',
      description: '复习时对题目的解释不明白，进一步追问',
      prompt: `你是一个知识库复习助手。用户正在复习一道选择题，对题目的解释有疑问，请进一步说明。

题目：{{question}}
正确答案：{{optionLetters}}. {{correctOption}}
原始解释：{{explanation}}
知识点标题：{{itemTitle}}

请用简洁清晰的语言回答用户的疑问。如果涉及古文，请适当引用原文。
保持回答在 200 字以内。`,
      variables: '["question","optionLetters","correctOption","explanation","itemTitle"]',
      data_flow: '输入：题目信息 + 用户追问消息 → 拼装上下文 → LLM 流式响应 → 前端逐字展示',
      logic_flow: '1. 用户在复习中点击追问或输入问题\n2. 前端将题目上下文 + 用户消息发送到后端\n3. 后端拼装 system prompt（本模板）+ 对话历史\n4. 调用 LLM 流式接口\n5. 逐 token 返回给前端\n6. 记录 token 消耗（call_type=review_explain）',
    },
    {
      key: 'review_options',
      name: '选项解释',
      category: 'review',
      description: '复习时对错误选项进行进一步解释',
      prompt: `你是一个知识库复习助手。用户正在复习一道选择题，想了解某个选项为什么对或错。

题目：{{question}}
正确答案：{{optionLetters}}. {{correctOption}}
用户询问的选项：{{askedOptionLetter}}. {{askedOptionText}}
知识点标题：{{itemTitle}}

请解释这个选项的含义，以及它作为正确/错误答案的原因。
如果该选项是干扰项，请说明它与正确答案的区别。
保持回答在 150 字以内。`,
      variables: '["question","optionLetters","correctOption","askedOptionLetter","askedOptionText","itemTitle"]',
      data_flow: '输入：题目 + 被询问的选项 → LLM 解释 → 流式返回',
      logic_flow: '1. 用户点击某个选项的"解释"按钮\n2. 前端发送题目信息 + 目标选项\n3. 后端拼装 prompt\n4. 调用 LLM 流式响应\n5. 记录 token 消耗（call_type=review_options）',
    },
    {
      key: 'review_extend',
      name: '延伸知识',
      category: 'review',
      description: '复习时生成知识点的延伸背景知识（作者/时代/文化等）',
      prompt: `你是一个知识库助手。用户正在学习一个知识点，希望了解更多背景信息。

知识点标题：{{itemTitle}}
知识点内容：
{{itemContent}}

请围绕以下方面进行知识延伸：
- 作者/创作者的背景与水平
- 当时的历史时代状况
- 相关的文化/社会背景
- 与其他知识点的关联

请用 Markdown 格式组织内容，适合作为知识点保存。
保持内容在 500 字以内，信息准确、有条理。`,
      variables: '["itemTitle","itemContent"]',
      data_flow: '输入：知识点标题+内容 → LLM 生成延伸内容 → 前端展示 → 用户选择保存方式 → 写入 review_extensions 或 knowledge_items',
      logic_flow: '1. 用户点击"延伸知识"按钮\n2. 前端发送知识点信息\n3. 后端拼装 prompt\n4. 调用 LLM 生成延伸内容\n5. 流式返回给前端\n6. 记录 token 消耗（call_type=review_extend）\n7. 用户选择保存：追加到当前知识点 / 新建知识点 / 不保存\n8. 保存时写入 review_extensions 表 + 更新或创建 knowledge_items',
    },
    {
      key: 'agent_classify',
      name: '类型分类',
      category: 'agent',
      description: '判断用户输入内容属于哪种知识类型（文言文/成语/诗词/通用）',
      prompt: `你是分类助手。根据输入内容判断知识类型，只返回以下之一：classical_chinese, idiom, poetry, general

输入内容：
{{input_text}}`,
      variables: '["input_text"]',
      data_flow: '输入：用户粘贴的原始文本 → LLM 分类 → 返回类型字符串 → 决定后续使用哪个知识处理 prompt',
      logic_flow: '1. 用户输入内容\n2. 截取前 500 字符\n3. 调用 LLM 分类\n4. 校验返回值是否为有效类型\n5. 若无效则回退到规则检测（detectType）\n6. 返回最终类型',
    },
    {
      key: 'agent_rag',
      name: 'RAG 问答',
      category: 'agent',
      description: '基于知识库内容回答用户问题，会检索相关知识点作为上下文',
      prompt: `你是一个知识库助手。根据以下知识库内容回答用户问题。如果知识库中没有相关信息，请如实说明。引用来源时请标注具体的知识条目。

知识库相关内容：
{{rag_context}}

用户问题：{{user_message}}`,
      variables: '["rag_context","user_message"]',
      data_flow: '输入：用户问题 → RAG 检索相关知识点 → 拼装上下文 → LLM 生成回答 → 流式返回 + 保存到 chat_messages',
      logic_flow: '1. 用户在 AI 问答页面输入问题\n2. RagService 检索相关知识（embedding 相似度 + 关键词匹配）\n3. 拼装检索结果为 rag_context\n4. 填充 prompt 模板\n5. 调用 LLM 流式接口\n6. 逐 token 返回前端\n7. 完整回答存入 chat_messages（含 sources、tokens、time_ms）\n8. 记录 token 消耗（call_type=chat）',
    },
  ];
}
