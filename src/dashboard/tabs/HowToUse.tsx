import React from 'react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold text-white/90 border-b border-white/10 pb-1">{title}</h3>
    <div className="text-xs text-white/70 flex flex-col gap-1.5">{children}</div>
  </section>
);

export const HowToUse: React.FC = () => (
  <div className="p-6 flex flex-col gap-6 max-w-lg mx-auto">
    <h2 className="text-base font-semibold">How to Use</h2>

    <Section title="Text Selection">
      <p>1. Select any text on your screen (drag to highlight)</p>
      <p>2. A small floating icon appears near your cursor</p>
      <p>3. Click the icon to open the assistant panel</p>
      <p>4. Type your question and press Enter</p>
    </Section>

    <Section title="Clipboard Shortcut">
      <p>Copy any text, then press:</p>
      <kbd className="bg-white/10 px-2 py-1 rounded font-mono w-fit">Ctrl + Shift + Space</kbd>
      <p>The assistant opens with that text as context.</p>
    </Section>

    <Section title="Screenshot Analysis">
      <p>1. Take a screenshot (Win+Shift+S or any tool)</p>
      <p>2. Copy it to clipboard</p>
      <p>3. A toast notification appears — click <strong>Accept</strong></p>
      <p>4. The assistant opens ready to answer questions about the image</p>
      <p className="text-white/40">Note: requires a vision-capable model (e.g. llava, gpt-4o)</p>
    </Section>

    <Section title="Using Ollama (Local AI)">
      <p>Ollama runs AI models on your machine — no internet or API key needed.</p>
      <p><strong>Start Ollama:</strong></p>
      <code className="bg-black/40 px-2 py-1 rounded font-mono block">ollama serve</code>
      <p><strong>Pull a model</strong> (do this once per model):</p>
      <code className="bg-black/40 px-2 py-1 rounded font-mono block">ollama pull llama3.2</code>
      <p>Model size guide:</p>
      <ul className="list-disc pl-4 flex flex-col gap-1">
        <li><code className="font-mono">llama3.2:1b</code> — very fast, 8GB+ RAM</li>
        <li><code className="font-mono">llama3.2</code> — balanced, 8GB+ RAM</li>
        <li><code className="font-mono">llava:7b</code> — vision support, 8GB+ RAM</li>
        <li><code className="font-mono">qwen2.5:7b</code> — smarter, 16GB+ RAM</li>
      </ul>
      <p>To run Ollama permanently (auto-starts with Windows), go to the <strong>Setup tab</strong>.</p>
    </Section>

    <Section title="Choosing OpenAI or Anthropic">
      <p>For cloud AI, go to <strong>Setup</strong> and enter your API key.</p>
      <p>OpenAI keys start with <code className="font-mono">sk-</code></p>
      <p>Anthropic keys start with <code className="font-mono">sk-ant-</code></p>
      <p>Then go to <strong>Models</strong> to set your preferred model as default.</p>
    </Section>
  </div>
);
