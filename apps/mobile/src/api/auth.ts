/**
 * Username/password session: the signed token lives in memory and localStorage, REST calls
 * send it as a Bearer header and SSE/WebSocket URLs carry it as `?token=` (no headers there).
 * Kept identical in apps/web/src/lib/auth.ts and apps/mobile/src/api/auth.ts.
 */
import { useSyncExternalStore } from 'react';
import type { AuthRole, AuthSession, DemoAccount } from '../types';

const STORAGE_KEY = 'kaizen.auth';
// setTimeout overflows above 2^31 - 1 ms (~24.8 days).
const MAX_TIMER_MS = 2147483647;

export const ROLE_LABEL: Record<AuthRole, string> = {
  technician: 'Technician',
  shift_leader: 'Shift Leader',
};

export const ROLE_ICON: Record<AuthRole, string> = {
  technician: 'engineering',
  shift_leader: 'supervisor_account',
};

function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (typeof parsed.token === 'string' && Date.parse(parsed.expires_at) > Date.now()) return parsed;
  } catch {
    // Corrupt entry; drop it below.
  }
  localStorage.removeItem(STORAGE_KEY);
  return null;
}

let session: AuthSession | null = loadSession();
const listeners = new Set<() => void>();
let expiryTimer: number | undefined;

/** Signs out when the token expires so no screen or stream keeps using a dead token. */
function scheduleExpiry(): void {
  clearTimeout(expiryTimer);
  if (!session) return;
  const delay = Math.min(MAX_TIMER_MS, Math.max(0, Date.parse(session.expires_at) - Date.now()));
  expiryTimer = window.setTimeout(logout, delay);
}

function setSession(next: AuthSession | null): void {
  session = next;
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
  scheduleExpiry();
  listeners.forEach((fn) => fn());
}

scheduleExpiry();

export function getSession(): AuthSession | null {
  return session;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSession(): AuthSession | null {
  return useSyncExternalStore(subscribe, getSession);
}

export async function login(username: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('Cannot reach the server');
  }
  if (res.status === 401) throw new Error('Wrong username or password');
  if (res.status === 503) throw new Error('Sign-in is not configured on the server');
  if (!res.ok) throw new Error(`Sign-in failed (HTTP ${res.status})`);
  setSession((await res.json()) as AuthSession);
}

export function logout(): void {
  setSession(null);
}

/** Accounts the login screens can offer (no passwords); empty when the server is unreachable. */
export async function fetchDemoAccounts(): Promise<DemoAccount[]> {
  try {
    const res = await fetch('/api/auth/accounts');
    if (!res.ok) return [];
    return (await res.json()) as DemoAccount[];
  } catch {
    return [];
  }
}

/** `fetch` with the Bearer token; a 401 (revoked or rotated token) returns the user to login. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (session) headers.set('Authorization', `Bearer ${session.token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) logout();
  return res;
}

/** Appends `token=` for SSE/WebSocket URLs, which cannot send an Authorization header. */
export function withToken(url: string): string {
  if (!session) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(session.token)}`;
}

/**
 * Pure parser that extracts password prefill only from `pwd` in a search query string and returns the cleaned search string.
 * Strips only `pwd`, preserving all other query parameters.
 */
export function readPasswordParam(search: string): { password: string; cleanedSearch: string } {
  const params = new URLSearchParams(search);
  const password = params.get('pwd') || '';
  params.delete('pwd');
  const remaining = params.toString();
  return {
    password,
    cleanedSearch: remaining ? `?${remaining}` : '',
  };
}

let cachedPrefill: string | null = null;

/**
 * Reads initial password from window.location.search (`?pwd=...`) and immediately strips `pwd` via history.replaceState.
 * Preserves other query params and the URL hash.
 */
export function takeLoginPrefill(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  const search = window.location.search;
  if (search) {
    const { password, cleanedSearch } = readPasswordParam(search);
    if (search !== cleanedSearch) {
      const newUrl = `${window.location.pathname}${cleanedSearch}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
      cachedPrefill = password;
      return password;
    }
  }
  if (cachedPrefill !== null) {
    return cachedPrefill;
  }
  return '';
}
