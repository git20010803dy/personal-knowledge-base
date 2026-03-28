import type { FastifyInstance } from 'fastify';
import {
  getAllProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  activateProvider,
  getActiveProvider,
} from '../db/providerRepo';
import { createProvider as createLLMProvider } from '../services/llm';

export async function providerRoutes(app: FastifyInstance) {
  // List all providers
  app.get('/api/providers', async () => {
    const providers = await getAllProviders();
    // Mask API keys in response
    return providers.map((p) => ({
      ...p,
      api_key: maskApiKey(p.api_key),
    }));
  });

  // Create a new provider
  app.post('/api/providers', async (req, reply) => {
    const body = req.body as {
      name: string;
      provider_type: 'openai' | 'claude' | 'custom';
      api_key: string;
      base_url: string;
      model: string;
    };

    if (!body.name || !body.provider_type || !body.api_key || !body.base_url || !body.model) {
      return reply.status(400).send({ error: '所有字段都是必填项' });
    }

    const provider = await createProvider(body);
    return {
      ...provider,
      api_key: maskApiKey(provider.api_key),
    };
  });

  // Update a provider
  app.put('/api/providers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      provider_type?: 'openai' | 'claude' | 'custom';
      api_key?: string;
      base_url?: string;
      model?: string;
    };

    // If api_key is masked (contains ****), don't update it
    if (body.api_key && body.api_key.includes('****')) {
      delete body.api_key;
    }

    const updated = await updateProvider(id, body);
    if (!updated) {
      return reply.status(404).send({ error: '未找到该提供商' });
    }

    return {
      ...updated,
      api_key: maskApiKey(updated.api_key),
    };
  });

  // Delete a provider
  app.delete('/api/providers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await deleteProvider(id);
    if (!deleted) {
      return reply.status(404).send({ error: '未找到该提供商' });
    }
    return { success: true };
  });

  // Activate a provider
  app.post('/api/providers/:id/activate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const activated = await activateProvider(id);
    if (!activated) {
      return reply.status(404).send({ error: '未找到该提供商' });
    }
    return {
      ...activated,
      api_key: maskApiKey(activated.api_key),
    };
  });

  // Test a provider connection
  app.post('/api/providers/test', async (req, reply) => {
    const body = req.body as {
      id?: string;  // optional: if given, use stored key from DB
      provider_type: 'openai' | 'claude' | 'custom';
      api_key: string;
      base_url: string;
      model: string;
    };

    if (!body.provider_type || !body.base_url || !body.model) {
      return reply.status(400).send({ error: '所有字段都是必填项' });
    }

    // If api_key is masked, try to get real key from DB
    let apiKey = body.api_key;
    if (body.api_key && body.api_key.includes('****') && body.id) {
      const { getProviderById } = await import('../db/providerRepo');
      const stored = await getProviderById(body.id);
      if (stored) {
        apiKey = stored.api_key;
      }
    }

    if (!apiKey) {
      return reply.status(400).send({ error: 'API Key 不能为空' });
    }

    try {
      const llm = createLLMProvider({
        provider_type: body.provider_type,
        api_key: apiKey,
        base_url: body.base_url,
        model: body.model,
      });

      const response = await llm.chat([
        { role: 'user', content: 'Say "OK" if you can hear me.' },
      ]);

      return {
        success: true,
        message: '连接成功',
        response: response.content.substring(0, 200),
      };
    } catch (error: any) {
      return {
        success: false,
        message: '连接失败',
        error: error.message,
      };
    }
  });
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}
