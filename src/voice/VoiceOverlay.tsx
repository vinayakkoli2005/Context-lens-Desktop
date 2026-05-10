import React, { useEffect, useRef, useState } from 'react';

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 1500;
const MAX_DURATION_MS = 28000;

const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(off, Math.max(-1, Math.min(1, samples[i])) * 0x7FFF, true);
    off += 2;
  }
  return buf;
};

export const VoiceOverlay: React.FC = () => {
  const [phase, setPhase] = useState<'listening' | 'transcribing' | 'done' | 'error'>('listening');
  const [elapsed, setElapsed] = useState(0);
  const [statusText, setStatusText] = useState('Listening…');
  const samplesRef = useRef<Float32Array[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const close = () => window.cc.send(window.cc.channels.VOICE_CLOSE);

  const stopAndTranscribe = async (samples: Float32Array[], sampleRate: number) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    if (samples.length === 0) { close(); return; }

    setPhase('transcribing');
    setStatusText('Transcribing…');

    const total = samples.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of samples) { merged.set(chunk, offset); offset += chunk.length; }

    const wav = encodeWav(merged, sampleRate);
    const bytes = new Uint8Array(wav);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    try {
      const result = await window.cc.invoke(window.cc.channels.WHISPER_TRANSCRIBE, { wavBase64: base64 }) as { text: string };
      if (result.text) {
        window.cc.send(window.cc.channels.VOICE_CLOSE);
        window.cc.invoke(window.cc.channels.VOICE_SEND, { text: result.text });
      }
      setPhase('done');
    } catch {
      setPhase('error');
      setStatusText('Failed — try again');
      setTimeout(close, 1500);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handleKeyDown);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const ctx = new AudioContext({ sampleRate: 16000 });
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const data = e.inputBuffer.getChannelData(0).slice();
          samplesRef.current.push(data);
          const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
          if (rms < SILENCE_THRESHOLD) {
            if (!silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(
                () => stopAndTranscribe(samplesRef.current, ctx.sampleRate),
                SILENCE_DURATION_MS
              );
            }
          } else {
            if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
          }
        };

        source.connect(processor);
        processor.connect(ctx.destination);
        maxTimerRef.current = setTimeout(() => stopAndTranscribe(samplesRef.current, ctx.sampleRate), MAX_DURATION_MS);
        elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      } catch {
        setPhase('error');
        setStatusText('Microphone access denied');
        setTimeout(close, 2000);
      }
    })();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="frosted rounded-2xl px-6 py-4 flex items-center gap-4 w-full mx-2">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
          phase === 'listening' ? 'bg-red-500/80 animate-pulse' :
          phase === 'transcribing' ? 'bg-blue-500/80 animate-pulse' :
          'bg-white/20'
        }`}>
          {phase === 'transcribing' ? '⏳' : '🎤'}
        </div>
        <div className="flex flex-col">
          <span className="text-white text-sm font-medium">{statusText}</span>
          {phase === 'listening' && (
            <span className="text-white/50 text-xs">{elapsed}s · Esc to cancel</span>
          )}
        </div>
      </div>
    </div>
  );
};
