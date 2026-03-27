const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Knowledge API
export const knowledgeApi = {
  list: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return request<any>(`/knowledge${query ? `?${query}` : ''}`);
  },

  get: (id: string) => request<any>(`/knowledge/${id}`),

  create: (data: { title?: string; raw_content: string; type?: string; auto_classify?: boolean; model?: string; temperature?: number; top_p?: number }) =>
    request<any>('/knowledge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<any>(`/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<any>(`/knowledge/${id}`, { method: 'DELETE' }),

  preview: (data: { raw_content: string; type?: string; model?: string; temperature?: number; top_p?: number }) =>
    request<any>('/knowledge/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  splitPreview: (data: { raw_content: string; type?: string; model?: string; temperature?: number; top_p?: number }) =>
    request<any>('/knowledge/split-preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  savePieces: (data: { pieces: Array<{ raw_content: string; title?: string; type?: string; keywords: string[]; tags: string[]; category?: string }>; merge: boolean }) =>
    request<any>('/knowledge/save-pieces', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  upload: async (file: File, type?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (type) formData.append('type', type);

    const response = await fetch(`${API_BASE}/knowledge/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '上传失败' }));
      throw new Error(error.error || '上传失败');
    }

    return response.json();
  },
};

// Template API
export const templateApi = {
  list: () => request<any>('/templates'),
  get: (id: string) => request<any>(`/templates/${id}`),
  create: (data: { type: string; name: string; template: string; is_default?: boolean }) =>
    request<any>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    request<any>(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<any>(`/templates/${id}`, { method: 'DELETE' }),
  reset: () =>
    request<any>('/templates/reset', { method: 'POST' }),
};

// Agent API
export const agentApi = {
  classify: (text: string) =>
    request<any>('/agent/classify', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // RAG chat with SSE streaming
  chat: (
    message: string,
    sessionId: string | undefined,
    onToken: (token: string) => void,
    onSources: (sources: Array<{ id: string; title: string }>) => void,
    onDone: (data: { session_id: string; error?: boolean }) => void,
    onError: (err: Error) => void,
    options?: { model?: string; temperature?: number; top_p?: number },
  ) => {
    const body: Record<string, string | number> = { message };
    if (sessionId) body.session_id = sessionId;
    if (options?.model) body.model = options.model;
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.top_p !== undefined) body.top_p = options.top_p;

    fetch(`${API_BASE}/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let buffer = '';

        const pump = (): Promise<void> => {
          return reader.read().then(({ done, value }) => {
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.type === 'token') onToken(parsed.data);
                  else if (parsed.type === 'sources') onSources(parsed.data);
                  else if (parsed.type === 'done') onDone(parsed.data);
                } catch {}
              }
            }
            return pump();
          });
        };
        return pump();
      })
      .catch(onError);
  },

  // Sessions
  listSessions: () => request<any>('/agent/sessions'),

  getSession: (id: string) => request<any>(`/agent/sessions/${id}`),

  deleteSession: (id: string) =>
    request<any>(`/agent/sessions/${id}`, { method: 'DELETE' }),
};

// Provider API
export const providerApi = {
  list: () => request<any[]>('/providers'),

  create: (data: { name: string; provider_type: string; api_key: string; base_url: string; model: string }) =>
    request<any>('/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; provider_type?: string; api_key?: string; base_url?: string; model?: string }) =>
    request<any>(`/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<any>(`/providers/${id}`, { method: 'DELETE' }),

  activate: (id: string) =>
    request<any>(`/providers/${id}/activate`, { method: 'POST' }),

  test: (data: { provider_type: string; api_key: string; base_url: string; model: string }) =>
    request<any>('/providers/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Graph API
export const graphApi = {
  getGraph: () => request<any>('/graph'),
  getClusters: () => request<any>('/graph/cluster'),
  getStats: () => request<any>('/graph/stats'),
  runClustering: (params: { keywordWeight?: number; tagWeight?: number; categoryWeight?: number; threshold?: number }) =>
    request<any>('/graph/cluster/run', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  getClusterParams: () => request<any>('/graph/cluster/params'),
};

// Review API
export const reviewApi = {
  start: (count?: number) =>
    request<any>('/review/start', {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),

  submit: (data: { review_id: string; question_index: number; user_answer: string }) =>
    request<any>('/review/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getToday: () => request<any>('/review/today'),

  getHistory: (page?: number, pageSize?: number) => {
    const params: Record<string, string> = {};
    if (page) params.page = String(page);
    if (pageSize) params.pageSize = String(pageSize);
    const query = new URLSearchParams(params).toString();
    return request<any>(`/review/history${query ? `?${query}` : ''}`);
  },
};

// Token Usage API
export const tokenApi = {
  getToday: () => request<any>('/tokens/today'),

  getRange: (start: string, end: string) =>
    request<any>(`/tokens/range?start=${start}&end=${end}`),

  getSummary: () => request<any>('/tokens/summary'),

  getTotal: () => request<any>('/tokens/total'),
};
