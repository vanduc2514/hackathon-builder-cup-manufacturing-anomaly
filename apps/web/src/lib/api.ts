// Typed read-only API helpers and a small polling hook for backend endpoints the dashboard consumes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from './auth';

// The Firebase Hosting rewrite cannot carry SSE, so production builds point streams at the
// Cloud Run origin (VITE_STREAM_ORIGIN); REST stays relative.
const STREAM_ORIGIN = (import.meta.env.VITE_STREAM_ORIGIN ?? '').replace(/\/+$/, '');

/** URL for a streaming endpoint: Cloud Run origin in production builds, relative in dev. */
export function streamUrl(path: string): string {
  return `${STREAM_ORIGIN}${path}`;
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await authFetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface ApiResource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Fetches `url` once on mount (and whenever `deps` change), optionally re-polling every `pollMs`. */
export function useApi<T>(url: string | null, pollMs = 0, deps: unknown[] = []): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url));
  const [tick, setTick] = useState<number>(0);
  const alive = useRef<boolean>(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const run = () => {
      fetchJson<T>(url, ctrl.signal)
        .then((d) => {
          if (!alive.current) return;
          setData(d);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!alive.current || ctrl.signal.aborted) return;
          setError(e instanceof Error ? e.message : 'request failed');
        })
        .finally(() => {
          if (alive.current && !ctrl.signal.aborted) setLoading(false);
        });
    };
    setLoading(true);
    run();
    const id = pollMs > 0 ? window.setInterval(run, pollMs) : undefined;
    return () => {
      ctrl.abort();
      if (id) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pollMs, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
