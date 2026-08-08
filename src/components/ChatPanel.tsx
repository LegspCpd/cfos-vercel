'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  onRunAgent: (prompt: string) => Promise<{ message: string; agentEdited?: boolean }>;
  busy: boolean;
  // When autoPrompt changes (and autoPromptNonce bumps), it is sent automatically.
  autoPrompt?: string;
  autoPromptNonce?: number;
}

const SUGGESTIONS = [
  'Build me a todo app',
  'Make a tic-tac-toe game',
  'Create a landing page for my product',
  'Build a counter with a nice design',
];

function MessageContent({ content }: { content: string }) {
  // Simple markdown render with code block support.
  return (
    <div className="prose prose-sm max-w-none prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export default function ChatPanel({ onRunAgent, busy, autoPrompt, autoPromptNonce }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentAutoRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Auto-send an externally supplied prompt (from home page / explore).
  useEffect(() => {
    if (autoPrompt && autoPromptNonce && autoPromptNonce > 0 && !sentAutoRef.current) {
      sentAutoRef.current = true;
      send(autoPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt, autoPromptNonce]);

  async function send(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setError('');
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    try {
      const result = await onRunAgent(trimmed);
      const editedNote = result.agentEdited ? '\n\n_(Files were updated — check the editor and preview.)_' : '';
      setMessages((m) => [...m, { role: 'assistant', content: result.message + editedNote }]);
    } catch (e) {
      setError((e as Error).message);
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${(e as Error).message}` }]);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !busy && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Ask the agent to build or modify your app. It will write code to the workspace files.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={busy}
                className="block w-full rounded-md border bg-card px-3 py-2 text-left text-sm hover:border-primary/50 disabled:opacity-50"
              >
                <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {m.role === 'user' ? (
                m.content
              ) : (
                <MessageContent content={m.content} />
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
            Agent is thinking...
          </div>
        )}
      </div>

      {error && <div className="px-3 pb-1 text-xs text-destructive">{error}</div>}

      <div className="border-t p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Tell the agent what to build..."
            rows={1}
            className="max-h-32 min-h-[38px] flex-1 resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-[38px] items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
