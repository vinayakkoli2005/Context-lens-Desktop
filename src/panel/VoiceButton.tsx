import React, { useEffect, useRef, useState } from 'react';

interface Props {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

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

export const VoiceButton: React.FC<Props> = ({ onTranscript, disabled }) => {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [whisperReady, setWhisperReady] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const samplesRef = useRef<Float32Array[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    window.cc.invoke(window.cc.channels.WHISPER_READY).then((r: { ready: boolean }) => {
      setWhisperReady(r.ready);
    });
    const unsub = window.cc.on(window.cc.channels.WHISPER_DOWNLOAD_PROGRESS, () => {
      window.cc.invoke(window.cc.channels.WHISPER_READY).then((r: { ready: boolean }) => setWhisperReady(r.ready));
    });
    return unsub;
  }, []);

  const stopRecording = async (samples: Float32Array[], sampleRate: number) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    setRecording(false);
    if (samples.length === 0) return;

    const total = samples.reduce((s, c) => s + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of samples) { merged.set(chunk, offset); offset += chunk.length; }

    const wav = encodeWav(merged, sampleRate);
    const bytes = new Uint8Array(wav);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    setTranscribing(true);
    try {
      const result = await window.cc.invoke(window.cc.channels.WHISPER_TRANSCRIBE, { wavBase64: base64 }) as { text: string };
      if (result.text) onTranscript(result.text);
    } catch (e: any) {
      console.error('transcription failed', e);
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    samplesRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = new AudioContext({ sampleRate: 16000 });
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    setRecording(true);

    processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0).slice();
      samplesRef.current.push(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      if (rms < SILENCE_THRESHOLD) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => stopRecording(samplesRef.current, ctx.sampleRate), SILENCE_DURATION_MS);
        }
      } else {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    maxTimerRef.current = setTimeout(() => stopRecording(samplesRef.current, ctx.sampleRate), MAX_DURATION_MS);
  };

  const handleClick = () => {
    if (recording) stopRecording(samplesRef.current, ctxRef.current?.sampleRate ?? 16000);
    else startRecording();
  };

  if (transcribing) return (
    <button disabled title="Transcribing…" className="px-2 py-1 rounded text-xs bg-white/20 flex items-center gap-1.5 opacity-80">
      <span style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: 'rgba(255,255,255,0.9)',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span>Transcribing…</span>
    </button>
  );

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={recording ? 'Click to stop' : 'Voice input'}
      className={`px-2 py-1 rounded text-xs transition-colors ${
        recording ? 'bg-red-500/80 hover:bg-red-500 animate-pulse' :
        'bg-white/10 hover:bg-white/20'
      }`}
    >
      {recording ? '⏹' : '🎤'}
    </button>
  );
};
