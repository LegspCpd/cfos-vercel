'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@/lib/client/i18n';
import { api } from '@/lib/client/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
}

interface ChatPanelProps {
  workspaceId: string;
  onRunAgent: (prompt: string) => Promise<{ message: string; agentEdited?: boolean }>;
  busy: boolean;
  // When autoPrompt changes (and autoPromptNonce bumps), it is sent automatically.
  autoPrompt?: string;
  autoPromptNonce?: number;
}

const SUGGESTION_PROMPTS = [
  'Build me a todo app with add, complete, and delete. Nice design.',
  'Make a tic-tac-toe game with a clean UI and win detection.',
  'Create a modern landing page for my product with a hero, features, and footer.',
  'Build a counter with a nice design.',
];

function MessageContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export default function ChatPanel({
  workspaceId,
  onRunAgent,
  busy,
  autoPrompt,
  autoPromptNonce,
}: ChatPanelProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatIdRef = useRef<string | null>(null);
  const sentAutoRef = useRef(false);

  // Load the latest chat thread for this workspace (create one if none exists).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listChats(workspaceId);
        if (cancelled) return;
        let chat = res.chats[0];
        if (!chat) {
          const created = await api.createChat(workspaceId);
          chat = { id: created.chat.id, title: '', messages: [], createdAt: '', updatedAt: '' };
        }
        chatIdRef.current = chat.id;
        setMessages(
          chat.messages.map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
            id: m.id,
          })),
        );
      } catch {
        /* persistence unavailable — continue in memory-only mode */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Auto-send an externally supplied prompt (from home page / explore).
  useEffect(() => {
    if (hydrated && autoPrompt && autoPromptNonce && autoPromptNonce > 0 && !sentAutoRef.current) {
      sentAutoRef.current = true;
      send(autoPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, autoPrompt, autoPromptNonce]);

  async function persistMessage(role: 'user' | 'assistant', content: string) {
    if (!chatIdRef.current) return;
    try {
      await api.appendChatMessage(workspaceId, chatIdRef.current, role, content);
    } catch {
      /* best-effort persistence */
    }
  }

  async function send(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setError('');
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    persistMessage('user', trimmed);
    try {
      const result = await onRunAgent(trimmed);
      const editedNote = result.agentEdited ? `\n\n_(${t('ws.filesUpdated')})_` : '';
      const reply = result.message + editedNote;
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      persistMessage('assistant', reply);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setMessages((m) => [...m, { role: 'assistant', content: msg }]);
      persistMessage('assistant', msg);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ws.agent')}</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {!hydrated ? (
          <div className="space-y-2">
            <div className="skeleton h-10 w-3/4" />
            <div className="skeleton h-10 w-2/3" />
          </div>
        ) : messages.length === 0 && !busy ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('ws.agentHint')}
            </p>
            {SUGGESTION_PROMPTS.map((p, i) => (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={busy}
                className="press block w-full rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 disabled:opacity-50"
              >
                <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
                {t(`ws.suggest${i}`)}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id ?? i} className={`reveal-row flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
          ))
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="thinking-indicator inline-block h-2 w-6 overflow-hidden rounded-full bg-primary/30" />
            {t('ws.agentThinking')}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 px-3 pb-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

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
            placeholder={t('ws.agentPlaceholder')}
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
