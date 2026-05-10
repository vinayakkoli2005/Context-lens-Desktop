import type { Message } from '../src/shared/types';

export interface StreamChatArgs {
  provider: 'ollama' | 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  ollamaUrl: string;
  messages: Message[];
  onToken: (delta: string) => void;
  signal?: AbortSignal;
}

export interface ModelInfo {
  name: string;
}

export const listModels = async (
  provider: 'ollama' | 'openai' | 'anthropic',
  apiKey: string,
  ollamaUrl: string
): Promise<ModelInfo[]> => {
  if (provider === 'anthropic') {
    return [
      { name: 'claude-opus-4-7' },
      { name: 'claude-sonnet-4-6' },
      { name: 'claude-haiku-4-5-20251001' },
    ];
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: undefined,
    });
    if (!res.ok) throw new Error(`OpenAI models failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data.data as { id: string }[])
      .filter(m => m.id.startsWith('gpt-'))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(m => ({ name: m.id }));
  }

  // ollama
  const res = await fetch(`${ollamaUrl}/api/tags`);
  if (!res.ok) throw new Error(`Ollama models failed: HTTP ${res.status}`);
  const data = await res.json();
  return (data.models ?? []).map((m: { name: string }) => ({ name: m.name }));
};

export const streamChat = async (args: StreamChatArgs): Promise<void> => {
  if (args.provider === 'ollama') return streamOllama(args);
  if (args.provider === 'openai') return streamOpenAI(args);
  if (args.provider === 'anthropic') return streamAnthropic(args);
  throw new Error(`Unknown provider: ${args.provider}`);
};

const streamOllama = async (args: StreamChatArgs): Promise<void> => {
  const body = {
    model: args.model,
    messages: args.messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.image ? { images: [m.image] } : {}),
    })),
    stream: true,
  };
  const res = await fetch(`${args.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: args.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama chat failed: HTTP ${res.status}`);
  await readNdJsonStream(res.body, (obj) => {
    if (obj.message?.content) args.onToken(obj.message.content);
    return !!obj.done;
  });
};

const streamOpenAI = async (args: StreamChatArgs): Promise<void> => {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages.map(m => ({
        role: m.role,
        content: m.image
          ? [
              { type: 'image_url', image_url: { url: `data:image/png;base64,${m.image}` } },
              { type: 'text', text: m.content as string },
            ]
          : m.content,
      })),
      stream: true,
    }),
    signal: args.signal,
  });
  if (!res.ok || !res.body) throw new Error(`OpenAI chat failed: HTTP ${res.status}`);
  await readSseStream(res.body, (data) => {
    if (data === '[DONE]') return true;
    try {
      const obj = JSON.parse(data);
      const delta = obj.choices?.[0]?.delta?.content;
      if (delta) args.onToken(delta);
    } catch { /* ignore malformed */ }
    return false;
  });
};

const streamAnthropic = async (args: StreamChatArgs): Promise<void> => {
  const systemMsg = args.messages.find(m => m.role === 'system');
  const userMsgs = args.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      content: m.image
        ? [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: m.image } },
            { type: 'text', text: m.content as string },
          ]
        : m.content,
    }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 4096,
      system: systemMsg?.content ?? '',
      messages: userMsgs,
      stream: true,
    }),
    signal: args.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Anthropic chat failed: HTTP ${res.status}`);
  await readSseStream(res.body, (data) => {
    try {
      const obj = JSON.parse(data);
      if (obj.type === 'content_block_delta' && obj.delta?.text) {
        args.onToken(obj.delta.text);
      }
      if (obj.type === 'message_stop') return true;
    } catch { /* ignore */ }
    return false;
  });
};

const readNdJsonStream = async (
  body: ReadableStream<Uint8Array>,
  onLine: (obj: any) => boolean
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (onLine(obj)) return;
      } catch { /* skip */ }
    }
  }
};

const readSseStream = async (
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => boolean
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (onData(data)) return;
    }
  }
};
