import type { FastifyInstance, FastifyReply } from 'fastify';
import type { LLMProvider } from '../services/llm/index';
import { getActiveLLMProvider, recordTokenUsage, estimateTokens } from '../services/llm/index';
import type { ActiveProviderInfo } from '../services/llm/index';
import type { LLMMessage } from '@pkb/shared';
import type { KnowledgeType } from '@pkb/shared';
import { detectType } from '../services/promptEngine';
import { RagService } from '../services/ragService';
import {
  createChatSession,
  getChatSession,
  listChatSessions,
  deleteChatSession,
  addChatMessage,
  getMessagesBySession,
  updateChatSessionTitle,
} from '../db/chatRepo';

const RAG_SYSTEM_PROMPT = `你是一个知识库助手。根据以下知识库内容回答用户问题。如果知识库中没有相关信息，请如实说明。引用来源时请标注具体的知识条目。`;

function sseWrite(reply: FastifyReply, data: object) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function agentRoutes(
  app: FastifyInstance
) {
  const ragService = new RagService();

  // Classify text (detect type without storing)
  app.post('/api/agent/classify', async (req, reply) => {
    const body = req.body as { text: string; model?: string; temperature?: number; top_p?: number };
    if (!body.text) {
      return reply.status(400).send({ error: 'text is required' });
    }

    const info = await getActiveLLMProvider();
    const llm = info.provider;
    const options = { model: body.model, temperature: body.temperature, top_p: body.top_p };
    const detectedType = detectType(body.text);

    try {
      const response = await llm.chat([
        {
          role: 'system',
          content: `你是分类助手。根据输入内容判断知识类型，只返回以下之一：classical_chinese, idiom, poetry, general`,
        },
        { role: 'user', content: `判断以下内容的类型：\n${body.text.substring(0, 500)}` },
      ], options);

      // Record token usage
      if (response.usage) {
        recordTokenUsage({
          model: options?.model || info.model,
          provider_name: info.providerName,
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
          call_type: 'classify',
        });
      }

      const llmType = response.content.trim().toLowerCase();
      const validTypes = ['classical_chinese', 'idiom', 'poetry', 'general'];
      const finalType = validTypes.includes(llmType) ? llmType : detectedType;

      return { type: finalType as KnowledgeType, confidence: validTypes.includes(llmType) ? 'high' : 'low' };
    } catch {
      return { type: detectedType, confidence: 'low' };
    }
  });

  // POST /api/agent/chat — RAG chat with SSE streaming
  app.post('/api/agent/chat', async (req, reply) => {
    const body = req.body as { session_id?: string; message: string; model?: string; temperature?: number; top_p?: number };
    if (!body.message?.trim()) {
      return reply.status(400).send({ error: 'message is required' });
    }

    let sessionId = body.session_id;
    const options = { model: body.model, temperature: body.temperature, top_p: body.top_p };

    // Create session if needed
    if (!sessionId) {
      const title = body.message.substring(0, 30) + (body.message.length > 30 ? '...' : '');
      const session = await createChatSession(title);
      sessionId = session.id;
    }

    // Verify session exists
    const session = await getChatSession(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'session not found' });
    }

    // Save user message
    await addChatMessage(sessionId, 'user', body.message);

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      const info = await getActiveLLMProvider();
      const llm = info.provider;

      // RAG retrieval
      const ragResult = await ragService.query(body.message);

      // Send sources event
      if (ragResult.sources.length > 0) {
        sseWrite(reply, {
          type: 'sources',
          data: ragResult.sources,
        });
      }

      // Build messages for LLM
      const messages: LLMMessage[] = [
        { role: 'system', content: RAG_SYSTEM_PROMPT },
      ];

      // Add context if available
      if (ragResult.context) {
        messages.push({
          role: 'user',
          content: `以下是知识库中的相关内容：\n\n${ragResult.context}\n\n用户问题：${body.message}`,
        });
      } else {
        messages.push({ role: 'user', content: body.message });
      }

      // Stream response
      let fullContent = '';
      let usedFallback = false;
      try {
        for await (const token of llm.chatStream(messages, options)) {
          fullContent += token;
          sseWrite(reply, { type: 'token', data: token });
        }
      } catch (streamErr: any) {
        // If streaming fails, try non-streaming
        console.warn('[Agent] Stream failed, falling back to non-stream:', streamErr.message);
        const response = await llm.chat(messages, options);
        fullContent = response.content;
        usedFallback = true;
        sseWrite(reply, { type: 'token', data: fullContent });

        // Record token usage from non-streaming fallback (has exact usage)
        if (response.usage) {
          recordTokenUsage({
            model: options?.model || info.model,
            provider_name: info.providerName,
            prompt_tokens: response.usage.promptTokens,
            completion_tokens: response.usage.completionTokens,
            total_tokens: response.usage.totalTokens,
            call_type: 'chat',
          });
        }
      }

      // For streaming, estimate token usage since we don't get exact counts
      if (!usedFallback) {
        const promptText = messages.map(m => m.content).join('\n');
        const estimatedPromptTokens = estimateTokens(promptText);
        const estimatedCompletionTokens = estimateTokens(fullContent);
        recordTokenUsage({
          model: options?.model || info.model,
          provider_name: info.providerName,
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: estimatedCompletionTokens,
          total_tokens: estimatedPromptTokens + estimatedCompletionTokens,
          call_type: 'chat',
        });
      }

      // Save assistant message
      const sourceIds = ragResult.sources.map((s) => s.id);
      await addChatMessage(sessionId, 'assistant', fullContent, sourceIds.length > 0 ? sourceIds : undefined);

      // Send done event
      sseWrite(reply, { type: 'done', data: { session_id: sessionId } });
      reply.raw.end();
    } catch (err: any) {
      console.error('[Agent] Chat error:', err);
      sseWrite(reply, { type: 'token', data: '抱歉，处理您的问题时出现了错误，请稍后重试。' });
      sseWrite(reply, { type: 'done', data: { session_id: sessionId, error: true } });
      reply.raw.end();
    }
  });

  // GET /api/agent/sessions — list chat sessions
  app.get('/api/agent/sessions', async () => {
    const sessions = await listChatSessions();
    return { data: sessions };
  });

  // GET /api/agent/sessions/:id — get session with messages
  app.get('/api/agent/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getChatSession(id);
    if (!session) {
      return reply.status(404).send({ error: 'session not found' });
    }
    const messages = await getMessagesBySession(id);
    return { data: { session, messages } };
  });

  // DELETE /api/agent/sessions/:id — delete session
  app.delete('/api/agent/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteChatSession(id);
    return { success: true };
  });
}
