# Persistent Memory — Design Spec

**Date:** 2026-05-12  
**Feature:** P0 — Persistent Memory  
**Status:** Approved for implementation

---

## Goal

Give the AI assistant long-term memory across conversations. After each conversation, key facts are automatically extracted and stored locally. On the next conversation, relevant memories are retrieved and injected into the system prompt — so the AI already knows who the user is and what they care about.

---

## Architecture Overview

```
Conversation ends (PANEL_CLOSE)
        ↓
memory-extractor.ts — LLM pass: extract facts → JSON array
        ↓
memory-store.ts — embed each fact via nomic-embed-text (Ollama)
        ↓
LanceDB table: userData/contextchat-memories/
        ↓
Next conversation: user sends first message (CHAT_SEND)
        ↓
memory-store.ts — embed message → cosine search → top-3 memories
        ↓
Injected into system prompt as bullet list
```

---

## Data Model

### Memory entry (shared type)

```typescript
// src/shared/types.ts — add this interface
interface Memory {
  id: string;                          // uuid
  content: string;                     // "User prefers TypeScript over JavaScript"
  type: 'fact' | 'preference' | 'project';
  source: 'auto' | 'manual';           // extracted vs user-pinned
  createdAt: number;                   // Date.now()
}
```

LanceDB stores `content`, `type`, `source`, `createdAt`, `id`, plus a `vector: Float32Array` column (embedding). The `vector` field is internal to `memory-store.ts` and never exposed to the renderer.

---

## Components

### `electron/memory-store.ts`
Single responsibility: LanceDB read/write/search.

```typescript
// Public API:
initMemoryStore(): Promise<void>
insertMemory(entry: Omit<Memory, 'id'>): Promise<Memory>
searchMemories(query: string, topK?: number): Promise<Memory[]>  // topK default 3
listAllMemories(): Promise<Memory[]>
deleteMemory(id: string): Promise<void>
```

- DB path: `app.getPath('userData')/contextchat-memories/`
- Embedding model: `nomic-embed-text` via Ollama (`POST /api/embeddings`)
- Similarity: cosine (LanceDB default)
- If Ollama is not running or embedding fails: log warning, skip silently (never crash)

### `electron/memory-extractor.ts`
Single responsibility: extract structured facts from a completed conversation.

```typescript
// Public API:
extractMemories(conversation: Conversation, ollamaUrl: string): Promise<Omit<Memory, 'id'>[]>
```

- Calls Ollama (non-streaming) with a system prompt instructing it to output a JSON array of facts
- Extraction prompt format:
  ```
  You are a memory extraction assistant. Given the conversation below,
  extract 0-5 factual statements about the user (preferences, projects,
  skills, goals). Output ONLY a JSON array like:
  [{"content": "...", "type": "fact|preference|project"}]
  If nothing worth remembering, output: []
  ```
- Parses JSON response with try/catch — on parse failure returns `[]`
- Filters out generic/trivial facts (fewer than 8 words, questions, greetings)
- Only runs if conversation has at least 2 user messages (avoids extracting from 1-line chats)

### `electron/ipc-channels.ts` — new channels

```typescript
MEMORY_LIST:   'memory:list'    // handle → Memory[]
MEMORY_DELETE: 'memory:delete'  // handle(id: string) → void
MEMORY_ADD:    'memory:add'     // handle(content: string, type) → Memory
MEMORY_COUNT:  'memory:count'   // handle → number  (for panel badge)
```

### `electron/main.ts` — integration points

**On PANEL_CLOSE** (after conversation ends):
```typescript
// fire-and-forget, never block UI
if (currentConversation && currentConversation.messages.length >= 3) {
  extractMemories(currentConversation, settings.ollamaUrl)
    .then(facts => Promise.all(facts.map(f => insertMemory(f))))
    .catch(err => console.warn('Memory extraction failed:', err));
}
```

**On CHAT_SEND** (inject into system prompt):
```typescript
const memories = await searchMemories(payload.userMessage.content);
if (memories.length > 0) {
  const memoryBlock = 'What you remember about this user:\n' +
    memories.map(m => `- ${m.content}`).join('\n');
  // prepend to a COPY of messages — never mutate currentConversation directly
  // pass augmented messages array to streamChat(), not stored in currentConversation
}
```

### `src/shared/types.ts`
Add `Memory` interface (as above).

### `src/panel/Panel.tsx` — memory indicator
Small memory icon (🧠 or brain SVG) in the panel header showing count of injected memories for the current conversation. Clicking it opens the dashboard Memories tab. Count = 0 means no indicator shown.

### `src/dashboard/tabs/Memories.tsx` — new dashboard tab
- List all memories (most recent first)
- Each row: content text, type badge (fact/preference/project), source badge (auto/manual), date, delete button
- "Add memory" input at top: text field + type selector + Save button (calls `MEMORY_ADD`)
- Empty state: "No memories yet. Start chatting and I'll remember what matters."

### `src/dashboard/Dashboard.tsx`
Add "Memories" to the tab list alongside existing tabs.

---

## System Prompt Injection Format

Injected as a prefix to the existing system message content:

```
What you remember about this user:
- User is building a desktop app called ContextChat using Electron and React
- User prefers TypeScript over JavaScript
- User's name is Vinayak

[existing system prompt: "You are a helpful AI assistant. The user has selected the following text: ..."]
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Ollama not running during extraction | Skip silently, log warning |
| Ollama not running during search | Skip injection, conversation proceeds normally |
| LanceDB init fails | Log error, memory feature disabled for session |
| JSON parse failure in extractor | Return `[]`, log warning |
| nomic-embed-text not installed | Log warning, prompt user in dashboard to pull it |

---

## What This Does NOT Do

- No memory from image/screenshot conversations (text-only extraction)
- No cloud sync — all data in `userData/` folder
- No memory sharing between different OS users
- No automatic memory editing — only add or delete, never update in place
- No memory of which model was used

---

## Dependencies

- `vectordb` (LanceDB) — `npm install vectordb` — file-based, zero server
- `apache-arrow` — peer dep of LanceDB
- `nomic-embed-text` Ollama model — pulled via existing model manager in dashboard
- No new renderer dependencies

---

## File Summary

| File | Action |
|---|---|
| `electron/memory-store.ts` | Create |
| `electron/memory-extractor.ts` | Create |
| `electron/ipc-channels.ts` | Modify — add 4 channels |
| `electron/main.ts` | Modify — wire extraction + injection |
| `electron/electron.vite.config.ts` | Modify — mark `vectordb` as external |
| `src/shared/types.ts` | Modify — add Memory interface |
| `src/panel/Panel.tsx` | Modify — add memory count indicator |
| `src/dashboard/tabs/Memories.tsx` | Create |
| `src/dashboard/Dashboard.tsx` | Modify — add Memories tab |
| `package.json` | Modify — add vectordb, apache-arrow |
