'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, FileText, CheckSquare, Gamepad2, BarChart3, Timer } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import NewFormatRow from '@/components/NewFormatRow';

// Task cards — English prompts for the agent; titles are localized.
const TASK_PROMPTS = [
  'Create a modern landing page for my product with a hero, features, and footer.',
  'Build a todo list app with add, complete, and delete. Nice design.',
  'Make a tic-tac-toe game with a clean UI and win detection.',
  'Build a dashboard with some charts and stat cards using sample data.',
  'Create a pomodoro timer with start/pause/reset.',
];
const TASK_ICONS = [FileText, CheckSquare, Gamepad2, BarChart3, Timer];

export default function HomePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [tagline, setTagline] = useState('');
  const TASKS = TASK_ICONS.map((icon, i) => ({
    icon,
    title: t(`home.task${i}`),
    prompt: TASK_PROMPTS[i],
  }));

  // Prefill from ?prompt= (e.g. from Explore page).
  useEffect(() => {
    const p = new URL(window.location.href).searchParams.get('prompt');
    if (p) setPrompt(p);
  }, []);

  useEffect(() => {
    api
      .getPublicSite()
      .then((site) => setTagline(site.siteTagline))
      .catch(() => {});
  }, []);

  async function startWorkspace(text: string) {
    if (!text.trim() || creating) return;
    setCreating(true);
    try {
      const res = await api.createWorkspace(t('ws.untitled'));
      // Pass the prompt so the workspace page can auto-run the agent on load.
      router.push(`/workspace/${res.workspace.id}?prompt=${encodeURIComponent(text)}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="reveal-row mb-2 text-center">
        <h1 className="bg-gradient-to-br from-primary via-primary/80 to-foreground/90 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          {t('home.title')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {tagline || t('home.sub')}
        </p>
      </div>

      {/* Chat input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startWorkspace(prompt);
        }}
        className="reveal-row mt-6 flex w-full max-w-xl items-center gap-2"
        style={{ animationDelay: '60ms' }}
      >
        <div className="relative flex-1">
          <div className="prompt-glow" aria-hidden="true" />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                startWorkspace(prompt);
              }
            }}
            placeholder={t('home.placeholder')}
            rows={1}
            className="max-h-40 min-h-[44px] w-full resize-y rounded-lg border bg-card px-4 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !prompt.trim()}
          className="press flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          aria-label={t('ws.new')}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Task suggestions */}
      <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {TASKS.map((task, i) => (
          <button
            key={task.title}
            onClick={() => startWorkspace(task.prompt)}
            disabled={creating}
            style={{ animationDelay: `${120 + i * 40}ms` }}
            className="reveal-row press flex items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors duration-200 hover:border-primary/50 hover:shadow-md disabled:opacity-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <task.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {task.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{task.prompt}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Start with a format */}
      <div className="mt-8" style={{ animationDelay: '320ms' }}>
        <NewFormatRow />
      </div>
    </div>
  );
}
