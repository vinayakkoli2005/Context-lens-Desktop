import { clipboard, nativeImage } from 'electron';

const POLL_MS = 500;

export const startClipboardWatcher = (onScreenshot: (base64Png: string) => void): (() => void) => {
  let lastImageHash = '';
  const interval = setInterval(() => {
    const img = clipboard.readImage();
    if (img.isEmpty()) { lastImageHash = ''; return; }
    const png = img.toPNG();
    // cheap hash: size + first 16 bytes hex
    const hash = `${png.length}:${png.slice(0, 16).toString('hex')}`;
    if (hash === lastImageHash) return;
    lastImageHash = hash;
    onScreenshot(png.toString('base64'));
  }, POLL_MS);
  return () => clearInterval(interval);
};
