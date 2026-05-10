import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HistoryEntry } from '../src/shared/types';

const MAX_ENTRIES = 500;

const getFilePath = (): string => join(app.getPath('userData'), 'contextchat-history.json');

const readFile = (): HistoryEntry[] => {
  const path = getFilePath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as HistoryEntry[];
  } catch {
    return [];
  }
};

const writeFile = (entries: HistoryEntry[]): void => {
  writeFileSync(getFilePath(), JSON.stringify(entries, null, 2), 'utf8');
};

export const appendHistory = (entry: HistoryEntry): void => {
  let entries = readFile();
  entries = [entry, ...entries.filter(e => e.id !== entry.id)];
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
  writeFile(entries);
};

export const getHistory = (): HistoryEntry[] => readFile();

export const deleteHistoryEntry = (id: string): void => {
  const entries = readFile().filter(e => e.id !== id);
  writeFile(entries);
};

export const exportHistoryMarkdown = (): string => {
  const entries = readFile();
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    '# ContextChat History Export',
    `Generated: ${date}`,
    '',
  ];
  for (const entry of entries) {
    const dt = new Date(entry.startedAt).toLocaleString();
    lines.push('---', '', `## Conversation — ${dt}`);
    lines.push(`**Provider:** ${entry.provider} · **Model:** ${entry.model}`);
    if (entry.context.type === 'text') {
      const preview = entry.context.value.slice(0, 80);
      lines.push(`**Context:** [selected text: "${preview}${entry.context.value.length > 80 ? '...' : ''}"]`);
    } else {
      lines.push('**Context:** [screenshot]');
    }
    lines.push('');
    for (const msg of entry.messages) {
      if (msg.role === 'system') continue;
      const label = msg.role === 'user' ? '**You:**' : '**Assistant:**';
      lines.push(`${label} ${msg.content}`, '');
    }
  }
  return lines.join('\n');
};
