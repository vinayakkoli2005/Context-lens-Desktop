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
