# Voice Input — Design Spec
Date: 2026-05-07

## Overview

Add voice input to ContextChat using local Whisper (whisper.cpp) for speech-to-text. No TTS — AI responses remain as text. Two entry points: a mic button in the existing chat panel, and a dedicated voice overlay window triggered by `Ctrl+Shift+V`.

---

## Architecture

### New files
- `electron/whisper-server.ts` — manages whisper.cpp binary, model download, transcription requests
- `electron/audio-recorder.ts` — IPC handlers for receiving audio from renderer and returning transcript
- `src/panel/VoiceButton.tsx` — mic button component for chat panel
- `src/voice/main.tsx` — React entry for voice overlay window
- `src/voice/VoiceOverlay.tsx` — minimal floating overlay with pulsing mic UI
- `voice.html` — HTML entry for voice overlay window

### Modified files
- `electron/ipc-channels.ts` — add TRANSCRIBE, WHISPER_READY channels
- `electron/main.ts` — register audio IPC handlers, register `Ctrl+Shift+V` shortcut, open voice overlay
- `electron/windows.ts` — add `showVoiceOverlay()`, `hideVoiceOverlay()`
- `electron.vite.config.ts` — add `voice` renderer input
- `src/panel/Panel.tsx` — embed VoiceButton next to text input

---

## Components

### whisper-server.ts
- On startup: checks for `whisper.cpp` binary in `%APPDATA%/contextchat-desktop/whisper/`
- If missing: downloads `whisper-bin-win-x64.zip` from whisper.cpp GitHub releases and unzips
- Checks for `ggml-base.en.bin` model in same dir; if missing, downloads from Hugging Face (~142MB)
- Exposes `transcribe(wavPath: string): Promise<string>` — spawns whisper.cpp as child process, parses stdout transcript
- Emits `ready` event when binary + model are both present

### audio-recorder.ts (IPC handlers)
- `TRANSCRIBE` handler: receives `{ wavBase64: string }`, writes to temp file, calls `whisper.transcribe()`, returns `{ text: string }`
- `WHISPER_READY` handler: returns `{ ready: boolean }` — renderer uses this to show/hide mic button

### VoiceButton.tsx
- Mic icon button rendered in chat panel next to send button
- On click: starts recording via `MediaRecorder` (Web Audio API, WebM/Opus → converted to WAV)
- Shows pulsing red dot while recording
- Silence detection: stops recording automatically after 1.5s of silence (RMS < threshold)
- On stop: sends WAV base64 to `TRANSCRIBE` IPC, inserts returned text into the input field
- Disabled if whisper not ready

### VoiceOverlay.tsx
- Small always-on-top floating window (300×120px), no frame, transparent background
- Shows: pulsing mic circle, "Listening…" text, elapsed time
- Same recording logic as VoiceButton
- On transcript received: closes overlay, opens chat panel, sends message directly to AI
- `Esc` key cancels recording

---

## Long Audio Handling

Whisper.cpp has a 30-second native limit per chunk. We handle this with:
- **Silence-based auto-stop**: RMS energy monitored every 100ms; if below threshold for 1.5s, recording stops and is sent for transcription. This keeps chunks well under 30s for normal speech.
- **Hard cap**: if recording exceeds 28 seconds with no silence, auto-stop and transcribe anyway
- For meeting listener (future): chunked streaming with overlap will be handled separately

---

## Model & Binary Management

- Binary: `whisper-bin-win-x64` from whisper.cpp GitHub releases (pre-built, ~3MB)
- Model: `ggml-base.en.bin` from Hugging Face (~142MB)
- Storage: `app.getPath('userData')/whisper/`
- Download happens on first use, with progress sent to renderer via `whisper:download:progress` push channel
- Dashboard Setup tab gains a "Whisper" step showing download status

---

## IPC Additions

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `whisper:ready` | invoke | Returns `{ ready: boolean, downloading: boolean }` |
| `whisper:transcribe` | invoke | Receives `{ wavBase64: string }`, returns `{ text: string }` |
| `whisper:download:progress` | main→renderer push | `{ percent: number, stage: 'binary' \| 'model' }` |

---

## Out of Scope
- Text-to-speech (TTS) — AI responses are text only
- Meeting/system audio capture — separate future feature
- Multi-language support — English only (`ggml-base.en`)
- Real-time streaming transcription — send full recording after stop
