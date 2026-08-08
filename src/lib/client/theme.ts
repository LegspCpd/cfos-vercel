'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
const THEME_KEY = 'cfos_theme';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', dark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(theme);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAndStore = (t: Theme) => {
    setTheme(t);
    window.localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  };

  return [theme, setAndStore];
}
