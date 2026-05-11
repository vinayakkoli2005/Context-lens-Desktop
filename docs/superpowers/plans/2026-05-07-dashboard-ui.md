# Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-tab dashboard window (Home, Setup, Models, History, How to Use) that serves as the primary UI for ContextChat, replacing the minimal Settings window.

**Architecture:** Add a new `dashboard` renderer entry wired to `dashboard.html` and `src/dashboard/`. New IPC channels handle Ollama status ping, provider key validation, and model pull progress. The dashboard window is opened from the tray and floating icon; it detects first launch via a `hasCompletedSetup` store flag.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Electron IPC, electron-vite, electron-store

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `dashboard.html` | HTML entry for dashboard window |
| Create | `src/dashboard/main.tsx` | React root mount |
| Create | `src/dashboard/Dashboard.tsx` | Tab shell + routing state |
| Create | `src/dashboard/tabs/Home.tsx` | Connection status, active model, shortcuts |
| Create | `src/dashboard/tabs/Setup.tsx` | First-run checklist wizard |
| Create | `src/dashboard/tabs/Models.tsx` | Per-provider model browser + Ollama pull |
| Create | `src/dashboard/tabs/HowToUse.tsx` | Static usage guide |
| Modify | `src/history/History.tsx` | Accept optional `embedded` prop to remove outer `h-screen` |
| Modify | `electron/ipc-channels.ts` | Add OLLAMA_STATUS, OLLAMA_PULL, OPENAI_STATUS, ANTHROPIC_STATUS, SETUP_COMPLETE |
| Modify | `electron/store.ts` | Add `hasCompletedSetup: boolean` to Settings type |
| Modify | `src/shared/types.ts` | Add `hasCompletedSetup` to Settings interface |
| Modify | `electron/main.ts` | Register new IPC handlers |
| Modify | `electron/windows.ts` | Add `showDashboard()`, update tray click |
| Modify | `electron/tray.ts` | Add "Open Dashboard" menu item |
| Modify | `electron.vite.config.ts` | Add `dashboard` to renderer inputs |

---

## Task 1: Add new IPC channels and Settings type

**Files:**
- Modify: `electron/ipc-channels.ts`
- Modify: `src/shared/types.ts`
- Modify: `electron/store.ts`

- [ ] **Step 1: Add channels to ipc-channels.ts**

Replace the file content with:

```typescript
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

  // settings / dashboard ↔ main
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

  // dashboard ↔ main (new)
  OLLAMA_STATUS: 'ollama:status',
  OLLAMA_PULL: 'ollama:pull',
  OPENAI_STATUS: 'openai:status',
  ANTHROPIC_STATUS: 'anthropic:status',
  SETUP_COMPLETE: 'setup:complete',
} as const;
```

- [ ] **Step 2: Add `hasCompletedSetup` to shared types**

In `src/shared/types.ts`, update the Settings interface:

```typescript
export interface Settings {
  ollamaUrl: string;
  selectedModel: string;
  launchAtStartup: boolean;
  provider: 'ollama' | 'openai' | 'anthropic';
  openaiApiKey: string;
  anthropicApiKey: string;
  hasCompletedSetup: boolean;
}
```

- [ ] **Step 3: Add `hasCompletedSetup` default to store**

In `electron/store.ts`, update DEFAULTS:

```typescript
const DEFAULTS: Settings = {
  ollamaUrl: 'http://localhost:11434',
  selectedModel: '',
  launchAtStartup: true,
  provider: 'ollama',
  openaiApiKey: '',
  anthropicApiKey: '',
  hasCompletedSetup: false,
};
```

- [ ] **Step 4: Commit**

```bash
git add electron/ipc-channels.ts src/shared/types.ts electron/store.ts
git commit -m "feat: add dashboard IPC channels and hasCompletedSetup setting"
```

---

## Task 2: Add IPC handlers in main process

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add OLLAMA_STATUS handler**

Inside `registerIpc()` in `electron/main.ts`, after the existing handlers, add:

```typescript
ipcMain.handle(IPC.OLLAMA_STATUS, async () => {
  const settings = getSettings();
  try {
    const res = await fetch(`${settings.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
    return { ok: res.ok, url: settings.ollamaUrl };
  } catch {
    return { ok: false, url: settings.ollamaUrl };
  }
});
```

- [ ] **Step 2: Add OPENAI_STATUS handler**

```typescript
ipcMain.handle(IPC.OPENAI_STATUS, async () => {
  const settings = getSettings();
  if (!settings.openaiApiKey) return { ok: false };
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${settings.openaiApiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
});
```

- [ ] **Step 3: Add ANTHROPIC_STATUS handler**

```typescript
ipcMain.handle(IPC.ANTHROPIC_STATUS, async () => {
  const settings = getSettings();
  if (!settings.anthropicApiKey) return { ok: false };
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
});
```

- [ ] **Step 4: Add OLLAMA_PULL handler**

```typescript
ipcMain.handle(IPC.OLLAMA_PULL, async (e, { model }: { model: string }) => {
  const settings = getSettings();
  try {
    const res = await fetch(`${settings.ollamaUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });
    if (!res.ok || !res.body) return { ok: false, error: `HTTP ${res.status}` };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const win = BrowserWindow.fromWebContents(e.sender);
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          win?.webContents.send('ollama:pull:progress', obj);
        } catch { /* skip malformed */ }
      }
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});
```

- [ ] **Step 5: Add SETUP_COMPLETE handler**

```typescript
ipcMain.handle(IPC.SETUP_COMPLETE, async () => {
  return setSettings({ hasCompletedSetup: true });
});
```

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add Ollama status, pull, and provider status IPC handlers"
```

---

## Task 3: Add dashboard window and update tray

**Files:**
- Modify: `electron/windows.ts`
- Modify: `electron/tray.ts`

- [ ] **Step 1: Add `showDashboard` to windows.ts**

Add a new window variable and export after the existing window declarations:

```typescript
let dashboardWin: BrowserWindow | null = null;

export const showDashboard = (): BrowserWindow => {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    dashboardWin.focus();
    return dashboardWin;
  }
  dashboardWin = new BrowserWindow({
    width: 720, height: 560,
    title: 'ContextChat',
    resizable: true,
    skipTaskbar: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true },
  });
  dashboardWin.loadURL(rendererUrl('dashboard.html'));
  dashboardWin.on('closed', () => { dashboardWin = null; });
  return dashboardWin;
};
```

- [ ] **Step 2: Update tray.ts to open dashboard**

In `electron/tray.ts`, add the import and update the menu:

```typescript
import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';
import { showDashboard, showHistory } from './windows';

let tray: Tray | null = null;

export const createTray = (): Tray => {
  const iconPath = join(process.env.NODE_ENV === 'development'
    ? join(process.cwd(), 'resources', 'tray-icon.png')
    : join(process.resourcesPath, 'tray-icon.png'));
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('ContextChat');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => showDashboard() },
    { label: 'Open History', click: () => showHistory() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showDashboard());
  return tray;
};
```

- [ ] **Step 3: Commit**

```bash
git add electron/windows.ts electron/tray.ts
git commit -m "feat: add dashboard window and update tray to open it"
```

---

## Task 4: Add dashboard HTML entry and vite config

**Files:**
- Create: `dashboard.html`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Create dashboard.html**

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>ContextChat</title></head>
<body><div id="root"></div><script type="module" src="/src/dashboard/main.tsx"></script></body>
</html>
```

- [ ] **Step 2: Add dashboard to vite config**

In `electron.vite.config.ts`, add `dashboard` to the renderer inputs:

```typescript
input: {
  panel: resolve(__dirname, 'index.html'),
  settings: resolve(__dirname, 'settings.html'),
  toast: resolve(__dirname, 'toast.html'),
  icon: resolve(__dirname, 'icon.html'),
  history: resolve(__dirname, 'history.html'),
  dashboard: resolve(__dirname, 'dashboard.html'),
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard.html electron.vite.config.ts
git commit -m "feat: add dashboard HTML entry and register with electron-vite"
```

---

## Task 5: Dashboard shell (main.tsx + Dashboard.tsx)

**Files:**
- Create: `src/dashboard/main.tsx`
- Create: `src/dashboard/Dashboard.tsx`

- [ ] **Step 1: Create src/dashboard/main.tsx**

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './Dashboard';
import '../panel/styles.css';

createRoot(document.getElementById('root')!).render(<Dashboard />);
```

- [ ] **Step 2: Create src/dashboard/Dashboard.tsx**

```typescript
import React, { useEffect, useState } from 'react';
import { Home } from './tabs/Home';
import { Setup } from './tabs/Setup';
import { Models } from './tabs/Models';
import { History } from '../history/History';
import { HowToUse } from './tabs/HowToUse';
import type { Settings } from '../shared/types';

type Tab = 'home' | 'setup' | 'models' | 'history' | 'howto';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'setup', label: 'Setup' },
  { id: 'models', label: 'Models' },
  { id: 'history', label: 'History' },
  { id: 'howto', label: 'How to Use' },
];

export const Dashboard: React.FC = () => {
  const [active, setActive] = useState<Tab>('home');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    window.cc.invoke(window.cc.channels.SETTINGS_GET).then((s: Settings) => {
      if (!s.hasCompletedSetup) setActive('setup');
      setReady(true);
    });
  }, []);

  if (!ready) return <div className="h-screen bg-gray-900 flex items-center justify-center text-white/50 text-sm">Loading…</div>;

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white text-sm select-none">
      {/* Tab bar */}
      <div className="flex border-b border-white/10 bg-gray-800 px-2 pt-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2 text-xs rounded-t transition-colors ${
              active === t.id
                ? 'bg-gray-900 text-white border-t border-l border-r border-white/10'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {active === 'home' && <Home onNavigate={setActive} />}
        {active === 'setup' && <Setup onNavigate={setActive} />}
        {active === 'models' && <Models />}
        {active === 'history' && <History embedded />}
        {active === 'howto' && <HowToUse />}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/main.tsx src/dashboard/Dashboard.tsx
git commit -m "feat: add dashboard shell with tab routing"
```

---

## Task 6: Update History component to support embedded mode

**Files:**
- Modify: `src/history/History.tsx`

- [ ] **Step 1: Add embedded prop**

Change the component signature and outer div:

```typescript
export const History: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
```

Change the outer `div` className from:
```typescript
<div className="h-screen flex flex-col bg-gray-900 text-white text-sm">
```
to:
```typescript
<div className={`${embedded ? 'h-full' : 'h-screen'} flex flex-col bg-gray-900 text-white text-sm`}>
```

- [ ] **Step 2: Commit**

```bash
git add src/history/History.tsx
git commit -m "feat: support embedded prop in History for dashboard use"
```

---

## Task 7: Home tab

**Files:**
- Create: `src/dashboard/tabs/Home.tsx`

- [ ] **Step 1: Create Home.tsx**

```typescript
import React, { useEffect, useState } from 'react';
import type { Settings } from '../../shared/types';

type Tab = 'home' | 'setup' | 'models' | 'history' | 'howto';

interface StatusResult { ok: boolean; url?: string; }

const StatusPill: React.FC<{ label: string; ok: boolean | null }> = ({ label, ok }) => (
  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
    ok === null ? 'bg-white/10 text-white/50' :
    ok ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
         'bg-red-500/20 text-red-400 border border-red-500/30'
  }`}>
    <span className={`w-1.5 h-1.5 rounded-full ${ok === null ? 'bg-white/30' : ok ? 'bg-green-400' : 'bg-red-400'}`} />
    {label}
  </span>
);

export const Home: React.FC<{ onNavigate: (tab: Tab) => void }> = ({ onNavigate }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [openaiOk, setOpenaiOk] = useState<boolean | null>(null);
  const [anthropicOk, setAnthropicOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    window.cc.invoke(window.cc.channels.SETTINGS_GET).then(setSettings);
  }, []);

  const checkAll = async () => {
    setChecking(true);
    setOllamaOk(null); setOpenaiOk(null); setAnthropicOk(null);
    const [ollama, openai, anthropic] = await Promise.all([
      window.cc.invoke(window.cc.channels.OLLAMA_STATUS) as Promise<StatusResult>,
      window.cc.invoke(window.cc.channels.OPENAI_STATUS) as Promise<StatusResult>,
      window.cc.invoke(window.cc.channels.ANTHROPIC_STATUS) as Promise<StatusResult>,
    ]);
    setOllamaOk(ollama.ok);
    setOpenaiOk(openai.ok);
    setAnthropicOk(anthropic.ok);
    setChecking(false);
  };

  const anyRed = ollamaOk === false || openaiOk === false || anthropicOk === false;

  return (
    <div className="p-6 flex flex-col gap-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-lg font-semibold mb-1">ContextChat</h1>
        <p className="text-white/50 text-xs">System-wide AI assistant for text and screenshots</p>
      </div>

      {/* Connection status */}
      <section className="bg-white/5 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-white/50 font-medium">Connection Status</span>
          <button
            onClick={checkAll}
            disabled={checking}
            className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40"
          >
            {checking ? 'Checking…' : 'Refresh'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label="Ollama (Local)" ok={ollamaOk} />
          <StatusPill label="OpenAI" ok={openaiOk} />
          <StatusPill label="Anthropic" ok={anthropicOk} />
        </div>
        {ollamaOk === null && openaiOk === null && anthropicOk === null && (
          <p className="text-xs text-white/40">Click Refresh to check connections</p>
        )}
      </section>

      {/* Active config */}
      {settings && (
        <section className="bg-white/5 rounded-lg p-4 flex flex-col gap-2">
          <span className="text-xs uppercase text-white/50 font-medium">Active Configuration</span>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-white/50 text-xs">Provider</span>
              <div className="font-medium capitalize">{settings.provider}</div>
            </div>
            <div>
              <span className="text-white/50 text-xs">Model</span>
              <div className="font-medium">{settings.selectedModel || '(auto)'}</div>
            </div>
          </div>
        </section>
      )}

      {/* Shortcut reminder */}
      <section className="bg-white/5 rounded-lg p-4 flex flex-col gap-2">
        <span className="text-xs uppercase text-white/50 font-medium">Keyboard Shortcut</span>
        <div className="flex items-center gap-2">
          <kbd className="px-2 py-1 rounded bg-white/10 text-xs font-mono">Ctrl+Shift+Space</kbd>
          <span className="text-xs text-white/60">Open assistant with clipboard text</span>
        </div>
        <p className="text-xs text-white/40">Or select any text on screen to see the floating icon</p>
      </section>

      {/* Quick actions */}
      <div className="flex gap-2">
        {anyRed && (
          <button
            onClick={() => onNavigate('setup')}
            className="px-4 py-2 rounded bg-yellow-600/70 hover:bg-yellow-600 text-xs"
          >
            Fix Setup Issues
          </button>
        )}
        <button
          onClick={() => onNavigate('models')}
          className="px-4 py-2 rounded bg-blue-600/70 hover:bg-blue-600 text-xs"
        >
          Manage Models
        </button>
        <button
          onClick={() => onNavigate('howto')}
          className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-xs"
        >
          How to Use
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/tabs/Home.tsx
git commit -m "feat: add Home tab with connection status pills and active config"
```

---

## Task 8: Setup tab

**Files:**
- Create: `src/dashboard/tabs/Setup.tsx`

- [ ] **Step 1: Create Setup.tsx**

```typescript
import React, { useEffect, useState } from 'react';
import type { Settings } from '../../shared/types';

type Tab = 'home' | 'setup' | 'models' | 'history' | 'howto';
type StepStatus = 'done' | 'action' | 'pending';

const StepCard: React.FC<{
  num: number;
  title: string;
  status: StepStatus;
  children: React.ReactNode;
}> = ({ num, title, status, children }) => (
  <div className={`rounded-lg p-4 border ${
    status === 'done' ? 'border-green-500/30 bg-green-500/5' :
    status === 'action' ? 'border-yellow-500/30 bg-yellow-500/5' :
    'border-white/10 bg-white/5 opacity-50'
  }`}>
    <div className="flex items-center gap-2 mb-2">
      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
        status === 'done' ? 'bg-green-500 text-white' :
        status === 'action' ? 'bg-yellow-500 text-black' :
        'bg-white/20 text-white/50'
      }`}>{status === 'done' ? '✓' : num}</span>
      <span className="text-sm font-medium">{title}</span>
    </div>
    <div className="text-xs text-white/70 flex flex-col gap-2">{children}</div>
  </div>
);

export const Setup: React.FC<{ onNavigate: (tab: Tab) => void }> = ({ onNavigate }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  useEffect(() => {
    window.cc.invoke(window.cc.channels.SETTINGS_GET).then((s: Settings) => {
      setSettings(s);
      setKeyInput(s.provider === 'openai' ? s.openaiApiKey : s.anthropicApiKey);
    });
  }, []);

  const checkOllama = async () => {
    setChecking(true);
    const res = await window.cc.invoke(window.cc.channels.OLLAMA_STATUS) as { ok: boolean };
    setOllamaOk(res.ok);
    setChecking(false);
  };

  const updateProvider = async (provider: Settings['provider']) => {
    const next = await window.cc.invoke(window.cc.channels.SETTINGS_SET, { provider }) as Settings;
    setSettings(next);
    setKeyInput(provider === 'openai' ? next.openaiApiKey : next.anthropicApiKey);
  };

  const saveKey = async () => {
    if (!settings) return;
    const field = settings.provider === 'openai' ? 'openaiApiKey' : 'anthropicApiKey';
    const next = await window.cc.invoke(window.cc.channels.SETTINGS_SET, { [field]: keyInput }) as Settings;
    setSettings(next);
  };

  const saveModel = async (selectedModel: string) => {
    const next = await window.cc.invoke(window.cc.channels.SETTINGS_SET, { selectedModel }) as Settings;
    setSettings(next);
  };

  const markComplete = async () => {
    await window.cc.invoke(window.cc.channels.SETUP_COMPLETE);
    onNavigate('home');
  };

  const isOllamaProvider = settings?.provider === 'ollama';
  const hasKey = settings
    ? (settings.provider === 'openai' ? !!settings.openaiApiKey : settings.provider === 'anthropic' ? !!settings.anthropicApiKey : true)
    : false;
  const providerConfigured = isOllamaProvider ? ollamaOk === true : hasKey;
  const modelSelected = !!settings?.selectedModel;

  if (!settings) return <div className="p-6 text-white/50 text-sm">Loading…</div>;

  return (
    <div className="p-6 flex flex-col gap-4 max-w-lg mx-auto">
      <div>
        <h2 className="text-base font-semibold mb-1">Setup</h2>
        <p className="text-white/50 text-xs">Complete these steps to get ContextChat working</p>
      </div>

      {/* Step 1: Permissions */}
      <StepCard num={1} title="Permissions" status="done">
        <p>Global input monitoring is active. ContextChat can detect text selections.</p>
      </StepCard>

      {/* Step 2: Provider */}
      <StepCard num={2} title="Choose AI Provider" status={settings.provider ? 'done' : 'action'}>
        <p>Select where to send your AI requests:</p>
        <select
          value={settings.provider}
          onChange={e => updateProvider(e.target.value as Settings['provider'])}
          className="bg-white/10 rounded px-2 py-1 text-white w-full"
        >
          <option value="ollama">Ollama (Local — free, private)</option>
          <option value="openai">OpenAI (GPT — requires API key)</option>
          <option value="anthropic">Anthropic (Claude — requires API key)</option>
        </select>
      </StepCard>

      {/* Step 3: Ollama or API Key */}
      {isOllamaProvider ? (
        <StepCard num={3} title="Start Ollama" status={ollamaOk === true ? 'done' : 'action'}>
          <p>Ollama must be running on your machine. Open a terminal and run:</p>
          <code className="bg-black/40 px-2 py-1 rounded font-mono block">ollama serve</code>
          <p>To run Ollama permanently (survives terminal close), open PowerShell as Administrator and run:</p>
          <code className="bg-black/40 px-2 py-1 rounded font-mono block text-xs whitespace-pre">{`$action = New-ScheduledTaskAction -Execute "ollama" -Argument "serve"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0
Register-ScheduledTask -TaskName "OllamaService" -Action $action -Trigger $trigger -Settings $settings -Force
Start-ScheduledTask -TaskName "OllamaService"`}</code>
          <button
            onClick={checkOllama}
            disabled={checking}
            className="px-3 py-1 rounded bg-blue-600/70 hover:bg-blue-600 disabled:opacity-40 w-fit"
          >
            {checking ? 'Checking…' : ollamaOk === true ? '✓ Connected' : 'Check Connection'}
          </button>
          {ollamaOk === false && <p className="text-red-400">Could not connect to Ollama. Make sure it's running.</p>}
        </StepCard>
      ) : (
        <StepCard num={3} title={`${settings.provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key`} status={hasKey ? 'done' : 'action'}>
          <p>{settings.provider === 'openai'
            ? 'Get your key from platform.openai.com → API Keys'
            : 'Get your key from console.anthropic.com → API Keys'}</p>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder={settings.provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            className="bg-white/10 rounded px-2 py-1 text-white w-full font-mono"
          />
          <button
            onClick={saveKey}
            className="px-3 py-1 rounded bg-blue-600/70 hover:bg-blue-600 w-fit"
          >
            Save Key
          </button>
        </StepCard>
      )}

      {/* Step 4: Pull / select model */}
      <StepCard
        num={4}
        title="Select a Model"
        status={modelSelected ? 'done' : providerConfigured ? 'action' : 'pending'}
      >
        {isOllamaProvider ? (
          <>
            <p>Pull a model to use with Ollama. Recommended for your system:</p>
            <button
              onClick={() => onNavigate('models')}
              className="px-3 py-1 rounded bg-blue-600/70 hover:bg-blue-600 w-fit"
            >
              Open Models tab to pull
            </button>
          </>
        ) : (
          <>
            <p>Choose a default model:</p>
            <select
              value={settings.selectedModel}
              onChange={e => saveModel(e.target.value)}
              className="bg-white/10 rounded px-2 py-1 text-white w-full"
            >
              <option value="">(auto select)</option>
              {settings.provider === 'openai'
                ? ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'].map(m => <option key={m} value={m}>{m}</option>)
                : ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'].map(m => <option key={m} value={m}>{m}</option>)
              }
            </select>
          </>
        )}
      </StepCard>

      {/* Step 5: Done */}
      <StepCard num={5} title="All Done!" status={providerConfigured && modelSelected ? 'action' : 'pending'}>
        <p>You're ready to use ContextChat. Select text anywhere or press Ctrl+Shift+Space.</p>
        <button
          onClick={markComplete}
          disabled={!providerConfigured}
          className="px-4 py-2 rounded bg-green-600/70 hover:bg-green-600 disabled:opacity-40 w-fit text-sm font-medium"
        >
          Go to Dashboard →
        </button>
      </StepCard>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/tabs/Setup.tsx
git commit -m "feat: add Setup tab with 5-step checklist wizard"
```

---

## Task 9: Models tab

**Files:**
- Create: `src/dashboard/tabs/Models.tsx`

- [ ] **Step 1: Create Models.tsx**

```typescript
import React, { useEffect, useState } from 'react';
import type { Settings, HardwareInfo } from '../../shared/types';

interface ModelInfo { name: string; }

const ANTHROPIC_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
const OPENAI_MODELS_COMMON = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];

type SubTab = 'ollama' | 'openai' | 'anthropic';

export const Models: React.FC = () => {
  const [sub, setSub] = useState<SubTab>('ollama');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [ollamaModels, setOllamaModels] = useState<ModelInfo[]>([]);
  const [openaiModels, setOpenaiModels] = useState<ModelInfo[]>(OPENAI_MODELS_COMMON.map(n => ({ name: n })));
  const [pullName, setPullName] = useState('');
  const [pullProgress, setPullProgress] = useState('');
  const [pulling, setPulling] = useState(false);
  const [ollamaError, setOllamaError] = useState('');

  useEffect(() => {
    window.cc.invoke(window.cc.channels.SETTINGS_GET).then(setSettings);
    window.cc.invoke(window.cc.channels.HARDWARE_INFO).then(setHw);
    loadOllamaModels();
    loadOpenAIModels();

    const unsub = window.cc.on('ollama:pull:progress', (obj: { status: string; completed?: number; total?: number }) => {
      if (obj.total && obj.completed) {
        setPullProgress(`${obj.status}: ${Math.round((obj.completed / obj.total) * 100)}%`);
      } else {
        setPullProgress(obj.status);
      }
    });
    return unsub;
  }, []);

  const loadOllamaModels = async () => {
    try {
      const list = await window.cc.invoke(window.cc.channels.MODELS_LIST, { provider: 'ollama' }) as ModelInfo[];
      setOllamaModels(Array.isArray(list) ? list : []);
      setOllamaError('');
    } catch {
      setOllamaError('Could not connect to Ollama');
    }
  };

  const loadOpenAIModels = async () => {
    const s = await window.cc.invoke(window.cc.channels.SETTINGS_GET) as Settings;
    if (!s.openaiApiKey) return;
    try {
      const list = await window.cc.invoke(window.cc.channels.MODELS_LIST, { provider: 'openai', apiKey: s.openaiApiKey }) as ModelInfo[];
      if (Array.isArray(list) && list.length > 0) setOpenaiModels(list);
    } catch { /* keep defaults */ }
  };

  const setDefault = async (selectedModel: string) => {
    const next = await window.cc.invoke(window.cc.channels.SETTINGS_SET, { selectedModel }) as Settings;
    setSettings(next);
  };

  const pullModel = async () => {
    if (!pullName.trim()) return;
    setPulling(true);
    setPullProgress('Starting…');
    try {
      await window.cc.invoke(window.cc.channels.OLLAMA_PULL, { model: pullName.trim() });
      setPullProgress('Done!');
      setPullName('');
      await loadOllamaModels();
    } catch (e: any) {
      setPullProgress(`Error: ${e.message}`);
    } finally {
      setPulling(false);
    }
  };

  if (!settings) return <div className="p-6 text-white/50 text-sm">Loading…</div>;

  const SUB_TABS: SubTab[] = ['ollama', 'openai', 'anthropic'];

  return (
    <div className="p-6 flex flex-col gap-4 max-w-2xl mx-auto">
      <h2 className="text-base font-semibold">Models</h2>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        {SUB_TABS.map(t => (
          <button
            key={t}
            onClick={() => setSub(t)}
            className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
              sub === t ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {t === 'ollama' ? 'Ollama (Local)' : t === 'openai' ? 'OpenAI' : 'Anthropic'}
          </button>
        ))}
      </div>

      {/* Ollama sub-tab */}
      {sub === 'ollama' && (
        <div className="flex flex-col gap-4">
          {hw && (
            <div className="text-xs text-white/50 bg-white/5 rounded px-3 py-2">
              Recommended for your {hw.totalRamGb}GB RAM: <strong className="text-white">{hw.recommendedTextModel}</strong> (text), <strong className="text-white">{hw.recommendedVisionModel}</strong> (vision)
            </div>
          )}

          {/* Pull new model */}
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase text-white/50 font-medium">Pull a Model</span>
            <div className="flex gap-2">
              <input
                value={pullName}
                onChange={e => setPullName(e.target.value)}
                placeholder="e.g. llama3.2, llava:7b, qwen2.5:7b"
                className="flex-1 bg-white/10 rounded px-2 py-1 text-sm text-white placeholder-white/30"
                onKeyDown={e => e.key === 'Enter' && pullModel()}
              />
              <button
                onClick={pullModel}
                disabled={pulling || !pullName.trim()}
                className="px-3 py-1 rounded bg-blue-600/70 hover:bg-blue-600 disabled:opacity-40 text-xs"
              >
                {pulling ? 'Pulling…' : 'Pull'}
              </button>
            </div>
            {pullProgress && <div className="text-xs text-white/60 font-mono">{pullProgress}</div>}
          </div>

          {/* Available models */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase text-white/50 font-medium">Available Models</span>
              <button onClick={loadOllamaModels} className="text-xs text-white/40 hover:text-white/70">Refresh</button>
            </div>
            {ollamaError && <div className="text-red-400 text-xs">{ollamaError}</div>}
            {ollamaModels.length === 0 && !ollamaError && (
              <div className="text-white/40 text-xs">No models pulled yet. Pull one above.</div>
            )}
            {ollamaModels.map(m => (
              <div key={m.name} className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
                <span className="text-sm font-mono">{m.name}</span>
                <button
                  onClick={() => setDefault(m.name)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    settings.selectedModel === m.name
                      ? 'bg-green-600/50 text-green-300'
                      : 'bg-white/10 hover:bg-white/20 text-white/70'
                  }`}
                >
                  {settings.selectedModel === m.name ? '✓ Default' : 'Set Default'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OpenAI sub-tab */}
      {sub === 'openai' && (
        <div className="flex flex-col gap-3">
          {!settings.openaiApiKey && (
            <div className="text-yellow-400 text-xs bg-yellow-500/10 rounded px-3 py-2 border border-yellow-500/20">
              No OpenAI API key set. Go to Setup tab to add one.
            </div>
          )}
          {openaiModels.map(m => (
            <div key={m.name} className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
              <span className="text-sm font-mono">{m.name}</span>
              <button
                onClick={() => setDefault(m.name)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  settings.selectedModel === m.name
                    ? 'bg-green-600/50 text-green-300'
                    : 'bg-white/10 hover:bg-white/20 text-white/70'
                }`}
              >
                {settings.selectedModel === m.name ? '✓ Default' : 'Set Default'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Anthropic sub-tab */}
      {sub === 'anthropic' && (
        <div className="flex flex-col gap-3">
          {!settings.anthropicApiKey && (
            <div className="text-yellow-400 text-xs bg-yellow-500/10 rounded px-3 py-2 border border-yellow-500/20">
              No Anthropic API key set. Go to Setup tab to add one.
            </div>
          )}
          {ANTHROPIC_MODELS.map(m => (
            <div key={m} className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
              <span className="text-sm font-mono">{m}</span>
              <button
                onClick={() => setDefault(m)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  settings.selectedModel === m
                    ? 'bg-green-600/50 text-green-300'
                    : 'bg-white/10 hover:bg-white/20 text-white/70'
                }`}
              >
                {settings.selectedModel === m ? '✓ Default' : 'Set Default'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/tabs/Models.tsx
git commit -m "feat: add Models tab with Ollama pull, provider sub-tabs, and set-default"
```

---

## Task 10: HowToUse tab

**Files:**
- Create: `src/dashboard/tabs/HowToUse.tsx`

- [ ] **Step 1: Create HowToUse.tsx**

```typescript
import React from 'react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold text-white/90 border-b border-white/10 pb-1">{title}</h3>
    <div className="text-xs text-white/70 flex flex-col gap-1.5">{children}</div>
  </section>
);

export const HowToUse: React.FC = () => (
  <div className="p-6 flex flex-col gap-6 max-w-lg mx-auto">
    <h2 className="text-base font-semibold">How to Use</h2>

    <Section title="Text Selection">
      <p>1. Select any text on your screen (drag to highlight)</p>
      <p>2. A small floating icon appears near your cursor</p>
      <p>3. Click the icon to open the assistant panel</p>
      <p>4. Type your question and press Enter</p>
    </Section>

    <Section title="Clipboard Shortcut">
      <p>Copy any text, then press:</p>
      <kbd className="bg-white/10 px-2 py-1 rounded font-mono w-fit">Ctrl + Shift + Space</kbd>
      <p>The assistant opens with that text as context.</p>
    </Section>

    <Section title="Screenshot Analysis">
      <p>1. Take a screenshot (Win+Shift+S or any tool)</p>
      <p>2. Copy it to clipboard</p>
      <p>3. A toast notification appears — click <strong>Accept</strong></p>
      <p>4. The assistant opens ready to answer questions about the image</p>
      <p className="text-white/40">Note: requires a vision-capable model (e.g. llava, gpt-4o)</p>
    </Section>

    <Section title="Using Ollama (Local AI)">
      <p>Ollama runs AI models on your machine — no internet or API key needed.</p>
      <p><strong>Start Ollama:</strong></p>
      <code className="bg-black/40 px-2 py-1 rounded font-mono block">ollama serve</code>
      <p><strong>Pull a model</strong> (do this once per model):</p>
      <code className="bg-black/40 px-2 py-1 rounded font-mono block">ollama pull llama3.2</code>
      <p>Model size guide:</p>
      <ul className="list-disc pl-4 flex flex-col gap-1">
        <li><code className="font-mono">llama3.2:1b</code> — very fast, 8GB+ RAM</li>
        <li><code className="font-mono">llama3.2</code> — balanced, 8GB+ RAM</li>
        <li><code className="font-mono">llava:7b</code> — vision support, 8GB+ RAM</li>
        <li><code className="font-mono">qwen2.5:7b</code> — smarter, 16GB+ RAM</li>
      </ul>
      <p>To run Ollama permanently (auto-starts with Windows), go to the <strong>Setup tab</strong>.</p>
    </Section>

    <Section title="Choosing OpenAI or Anthropic">
      <p>For cloud AI, go to <strong>Setup</strong> and enter your API key.</p>
      <p>OpenAI keys start with <code className="font-mono">sk-</code></p>
      <p>Anthropic keys start with <code className="font-mono">sk-ant-</code></p>
      <p>Then go to <strong>Models</strong> to set your preferred model as default.</p>
    </Section>
  </div>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/tabs/HowToUse.tsx
git commit -m "feat: add HowToUse tab with static usage guide"
```

---

## Task 11: Wire IPC channels to preload and verify build

**Files:**
- Modify: `electron/preload.ts` (verify — no changes needed, generic invoker already handles new channels)

- [ ] **Step 1: Verify preload handles new channels**

Open `electron/preload.ts`. Confirm `window.cc.invoke` and `window.cc.on` are generic (accept any channel string). No changes needed — the existing generic bridge handles all new IPC channels.

- [ ] **Step 2: Run the dev build and open dashboard**

```bash
npm run dev
```

Right-click the tray icon → "Open Dashboard". Verify:
- All 5 tabs are visible and clickable
- Home tab shows 3 connection pills (grey until Refresh clicked)
- Setup tab shows the 5-step checklist
- Models tab shows Ollama/OpenAI/Anthropic sub-tabs
- History tab shows existing chat history
- How to Use tab shows all 5 sections

- [ ] **Step 3: Test first-launch detection**

In `electron-store` data (find with `%APPDATA%\contextchat-desktop` on Windows), delete or set `hasCompletedSetup: false`. Restart the app — dashboard should open on Setup tab automatically.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete dashboard UI with 5 tabs, connection status, setup wizard, and model management"
```
