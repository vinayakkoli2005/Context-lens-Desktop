import React from 'react';

export const ScreenshotToast: React.FC = () => {
  const accept = () => window.cc.send(window.cc.channels.TOAST_ACCEPT);
  const dismiss = () => window.cc.send(window.cc.channels.TOAST_DISMISS);
  return (
    <div className="frosted p-3 m-1 flex flex-col gap-2 no-drag">
      <div className="text-sm">📸 Screenshot ready — Ask ContextChat?</div>
      <div className="flex gap-2 justify-end">
        <button onClick={dismiss} className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20">Dismiss</button>
        <button onClick={accept} className="px-2 py-1 text-xs rounded bg-blue-500/80 hover:bg-blue-500">Yes</button>
      </div>
    </div>
  );
};
