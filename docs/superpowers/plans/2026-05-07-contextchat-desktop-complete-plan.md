# ContextChat Desktop — Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the working Ollama-only MVP into a fully shippable desktop app with multi-provider AI (Ollama + OpenAI + Anthropic), abort support, keyboard shortcut, settings validation, persistent conversation history, and a history viewer with markdown export.

**Architecture:** Four sequential layers — provider abstraction first (replaces `ollama-client.ts` with `ai-client.ts`), then UX polish (abort, shortcut, validation), then history persistence (`history-store.ts` + JSON file), then history UI (new BrowserWindow). Each layer builds on the previous and is independently testable.

**Tech Stack:** Electron 32, React 18, TypeScript 5, Vite (electron-vite), Tailwind CSS, electron-store, vitest

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `electron/ai-client.ts` | Unified `streamChat` + `listModels` for Ollama, OpenAI, Anthropic |
| `electron/history-store.ts` | Read/write/prune/export JSON history file in userData dir |
| `src/history/History.tsx` | History window React component (list + detail + export) |
| `src/history/main.tsx` | History window React entry point |
| `history.html` | History window HTML shell |

### Modified files
| File | Change summary |
|------|---------------|
| `electron/ipc-channels.ts` | Add `MODELS_LIST`, `ABORT_CHAT`, `HISTORY_GET`, `HISTORY_DELETE`, `HISTORY_EXPORT` |
| `electron/store.ts` | Add `provider`, `openaiApiKey`, `anthropicApiKey` fields |
| `electron/windows.ts` | Add `showHistory` / `hideHistory` / `sendToHistory` |
| `electron/tray.ts` | Add "Open History" menu item |
| `electron/main.ts` | Wire new IPC handlers, AbortController, global shortcut, history save on CHAT_DONE |
| `electron.vite.config.ts` | Add `history` input entry |
| `src/shared/types.ts` | Extend `Settings` with new fields; add `HistoryEntry` type |
| `src/settings/Settings.tsx` | Provider picker, API key field, "Fetch Models" button, validation |
| `src/panel/Panel.tsx` | Add Stop button during streaming, pass provider+key to CHAT_SEND |
| `src/panel/ModelSelector.tsx` | Fetch models via new MODELS_LIST payload |
| `tests/ai-client.test.ts` | Tests for listModels routing and error handling |
| `tests/history-store.test.ts` | Tests for append, prune, delete, export |

### Deleted files
| File | Reason |
|------|--------|
| `electron/ollama-client.ts` | Replaced by `electron/ai-client.ts` |
| `tests/ollama-client.test.ts` | Replaced by `tests/ai-client.test.ts` |

---

## Task 1: Extend Types and IPC Channels

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `electron/ipc-channels.ts`

- [ ] **Step 1: Extend `Settings` and add `HistoryEntry` in `src/shared/types.ts`**

Replace the existing `Settings` interface and add `HistoryEntry`:

```ts
export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
  image?: string;
}

export interface Conversation {
  id: string;
  context: { type: 'text' | 'image'; value: string };
  messages: Message[];
  model: string;
}

export interface Settings {
  ollamaUrl: string;
  selectedModel: string;
  launchAtStartup: boolean;
  provider: 'ollama' | 'openai' | 'anthropic';
  openaiApiKey: string;
  anthropicApiKey: string;
}

export interface OllamaModel {
  name: string;
  size: number;
}

export interface HardwareInfo {
  totalRamGb: number;
  recommendedTextModel: string;
  recommendedVisionModel: string;
}

export type QuickAction = 'explain' | 'summarize' | 'ask';

export interface HistoryEntry {
  id: string;
  startedAt: number;
  provider: string;
  model: string;
  context: { type: 'text' | 'image'; value: string };
  messages: Message[];
}
```

- [ ] **Step 2: Add new IPC channels to `electron/ipc-channels.ts`**

Replace the file entirely:

```ts
export const IPC = {
  // panel ↔ main
  PANEL_READY: 'panel:ready',
  PANEL_CLOSE: 'panel:close',
  CHAT_SEND: 'chat:send',
  CHAT_TOKEN: 'chat:token',
  CHAT_DONE: 'chat:done',
  CHAT_ERROR: 'chat:error',
  ABORT_CHAT: 'chat:abort',

  // icon ↔ main
  ICON_CLICK: 'icon:click',

  // settings ↔ main
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  MODELS_LIST: 'models:list',
  HARDWARE_INFO: 'hardware:info',

  // toast ↔ main
  TOAST_ACCEPT: 'toast:accept',
  TOAST_DISMISS: 'toast:dismiss',

  // main → panel push
  CONTEXT_TEXT: 'context:text',
  CONTEXT_IMAGE: 'context:image',

  // history ↔ main
  HISTORY_GET: 'history:get',
  HISTORY_DELETE: 'history:delete',
  HISTORY_EXPORT: 'history:export',
} as const;
```

- [ ] **Step 3: Verify build still passes**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts electron/ipc-channels.ts
git commit -m "feat: extend types with provider/history fields and add IPC channels"
```

---

## Task 2: Update electron-store with New Settings Fields

**Files:**
- Modify: `electron/store.ts`

- [ ] **Step 1: Add new defaults and update `store.ts`**

Replace the file entirely:

```ts
import Store from 'electron-store';
import type { Settings } from '../src/shared/types';

const DEFAULTS: Settings = {
  ollamaUrl: 'http://localhost:11434',
  selectedModel: '',
  launchAtStartup: true,
  provider: 'ollama',
  openaiApiKey: '',
  anthropicApiKey: '',
};

const store = new Store<Settings>({ defaults: DEFAULTS });

export const getSettings = (): Settings => ({
  ollamaUrl: store.get('ollamaUrl'),
  selectedModel: store.get('selectedModel'),
  launchAtStartup: store.get('launchAtStartup'),
  provider: store.get('provider'),
  openaiApiKey: store.get('openaiApiKey'),
  anthropicApiKey: store.get('anthropicApiKey'),
});

export const setSettings = (patch: Partial<Settings>): Settings => {
  for (const [k, v] of Object.entries(patch)) {
    (store as any).set(k, v);
  }
  return getSettings();
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add electron/store.ts
git commit -m "feat: add provider and API key fields to settings store"
```

---

## Task 3: Write Tests for AI Client

**Files:**
- Create: `tests/ai-client.test.ts`

- [ ] **Step 1: Write failing tests for `listModels` routing**

Create `tests/ai-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the routing logic by mocking fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after stubbing globals
const { listModels } = await import('../electron/ai-client');

beforeEach(() => {
  mockFetch.mockReset();
});

describe('listModels', () => {
  it('routes ollama to /api/tags and returns model names', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.2', size: 1000 }, { name: 'llava', size: 2000 }] })
    });
    const models = await listModels('ollama', '', 'http://localhost:11434');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags');
    expect(models).toEqual([{ name: 'llama3.2' }, { name: 'llava' }]);
  });

  it('routes openai to /v1/models with Bearer auth and filters gpt- models', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o-mini' },
          { id: 'gpt-4o' },
          { id: 'text-embedding-3-small' },
          { id: 'whisper-1' },
        ]
      })
    });
    const models = await listModels('openai', 'sk-test', '');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }) })
    );
    expect(models.map(m => m.name)).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('returns hardcoded list for anthropic without calling fetch', async () => {
    const models = await listModels('anthropic', 'sk-ant-test', '');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(models.map(m => m.name)).toContain('claude-sonnet-4-6');
    expect(models.length).toBe(3);
  });

  it('throws when ollama is unreachable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(listModels('ollama', '', 'http://localhost:11434')).rejects.toThrow('503');
  });

  it('throws when openai returns 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(listModels('openai', 'bad-key', '')).rejects.toThrow('401');
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- tests/ai-client.test.ts`
Expected: FAIL — `Cannot find module '../electron/ai-client'`

---

## Task 4: Implement `electron/ai-client.ts`

**Files:**
- Create: `electron/ai-client.ts`
- Delete: `electron/ollama-client.ts`

- [ ] **Step 1: Create `electron/ai-client.ts`**

```ts
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
      messages: args.messages.map(m => ({ role: m.role, content: m.content })),
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
    .map(m => ({ role: m.role, content: m.content }));

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
```

- [ ] **Step 2: Delete `electron/ollama-client.ts`**

```bash
rm electron/ollama-client.ts
```

- [ ] **Step 3: Run tests and confirm they pass**

Run: `npm test -- tests/ai-client.test.ts`
Expected: 5 tests PASS

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build fails — `main.ts` still imports `ollama-client`. That's fine, fix it in Task 5.

- [ ] **Step 5: Commit**

```bash
git add electron/ai-client.ts tests/ai-client.test.ts
git rm electron/ollama-client.ts tests/ollama-client.test.ts
git commit -m "feat: replace ollama-client with multi-provider ai-client (Ollama/OpenAI/Anthropic)"
```

---

## Task 5: Wire `ai-client` into `main.ts` and Update MODELS_LIST IPC

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Replace `main.ts` with updated version using `ai-client`**

Replace the entire file:

```ts
import { app, ipcMain, BrowserWindow, globalShortcut, clipboard } from 'electron';
import { IPC } from './ipc-channels';
import { createTray } from './tray';
import { showIcon, hideIcon, showPanel, hidePanel, showToast, hideToast, sendToPanel, isPanelOpen, showHistory } from './windows';
import { startSelectionMonitor } from './selection-monitor';
import { startClipboardWatcher } from './clipboard-watcher';
import { listModels, streamChat } from './ai-client';
import { getSettings, setSettings } from './store';
import { detectHardware } from './hardware-detector';
import { createConversation, appendMessage, applyRollingWindow } from './conversation';
import { appendHistory } from './history-store';
import type { Conversation, Message } from '../src/shared/types';

let currentConversation: Conversation | null = null;
let lastSelectionPos = { x: 100, y: 100 };
let pendingScreenshot: string | null = null;
let pendingSelectionText: string | null = null;
let currentAbortController: AbortController | null = null;

const ensureSingleInstance = (): boolean => {
  const got = app.requestSingleInstanceLock();
  if (!got) { app.quit(); return false; }
  return true;
};

const setupAutoLaunch = (): void => {
  const settings = getSettings();
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, openAsHidden: true });
};

const handleSelection = (e: { text: string; x: number; y: number }) => {
  if (isPanelOpen()) return;
  lastSelectionPos = { x: e.x, y: e.y };
  pendingScreenshot = null;
  pendingSelectionText = e.text;
  showIcon(e.x + 8, e.y + 8);
};

const openPanelForSelection = () => {
  hideIcon();
  if (!pendingSelectionText) return;
  const settings = getSettings();
  const hw = detectHardware();
  const model = settings.selectedModel || hw.recommendedTextModel;
  currentConversation = createConversation({ type: 'text', value: pendingSelectionText }, model);
  showPanel(lastSelectionPos.x + 16, lastSelectionPos.y + 16);
  const textSnapshot = pendingSelectionText;
  setTimeout(() => sendToPanel(IPC.CONTEXT_TEXT, textSnapshot), 250);
};

const openPanelForScreenshot = () => {
  hideToast();
  if (!pendingScreenshot) return;
  const settings = getSettings();
  const hw = detectHardware();
  const model = settings.selectedModel || hw.recommendedVisionModel;
  currentConversation = createConversation({ type: 'image', value: '[screenshot]' }, model);
  showPanel(lastSelectionPos.x, lastSelectionPos.y);
  const screenshotSnapshot = pendingScreenshot;
  setTimeout(() => sendToPanel(IPC.CONTEXT_IMAGE, screenshotSnapshot), 250);
};

const openPanelForClipboard = () => {
  if (isPanelOpen()) return;
  const text = clipboard.readText().trim();
  if (!text) return;
  pendingSelectionText = text;
  const settings = getSettings();
  const hw = detectHardware();
  const model = settings.selectedModel || hw.recommendedTextModel;
  currentConversation = createConversation({ type: 'text', value: text }, model);
  const display = require('electron').screen.getPrimaryDisplay().workAreaSize;
  showPanel(Math.round(display.width / 2) - 180, Math.round(display.height / 2) - 240);
  setTimeout(() => sendToPanel(IPC.CONTEXT_TEXT, text), 250);
};

const registerIpc = (): void => {
  ipcMain.on(IPC.ICON_CLICK, () => openPanelForSelection());
  ipcMain.on(IPC.PANEL_CLOSE, () => { hidePanel(); currentConversation = null; currentAbortController?.abort(); currentAbortController = null; });
  ipcMain.on(IPC.TOAST_ACCEPT, () => openPanelForScreenshot());
  ipcMain.on(IPC.TOAST_DISMISS, () => { hideToast(); pendingScreenshot = null; });
  ipcMain.on(IPC.ABORT_CHAT, () => { currentAbortController?.abort(); currentAbortController = null; });

  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings());
  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch) => {
    const next = setSettings(patch);
    setupAutoLaunch();
    return next;
  });
  ipcMain.handle(IPC.HARDWARE_INFO, () => detectHardware());
  ipcMain.handle(IPC.MODELS_LIST, async (_e, payload?: { provider?: string; apiKey?: string; ollamaUrl?: string }) => {
    const settings = getSettings();
    const provider = (payload?.provider ?? settings.provider) as 'ollama' | 'openai' | 'anthropic';
    const apiKey = payload?.apiKey ?? (provider === 'openai' ? settings.openaiApiKey : settings.anthropicApiKey);
    const ollamaUrl = payload?.ollamaUrl ?? settings.ollamaUrl;
    return listModels(provider, apiKey, ollamaUrl);
  });

  ipcMain.handle(IPC.CHAT_SEND, async (e, payload: { userMessage: Message; model: string }) => {
    if (!currentConversation) throw new Error('No active conversation');
    currentConversation = appendMessage(currentConversation, payload.userMessage);
    currentConversation = applyRollingWindow(currentConversation);
    currentConversation = { ...currentConversation, model: payload.model };
    const settings = getSettings();
    const apiKey = settings.provider === 'openai' ? settings.openaiApiKey : settings.anthropicApiKey;
    let assistantBuffer = '';
    const win = BrowserWindow.fromWebContents(e.sender);
    currentAbortController = new AbortController();
    try {
      await streamChat({
        provider: settings.provider,
        apiKey,
        model: payload.model,
        ollamaUrl: settings.ollamaUrl,
        messages: currentConversation.messages,
        onToken: (delta) => {
          assistantBuffer += delta;
          win?.webContents.send(IPC.CHAT_TOKEN, { delta });
        },
        signal: currentAbortController.signal,
      });
      currentConversation = appendMessage(currentConversation, { role: 'assistant', content: assistantBuffer });
      win?.webContents.send(IPC.CHAT_DONE, {});
      // Save completed conversation to history
      if (currentConversation) {
        appendHistory({
          id: currentConversation.id,
          startedAt: Date.now(),
          provider: settings.provider,
          model: payload.model,
          context: currentConversation.context,
          messages: currentConversation.messages,
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (assistantBuffer) {
          currentConversation = appendMessage(currentConversation, { role: 'assistant', content: assistantBuffer });
        }
        win?.webContents.send(IPC.CHAT_DONE, {});
      } else {
        win?.webContents.send(IPC.CHAT_ERROR, { message: err.message });
      }
    } finally {
      currentAbortController = null;
    }
  });

  ipcMain.handle(IPC.HISTORY_GET, () => require('./history-store').getHistory());
  ipcMain.handle(IPC.HISTORY_DELETE, (_e, payload: { id: string }) => {
    require('./history-store').deleteHistoryEntry(payload.id);
  });
  ipcMain.handle(IPC.HISTORY_EXPORT, () => require('./history-store').exportHistoryMarkdown());
};

const main = async (): Promise<void> => {
  if (!ensureSingleInstance()) return;
  await app.whenReady();
  app.setAppUserModelId('com.contextchat.desktop');
  registerIpc();
  createTray();
  setupAutoLaunch();
  startSelectionMonitor(handleSelection);
  startClipboardWatcher((png) => {
    if (isPanelOpen()) return;
    pendingScreenshot = png;
    showToast();
  });
  globalShortcut.register('CommandOrControl+Shift+Space', openPanelForClipboard);
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => {});
};

main();
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build fails on missing `showHistory` from `windows.ts` and missing `history-store`. That's expected — those come in Tasks 6 and 7.

- [ ] **Step 3: Commit what compiles**

```bash
git add electron/main.ts
git commit -m "feat: wire ai-client into main, add abort controller and global shortcut"
```

---

## Task 6: Add `showHistory` to `windows.ts`

**Files:**
- Modify: `electron/windows.ts`

- [ ] **Step 1: Add history window to `electron/windows.ts`**

Read the current file, then append after the `showSettings` function:

```ts
export const showHistory = (): BrowserWindow => {
  // reuse or create
  if ((showHistory as any)._win && !(showHistory as any)._win.isDestroyed()) {
    (showHistory as any)._win.focus();
    return (showHistory as any)._win;
  }
  const win = new BrowserWindow({
    width: 680, height: 520,
    title: 'ContextChat History',
    resizable: true,
    webPreferences: { preload, sandbox: false, contextIsolation: true },
  });
  win.loadURL(rendererUrl('history.html'));
  win.on('closed', () => { (showHistory as any)._win = null; });
  (showHistory as any)._win = win;
  return win;
};
```

- [ ] **Step 2: Verify build (ignoring history-store import)**

Run: `npm run build`
Expected: Build fails only on missing `history-store` — `windows.ts` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add electron/windows.ts
git commit -m "feat: add showHistory window to windows.ts"
```

---

## Task 7: Write Tests for History Store

**Files:**
- Create: `tests/history-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/history-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

// Point app.getPath to a temp dir
const testDir = join(tmpdir(), `cc-history-test-${Date.now()}`);
mkdirSync(testDir, { recursive: true });
vi.mock('electron', () => ({ app: { getPath: () => testDir } }));

const { appendHistory, getHistory, deleteHistoryEntry, exportHistoryMarkdown } =
  await import('../electron/history-store');

const makeEntry = (id: string, startedAt = Date.now()) => ({
  id,
  startedAt,
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  context: { type: 'text' as const, value: 'some selected text' },
  messages: [
    { role: 'system' as const, content: 'You are helpful.' },
    { role: 'user' as const, content: 'Explain this' },
    { role: 'assistant' as const, content: 'Sure, here is an explanation.' },
  ],
});

beforeEach(() => {
  const file = join(testDir, 'contextchat-history.json');
  if (existsSync(file)) rmSync(file);
});

describe('appendHistory', () => {
  it('creates the file and saves the first entry', () => {
    appendHistory(makeEntry('1'));
    const entries = getHistory();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('1');
  });

  it('appends multiple entries, newest first', () => {
    appendHistory(makeEntry('1', 1000));
    appendHistory(makeEntry('2', 2000));
    const entries = getHistory();
    expect(entries[0].id).toBe('2');
    expect(entries[1].id).toBe('1');
  });

  it('prunes to 500 entries when limit is exceeded', () => {
    for (let i = 0; i < 501; i++) appendHistory(makeEntry(`e${i}`, i));
    const entries = getHistory();
    expect(entries).toHaveLength(500);
    expect(entries[0].id).toBe('e500'); // newest kept
  });
});

describe('deleteHistoryEntry', () => {
  it('removes the entry with the given id', () => {
    appendHistory(makeEntry('del-me'));
    appendHistory(makeEntry('keep-me'));
    deleteHistoryEntry('del-me');
    const entries = getHistory();
    expect(entries.find(e => e.id === 'del-me')).toBeUndefined();
    expect(entries.find(e => e.id === 'keep-me')).toBeDefined();
  });
});

describe('exportHistoryMarkdown', () => {
  it('returns a non-empty markdown string with conversation content', () => {
    appendHistory(makeEntry('exp-1'));
    const md = exportHistoryMarkdown();
    expect(md).toContain('# ContextChat History Export');
    expect(md).toContain('Explain this');
    expect(md).toContain('Sure, here is an explanation.');
    expect(md).toContain('openai');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `npm test -- tests/history-store.test.ts`
Expected: FAIL — `Cannot find module '../electron/history-store'`

---

## Task 8: Implement `electron/history-store.ts`

**Files:**
- Create: `electron/history-store.ts`

- [ ] **Step 1: Create `electron/history-store.ts`**

```ts
import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HistoryEntry } from '../src/shared/types';

const MAX_ENTRIES = 500;

const getFilePath = (): string => join(app.getPath('userData'), 'contextchat-history.json');

const readFile = (): HistoryEntry[] => {
  const path = getFilePath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as HistoryEntry[];
  } catch {
    return [];
  }
};

const writeFile = (entries: HistoryEntry[]): void => {
  writeFileSync(getFilePath(), JSON.stringify(entries, null, 2), 'utf8');
};

export const appendHistory = (entry: HistoryEntry): void => {
  let entries = readFile();
  entries = [entry, ...entries.filter(e => e.id !== entry.id)];
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
  writeFile(entries);
};

export const getHistory = (): HistoryEntry[] => readFile();

export const deleteHistoryEntry = (id: string): void => {
  const entries = readFile().filter(e => e.id !== id);
  writeFile(entries);
};

export const exportHistoryMarkdown = (): string => {
  const entries = readFile();
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    '# ContextChat History Export',
    `Generated: ${date}`,
    '',
  ];
  for (const entry of entries) {
    const dt = new Date(entry.startedAt).toLocaleString();
    lines.push('---', '', `## Conversation — ${dt}`);
    lines.push(`**Provider:** ${entry.provider} · **Model:** ${entry.model}`);
    if (entry.context.type === 'text') {
      const preview = entry.context.value.slice(0, 80);
      lines.push(`**Context:** [selected text: "${preview}${entry.context.value.length > 80 ? '...' : ''}"]`);
    } else {
      lines.push('**Context:** [screenshot]');
    }
    lines.push('');
    for (const msg of entry.messages) {
      if (msg.role === 'system') continue;
      const label = msg.role === 'user' ? '**You:**' : '**Assistant:**';
      lines.push(`${label} ${msg.content}`, '');
    }
  }
  return lines.join('\n');
};
```

- [ ] **Step 2: Run tests — confirm they pass**

Run: `npm test -- tests/history-store.test.ts`
Expected: 5 tests PASS

- [ ] **Step 3: Verify full build**

Run: `npm run build`
Expected: Build succeeds — all imports resolved.

- [ ] **Step 4: Commit**

```bash
git add electron/history-store.ts tests/history-store.test.ts
git commit -m "feat: add history store with append, delete, prune, and markdown export"
```

---

## Task 9: Update Tray with History Menu Item

**Files:**
- Modify: `electron/tray.ts`

- [ ] **Step 1: Replace `electron/tray.ts`**

```ts
import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';
import { showSettings, showHistory } from './windows';

let tray: Tray | null = null;

export const createTray = (): Tray => {
  const iconPath = join(process.env.NODE_ENV === 'development'
    ? join(process.cwd(), 'resources', 'tray-icon.png')
    : join(process.resourcesPath, 'tray-icon.png'));
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('ContextChat');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Settings', click: () => showSettings() },
    { label: 'Open History', click: () => showHistory() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showSettings());
  return tray;
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add electron/tray.ts
git commit -m "feat: add Open History item to tray menu"
```

---

## Task 10: Add History Window HTML Entry

**Files:**
- Create: `history.html`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Create `history.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ContextChat History</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/history/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Add `history` input to `electron.vite.config.ts`**

Replace the file:

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      lib: { entry: 'electron/main.ts' },
      rollupOptions: {
        external: ['uiohook-napi', '@nut-tree-fork/nut-js', 'electron-store']
      }
    }
  },
  preload: {
    build: {
      lib: { entry: 'electron/preload.ts' }
    }
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: {
      rollupOptions: {
        input: {
          panel: resolve(__dirname, 'index.html'),
          settings: resolve(__dirname, 'settings.html'),
          toast: resolve(__dirname, 'toast.html'),
          icon: resolve(__dirname, 'icon.html'),
          history: resolve(__dirname, 'history.html'),
        }
      }
    }
  }
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (history entry compiles even before the React component exists — Vite will error on missing module in next step, not here).

- [ ] **Step 4: Commit**

```bash
git add history.html electron.vite.config.ts
git commit -m "feat: add history.html entry point and register in vite config"
```

---

## Task 11: Build History UI Window

**Files:**
- Create: `src/history/main.tsx`
- Create: `src/history/History.tsx`

- [ ] **Step 1: Create `src/history/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { History } from './History';
import '../panel/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <History />
  </React.StrictMode>
);
```

- [ ] **Step 2: Create `src/history/History.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import type { HistoryEntry, Message } from '../shared/types';

export const History: React.FC = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await window.cc.invoke(window.cc.channels.HISTORY_GET);
    setEntries(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    await window.cc.invoke(window.cc.channels.HISTORY_DELETE, { id });
    setEntries(prev => prev.filter(e => e.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const handleExport = async () => {
    const markdown = await window.cc.invoke(window.cc.channels.HISTORY_EXPORT);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `contextchat-history-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const preview = (entry: HistoryEntry): string => {
    const first = entry.messages.find(m => m.role === 'user');
    const text = first?.content ?? entry.context.value;
    return text.slice(0, 60) + (text.length > 60 ? '…' : '');
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-white/60 text-sm">Loading…</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white text-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-white/10">
        <span className="font-semibold">History ({entries.length})</span>
        <button
          onClick={handleExport}
          disabled={entries.length === 0}
          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs"
        >
          Export All
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: entry list */}
        <div className="w-60 flex-shrink-0 border-r border-white/10 overflow-y-auto">
          {entries.length === 0 && (
            <div className="p-4 text-white/40 text-xs">No history yet</div>
          )}
          {entries.map(e => (
            <button
              key={e.id}
              onClick={() => setSelected(e)}
              className={`w-full text-left px-3 py-2 border-b border-white/5 hover:bg-white/5 ${selected?.id === e.id ? 'bg-white/10' : ''}`}
            >
              <div className="text-xs text-white/50 mb-0.5">{formatDate(e.startedAt)}</div>
              <div className="text-xs font-medium text-blue-400 mb-0.5">{e.provider} · {e.model}</div>
              <div className="text-xs text-white/70 truncate">{preview(e)}</div>
            </button>
          ))}
        </div>

        {/* Right: conversation detail */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selected ? (
            <div className="text-white/30 text-xs mt-8 text-center">Select a conversation</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-white/50">{formatDate(selected.startedAt)}</div>
                  <div className="text-xs text-blue-400">{selected.provider} · {selected.model}</div>
                </div>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-400/30 hover:border-red-300/50"
                >
                  Delete
                </button>
              </div>

              {selected.context.type === 'text' && (
                <div className="bg-white/5 rounded p-2 text-xs text-white/60 border-l-2 border-blue-500 italic">
                  "{selected.context.value.slice(0, 120)}{selected.context.value.length > 120 ? '…' : ''}"
                </div>
              )}

              {selected.messages.filter(m => m.role !== 'system').map((msg: Message, i: number) => (
                <div
                  key={i}
                  className={`rounded p-3 text-sm ${msg.role === 'user' ? 'bg-blue-600/20 border border-blue-500/20' : 'bg-white/5 border border-white/10'}`}
                >
                  <div className="text-xs text-white/40 mb-1">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                  <div className="whitespace-pre-wrap text-white/90">{msg.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with all 5 HTML entries compiled.

- [ ] **Step 4: Commit**

```bash
git add src/history/main.tsx src/history/History.tsx
git commit -m "feat: add History window with list, detail, delete, and export"
```

---

## Task 12: Redesign Settings with Provider Picker and Dynamic Models

**Files:**
- Modify: `src/settings/Settings.tsx`

- [ ] **Step 1: Replace `src/settings/Settings.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import type { Settings as S, HardwareInfo } from '../shared/types';

interface ModelInfo { name: string; }

const PROVIDER_LABELS = { ollama: 'Ollama (Local)', openai: 'OpenAI', anthropic: 'Anthropic' };

const validateKey = (provider: string, key: string): string | null => {
  if (provider === 'openai' && key && !key.startsWith('sk-')) return 'OpenAI keys must start with sk-';
  if (provider === 'anthropic' && key && !key.startsWith('sk-ant-')) return 'Anthropic keys must start with sk-ant-';
  return null;
};

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<S | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [fetchSuccess, setFetchSuccess] = useState('');
  const [keyError, setKeyError] = useState('');

  useEffect(() => {
    window.cc.invoke(window.cc.channels.SETTINGS_GET).then(setSettings);
    window.cc.invoke(window.cc.channels.HARDWARE_INFO).then(setHw);
  }, []);

  const update = async (patch: Partial<S>) => {
    const next = await window.cc.invoke(window.cc.channels.SETTINGS_SET, patch);
    setSettings(next);
    // Re-validate key on provider change
    if (patch.provider) {
      const key = patch.provider === 'openai' ? next.openaiApiKey : next.anthropicApiKey;
      setKeyError(validateKey(patch.provider, key) ?? '');
      setModels([]);
      setFetchError('');
      setFetchSuccess('');
    }
  };

  const handleKeyChange = (field: 'openaiApiKey' | 'anthropicApiKey', value: string) => {
    const provider = field === 'openaiApiKey' ? 'openai' : 'anthropic';
    setKeyError(validateKey(provider, value) ?? '');
    update({ [field]: value });
  };

  const fetchModels = async () => {
    if (!settings) return;
    setFetchError('');
    setFetchSuccess('');
    setModels([]);
    try {
      const list = await window.cc.invoke(window.cc.channels.MODELS_LIST, {
        provider: settings.provider,
        apiKey: settings.provider === 'openai' ? settings.openaiApiKey : settings.anthropicApiKey,
        ollamaUrl: settings.ollamaUrl,
      });
      setModels(list);
      setFetchSuccess(`${list.length} model${list.length !== 1 ? 's' : ''} found`);
    } catch (e: any) {
      setFetchError(e.message ?? 'Failed to fetch models');
    }
  };

  if (!settings || !hw) return <div className="p-4 text-sm">Loading…</div>;

  const currentKey = settings.provider === 'openai' ? settings.openaiApiKey : settings.anthropicApiKey;

  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-4 text-sm">
      <h1 className="text-xl font-semibold">ContextChat Settings</h1>

      <section className="frosted p-3 rounded">
        <div className="text-xs uppercase text-white/60">Hardware</div>
        <div>Detected RAM: <strong>{hw.totalRamGb} GB</strong></div>
        <div className="text-white/80 mt-1 text-xs">
          Recommended: <code>{hw.recommendedTextModel}</code> (text), <code>{hw.recommendedVisionModel}</code> (vision)
        </div>
      </section>

      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase text-white/60">AI Provider</span>
        <select
          value={settings.provider}
          onChange={(e) => update({ provider: e.target.value as S['provider'] })}
          className="bg-white/10 rounded px-2 py-1"
        >
          {(Object.keys(PROVIDER_LABELS) as S['provider'][]).map(p => (
            <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
          ))}
        </select>
      </label>

      {settings.provider === 'ollama' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-white/60">Ollama URL</span>
          <input
            value={settings.ollamaUrl}
            onChange={(e) => update({ ollamaUrl: e.target.value })}
            className="bg-white/10 rounded px-2 py-1"
          />
        </label>
      )}

      {settings.provider !== 'ollama' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-white/60">
            {settings.provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key
          </span>
          <input
            type="password"
            value={currentKey}
            onChange={(e) => handleKeyChange(
              settings.provider === 'openai' ? 'openaiApiKey' : 'anthropicApiKey',
              e.target.value
            )}
            placeholder={settings.provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            className="bg-white/10 rounded px-2 py-1"
          />
          {keyError && <div className="text-red-400 text-xs">{keyError}</div>}
        </label>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            onClick={fetchModels}
            className="px-3 py-1 rounded bg-blue-600/70 hover:bg-blue-600 text-xs"
          >
            Fetch Models
          </button>
          {fetchSuccess && <span className="text-green-400 text-xs">{fetchSuccess}</span>}
          {fetchError && <span className="text-red-400 text-xs">{fetchError}</span>}
        </div>

        {models.length > 0 && (
          <label className="flex flex-col gap-1 mt-2">
            <span className="text-xs uppercase text-white/60">Select Model</span>
            <select
              value={settings.selectedModel}
              onChange={(e) => update({ selectedModel: e.target.value })}
              className="bg-white/10 rounded px-2 py-1"
            >
              <option value="">(use recommendation)</option>
              {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.launchAtStartup}
          onChange={(e) => update({ launchAtStartup: e.target.checked })}
        />
        <span>Launch at Windows startup</span>
      </label>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/settings/Settings.tsx
git commit -m "feat: redesign settings with provider picker, API key validation, and dynamic model fetch"
```

---

## Task 13: Update Panel with Abort Button and Provider-Aware Sends

**Files:**
- Modify: `src/panel/Panel.tsx`
- Modify: `src/panel/ModelSelector.tsx`

- [ ] **Step 1: Replace `src/panel/Panel.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import type { Message } from '../shared/types';
import { ContextPreview } from './ContextPreview';
import { ActionButtons } from './ActionButtons';
import { ChatHistory } from './ChatHistory';
import { ResponseStream } from './ResponseStream';
import { ModelSelector } from './ModelSelector';

export const Panel: React.FC = () => {
  const [contextText, setContextText] = useState<string>('');
  const [contextImage, setContextImage] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [model, setModel] = useState('');
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const offText = window.cc.on(window.cc.channels.CONTEXT_TEXT, (t: string) => { setContextText(t); setContextImage(''); });
    const offImg  = window.cc.on(window.cc.channels.CONTEXT_IMAGE, (b: string) => { setContextImage(b); setContextText(''); });
    const offTok  = window.cc.on(window.cc.channels.CHAT_TOKEN, (p: { delta: string }) => setStreamBuffer((s) => s + p.delta));
    const offDone = window.cc.on(window.cc.channels.CHAT_DONE, () => {
      setStreaming(false);
      setStreamBuffer((buf) => {
        if (buf) setMessages((m) => [...m, { role: 'assistant', content: buf }]);
        return '';
      });
    });
    const offErr = window.cc.on(window.cc.channels.CHAT_ERROR, (p: { message: string }) => {
      setStreaming(false);
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${p.message}` }]);
      setStreamBuffer('');
    });
    window.cc.invoke(window.cc.channels.HARDWARE_INFO).then((hw) => setModel(hw.recommendedTextModel));
    return () => { offText(); offImg(); offTok(); offDone(); offErr(); };
  }, []);

  const send = (prompt: string) => {
    if (streaming || !prompt.trim() || !model) return;
    const userMsg: Message = contextImage
      ? { role: 'user', content: prompt, image: contextImage }
      : { role: 'user', content: prompt };
    setMessages((m) => [...m, userMsg]);
    setStreaming(true);
    setStreamBuffer('');
    setInput('');
    window.cc.invoke(window.cc.channels.CHAT_SEND, { userMessage: userMsg, model });
  };

  const abort = () => {
    window.cc.send(window.cc.channels.ABORT_CHAT);
    setStreaming(false);
  };

  const close = () => window.cc.send(window.cc.channels.PANEL_CLOSE);

  return (
    <div className="frosted h-screen w-screen flex flex-col p-3 gap-2">
      <div className="drag-region flex justify-between items-center text-xs text-white/70 select-none">
        <span>ContextChat</span>
        <button onClick={close} className="no-drag px-2 hover:text-white">✕</button>
      </div>
      <ContextPreview text={contextText} image={contextImage} />
      <div className="border-t border-white/10" />
      <ActionButtons onPick={send} disabled={streaming || !model} />
      <div className="flex-1 overflow-y-auto no-drag">
        <ChatHistory messages={messages} />
        {streaming && <ResponseStream text={streamBuffer} streaming />}
      </div>
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
        placeholder="Ask a follow-up..."
        rows={2}
        className="no-drag bg-white/5 rounded p-2 text-sm resize-none focus:outline-none focus:bg-white/10"
      />
      <div className="flex justify-between items-center no-drag">
        <ModelSelector value={model} onChange={setModel} />
        <div className="flex gap-2">
          {streaming && (
            <button onClick={abort} className="px-3 py-1 rounded bg-red-500/80 hover:bg-red-500 text-xs">
              Stop
            </button>
          )}
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            className="px-3 py-1 rounded bg-blue-500/80 hover:bg-blue-500 disabled:opacity-40 text-xs"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Replace `src/panel/ModelSelector.tsx`**

```tsx
import React, { useEffect, useState } from 'react';

interface ModelInfo { name: string; }

export const ModelSelector: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    window.cc.invoke(window.cc.channels.MODELS_LIST)
      .then((list: ModelInfo[]) => {
        setModels(Array.isArray(list) ? list : []);
        if (!value && list.length > 0) onChange(list[0].name);
      })
      .catch(() => setModels([]));
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/10 text-xs rounded px-2 py-1 no-drag"
    >
      {models.length === 0 && <option value="">no models</option>}
      {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
    </select>
  );
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass (ai-client + history-store + existing conversation/hardware tests).

- [ ] **Step 5: Commit**

```bash
git add src/panel/Panel.tsx src/panel/ModelSelector.tsx
git commit -m "feat: add Stop button to panel and update ModelSelector for multi-provider"
```

---

## Task 14: End-to-End Verification

- [ ] **Step 1: Start the app in dev mode**

Run: `npm run dev`
Expected: Electron app starts, tray icon appears.

- [ ] **Step 2: Layer 1 — Provider abstraction**

1. Right-click tray → Open Settings
2. Change provider to **OpenAI**, enter a valid `sk-...` key
3. Click **Fetch Models** → should show GPT model list with success count
4. Change provider to **Anthropic**, enter a valid `sk-ant-...` key  
5. Click **Fetch Models** → shows exactly 3 Claude models without network call
6. Change provider to **Ollama** → click **Fetch Models** → shows local models
7. Send a chat with each provider — responses stream correctly

- [ ] **Step 3: Layer 1 — Validation**

1. Enter `badkey` for OpenAI → inline error "OpenAI keys must start with sk-"
2. Enter `badkey` for Anthropic → inline error "Anthropic keys must start with sk-ant-"

- [ ] **Step 4: Layer 2 — Abort**

1. Start a chat → "Stop" button appears
2. Click "Stop" → streaming halts, partial response shown, Send re-enables

- [ ] **Step 5: Layer 2 — Keyboard shortcut**

1. Copy some text to clipboard
2. Press `Ctrl+Shift+Space` → panel opens with that text as context

- [ ] **Step 6: Layer 3 — History persistence**

1. Complete a chat conversation
2. Close and restart the app (`Ctrl+C` then `npm run dev`)
3. Open History from tray → conversation appears in list

- [ ] **Step 7: Layer 4 — History UI**

1. Click a conversation in the left list → full thread appears on right
2. Click **Delete** → entry removed from list
3. Click **Export All** → `.md` file downloads with all conversations
4. Open the `.md` file → valid markdown with conversation content

- [ ] **Step 8: Run full test suite one final time**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "chore: complete ContextChat Desktop implementation — all 4 layers verified"
```

---

## Verification Checklist

### Layer 1 — Provider abstraction
- [ ] `npm run build` passes after replacing `ollama-client.ts` with `ai-client.ts`
- [ ] Settings window shows provider dropdown (Ollama / OpenAI / Anthropic)
- [ ] Selecting OpenAI + valid key → "Fetch Models" returns real GPT model list
- [ ] Selecting Anthropic → shows 3 hardcoded Claude models
- [ ] Selecting Ollama → fetches from configured URL
- [ ] Chat works end-to-end with each of the 3 providers
- [ ] Wrong API key format shows inline validation error immediately

### Layer 2 — Polish / robustness
- [ ] "Stop" button appears during streaming and aborts mid-stream
- [ ] Panel re-enables Send after abort, shows partial response
- [ ] `Ctrl+Shift+Space` opens panel when clipboard has text
- [ ] Ollama unreachable shows specific error message in panel
- [ ] Settings "Fetch Models" shows success count or error inline

### Layer 3 — History persistence
- [ ] `contextchat-history.json` created in userData dir after first complete conversation
- [ ] File contains correct entry after chat completes
- [ ] File survives app restart (entries still present)
- [ ] 500-entry cap: adding entry 501 removes oldest

### Layer 4 — History UI + export
- [ ] "Open History" in tray menu opens history window
- [ ] Past conversations listed with date + preview
- [ ] Clicking a conversation shows full thread on right
- [ ] "Export All" triggers file download
- [ ] Downloaded `.md` file is valid markdown with all conversations
- [ ] "Delete" removes entry from list and from disk immediately
