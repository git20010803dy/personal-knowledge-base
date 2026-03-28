import type { KnowledgeType, PromptTemplate } from '@pkb/shared';

// Built-in prompt templates
const BUILT_IN_TEMPLATES: Array<Omit<PromptTemplate, 'created_at'>> = [
  {
    id: 'builtin-classical-chinese',
    type: 'classical_chinese',
    name: '文言文处理',
    is_default: true,
    template: `你是一位古典文学专家。请分析以下文言文内容，严格按照 JSON 格式返回结果。

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
  },
  {
    id: 'builtin-idiom',
    type: 'idiom',
    name: '成语处理',
    is_default: true,
    template: `你是一位成语词典编纂专家。请分析以下成语内容，严格按照 JSON 格式返回结果。

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
  },
  {
    id: 'builtin-poetry',
    type: 'poetry',
    name: '诗词处理',
    is_default: true,
    template: `你是一位诗词鉴赏专家。请分析以下诗词内容，严格按照 JSON 格式返回结果。

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
  },
  {
    id: 'builtin-general',
    type: 'general',
    name: '通用处理',
    is_default: true,
    template: `你是一位知识管理助手。请分析以下内容，提取关键信息，严格按照 JSON 格式返回结果。

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
  },
];

export function getBuiltInTemplates(): Array<Omit<PromptTemplate, 'created_at'>> {
  return BUILT_IN_TEMPLATES;
}

export function detectType(rawContent: string): KnowledgeType {
  const content = rawContent.trim();

  // Check for poetry patterns (lines with similar length, rhyming markers)
  const lines = content.split('\n').filter((l) => l.trim());
  const hasPoetryMarkers = /[，。！？；：]$/gm.test(content) && lines.length >= 2 && lines.length <= 20;
  const isShortLines = lines.every((l) => l.trim().length <= 30);

  if (hasPoetryMarkers && isShortLines && lines.length >= 4) {
    // Could be poetry - check for classical patterns
    const classicalMarkers = /之|乎|者|也|矣|焉|哉|兮/;
    if (classicalMarkers.test(content)) {
      // Check if it looks like an idiom (4 characters)
      const cleanContent = content.replace(/[\s，。！？；：]/g, '');
      if (/^[\u4e00-\u9fa5]{3,8}$/.test(cleanContent)) {
        return 'idiom';
      }
      return 'classical_chinese';
    }
  }

  // Check for idiom (short 4-character phrase)
  const cleanContent = content.replace(/[\s，。！？；：""''（）]/g, '');
  if (/^[\u4e00-\u9fa5]{3,8}$/.test(cleanContent) && content.length < 100) {
    return 'idiom';
  }

  // Check for classical Chinese markers
  const classicalRatio = (content.match(/[之乎者也矣焉哉兮其而乃于]/g)) || [];
  if (classicalRatio.length > content.length * 0.05) {
    return 'classical_chinese';
  }

  return 'general';
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return result;
}

export function parseJsonResponse(response: string): Record<string, unknown> {
  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonStr = response.trim();

  // Remove markdown code block markers
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to find JSON in the response
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Fall through
      }
    }
    // Return a fallback structure
    return {
      title: '未解析的内容',
      summary: response.substring(0, 200),
      raw_response: response,
    };
  }
}
