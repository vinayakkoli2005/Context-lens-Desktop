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

    const unsub = window.cc.on(window.cc.channels.OLLAMA_PULL_PROGRESS, (obj: { status: string; completed?: number; total?: number }) => {
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
