# Persistent Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add long-term memory to ContextChat so the AI automatically extracts facts from conversations and injects relevant ones into future prompts.

**Architecture:** After each conversation closes, a lightweight LLM pass extracts 0–5 facts and stores them as vector embeddings in a local LanceDB database. On each new chat message, the user's message is embedded and the top-3 semantically similar memories are retrieved and prepended to the system prompt — never mutating the stored conversation object. A Memories tab in the dashboard lets the user view, add, and delete memories; a count badge in the panel header shows how many memories are active for the current conversation.

**Tech Stack:** `@lancedb/lancedb`, `apache-arrow`, `nomic-embed-text` (Ollama), Electron IPC, React, TypeScript, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `electron/memory-store.ts` | Create | LanceDB init, insert, search, list, delete |
| `electron/memory-extractor.ts` | Create | LLM-based fact extraction from a Conversation |
| `electron/ipc-channels.ts` | Modify | Add 4 memory channels |
| `electron/main.ts` | Modify | Wire extraction on PANEL_CLOSE, injection on CHAT_SEND |
| `electron/electron.vite.config.ts` | Modify | Mark `@lancedb/lancedb` as external |
| `src/shared/types.ts` | Modify | Add Memory interface |
| `src/panel/Panel.tsx` | Modify | Memory count badge in header |
| `src/dashboard/tabs/Memories.tsx` | Create | Memory management UI |
| `src/dashboard/Dashboard.tsx` | Modify | Add Memories tab |
| `package.json` | Modify | Add @lancedb/lancedb, apache-arrow |
| `tests/memory-store.test.ts` | Create | Unit tests for store |
| `tests/memory-extractor.test.ts` | Create | Unit tests for extractor |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Install packages**

```powershell
cd "c:\Users\vinay\contextchat-desktop"
npm install @lancedb/lancedb apache-arrow
```

Expected: packages added to `node_modules/`, no errors.

- [ ] **Step 2: Mark lancedb as external in vite config**

Open `electron.vite.config.ts`. The current `external` array is:
```typescript
external: ['electron', 'uiohook-napi', '@nut-tree-fork/nut-js'],
```

Change it to:
```typescript
external: ['electron', 'uiohook-napi', '@nut-tree-fork/nut-js', '@lancedb/lancedb', 'apache-arrow'],
```

- [ ] **Step 3: Verify build still works**

```powershell
npm run build
```

Expected: build completes with no errors. LanceDB should not appear in the bundle output.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json electron.vite.config.ts
git commit -m "chore: add lancedb and apache-arrow dependencies"
```

---

## Task 2: Add Memory Type to Shared Types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Read the current types file**

Open `src/shared/types.ts`. It currently exports: `Role`, `Message`, `Conversation`, `Settings`, `OllamaModel`, `HardwareInfo`, `QuickAction`, `HistoryEntry`.

- [ ] **Step 2: Add Memory interface**

Add this after the `HistoryEntry` interface:

```typescript
export interface Memory {
  id: string;
  content: string;
  type: 'fact' | 'preference' | 'project';
  source: 'auto' | 'manual';
  createdAt: number;
}
```

- [ ] **Step 3: Commit**

```powershell
git add src/shared/types.ts
git commit -m "feat: add Memory interface to shared types"
```

---

## Task 3: Build memory-store.ts

**Files:**
- Create: `electron/memory-store.ts`
- Create: `tests/memory-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/memory-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { initMemoryStore, insertMemory, listAllMemories, deleteMemory, searchMemories } from '../electron/memory-store';

const TEST_DB_PATH = join(process.cwd(), 'tests', '_test_memories');

// Mock Ollama embed call
vi.mock('../electron/memory-store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../electron/memory-store')>();
  return {
    ...mod,
    // Override embed to return a fixed vector so tests don't need Ollama
    _embedText: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
  };
});

describe('memory-store', () => {
  beforeEach(async () => {
    await initMemoryStore(TEST_DB_PATH);
  });

  afterEach(() => {
    if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH, { recursive: true });
  });

  it('inserts and lists a memory', async () => {
    await insertMemory({ content: 'User prefers TypeScript', type: 'preference', source: 'auto', createdAt: Date.now() }, TEST_DB_PATH);
    const list = await listAllMemories(TEST_DB_PATH);
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe('User prefers TypeScript');
  });

  it('deletes a memory by id', async () => {
    const mem = await insertMemory({ content: 'User likes dark mode', type: 'preference', source: 'manual', createdAt: Date.now() }, TEST_DB_PATH);
    await deleteMemory(mem.id, TEST_DB_PATH);
    const list = await listAllMemories(TEST_DB_PATH);
    expect(list).toHaveLength(0);
  });

  it('returns empty array when no memories exist', async () => {
    const list = await listAllMemories(TEST_DB_PATH);
    expect(list).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
npm run test -- tests/memory-store.test.ts
```

Expected: FAIL — `Cannot find module '../electron/memory-store'`

- [ ] **Step 3: Implement memory-store.ts**

Create `electron/memory-store.ts`:

```typescript
import { connect } from '@lancedb/lancedb';
import { app } from 'electron';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Memory } from '../src/shared/types';

const TABLE_NAME = 'memories';
const EMBED_DIM = 768;

const getDbPath = (override?: string): string =>
  override ?? join(app.getPath('userData'), 'contextchat-memories');

export const _embedText = async (text: string, ollamaUrl: string): Promise<number[]> => {
  const res = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Embed failed: HTTP ${res.status}`);
  const json = await res.json() as { embedding: number[] };
  return json.embedding;
};

export const initMemoryStore = async (dbPathOverride?: string): Promise<void> => {
  const db = await connect(getDbPath(dbPathOverride));
  const tables = await db.tableNames();
  if (!tables.includes(TABLE_NAME)) {
    await db.createTable(TABLE_NAME, [
      { id: uuid(), content: '', type: 'fact', source: 'auto', createdAt: 0, vector: new Array(EMBED_DIM).fill(0) },
    ]);
    const table = await db.openTable(TABLE_NAME);
    await table.delete('content = \'\'');
  }
};

export const insertMemory = async (
  entry: Omit<Memory, 'id'>,
  dbPathOverride?: string,
  ollamaUrl = 'http://localhost:11434',
): Promise<Memory> => {
  const id = uuid();
  let vector: number[];
  try {
    vector = await _embedText(entry.content, ollamaUrl);
  } catch {
    vector = new Array(EMBED_DIM).fill(0);
  }
  const db = await connect(getDbPath(dbPathOverride));
  const table = await db.openTable(TABLE_NAME);
  await table.add([{ id, ...entry, vector }]);
  return { id, ...entry };
};

export const listAllMemories = async (dbPathOverride?: string): Promise<Memory[]> => {
  try {
    const db = await connect(getDbPath(dbPathOverride));
    const table = await db.openTable(TABLE_NAME);
    const rows = await table.query().toArray();
    return rows.map(r => ({ id: r.id, content: r.content, type: r.type, source: r.source, createdAt: r.createdAt }));
  } catch {
    return [];
  }
};

export const deleteMemory = async (id: string, dbPathOverride?: string): Promise<void> => {
  const db = await connect(getDbPath(dbPathOverride));
  const table = await db.openTable(TABLE_NAME);
  await table.delete(`id = '${id}'`);
};

export const searchMemories = async (
  query: string,
  ollamaUrl = 'http://localhost:11434',
  topK = 3,
  dbPathOverride?: string,
): Promise<Memory[]> => {
  try {
    const vector = await _embedText(query, ollamaUrl);
    const db = await connect(getDbPath(dbPathOverride));
    const table = await db.openTable(TABLE_NAME);
    const rows = await table.vectorSearch(vector).limit(topK).toArray();
    return rows.map(r => ({ id: r.id, content: r.content, type: r.type, source: r.source, createdAt: r.createdAt }));
  } catch {
    return [];
  }
};
```

- [ ] **Step 4: Run tests — expect pass**

```powershell
npm run test -- tests/memory-store.test.ts
```

Expected: PASS all 3 tests.

- [ ] **Step 5: Commit**

```powershell
git add electron/memory-store.ts tests/memory-store.test.ts
git commit -m "feat: add memory-store with LanceDB vector storage"
```

---

## Task 4: Build memory-extractor.ts

**Files:**
- Create: `electron/memory-extractor.ts`
- Create: `tests/memory-extractor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/memory-extractor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { extractMemories } from '../electron/memory-extractor';
import type { Conversation } from '../src/shared/types';

const makeConversation = (messages: { role: string; content: string }[]): Conversation => ({
  id: 'test-id',
  context: { type: 'text', value: 'test' },
  model: 'llama3',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    ...messages,
  ] as any,
});

describe('memory-extractor', () => {
  it('returns empty array for short conversations', async () => {
    const conv = makeConversation([{ role: 'user', content: 'Hi' }]);
    const result = await extractMemories(conv, 'http://localhost:11434');
    expect(result).toEqual([]);
  });

  it('parses valid JSON array from LLM response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: '[{"content":"User prefers TypeScript","type":"preference"}]' },
      }),
    }) as any;
    const conv = makeConversation([
      { role: 'user', content: 'I prefer TypeScript' },
      { role: 'assistant', content: 'Got it.' },
      { role: 'user', content: 'Always use strict types' },
    ]);
    const result = await extractMemories(conv, 'http://localhost:11434');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('User prefers TypeScript');
    expect(result[0].type).toBe('preference');
    expect(result[0].source).toBe('auto');
  });

  it('returns empty array on JSON parse failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'not json at all' } }),
    }) as any;
    const conv = makeConversation([
      { role: 'user', content: 'Hello there' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Help me code' },
    ]);
    const result = await extractMemories(conv, 'http://localhost:11434');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
npm run test -- tests/memory-extractor.test.ts
```

Expected: FAIL — `Cannot find module '../electron/memory-extractor'`

- [ ] **Step 3: Implement memory-extractor.ts**

Create `electron/memory-extractor.ts`:

```typescript
import type { Conversation, Memory } from '../src/shared/types';

const EXTRACTION_PROMPT = `You are a memory extraction assistant.
Given the conversation below, extract 0-5 factual statements about the user: their preferences, projects, skills, or goals.
Output ONLY a valid JSON array, no other text. Format:
[{"content": "User prefers TypeScript over JavaScript", "type": "preference"}]
Types must be one of: fact, preference, project.
If nothing is worth remembering, output: []`;

export const extractMemories = async (
  conversation: Conversation,
  ollamaUrl: string,
): Promise<Omit<Memory, 'id'>[]> => {
  const userMessages = conversation.messages.filter(m => m.role === 'user');
  if (userMessages.length < 2) return [];

  const transcript = conversation.messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  try {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        stream: false,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: transcript },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const json = await res.json() as { message: { content: string } };
    const raw = json.message.content.trim();

    const parsed = JSON.parse(raw) as { content: string; type: string }[];
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed
      .filter(f => typeof f.content === 'string' && f.content.split(' ').length >= 4)
      .map(f => ({
        content: f.content,
        type: (['fact', 'preference', 'project'].includes(f.type) ? f.type : 'fact') as Memory['type'],
        source: 'auto' as const,
        createdAt: now,
      }));
  } catch {
    return [];
  }
};
```

- [ ] **Step 4: Run tests — expect pass**

```powershell
npm run test -- tests/memory-extractor.test.ts
```

Expected: PASS all 3 tests.

- [ ] **Step 5: Commit**

```powershell
git add electron/memory-extractor.ts tests/memory-extractor.test.ts
git commit -m "feat: add memory-extractor for LLM-based fact extraction"
```

---

## Task 5: Add IPC Channels

**Files:**
- Modify: `electron/ipc-channels.ts`

- [ ] **Step 1: Read ipc-channels.ts**

Open `electron/ipc-channels.ts`. It exports a const object `IPC` with all channel strings.

- [ ] **Step 2: Add memory channels**

Add these four entries to the `IPC` object:

```typescript
MEMORY_LIST:   'memory:list',
MEMORY_DELETE: 'memory:delete',
MEMORY_ADD:    'memory:add',
MEMORY_COUNT:  'memory:count',
```

- [ ] **Step 3: Commit**

```powershell
git add electron/ipc-channels.ts
git commit -m "feat: add memory IPC channel definitions"
```

---

## Task 6: Wire Memory into main.ts

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add imports at top of main.ts**

After the existing imports, add:

```typescript
import { initMemoryStore, insertMemory, searchMemories, listAllMemories, deleteMemory } from './memory-store';
import { extractMemories } from './memory-extractor';
```

- [ ] **Step 2: Init memory store in main()**

Inside `const main = async (): Promise<void> => {`, after `await app.whenReady();`, add:

```typescript
await initMemoryStore().catch(err => console.warn('Memory store init failed:', err));
```

- [ ] **Step 3: Register memory IPC handlers**

Inside `registerIpc()`, after the existing `ipcMain.handle(IPC.HISTORY_EXPORT, ...)` block, add:

```typescript
ipcMain.handle(IPC.MEMORY_LIST, () => listAllMemories());
ipcMain.handle(IPC.MEMORY_COUNT, async () => {
  const all = await listAllMemories();
  return all.length;
});
ipcMain.handle(IPC.MEMORY_DELETE, (_e, id: string) => deleteMemory(id));
ipcMain.handle(IPC.MEMORY_ADD, (_e, payload: { content: string; type: Memory['type'] }) =>
  insertMemory({ content: payload.content, type: payload.type, source: 'manual', createdAt: Date.now() },
    undefined,
    getSettings().ollamaUrl,
  )
);
```

Also add `import type { Memory } from '../src/shared/types';` to the existing type imports at the top.

- [ ] **Step 4: Extract memories on PANEL_CLOSE**

Find the existing `ipcMain.on(IPC.PANEL_CLOSE, ...)` handler:

```typescript
ipcMain.on(IPC.PANEL_CLOSE, () => { hidePanel(); currentConversation = null; currentAbortController?.abort(); currentAbortController = null; });
```

Replace with:

```typescript
ipcMain.on(IPC.PANEL_CLOSE, () => {
  hidePanel();
  currentAbortController?.abort();
  currentAbortController = null;
  if (currentConversation) {
    const conv = currentConversation;
    const { ollamaUrl } = getSettings();
    extractMemories(conv, ollamaUrl)
      .then(facts => Promise.all(facts.map(f => insertMemory(f, undefined, ollamaUrl))))
      .catch(err => console.warn('Memory extraction failed:', err));
  }
  currentConversation = null;
});
```

- [ ] **Step 5: Inject memories on CHAT_SEND**

Find the `ipcMain.handle(IPC.CHAT_SEND, async (e, payload) => {` handler. After `currentConversation = { ...currentConversation, model: payload.model };` and before `const settings = getSettings();`, add:

```typescript
const memories = await searchMemories(
  payload.userMessage.content as string,
  settings.ollamaUrl,
).catch(() => [] as Memory[]);

const messagesWithMemory = memories.length > 0
  ? currentConversation.messages.map((m, i) =>
      i === 0
        ? { ...m, content: `What you remember about this user:\n${memories.map(mem => `- ${mem.content}`).join('\n')}\n\n${m.content}` }
        : m
    )
  : currentConversation.messages;
```

Then change the `streamChat` call to use `messagesWithMemory`:

```typescript
await streamChat({
  ...
  messages: messagesWithMemory,   // was: currentConversation.messages
  ...
});
```

- [ ] **Step 6: Verify build**

```powershell
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 7: Commit**

```powershell
git add electron/main.ts
git commit -m "feat: wire memory extraction and injection into main process"
```

---

## Task 7: Memory Count Badge in Panel

**Files:**
- Modify: `src/panel/Panel.tsx`

- [ ] **Step 1: Read Panel.tsx**

Open `src/panel/Panel.tsx`. Note the existing state variables and the header/toolbar area.

- [ ] **Step 2: Add activeMemoryCount state**

Add a new state variable near the other state declarations:

```typescript
const [activeMemoryCount, setActiveMemoryCount] = useState(0);
```

- [ ] **Step 3: Fetch memory count when memories are injected**

Inside the `CONTEXT_TEXT` and `CONTEXT_IMAGE` listeners (in the mount `useEffect`), after context is set, add a count fetch. Find where `setContextText` or `setContextImage` is called and add after each:

```typescript
window.cc.invoke(window.cc.channels.MEMORY_COUNT)
  .then((count: number) => setActiveMemoryCount(count))
  .catch(() => setActiveMemoryCount(0));
```

- [ ] **Step 4: Render the badge in the panel header**

Find the panel header/toolbar JSX (the top bar with the close button). Add this alongside the existing controls:

```tsx
{activeMemoryCount > 0 && (
  <span
    title={`${activeMemoryCount} memories active`}
    style={{ fontSize: 11, color: '#888', marginRight: 6, cursor: 'default' }}
  >
    🧠 {activeMemoryCount}
  </span>
)}
```

- [ ] **Step 5: Commit**

```powershell
git add src/panel/Panel.tsx
git commit -m "feat: add memory count badge to panel header"
```

---

## Task 8: Memories Dashboard Tab

**Files:**
- Create: `src/dashboard/tabs/Memories.tsx`
- Modify: `src/dashboard/Dashboard.tsx`

- [ ] **Step 1: Create Memories.tsx**

Create `src/dashboard/tabs/Memories.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Memory } from '../../shared/types';

export default function Memories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<Memory['type']>('fact');
  const [loading, setLoading] = useState(true);

  const load = () => {
    window.cc.invoke(window.cc.channels.MEMORY_LIST)
      .then((list: Memory[]) => { setMemories(list); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    await window.cc.invoke(window.cc.channels.MEMORY_DELETE, id);
    load();
  };

  const handleAdd = async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    await window.cc.invoke(window.cc.channels.MEMORY_ADD, { content: trimmed, type: newType });
    setNewContent('');
    load();
  };

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading memories...</div>;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          placeholder="Add a memory — e.g. I prefer dark mode"
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <select
          className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
          value={newType}
          onChange={e => setNewType(e.target.value as Memory['type'])}
        >
          <option value="fact">Fact</option>
          <option value="preference">Preference</option>
          <option value="project">Project</option>
        </select>
        <button
          onClick={handleAdd}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Save
        </button>
      </div>

      {memories.length === 0 ? (
        <p className="text-sm text-gray-400">
          No memories yet. Start chatting and the AI will remember what matters.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {memories.sort((a, b) => b.createdAt - a.createdAt).map(m => (
            <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg bg-gray-800 px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-white">{m.content}</span>
                <div className="flex gap-1.5">
                  <span className="rounded px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300">{m.type}</span>
                  <span className="rounded px-1.5 py-0.5 text-xs bg-gray-700 text-gray-400">{m.source}</span>
                  <span className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="mt-0.5 text-xs text-red-400 hover:text-red-300 shrink-0"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add Memories tab to Dashboard.tsx**

Open `src/dashboard/Dashboard.tsx`. Find the existing tab list (tabs like "Home", "Models", "Settings", "How to Use"). Add "Memories" to the tab array and import the component:

```tsx
import Memories from './tabs/Memories';
```

In the tab definitions array, add:
```tsx
{ id: 'memories', label: 'Memories', component: <Memories /> },
```

- [ ] **Step 3: Build and verify**

```powershell
npm run build
```

Expected: clean build. Check `out/renderer/` — `dashboard-*.js` should be present.

- [ ] **Step 4: Commit**

```powershell
git add src/dashboard/tabs/Memories.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add Memories dashboard tab for viewing and managing memories"
```

---

## Task 9: End-to-End Smoke Test

**Files:** None — manual verification only.

- [ ] **Step 1: Pull nomic-embed-text model if not already installed**

Open the app dashboard → Models tab → pull `nomic-embed-text`.

- [ ] **Step 2: Start the app**

```powershell
npm run dev
```

- [ ] **Step 3: Have a conversation**

Select any text on screen → open panel → send 2–3 messages about yourself (e.g. "I'm a CS student at IIIT Delhi building a desktop AI app in TypeScript").

- [ ] **Step 4: Close the panel**

Click the close button. Wait ~5 seconds for extraction to run silently in background.

- [ ] **Step 5: Open dashboard → Memories tab**

Verify 1–3 auto-extracted memories appear. They should describe facts about you from the conversation.

- [ ] **Step 6: Add a manual memory**

Type "I prefer dark mode" → type: Preference → Save. Verify it appears in the list.

- [ ] **Step 7: Delete a memory**

Click Delete on any entry. Verify it disappears.

- [ ] **Step 8: Start a new conversation**

Select new text → open panel → send a message. The 🧠 badge should appear in the panel header with the memory count.

- [ ] **Step 9: Final commit and push**

```powershell
git add -A
git commit -m "feat: complete P0 persistent memory implementation"
git push
```

---

## Self-Review

**Spec coverage check:**
- ✅ LanceDB + nomic-embed-text — Task 1, Task 3
- ✅ Memory interface — Task 2
- ✅ Auto-extraction on PANEL_CLOSE — Task 6 Step 4
- ✅ Injection into system prompt (copy, not mutate) — Task 6 Step 5
- ✅ IPC channels (list, delete, add, count) — Task 5, Task 6 Step 3
- ✅ Panel memory count badge — Task 7
- ✅ Dashboard Memories tab (view, add, delete) — Task 8
- ✅ Error handling (Ollama down → silent skip) — Task 3 Step 3 (`_embedText` catch), Task 4 Step 3 (extractor catch)
- ✅ initMemoryStore called before IPC registration — Task 6 Step 2

**Placeholder scan:** No TBDs, no "handle edge cases", all code blocks present. ✅

**Type consistency:**
- `Memory` interface defined in Task 2, used identically in Tasks 3, 4, 6, 7, 8 ✅
- `insertMemory`, `listAllMemories`, `deleteMemory`, `searchMemories` defined in Task 3, used in Task 6 ✅
- `extractMemories` defined in Task 4, used in Task 6 ✅
- IPC channels `MEMORY_LIST`, `MEMORY_DELETE`, `MEMORY_ADD`, `MEMORY_COUNT` defined in Task 5, used in Tasks 6, 7, 8 ✅
