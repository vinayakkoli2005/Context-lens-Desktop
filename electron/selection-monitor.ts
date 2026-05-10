import { uIOhook, UiohookMouseEvent } from 'uiohook-napi';
import { clipboard } from 'electron';
import { keyboard, Key } from '@nut-tree-fork/nut-js';

const MIN_TEXT_LEN = 4;
const MIN_DRAG_PX = 5;

let lastDownX = 0;
let lastDownY = 0;
let dragging = false;

export interface SelectionEvent {
  text: string;
  x: number;
  y: number;
}

export const startSelectionMonitor = (
  onSelection: (e: SelectionEvent) => void,
  onDeselect?: () => void,
): (() => void) => {
  const onDown = (e: UiohookMouseEvent) => {
    if (e.button !== 1) return; // left button only
    lastDownX = e.x; lastDownY = e.y;
    dragging = true;
  };

  const onUp = async (e: UiohookMouseEvent) => {
    if (!dragging || e.button !== 1) return;
    dragging = false;
    const dx = Math.abs(e.x - lastDownX);
    const dy = Math.abs(e.y - lastDownY);
    if (dx < MIN_DRAG_PX && dy < MIN_DRAG_PX) {
      onDeselect?.();
      return;
    }

    const previous = clipboard.readText();
    const previousImage = clipboard.readImage();
    try {
      // small delay so the host app finalizes the selection
      await new Promise((r) => setTimeout(r, 60));
      await keyboard.pressKey(Key.LeftControl, Key.C);
      await keyboard.releaseKey(Key.LeftControl, Key.C);
      await new Promise((r) => setTimeout(r, 80));
      const text = clipboard.readText().trim();
      if (text && text.length >= MIN_TEXT_LEN && text !== previous.trim()) {
        onSelection({ text, x: e.x, y: e.y });
      }
    } catch (err) {
      console.error('selection read failed', err);
    } finally {
      // restore prior clipboard
      if (!previousImage.isEmpty()) clipboard.writeImage(previousImage);
      else clipboard.writeText(previous);
    }
  };

  uIOhook.on('mousedown', onDown);
  uIOhook.on('mouseup', onUp);
  uIOhook.start();

  return () => {
    uIOhook.off('mousedown', onDown);
    uIOhook.off('mouseup', onUp);
    uIOhook.stop();
  };
};
