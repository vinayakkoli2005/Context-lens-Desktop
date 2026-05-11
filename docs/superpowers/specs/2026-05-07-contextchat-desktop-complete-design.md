# ContextChat Desktop — Complete App Design

**Date:** 2026-05-07  
**Approach:** Option A — Incremental layers  
**Status:** Approved

---

## Goals

Turn the working MVP (Ollama-only, session-only chat) into a fully shippable desktop app with:
1. Multi-provider AI (Ollama + OpenAI + Anthropic) with dynamic model listing
2. Polish and robustness (abort, keyboard shortcut, error states, settings validation)
3. Conversation history persisted to disk (JSON)
4. History UI window + markdown export

---

## Architecture

### What stays unchanged
- `electron/selection-monitor.ts` — uIOhook global mouse listener
- `electron/clipboard-watcher.ts` — screenshot detection via clipboard polling
- `electron/windows.ts` — 4 BrowserWindow definitions (icon, panel, toast, settings); gains `showHistory`
- `electron/conversation.ts` — rolling-window context builder
- `electron/preload.ts` — IPC bridge

### What changes
| File | Change |
|------|--------|
| `electron/ollama-client.ts` | Replaced by `electron/ai-client.ts` (multi-provider) |
| `electron/store.ts` | Gains provider + API key fields |
| `electron/ipc-channels.ts` | Gains `MODELS_LIST`, `ABORT_CHAT`, `HISTORY_GET`, `HISTORY_DELETE`, `HISTORY_EXPORT` |
| `electron/main.ts` | New IPC handlers, AbortController per request, global shortcut |
| `electron/tray.ts` | Adds "Open History" menu item |
| `src/settings/Settings.tsx` | Full redesign: provider picker, API key, dynamic model list |
| `src/panel/Panel.tsx` | Abort button during streaming |
| `src/panel/ModelSelector.tsx` | Provider-aware, shows fetched model list |
| `src/shared/types.ts` | Extends `Settings` type |

### What's new
| File | Purpose |
|------|---------|
| `electron/ai-client.ts` | Unified streaming chat + model listing for all 3 providers |
| `electron/history-store.ts` | Read/write/prune JSON history file on disk |
| `src/history/History.tsx` | History window React component |
| `src/history/main.tsx` | History window entry point |
| `history.html` | History window HTML entry |

---

## Layer 1: Provider Abstraction

### `electron/ai-client.ts` interface
```ts
export interface StreamChatArgs {
  provider: 'ollama' | 'openai' | 'anthropic'
  apiKey: string
  model: string
  ollamaUrl: string
  messages: Message[]
  onToken: (delta: string) => void
  signal?: AbortSignal
}
export const streamChat = async (args: StreamChatArgs): Promise<void>
export const listModels = async (provider, apiKey, ollamaUrl): Promise<{ name: string }[]>
```

### Model listing per provider
- **Ollama:** `GET {ollamaUrl}/api/tags` — returns `data.models[].name`
- **OpenAI:** `GET https://api.openai.com/v1/models` with Bearer auth — filter to names starting with `gpt-`, sort alphabetically
- **Anthropic:** No public list endpoint — return hardcoded array:
  `['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']`

### Settings schema additions
```ts
interface Settings {
  // existing
  ollamaUrl: string
  selectedModel: string
  launchAtStartup: boolean
  // new
  provider: 'ollama' | 'openai' | 'anthropic'   // default: 'ollama'
  openaiApiKey: string                            // default: ''
  anthropicApiKey: string                         // default: ''
}
```

API keys live in electron-store (user data dir, not bundled). Never logged.

### IPC changes for provider support
- `MODELS_LIST` — renamed from existing, now takes `{ provider, apiKey, ollamaUrl }` payload
- `CHAT_SEND` payload gains `provider` and `apiKey` fields
- Main creates one `AbortController` per `CHAT_SEND`, stores it; `ABORT_CHAT` calls `.abort()`

---

## Layer 2: Polish & Robustness

### Abort mid-stream
- Panel shows "Stop" button (red, replaces Send during streaming)
- Clicking sends `ABORT_CHAT` IPC → main calls `abortController.abort()`
- `streamChat` catches `AbortError`, resolves cleanly — panel receives `CHAT_DONE` with partial content

### Global keyboard shortcut
- `Ctrl+Shift+Space` registered via `globalShortcut.register` in `main.ts`
- Behavior: if panel is not open → read clipboard text → if non-empty, open panel with that text as context
- Unregistered on `app.willQuit`

### Settings validation
- API key field: inline error shown immediately if format is wrong
  - OpenAI keys must start with `sk-`
  - Anthropic keys must start with `sk-ant-`
- "Fetch Models" button: calls `MODELS_LIST` with current key, shows success count or error inline
- Ollama URL: validated as a URL, error if `MODELS_LIST` fails

### Error states in panel
- Network error → `CHAT_ERROR` → panel shows red error banner with message
- Empty model selected → panel shows warning before send
- Ollama not running → specific "Ollama not reachable" message with URL hint

---

## Layer 3: History Persistence

### `electron/history-store.ts`
```ts
interface HistoryEntry {
  id: string           // uuid
  startedAt: number    // timestamp ms
  provider: string
  model: string
  context: { type: 'text' | 'image'; value: string }
  messages: Message[]  // full thread including system
}

// File location: app.getPath('userData')/contextchat-history.json
// Max entries: 500 (oldest pruned when exceeded)

export const appendHistory = (entry: HistoryEntry): void
export const getHistory = (): HistoryEntry[]
export const deleteHistoryEntry = (id: string): void
export const exportHistoryMarkdown = (): string
```

### When conversations are saved
- On `CHAT_DONE` (not on abort or error) — only complete conversations saved
- Main passes `currentConversation` + provider/model to `appendHistory`

### Export format
```markdown
# ContextChat History Export
Generated: 2026-05-07

---

## Conversation — 2026-05-07 14:32
**Provider:** OpenAI · **Model:** gpt-4o-mini  
**Context:** [selected text: "Lorem ipsum..."]

**You:** Summarize this  
**Assistant:** Lorem ipsum is placeholder text...

---
```

---

## Layer 4: History UI

### History window
- Size: 680×520, resizable, standard frame (not frameless)
- Left panel (240px): scrollable list of past conversations
  - Each row: date + time, provider badge, first user message (truncated to 60 chars)
  - Selected row highlighted
- Right panel: full thread display for selected conversation
  - System message hidden from display
  - User/assistant bubbles, same style as panel
- Toolbar (top right): "Export All" button, "Delete" button for selected

### Tray menu update
```
Open Settings
Open History      ← new
─────────────
Quit
```

### History window IPC
- `HISTORY_GET` → returns `HistoryEntry[]`
- `HISTORY_DELETE` → `{ id: string }` → deletes entry, returns updated list
- `HISTORY_EXPORT` → returns markdown string → renderer triggers save dialog via `ipcRenderer.invoke` + `dialog.showSaveDialog`

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
- [ ] "Export All" opens native save dialog
- [ ] Exported `.md` file is valid markdown with all conversations
- [ ] "Delete" removes entry from list and from disk immediately
