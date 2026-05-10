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
