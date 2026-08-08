'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Send } from 'lucide-react';
import { api } from '@/lib/client/api';

const TASKS = [
  { icon: '📄', title: 'Build a one-page landing site', prompt: 'Create a modern landing page for my product with a hero, features, and footer.' },
  { icon: '✅', title: 'Make a todo app', prompt: 'Build a todo list app with add, complete, and delete. Nice design.' },
  { icon: '🎮', title: 'Build a tic-tac-toe game', prompt: 'Make a tic-tac-toe game with a clean UI and win detection.' },
  { icon: '📊', title: 'Create a data dashboard', prompt: 'Build a dashboard with some charts and stat cards using sample data.' },
  { icon: '⏱️', title: 'Build a pomodoro timer', prompt: 'Create a pomodoro timer with start/pause/reset.' },
];

export default function HomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);

  // Prefill from ?prompt= (e.g. from Explore page).
  useEffect(() => {
    const p = new URL(window.location.href).searchParams.get('prompt');
    if (p) setPrompt(p);
  }, []);

  async function startWorkspace(text: string) {
    if (!text.trim() || creating) return;
    setCreating(true);
    try {
      const res = await api.createWorkspace('Untitled Workspace');
      // Pass the prompt so the workspace page can auto-run the agent on load.
      router.push(`/workspace/${res.workspace.id}?prompt=${encodeURIComponent(text)}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="mb-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          What do you want to build?
        </h1>
        <p className="mt-2 text-muted-foreground">
          Describe an app and the agent will write it for you.
        </p>
      </div>

      {/* Chat input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startWorkspace(prompt);
        }}
        className="mt-6 flex w-full max-w-xl items-end gap-2"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              startWorkspace(prompt);
            }
          }}
          placeholder="e.g. Build a calculator app..."
          rows={1}
          className="max-h-40 min-h-[44px] flex-1 resize-y rounded-lg border bg-card px-4 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={creating || !prompt.trim()}
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          aria-label="Create workspace"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Task suggestions */}
      <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {TASKS.map((task) => (
          <button
            key={task.title}
            onClick={() => startWorkspace(task.prompt)}
            disabled={creating}
            className="flex items-start gap-3 rounded-lg border bg-card p-4 text-left hover:border-primary/50 disabled:opacity-50"
          >
            <span className="text-xl">{task.icon}</span>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {task.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{task.prompt}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
