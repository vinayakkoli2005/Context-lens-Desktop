import React from 'react';

export const ResponseStream: React.FC<{ text: string; streaming: boolean }> = ({ text, streaming }) => (
  <div className="whitespace-pre-wrap text-sm text-white/95">
    {text}{streaming && <span className="opacity-60">▋</span>}
  </div>
);
