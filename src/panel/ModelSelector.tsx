import React, { useEffect, useRef, useState } from 'react';

interface ModelInfo { name: string; }

export const ModelSelector: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    window.cc.invoke(window.cc.channels.MODELS_LIST)
      .then((list: ModelInfo[]) => {
        setModels(Array.isArray(list) ? list : []);
        if (list.length > 0 && !valueRef.current) onChangeRef.current(list[0].name);
      })
      .catch((err: unknown) => { console.error('MODELS_LIST failed:', err); setModels([]); });
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/10 text-xs rounded px-2 py-1 no-drag"
    >
      {models.length === 0 && <option value="">no models</option>}
      {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
    </select>
  );
};
