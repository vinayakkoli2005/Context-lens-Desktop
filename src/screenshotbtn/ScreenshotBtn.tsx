import React, { useRef, useState } from 'react';

export const ScreenshotBtn: React.FC = () => {
  const [pressed, setPressed] = useState(false);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, winX: 0, winY: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { dragging: false, startX: e.screenX, startY: e.screenY, winX: window.screenX, winY: window.screenY };
    setPressed(true);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.screenX - dragRef.current.startX;
      const dy = ev.screenY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.dragging = true;
        window.cc.send(window.cc.channels.SCREENSHOT_BTN_DRAG, {
          x: dragRef.current.winX + dx,
          y: dragRef.current.winY + dy,
        });
      }
    };

    const onUp = () => {
      setPressed(false);
      if (!dragRef.current.dragging) {
        window.cc.send(window.cc.channels.SCREENSHOT_BTN_CLICK);
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer select-none transition-transform ${
        pressed ? 'scale-90' : 'scale-100'
      }`}
      title="Take screenshot and ask AI"
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg transition-colors ${
        pressed ? 'bg-white/40' : 'bg-white/20 hover:bg-white/30'
      }`}
        style={{ backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }}
      >
        📷
      </div>
    </div>
  );
};
