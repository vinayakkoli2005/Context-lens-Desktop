# ContextChat — Feature Ideas & Roadmap

A collection of feature ideas to expand ContextChat from a local AI assistant into a powerful, context-aware productivity tool.

---

## 1. Internet Access for Local LLMs

**Problem:** Local models (Ollama, etc.) have a knowledge cutoff and cannot access real-time information.

**Core Idea:** Give local models the ability to search the web and retrieve current information before answering.

### Implementation Approaches

- **Tool-calling layer** — Intercept user messages, detect when a web search would help (news, current events, prices, docs), run a search via SerpAPI / Brave Search API / DuckDuckGo, inject the top results as context into the prompt.
- **RAG over live web** — Fetch page content from URLs, chunk it, embed it on-the-fly, and do a vector similarity search before constructing the LLM prompt.
- **Playwright/Puppeteer scraping** — For richer pages (SPAs), use a headless browser to extract the rendered text.

### Refined Features

- Auto-detect queries that need fresh data ("latest", "today", "price of", "news about")
- Show inline citations with source URLs in the response
- Cache recent searches (TTL ~10 min) to avoid redundant API calls
- Optional: let the user pin specific sites to always search (e.g. their company wiki)
- Privacy mode: disable internet access entirely for sensitive conversations

---

## 2. Google Meet Live Transcription + AI Interview Helper

**Problem:** During video calls (especially technical interviews), users need real-time assistance without switching context.

**Core Idea:** Capture system audio, transcribe it live, detect questions directed at the user, and surface AI-generated answers on demand.

### Implementation Approaches

- **System audio capture** — Use `node-record-lpcm16` or Electron's `desktopCapturer` to tap into loopback audio (what's playing through speakers, including Meet audio).
- **Transcription engine** — Run OpenAI Whisper locally (via `whisper.cpp` or `faster-whisper`) for privacy, or optionally use Whisper API for speed.
- **Speaker diarization** — Distinguish "interviewer" from "me" using silence gaps and speaker-change detection.
- **Question detection** — Use a lightweight LLM pass or regex heuristics to identify when a question was asked.

### Refined Features

- Floating overlay window (always-on-top, semi-transparent) showing the live transcript
- "AI Help" button appears when a question is detected — one click generates a concise answer
- Keyboard shortcut to summon the answer without touching the mouse
- "Preparation mode" — paste a job description + resume, the AI tailors answers to your profile
- Post-call: auto-generate a summary of questions asked + your answers + suggested improvements
- Works for any meeting tool (Zoom, Teams, Google Meet) since it captures system audio

### Privacy Considerations

- Transcription runs fully locally with Whisper.cpp — audio never leaves the machine
- Overlay can be quickly hidden with a hotkey to avoid detection in screen shares

---

## 3. Persistent Memory / Long-Term Context

**Problem:** Every conversation starts fresh — the AI has no memory of past interactions, user preferences, or ongoing projects.

**Core Idea:** Build a memory layer that persists facts, preferences, and summaries across sessions, injected into the system prompt when relevant.

### Implementation Approaches

- **Structured memory store** — JSON file (or SQLite) with typed memory entries: `{ type: 'fact' | 'preference' | 'project', content, createdAt, lastAccessed }`. Already have `history-store.ts` as a starting point.
- **Semantic retrieval** — Embed memories using a local embedding model (e.g. `nomic-embed-text` via Ollama), store vectors in a local vector DB (LanceDB, Hnswlib), retrieve top-k relevant memories per conversation.
- **Auto-extraction** — After each conversation, run a lightweight LLM pass to extract key facts ("user prefers TypeScript", "working on project X") and store them.

### Refined Features

- Memory dashboard in the sidebar — view, edit, delete stored memories
- "Remember this" button in chat to explicitly save something
- "Forget this" command to remove sensitive entries
- Memory categories: Personal, Work Projects, Preferences, Technical Facts
- Time-decay: memories accessed less recently get lower retrieval weight
- Memory export/import for backup

---

## 4. RAG (Retrieval-Augmented Generation)

**Problem:** Users often need to query large documents, codebases, or knowledge bases that won't fit in a single LLM context window.

**Core Idea:** Index local files/folders, embed them into a vector store, and automatically pull in the most relevant chunks when the user asks a question.

### Implementation Approaches

- **Document ingestion pipeline** — Watch a user-configured folder, parse files (PDF via `pdf-parse`, DOCX via `mammoth`, code via plain text), chunk into ~512 token segments, embed with local model.
- **Vector store** — LanceDB (zero-server, file-based, great for Electron) or Chroma (requires local server). LanceDB is the better fit for a desktop app.
- **Query-time retrieval** — Embed the user's question, cosine-similarity search against the vector store, inject top-k chunks into the prompt as context.

### Refined Features

- "Add to knowledge base" button in the UI (drag-and-drop files)
- Source citations in responses: "Based on `docs/api-spec.md` section 3..."
- Codebase mode: index a git repo, ask questions about the code
- Web page ingestion: paste a URL, the app fetches and indexes it
- Re-indexing: auto-detect file changes via `chokidar` and update embeddings incrementally
- Collection management: separate knowledge bases per project

---

## 5. Additional Ideas

### 5a. Clipboard Intelligence
- Monitor clipboard changes; when the user copies code or text, proactively offer relevant AI actions (explain, refactor, translate, summarize)
- Show a subtle toast notification with 2–3 suggested actions

### 5b. Multi-Modal Screenshot Analysis Pipeline
- Batch screenshot capture (record every N seconds) to build a "what I was working on" timeline
- Ask questions about past screenshots: "What was I debugging at 3pm yesterday?"

### 5c. Prompt Library
- User-curated collection of reusable prompts (e.g. "Code review", "Email draft", "Meeting summary")
- Quick-access via keyboard shortcut — type `/` in chat to search the library
- Community prompt sharing via a simple JSON file export/import

### 5d. Multi-Provider Routing
- Auto-route queries to the best model based on task type:
  - Code → DeepSeek Coder / CodeLlama
  - Vision → LLaVA / Moondream
  - Fast response → Gemma / Phi-3 Mini
  - Complex reasoning → Llama 3 / Qwen

### 5e. Conversation Branching
- Let users fork a conversation at any message to explore different directions
- Visual tree view of conversation branches in the history window

### 5f. Scheduled Context Digests
- Morning briefing: summarize your clipboard history, open tabs (via browser extension), and recent files
- End-of-day: summarize what you worked on, generate a standup update

### 5g. Browser Extension Integration
- Companion browser extension that sends selected web text directly to ContextChat
- "Ask AI about this page" — one-click to send the full page content as context

### 5h. Voice Input / Output
- Push-to-talk (existing `voice.html` already present — expand it)
- TTS responses using a local model (`piper-tts`) or system speech synthesis
- Wake word detection: say "Hey Context" to open the panel hands-free

---

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---|---|---|---|
| Persistent Memory | High | Medium | **P0** |
| RAG (local files) | High | High | **P1** |
| Internet Access | High | Medium | **P1** |
| Prompt Library | Medium | Low | **P1** |
| Multi-Provider Routing | Medium | Low | **P1** |
| Google Meet Transcription | High | Very High | **P2** |
| Clipboard Intelligence | Medium | Low | **P2** |
| Voice Input/Output | Medium | Medium | **P2** |
| Browser Extension | Medium | High | **P3** |
| Conversation Branching | Low | High | **P3** |
| Scheduled Digests | Low | Medium | **P3** |
