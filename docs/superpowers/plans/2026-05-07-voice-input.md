# Voice Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local Whisper-based voice input to ContextChat — a mic button in the chat panel and a dedicated `Ctrl+Shift+V` voice overlay window, both transcribing speech to text using whisper.cpp running locally.

**Architecture:** `electron/whisper-server.ts` manages the whisper.cpp binary and model download, spawns transcription as a child process, and exposes a `transcribe(wavPath)` function. Renderer components record audio via Web Audio API, convert to WAV, send base64 to main via IPC, and receive the transcript back. The voice overlay is a separate frameless window that auto-sends the transcript as a chat message.

**Tech Stack:** whisper.cpp (pre-built Windows binary), Web Audio API + MediaRecorder, Node.js child_process, electron IPC, React, TypeScript, Tailwind CSS

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `electron/whisper-server.ts` | Binary/model download, transcribe() function |
| Create | `electron/audio-ipc.ts` | IPC handlers for TRANSCRIBE, WHISPER_READY, download progress |
| Create | `src/panel/VoiceButton.tsx` | Mic button + recording logic for chat panel |
| Create | `src/voice/VoiceOverlay.tsx` | Standalone voice overlay component |
| Create | `src/voice/main.tsx` | React entry for voice overlay window |
| Create | `voice.html` | HTML entry for voice overlay window |
| Modify | `electron/ipc-channels.ts` | Add WHISPER_READY, WHISPER_TRANSCRIBE, WHISPER_DOWNLOAD_PROGRESS |
| Modify | `electron/main.ts` | Import audio-ipc, register Ctrl+Shift+V shortcut, open voice overlay |
| Modify | `electron/windows.ts` | Add showVoiceOverlay(), hideVoiceOverlay() |
| Modify | `electron.vite.config.ts` | Add voice renderer input |
| Modify | `src/panel/Panel.tsx` | Embed VoiceButton next to Send button |

---

## Task 1: Add IPC channels

**Files:**
- Modify: `electron/ipc-channels.ts`

- [ ] **Step 1: Add whisper channels**

Open `electron/ipc-channels.ts` and add to the `IPC` object before the closing `} as const`:

```typescript
  // voice / whisper
  WHISPER_READY: 'whisper:ready',
  WHISPER_TRANSCRIBE: 'whisper:transcribe',
  WHISPER_DOWNLOAD_PROGRESS: 'whisper:download:progress',
```

- [ ] **Step 2: Verify build**

```powershell
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```powershell
git add electron/ipc-channels.ts
git commit -m "feat: add whisper IPC channel constants"
```

---

## Task 2: whisper-server.ts — binary/model management and transcription

**Files:**
- Create: `electron/whisper-server.ts`

- [ ] **Step 1: Create the file**

```typescript
import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import https from 'node:https';

const WHISPER_DIR = join(app.getPath('userData'), 'whisper');
const BINARY_PATH = join(WHISPER_DIR, 'whisper-cli.exe');
const MODEL_PATH = join(WHISPER_DIR, 'ggml-base.en.bin');

const BINARY_URL = 'https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-bin-x64.zip';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';

export type DownloadProgressCallback = (stage: 'binary' | 'model', percent: number) => void;

const downloadFile = (url: string, dest: string, onProgress: (percent: number) => void): Promise<void> =>
  new Promise((resolve, reject) => {
    const follow = (u: string) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location!);
          return;
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let received = 0;
        const stream = createWriteStream(dest);
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total) onProgress(Math.round((received / total) * 100));
          stream.write(chunk);
        });
        res.on('end', () => { stream.end(); resolve(); });
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });

const extractZip = async (zipPath: string, destDir: string): Promise<void> => {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
};

export const ensureWhisper = async (onProgress: DownloadProgressCallback): Promise<void> => {
  mkdirSync(WHISPER_DIR, { recursive: true });

  if (!existsSync(BINARY_PATH)) {
    const zipPath = join(WHISPER_DIR, 'whisper-bin.zip');
    await downloadFile(BINARY_URL, zipPath, (p) => onProgress('binary', p));
    await extractZip(zipPath, WHISPER_DIR);
    // whisper.cpp zip extracts as whisper-cli.exe or main.exe depending on version
    // rename if needed
    const altPath = join(WHISPER_DIR, 'main.exe');
    if (!existsSync(BINARY_PATH) && existsSync(altPath)) {
      require('node:fs').renameSync(altPath, BINARY_PATH);
    }
  }

  if (!existsSync(MODEL_PATH)) {
    await downloadFile(MODEL_URL, MODEL_PATH, (p) => onProgress('model', p));
  }
};

export const isWhisperReady = (): boolean =>
  existsSync(BINARY_PATH) && existsSync(MODEL_PATH);

export const transcribe = (wavPath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const proc = spawn(BINARY_PATH, [
      '-m', MODEL_PATH,
      '-f', wavPath,
      '--no-timestamps',
      '-l', 'en',
      '--output-txt',
      '-',
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`whisper exited ${code}: ${err}`));
      else resolve(out.replace(/\[.*?\]/g, '').trim());
    });
  });
```

- [ ] **Step 2: Install adm-zip (needed for zip extraction)**

```powershell
npm install adm-zip
npm install --save-dev @types/adm-zip
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```powershell
git add electron/whisper-server.ts package.json package-lock.json
git commit -m "feat: add whisper-server for binary/model management and transcription"
```

---

## Task 3: audio-ipc.ts — IPC handlers

**Files:**
- Create: `electron/audio-ipc.ts`

- [ ] **Step 1: Create the file**

```typescript
import { ipcMain, BrowserWindow } from 'electron';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IPC } from './ipc-channels';
import { ensureWhisper, isWhisperReady, transcribe } from './whisper-server';

let ensurePromise: Promise<void> | null = null;

export const registerAudioIpc = (mainWindow: () => BrowserWindow | null): void => {
  ipcMain.handle(IPC.WHISPER_READY, () => ({
    ready: isWhisperReady(),
    downloading: ensurePromise !== null,
  }));

  ipcMain.handle(IPC.WHISPER_TRANSCRIBE, async (_e, { wavBase64 }: { wavBase64: string }) => {
    if (!isWhisperReady()) {
      if (!ensurePromise) {
        ensurePromise = ensureWhisper((stage, percent) => {
          mainWindow()?.webContents.send(IPC.WHISPER_DOWNLOAD_PROGRESS, { stage, percent });
        }).finally(() => { ensurePromise = null; });
      }
      await ensurePromise;
    }
    const wavPath = join(tmpdir(), `cc-voice-${Date.now()}.wav`);
    try {
      writeFileSync(wavPath, Buffer.from(wavBase64, 'base64'));
      const text = await transcribe(wavPath);
      return { text };
    } finally {
      try { unlinkSync(wavPath); } catch { /* ignore */ }
    }
  });
};
```

- [ ] **Step 2: Commit**

```powershell
git add electron/audio-ipc.ts
git commit -m "feat: add audio IPC handlers for whisper transcription"
```

---

## Task 4: Register IPC and shortcut in main.ts

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add import for registerAudioIpc and showVoiceOverlay**

Add to the imports at top of `electron/main.ts`:

```typescript
import { registerAudioIpc } from './audio-ipc';
import { showVoiceOverlay } from './windows';
```

- [ ] **Step 2: Call registerAudioIpc inside registerIpc()**

At the bottom of the `registerIpc()` function body, before the closing `}`:

```typescript
  registerAudioIpc(() => BrowserWindow.getAllWindows()[0] ?? null);
```

- [ ] **Step 3: Register Ctrl+Shift+V shortcut**

In the `main()` function, after the existing `globalShortcut.register` call:

```typescript
  globalShortcut.register('CommandOrControl+Shift+V', () => showVoiceOverlay());
```

- [ ] **Step 4: Verify TypeScript**

```powershell
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```powershell
git add electron/main.ts
git commit -m "feat: register audio IPC and Ctrl+Shift+V voice shortcut in main"
```

---

## Task 5: Add voice overlay window to windows.ts

**Files:**
- Modify: `electron/windows.ts`

- [ ] **Step 1: Add voiceWin variable and showVoiceOverlay / hideVoiceOverlay exports**

At the end of `electron/windows.ts`, after `showDashboard`, add:

```typescript
let voiceWin: BrowserWindow | null = null;

export const showVoiceOverlay = (): BrowserWindow => {
  if (voiceWin && !voiceWin.isDestroyed()) {
    voiceWin.focus();
    return voiceWin;
  }
  const display = screen.getPrimaryDisplay().workAreaSize;
  voiceWin = new BrowserWindow({
    width: 300, height: 120,
    x: Math.round(display.width / 2) - 150,
    y: display.height - 160,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true },
  });
  voiceWin.loadURL(rendererUrl('voice.html'));
  voiceWin.on('closed', () => { voiceWin = null; });
  return voiceWin;
};

export const hideVoiceOverlay = (): void => {
  if (voiceWin && !voiceWin.isDestroyed()) voiceWin.close();
};
```

- [ ] **Step 2: Commit**

```powershell
git add electron/windows.ts
git commit -m "feat: add voice overlay window to windows.ts"
```

---

## Task 6: Add voice HTML entry and vite config

**Files:**
- Create: `voice.html`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Create voice.html**

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Voice</title></head>
<body><div id="root"></div><script type="module" src="/src/voice/main.tsx"></script></body>
</html>
```

- [ ] **Step 2: Add voice to vite config**

In `electron.vite.config.ts`, add `voice` to the renderer inputs object:

```typescript
voice: resolve(__dirname, 'voice.html'),
```

- [ ] **Step 3: Commit**

```powershell
git add voice.html electron.vite.config.ts
git commit -m "feat: add voice HTML entry and register with electron-vite"
```

---

## Task 7: VoiceButton.tsx — mic button for chat panel

**Files:**
- Create: `src/panel/VoiceButton.tsx`

- [ ] **Step 1: Create VoiceButton.tsx**

```typescript
import React, { useEffect, useRef, useState } from 'react';

interface Props {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 1500;
const MAX_DURATION_MS = 28000;

const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(off, Math.max(-1, Math.min(1, samples[i])) * 0x7FFF, true);
    off += 2;
  }
  return buf;
};

export const VoiceButton: React.FC<Props> = ({ onTranscript, disabled }) => {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [whisperReady, setWhisperReady] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const samplesRef = useRef<Float32Array[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    window.cc.invoke(window.cc.channels.WHISPER_READY).then((r: { ready: boolean }) => {
      setWhisperReady(r.ready);
    });
    const unsub = window.cc.on(window.cc.channels.WHISPER_DOWNLOAD_PROGRESS, () => {
      window.cc.invoke(window.cc.channels.WHISPER_READY).then((r: { ready: boolean }) => setWhisperReady(r.ready));
    });
    return unsub;
  }, []);

  const stopRecording = async (samples: Float32Array[], sampleRate: number) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    setRecording(false);
    if (samples.length === 0) return;

    const total = samples.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of samples) { merged.set(chunk, offset); offset += chunk.length; }

    const wav = encodeWav(merged, sampleRate);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(wav)));
    setTranscribing(true);
    try {
      const result = await window.cc.invoke(window.cc.channels.WHISPER_TRANSCRIBE, { wavBase64: base64 }) as { text: string };
      if (result.text) onTranscript(result.text);
    } catch (e: any) {
      console.error('transcription failed', e);
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    samplesRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = new AudioContext({ sampleRate: 16000 });
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    setRecording(true);

    processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0).slice();
      samplesRef.current.push(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      if (rms < SILENCE_THRESHOLD) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => stopRecording(samplesRef.current, ctx.sampleRate), SILENCE_DURATION_MS);
        }
      } else {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    maxTimerRef.current = setTimeout(() => stopRecording(samplesRef.current, ctx.sampleRate), MAX_DURATION_MS);
  };

  const handleClick = () => {
    if (recording) stopRecording(samplesRef.current, ctxRef.current?.sampleRate ?? 16000);
    else startRecording();
  };

  if (!whisperReady && !transcribing) return null;

  return (
    <button
      onClick={handleClick}
      disabled={disabled || transcribing}
      title={recording ? 'Click to stop' : transcribing ? 'Transcribing…' : 'Voice input'}
      className={`px-2 py-1 rounded text-xs transition-colors ${
        recording ? 'bg-red-500/80 hover:bg-red-500 animate-pulse' :
        transcribing ? 'bg-white/20 opacity-60' :
        'bg-white/10 hover:bg-white/20'
      }`}
    >
      {recording ? '⏹' : transcribing ? '…' : '🎤'}
    </button>
  );
};
```

- [ ] **Step 2: Commit**

```powershell
git add src/panel/VoiceButton.tsx
git commit -m "feat: add VoiceButton with WAV encoding, silence detection, and whisper transcription"
```

---

## Task 8: Embed VoiceButton in Panel.tsx

**Files:**
- Modify: `src/panel/Panel.tsx`

- [ ] **Step 1: Add VoiceButton import**

Add to imports at top of `src/panel/Panel.tsx`:

```typescript
import { VoiceButton } from './VoiceButton';
```

- [ ] **Step 2: Add VoiceButton next to Send button**

Find the `<div className="flex justify-between items-center no-drag">` section. Add `<VoiceButton>` inside the right-side button group, before the Send button:

```typescript
      <div className="flex justify-between items-center no-drag">
        <ModelSelector value={model} onChange={setModel} />
        <div className="flex gap-2">
          <VoiceButton
            onTranscript={(text) => setInput((prev) => prev ? `${prev} ${text}` : text)}
            disabled={streaming}
          />
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
```

- [ ] **Step 3: Commit**

```powershell
git add src/panel/Panel.tsx
git commit -m "feat: embed VoiceButton in chat panel"
```

---

## Task 9: Voice overlay window (VoiceOverlay + main)

**Files:**
- Create: `src/voice/main.tsx`
- Create: `src/voice/VoiceOverlay.tsx`

- [ ] **Step 1: Create src/voice/main.tsx**

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceOverlay } from './VoiceOverlay';
import '../panel/styles.css';

createRoot(document.getElementById('root')!).render(<VoiceOverlay />);
```

- [ ] **Step 2: Create src/voice/VoiceOverlay.tsx**

```typescript
import React, { useEffect, useRef, useState } from 'react';

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 1500;
const MAX_DURATION_MS = 28000;

const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(off, Math.max(-1, Math.min(1, samples[i])) * 0x7FFF, true);
    off += 2;
  }
  return buf;
};

export const VoiceOverlay: React.FC = () => {
  const [phase, setPhase] = useState<'listening' | 'transcribing' | 'done' | 'error'>('listening');
  const [elapsed, setElapsed] = useState(0);
  const [statusText, setStatusText] = useState('Listening…');
  const samplesRef = useRef<Float32Array[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const close = () => window.cc.send(window.cc.channels.PANEL_CLOSE);

  const stopAndTranscribe = async (samples: Float32Array[], sampleRate: number) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    if (samples.length === 0) { close(); return; }

    setPhase('transcribing');
    setStatusText('Transcribing…');

    const total = samples.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of samples) { merged.set(chunk, offset); offset += chunk.length; }

    const wav = encodeWav(merged, sampleRate);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(wav)));

    try {
      const result = await window.cc.invoke(window.cc.channels.WHISPER_TRANSCRIBE, { wavBase64: base64 }) as { text: string };
      if (result.text) {
        // Open panel and send transcript as message via CONTEXT_TEXT then trigger send
        window.cc.send(window.cc.channels.PANEL_CLOSE); // close voice overlay
        // Signal main to open panel with voice transcript
        window.cc.invoke('voice:send', { text: result.text });
      }
      setPhase('done');
    } catch {
      setPhase('error');
      setStatusText('Failed — try again');
      setTimeout(close, 1500);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handleKeyDown);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const ctx = new AudioContext({ sampleRate: 16000 });
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const data = e.inputBuffer.getChannelData(0).slice();
          samplesRef.current.push(data);
          const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
          if (rms < SILENCE_THRESHOLD) {
            if (!silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(
                () => stopAndTranscribe(samplesRef.current, ctx.sampleRate),
                SILENCE_DURATION_MS
              );
            }
          } else {
            if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
          }
        };

        source.connect(processor);
        processor.connect(ctx.destination);
        maxTimerRef.current = setTimeout(() => stopAndTranscribe(samplesRef.current, ctx.sampleRate), MAX_DURATION_MS);
        elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      } catch {
        setPhase('error');
        setStatusText('Microphone access denied');
        setTimeout(close, 2000);
      }
    })();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="frosted rounded-2xl px-6 py-4 flex items-center gap-4 w-full mx-2">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
          phase === 'listening' ? 'bg-red-500/80 animate-pulse' :
          phase === 'transcribing' ? 'bg-blue-500/80 animate-pulse' :
          'bg-white/20'
        }`}>
          {phase === 'transcribing' ? '⏳' : '🎤'}
        </div>
        <div className="flex flex-col">
          <span className="text-white text-sm font-medium">{statusText}</span>
          {phase === 'listening' && (
            <span className="text-white/50 text-xs">{elapsed}s · Esc to cancel</span>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Add `voice:send` IPC handler in main.ts**

In `electron/main.ts`, inside `registerIpc()`, add:

```typescript
  ipcMain.handle('voice:send', (_e, { text }: { text: string }) => {
    const settings = getSettings();
    const hw = detectHardware();
    const model = settings.selectedModel || hw.recommendedTextModel;
    currentConversation = createConversation({ type: 'text', value: text }, model);
    const display = screen.getPrimaryDisplay().workAreaSize;
    showPanel(Math.round(display.width / 2) - 180, Math.round(display.height / 2) - 240);
    setTimeout(() => sendToPanel(IPC.CONTEXT_TEXT, text), 250);
  });
```

Also add `showPanel` and `sendToPanel` to the imports from `./windows` if not already present (they are already imported).

- [ ] **Step 4: Commit**

```powershell
git add src/voice/main.tsx src/voice/VoiceOverlay.tsx electron/main.ts
git commit -m "feat: add voice overlay window with auto-transcribe and panel open"
```

---

## Task 10: Test end-to-end and verify

- [ ] **Step 1: Run the app**

```powershell
npm run dev
```

- [ ] **Step 2: Test VoiceButton in chat panel**

1. Select text anywhere to open the chat panel
2. Look for the 🎤 button next to Send (only visible if whisper is ready OR downloading)
3. Click it — browser will ask for microphone permission, click Allow
4. Speak a sentence, pause for 1.5s
5. Button shows `…` while transcribing
6. Text appears in the input field
7. Press Enter to send

- [ ] **Step 3: Test first-run download**

On first use, whisper.cpp binary + model will download. Verify:
- The 🎤 button appears (whisper not ready yet triggers download on first transcribe call)
- Terminal shows no crashes during download

- [ ] **Step 4: Test voice overlay**

1. Press `Ctrl+Shift+V`
2. Small overlay appears at bottom-center of screen with pulsing mic
3. Speak, pause
4. Overlay closes, chat panel opens with spoken text as context
5. Press `Esc` during recording — overlay closes

- [ ] **Step 5: Final commit**

```powershell
git add .
git commit -m "feat: complete voice input with whisper.cpp — mic button + Ctrl+Shift+V overlay"
```
