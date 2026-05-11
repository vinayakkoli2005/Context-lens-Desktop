# ContextChat Dashboard UI — Design Spec
Date: 2026-05-07

## Overview

Add a full dashboard window to ContextChat that serves as the primary UI for both new and returning users. The dashboard is opened from the tray icon or the floating icon logo. It replaces the current minimal Settings window as the main configuration surface.

---

## Architecture

### New files
- `src/dashboard/main.tsx` — React entry for dashboard window
- `src/dashboard/Dashboard.tsx` — root component with tab routing
- `src/dashboard/tabs/Home.tsx`
- `src/dashboard/tabs/Setup.tsx`
- `src/dashboard/tabs/Models.tsx`
- `src/dashboard/tabs/History.tsx` — reuses existing History logic
- `src/dashboard/tabs/HowToUse.tsx`
- `dashboard.html` — HTML entry point (mirrors settings.html pattern)

### Modified files
- `electron/windows.ts` — add `showDashboard()`, update tray click to open dashboard
- `electron/tray.ts` — add "Open Dashboard" menu item
- `electron/main.ts` — add IPC handlers for Ollama status check and model pull
- `electron/ipc-channels.ts` — add new IPC channel constants
- `electron.vite.config.ts` — add `dashboard` to renderer inputs

### IPC additions
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `ollama:status` | invoke | Ping Ollama URL, return `{ ok: boolean, url: string }` |
| `ollama:pull` | invoke | Run `ollama pull <model>`, stream progress tokens back |
| `openai:status` | invoke | Validate OpenAI key, return `{ ok: boolean }` |
| `anthropic:status` | invoke | Validate Anthropic key, return `{ ok: boolean }` |

---

## Tab Designs

### Home Tab
- **Connection status row**: three pills — `Ollama`, `OpenAI`, `Anthropic`. Each pill is green (connected/valid) or red (unreachable/missing key). Checked live on tab mount and on a "Refresh" button click.
- **Active provider + model**: shows currently saved provider and selected model name.
- **Keyboard shortcut reminder**: `Ctrl+Shift+Space` — opens panel from clipboard.
- **Quick actions**: "Go to Setup" button if any connection is red. "Open Models" button always visible.

### Setup Tab
Checklist of 5 steps rendered as cards. Each card has a status icon (✓ done / ⚠ action needed / ○ not started), a title, a short description, and an inline action button where needed.

1. **Permissions** — uiohook global hook active (always granted on Windows, show ✓)
2. **Ollama installed** — link to ollama.com download if not detected
3. **Ollama running** — "Check connection" button pings `ollama:status`; shows "Start Ollama" instructions if down
4. **Provider configured** — inline provider selector + API key input (mirrors Settings.tsx logic)
5. **Model selected** — dropdown of available models for active provider

On first launch (no `selectedModel` saved), dashboard opens to Setup tab automatically. Otherwise opens to Home.

### Models Tab
Three sub-tabs: **Ollama | OpenAI | Anthropic**

**Ollama sub-tab:**
- Lists currently pulled models (from `/api/tags`)
- "Pull model" input + button — calls `ollama:pull`, shows streaming progress line
- Shows recommended model for this machine's RAM
- "Set as text default" / "Set as vision default" buttons per model row

**OpenAI sub-tab:**
- Connection status pill
- Lists GPT models available for the saved API key (fetched via `/v1/models`)
- "Set as default" button per model

**Anthropic sub-tab:**
- Connection status pill
- Static list of supported models (Claude 4 Opus/Sonnet/Haiku — no API call needed)
- "Set as default" button per model

### History Tab
Reuses existing `src/history/History.tsx` component directly. No new logic needed — just embed it inside the dashboard tab shell.

### How to Use Tab
Static content, no IPC. Sections:
1. **Text selection** — select text anywhere → floating icon appears → click → panel opens
2. **Screenshot** — copy screenshot to clipboard → toast appears → click Accept → panel opens
3. **Clipboard shortcut** — `Ctrl+Shift+Space` opens panel with current clipboard text
4. **Chat panel** — how to send messages, abort, close
5. **Ollama setup** — `ollama serve` to run temporarily; Windows Task Scheduler for permanent background service (with the PowerShell command)
6. **Choosing a model** — guidance on model sizes vs RAM

---

## Window Properties
- Size: 720×560, resizable
- Title: "ContextChat"
- `skipTaskbar: false` — appears in taskbar (unlike panel/icon/toast)
- `alwaysOnTop: false`
- Same preload as other windows

---

## First-Launch Detection
In `electron/store.ts`, add a `hasCompletedSetup: boolean` field (default `false`). Set to `true` when the user reaches step 5 (model selected) in Setup. Dashboard reads this to decide which tab to open first.

---

## Error Handling
- All IPC handlers for status checks use try/catch and return `{ ok: false, error: string }` — never throw to renderer
- `ollama:pull` streams progress lines; on error sends a final `{ done: true, error: string }` token
- OpenAI/Anthropic status checks use a lightweight API call (list models or validate key) with a 5-second timeout

---

## Out of Scope
- No authentication flow beyond API key input
- No usage analytics or telemetry
- No multi-account support
- No dark/light theme toggle (uses existing frosted glass style)
