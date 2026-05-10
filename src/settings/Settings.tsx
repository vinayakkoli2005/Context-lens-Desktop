import React, { useEffect, useState } from 'react';
import type { Settings as S, HardwareInfo } from '../shared/types';

interface ModelInfo { name: string; }

const PROVIDER_LABELS = { ollama: 'Ollama (Local)', openai: 'OpenAI', anthropic: 'Anthropic' };

const validateKey = (provider: string, key: string): string | null => {
  if (provider === 'openai' && key && !key.startsWith('sk-')) return 'OpenAI keys must start with sk-';
  if (provider === 'anthropic' && key && !key.startsWith('sk-ant-')) return 'Anthropic keys must start with sk-ant-';
  return null;
};

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<S | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [fetchSuccess, setFetchSuccess] = useState('');
  const [keyError, setKeyError] = useState('');

  useEffect(() => {
    window.cc.invoke(window.cc.channels.SETTINGS_GET).then(setSettings);
    window.cc.invoke(window.cc.channels.HARDWARE_INFO).then(setHw);
  }, []);

  const update = async (patch: Partial<S>) => {
    const next = await window.cc.invoke(window.cc.channels.SETTINGS_SET, patch);
    setSettings(next);
    // Re-validate key on provider change
    if (patch.provider) {
      const key = patch.provider === 'openai' ? next.openaiApiKey : next.anthropicApiKey;
      setKeyError(validateKey(patch.provider, key) ?? '');
      setModels([]);
      setFetchError('');
      setFetchSuccess('');
    }
  };

  const handleKeyChange = (field: 'openaiApiKey' | 'anthropicApiKey', value: string) => {
    const provider = field === 'openaiApiKey' ? 'openai' : 'anthropic';
    setKeyError(validateKey(provider, value) ?? '');
    update({ [field]: value });
  };

  const fetchModels = async () => {
    if (!settings) return;
    setFetchError('');
    setFetchSuccess('');
    setModels([]);
    try {
      const list = await window.cc.invoke(window.cc.channels.MODELS_LIST, {
        provider: settings.provider,
        apiKey: settings.provider === 'openai' ? settings.openaiApiKey : settings.anthropicApiKey,
        ollamaUrl: settings.ollamaUrl,
      });
      setModels(list);
      setFetchSuccess(`${list.length} model${list.length !== 1 ? 's' : ''} found`);
    } catch (e: any) {
      setFetchError(e.message ?? 'Failed to fetch models');
    }
  };

  if (!settings || !hw) return <div className="p-4 text-sm">Loading…</div>;

  const currentKey = settings.provider === 'openai' ? settings.openaiApiKey : settings.anthropicApiKey;

  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-4 text-sm">
      <h1 className="text-xl font-semibold">ContextChat Settings</h1>

      <section className="frosted p-3 rounded">
        <div className="text-xs uppercase text-white/60">Hardware</div>
        <div>Detected RAM: <strong>{hw.totalRamGb} GB</strong></div>
        <div className="text-white/80 mt-1 text-xs">
          Recommended: <code>{hw.recommendedTextModel}</code> (text), <code>{hw.recommendedVisionModel}</code> (vision)
        </div>
      </section>

      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase text-white/60">AI Provider</span>
        <select
          value={settings.provider}
          onChange={(e) => update({ provider: e.target.value as S['provider'] })}
          className="bg-white/10 rounded px-2 py-1"
        >
          {(Object.keys(PROVIDER_LABELS) as S['provider'][]).map(p => (
            <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
          ))}
        </select>
      </label>

      {settings.provider === 'ollama' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-white/60">Ollama URL</span>
          <input
            value={settings.ollamaUrl}
            onChange={(e) => update({ ollamaUrl: e.target.value })}
            className="bg-white/10 rounded px-2 py-1"
          />
        </label>
      )}

      {settings.provider !== 'ollama' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-white/60">
            {settings.provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key
          </span>
          <input
            type="password"
            value={currentKey}
            onChange={(e) => handleKeyChange(
              settings.provider === 'openai' ? 'openaiApiKey' : 'anthropicApiKey',
              e.target.value
            )}
            placeholder={settings.provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            className="bg-white/10 rounded px-2 py-1"
          />
          {keyError && <div className="text-red-400 text-xs">{keyError}</div>}
        </label>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            onClick={fetchModels}
            className="px-3 py-1 rounded bg-blue-600/70 hover:bg-blue-600 text-xs"
          >
            Fetch Models
          </button>
          {fetchSuccess && <span className="text-green-400 text-xs">{fetchSuccess}</span>}
          {fetchError && <span className="text-red-400 text-xs">{fetchError}</span>}
        </div>

        {models.length > 0 && (
          <label className="flex flex-col gap-1 mt-2">
            <span className="text-xs uppercase text-white/60">Select Model</span>
            <select
              value={settings.selectedModel}
              onChange={(e) => update({ selectedModel: e.target.value })}
              className="bg-white/10 rounded px-2 py-1"
            >
              <option value="">(use recommendation)</option>
              {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.launchAtStartup}
          onChange={(e) => update({ launchAtStartup: e.target.checked })}
        />
        <span>Launch at Windows startup</span>
      </label>
    </div>
  );
};
