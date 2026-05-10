import React from 'react';
import type { QuickAction } from '../shared/types';

const PROMPTS: Record<QuickAction, string> = {
  explain: 'Explain this in simple terms.',
  summarize: 'Summarize this in 2-3 sentences.',
  ask: ''
};

export const ActionButtons: React.FC<{ onPick: (prompt: string) => void; disabled: boolean }> = ({ onPick, disabled }) => (
  <div className="flex gap-2 no-drag">
    <button disabled={disabled} onClick={() => onPick(PROMPTS.explain)}    className="px-3 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20 disabled:opacity-40">Explain</button>
    <button disabled={disabled} onClick={() => onPick(PROMPTS.summarize)} className="px-3 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20 disabled:opacity-40">Summarize</button>
  </div>
);
