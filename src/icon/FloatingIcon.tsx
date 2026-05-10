import React from 'react';

export const FloatingIcon: React.FC = () => {
  const click = () => window.cc.send(window.cc.channels.ICON_CLICK);
  return (
    <button
      onClick={click}
      title="Ask ContextChat"
      className="w-7 h-7 rounded-full frosted flex items-center justify-center text-sm hover:scale-110 transition cursor-pointer no-drag"
    >
      🤖
    </button>
  );
};
