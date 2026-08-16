'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Plus, MessageSquare, Wrench } from 'lucide-react';
import { api, type WorkspaceFile } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: { tool: string; summary: string }[];
}

interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMsg[];
}

interface Props {
  workspaceId: string;
  onAgentResult: (files: WorkspaceFile[]) => void;
  // Read-only mode for read-only collaborators: the input is disabled.
  readOnly?: boolean;
}

// The left-side AI chat panel. Lists the workspace's chat threads, lets the user send a prompt
// to the code agent, and shows the assistant's reply. When the agent returns updated files they
// are surfaced to the parent via onAgentResult so the Code/App tabs refresh.
export default function ChatPanel({ workspaceId, onAgentResult, readOnly = false }: Props) {
  const { t } = useI18n();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listChats(workspaceId);
      setThreads(res.chats);
      if (res.chats.length > 0 && !activeId) setActiveId(res.chats[0].id);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [workspaceId, activeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-scroll to the latest message when the active thread changes or a new message arrives.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threads, activeId]);

  async function newChat() {
    try {
      const res = await api.createChat(workspaceId);
      const thread: ChatThread = {
        id: res.chat.id,
        title: t('ws.newChat'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setThreads((prev) => [thread, ...prev]);
      setActiveId(thread.id);
    } catch {
      /* ignore */
    }
  }

  async function send() {
    const prompt = input.trim();
    if (!prompt || sending) return;
    let chatId = activeId;
    if (!chatId) {
      try {
        const res = await api.createChat(workspaceId);
        chatId = res.chat.id;
        const thread: ChatThread = {
          id: res.chat.id,
          title: t('ws.newChat'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        setThreads((prev) => [thread, ...prev]);
        setActiveId(chatId);
      } catch {
        return;
      }
    }
    setSending(true);
    setInput('');
    // Optimistically append the user's message.
    const userMsg: ChatMsg = { id: `tmp-${Date.now()}`, role: 'user', content: prompt };
    setThreads((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, userMsg] } : c)),
    );

    try {
      // Persist the user message + run the agent.
      await api.appendChatMessage(workspaceId, chatId, 'user', prompt);
      const result = await api.runAgent(workspaceId, prompt);
      // Surface the new files to the parent (Code/App tabs).
      onAgentResult(result.files as WorkspaceFile[]);
      // Persist and append the assistant reply.
      await api.appendChatMessage(workspaceId, chatId, 'assistant', result.message);
      const aiMsg: ChatMsg = {
        id: `tmp-${Date.now()}-a`,
        role: 'assistant',
        content: result.message,
        toolCalls: result.toolCalls ?? [],
      };
      setThreads((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, aiMsg] } : c)),
      );
    } catch (e) {
      const errMsg = (e as Error).message || t('ws.agentFailed');
      const aiMsg: ChatMsg = { id: `tmp-${Date.now()}-e`, role: 'assistant', content: `❌ ${errMsg}` };
      setThreads((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, aiMsg] } : c)),
      );
    } finally {
      setSending(false);
    }
  }

  const active = threads.find((c) => c.id === activeId);

  return (
    <div className="flex h-full flex-col">
      {/* Thread header + new chat */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{t('ws.chatTitle')}</span>
        <button
          onClick={newChat}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={t('ws.newChat')}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Thread list (compact) */}
      {threads.length > 1 && (
        <div className="shrink-0 border-b px-2 py-1.5">
          <select
            value={activeId ?? ''}
            onChange={(e) => setActiveId(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none"
          >
            {threads.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : !active || active.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <MessageSquare className="mb-2 h-6 w-6 opacity-50" />
            <p className="text-xs">{t('ws.chatEmpty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.messages.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  'flex',
                  m.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={clsx(
                    'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground',
                  )}
                >
                  {m.content}
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                      {m.toolCalls.map((tc, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                        >
                          <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            <span className="font-mono text-foreground/80">{tc.tool}</span>
                            {tc.summary ? ` — ${tc.summary}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-secondary px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-2">
        {readOnly ? (
          <p className="rounded-md bg-secondary/50 px-2.5 py-2 text-center text-xs text-muted-foreground">
            {t('ws.readOnlyHint')}
          </p>
        ) : (
          <div className="flex items-end gap-1.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t('ws.chatPlaceholder')}
              rows={2}
              className="min-h-[40px] flex-1 resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
