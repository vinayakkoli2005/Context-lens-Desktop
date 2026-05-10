# Context Lens Desktop

> A system-wide AI assistant for Windows that works wherever you do — select text, capture a screenshot, or speak, and get instant AI responses without leaving your current app.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-32-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## What Is This?

Context Lens sits silently in your system tray. The moment you select text anywhere on your screen — in a browser, PDF, terminal, or any app — a small icon appears. Click it, and a sleek chat panel opens with that text already loaded as context. Ask the AI anything about it.

Same for screenshots: take one, and the AI can analyze the image directly. No copy-paste, no tab switching, no friction.

---

## Features

| Feature | Description |
|---|---|
| **Global Text Selection** | Detects text selected anywhere on screen using native OS hooks |
| **Screenshot Analysis** | Capture your screen and chat with a vision-capable AI about what it sees |
| **Voice Input** | Speak your question — Whisper ASR transcribes it locally, nothing leaves your device |
| **Multi-Provider LLM** | Works with Ollama (local), OpenAI (GPT-4), and Anthropic (Claude) |
| **Hardware-Aware Models** | Automatically recommends the best local model based on your system RAM |
| **Conversation History** | Every conversation saved locally, exportable to Markdown |
| **Model Manager** | Download and manage Ollama models from inside the app |
| **Always Private** | Local inference with Ollama means your data never has to leave your machine |

---

## Demo

```
1. Select any text on screen
         ↓
2. Click the floating icon that appears
         ↓
3. Chat panel opens with your text as context
         ↓
4. Ask anything — "Explain this", "Summarize", "Rewrite formally"
         ↓
5. Get a streamed AI response in real time
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 32 |
| UI | React 18 + TypeScript 5.6 + Tailwind CSS |
| Build | electron-vite + Vite 5 |
| Local AI | Ollama (NDJSON streaming) |
| Cloud AI | OpenAI API (SSE) · Anthropic API (event stream) |
| OS integration | uiohook-napi (global hooks) · @nut-tree-fork/nut-js |
| Voice | Whisper ASR (lazy-loaded, runs locally) |
| Storage | electron-store (settings) · JSON file (history) |

---

## Getting Started

### Prerequisites

- **Node.js** 20+ — [nodejs.org](https://nodejs.org)
- **Ollama** (for local models) — [ollama.com](https://ollama.com) *(optional if using OpenAI/Anthropic)*

### Installation

```bash
# Clone the repo
git clone https://github.com/vinayakkoli2005/Context-lens-Desktop.git
cd Context-lens-Desktop

# Install dependencies
npm install
```

### Running in Development

> **Important:** Run from PowerShell or CMD — not Git Bash. Electron's native module interception does not work correctly in MSYS2/Git Bash.

```powershell
npm run dev
```

The app will start and appear in your system tray.

### Building for Production

```powershell
npm run build        # Compile all bundles
npm run package      # Build Windows installer (.exe)
```

Output is in the `release/` folder.

---

## Configuration

Open the dashboard from the tray icon → **Settings** tab.

| Setting | Description |
|---|---|
| **Provider** | Choose Ollama, OpenAI, or Anthropic |
| **Ollama URL** | Default: `http://localhost:11434` |
| **OpenAI API Key** | Your OpenAI key for GPT-4 access |
| **Anthropic API Key** | Your Anthropic key for Claude access |
| **Model** | Select or download any model |
| **Launch at Startup** | Start with Windows automatically |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Shift + Space` | Open chat with clipboard content |
| `Ctrl + Shift + V` | Open voice input overlay |
| Click tray icon | Open dashboard |

---

## Architecture

Context Lens uses a **multi-process Electron architecture** with 8 renderer windows communicating through a typed IPC layer.

```
┌─────────────────────────────────────────────────┐
│                  Main Process                   │
│  ┌────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Selection  │  │   IPC    │  │  AI Client  │ │
│  │  Monitor   │  │ Registry │  │  (stream)   │ │
│  └────────────┘  └──────────┘  └─────────────┘ │
└────────────────────┬────────────────────────────┘
                     │ IPC (typed channels)
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌──────────┐
   │  Panel  │  │Dashboard│  │ History  │
   │ (chat)  │  │(settings│  │ (export) │
   └─────────┘  └─────────┘  └──────────┘
        + icon · toast · voice · screenshot btn
```

**Key design decisions:**
- **PANEL_READY handshake** — panel signals main when mounted; main flushes buffered context. Eliminates unreliable `setTimeout` delays.
- **Rolling context window** — keeps last 10 conversation pairs (21 messages max) to manage token budgets automatically.
- **Unified streaming interface** — single `streamChat()` function handles NDJSON, SSE, and Anthropic event streams with `AbortController` support.
- **Hardware-aware selection** — detects system RAM and maps it to an appropriate local model tier automatically.

---

## Project Structure

```
Context-lens-Desktop/
├── electron/               # Main process (Node.js / Electron)
│   ├── main.ts             # App entry, IPC registration, lifecycle
│   ├── windows.ts          # All BrowserWindow creation & management
│   ├── ai-client.ts        # LLM streaming (Ollama, OpenAI, Anthropic)
│   ├── selection-monitor.ts# Global text selection detection
│   ├── hardware-detector.ts# RAM-based model recommendation
│   ├── history-store.ts    # Conversation persistence
│   ├── whisper-server.ts   # Local ASR setup & transcription
│   └── store.ts            # electron-store settings wrapper
├── src/
│   ├── panel/              # Chat panel UI (main feature window)
│   ├── dashboard/          # Settings, model manager, status
│   ├── history/            # Conversation history viewer
│   ├── settings/           # Provider configuration
│   ├── voice/              # Voice input overlay
│   ├── icon/               # Floating selection icon
│   ├── toast/              # Screenshot notification
│   ├── screenshotbtn/      # Draggable screenshot trigger
│   └── shared/types.ts     # Shared TypeScript interfaces
├── resources/              # App icons
├── electron.vite.config.ts # Build configuration
└── IDEAS.md                # Planned features roadmap
```

---

## Planned Features

See [IDEAS.md](IDEAS.md) for the full roadmap. Highlights:

- **Local RAG** — index your own documents with LanceDB + local embeddings, query them in chat
- **Persistent Memory** — remember facts, preferences, and projects across conversations
- **Internet Access** — give local models real-time web search capability
- **Google Meet Transcription** — live ASR overlay with AI interview assistance

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push and open a PR

---

## License

MIT © [Vinayak Koli](https://github.com/vinayakkoli2005)
