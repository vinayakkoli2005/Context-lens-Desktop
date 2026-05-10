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
