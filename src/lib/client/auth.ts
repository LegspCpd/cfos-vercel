'use client';

const TOKEN_KEY = 'cfos_token';

// Token is stored BOTH as a cookie (so the server can check auth during SSR and
// redirect unauthenticated users straight to /login) and in localStorage (backward
// compat). The cookie is non-httpOnly so the client can read/write it, and it lives
// at path=/ so it's available on every route.
function setCookie(value: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

function getCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

export function getToken(): string | null {
  return getCookie() || (typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null);
}

export function setToken(token: string) {
  setCookie(token);
  if (typeof window !== 'undefined') window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  clearCookie();
  if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
