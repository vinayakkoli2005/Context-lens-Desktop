import React from 'react';

export const ContextPreview: React.FC<{ text?: string; image?: string }> = ({ text, image }) => {
  if (image) {
    return <img src={`data:image/png;base64,${image}`} alt="screenshot" className="max-h-24 rounded" />;
  }
  return (
    <div className="text-xs text-white/60 italic line-clamp-3">
      "{text}"
    </div>
  );
};
