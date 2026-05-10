import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync, createWriteStream, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import https from 'node:https';

const whisperDir = () => join(app.getPath('userData'), 'whisper');
const modelPath = () => join(whisperDir(), 'ggml-base.en.bin');

// Binary may live in a subfolder alongside its DLLs — find and cache the path
let _binaryPath: string | null = null;
const binaryPath = (): string => {
  if (_binaryPath && existsSync(_binaryPath)) return _binaryPath;
  for (const name of ['whisper-cli.exe', 'main.exe']) {
    const found = findFile(whisperDir(), name);
    if (found) { _binaryPath = found; return found; }
  }
  return join(whisperDir(), 'whisper-cli.exe'); // fallback (will fail gracefully)
};

const BINARY_URL = 'https://github.com/ggerganov/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin?download=true';

export type DownloadProgressCallback = (stage: 'binary' | 'model', percent: number) => void;

const downloadFile = (url: string, dest: string, onProgress: (percent: number) => void): Promise<void> =>
  new Promise((resolve, reject) => {
    const follow = (u: string, redirects = 0) => {
      if (redirects > 10) { reject(new Error('Too many redirects')); return; }
      const parsed = new URL(u);
      https.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'contextchat-desktop/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
          res.resume();
          if (!res.headers.location) { reject(new Error('Redirect with no location')); return; }
          const next = res.headers.location.startsWith('http') ? res.headers.location : `https://${parsed.hostname}${res.headers.location}`;
          follow(next, redirects + 1);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
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
        res.on('end', () => stream.end());
        stream.on('finish', resolve);
        stream.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });

// Walk a directory recursively to find a file by name
const findFile = (dir: string, name: string): string | null => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
};

const extractZip = async (zipPath: string, destDir: string): Promise<void> => {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
};

export const ensureWhisper = async (onProgress: DownloadProgressCallback): Promise<void> => {
  mkdirSync(whisperDir(), { recursive: true });

  if (!findFile(whisperDir(), 'whisper-cli.exe') && !findFile(whisperDir(), 'main.exe')) {
    const zipPath = join(whisperDir(), 'whisper-bin.zip');
    await downloadFile(BINARY_URL, zipPath, (p) => onProgress('binary', p));
    await extractZip(zipPath, whisperDir());
    _binaryPath = null; // reset cache after extraction
  }

  if (!existsSync(modelPath())) {
    await downloadFile(MODEL_URL, modelPath(), (p) => onProgress('model', p));
  }
};

export const isWhisperReady = (): boolean =>
  !!(findFile(whisperDir(), 'whisper-cli.exe') || findFile(whisperDir(), 'main.exe')) && existsSync(modelPath());

export const transcribe = (wavPath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const bin = binaryPath();
    const proc = spawn(bin, [
      '-m', modelPath(),
      '-f', wavPath,
      '--no-timestamps',
      '-l', 'en',
    ], { cwd: join(bin, '..') });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`whisper exited ${code}: ${err}`));
      else resolve(out.replace(/\[.*?\]/g, '').trim());
    });
  });
