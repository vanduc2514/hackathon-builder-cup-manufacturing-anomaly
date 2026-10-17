import { useState, useEffect, useCallback, useRef } from "react";
import type { FactoryTickPacket, FactoryMachineTelemetry } from "../types";

export const DEFAULT_MACHINES: FactoryMachineTelemetry[] = [];

export const INITIAL_FACTORY_PACKET: FactoryTickPacket = {
  tick_index: 0,
  machines: [],
  recent_parts: [],
  edge_stats: null,
  active_anomaly: null,
};

// Backoff ladder (seconds) capped at the last entry. Each entry is the *base*
// delay before full-jitter scaling: the actual delay is uniform(0, base).
// Going through three quick retries before long backoff catches a flapping
// upstream without hammering it; the 5 s cap stops a single throttled instance
// from producing an SSE reconnect storm that Cloud Run interprets as 429-worthy
// request concurrency (the regression behind issue #265).
export const BACKOFF_LADDER_S: readonly number[] = [1, 2, 5, 5, 5];
export const MAX_RECONNECT_ATTEMPTS = BACKOFF_LADDER_S.length;
const MAX_JITTER_S = 5;

/**
 * Draw a full-jitter backoff delay for the given attempt index.
 *
 * Implementation matches the AWS Architecture Blog guidance: ``delay =
 * uniform(0, base)`` (Exponential "Equal Jitter" / full jitter). Full jitter
 * desynchronises parallel clients so a single Cloud Run instance never
 * receives a thundering-herd reconnect burst — the failure mode behind
 * \"no available instance\" 429s in issue #265.
 */
export function computeBackoffDelayMs(attemptIndex: number): number {
  const safeAttempt = Math.max(0, Math.min(attemptIndex, BACKOFF_LADDER_S.length - 1));
  const baseSeconds = BACKOFF_LADDER_S[safeAttempt] ?? MAX_JITTER_S;
  // uniform(0, base) in seconds -> ms. Math.random() is acceptable here: the
  // jitter is intentionally loose and we run only one client per dashboard tab.
  return Math.floor(Math.random() * baseSeconds * 1000);
}

export type FactoryStreamState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export interface UseFactoryStreamOptions {
  enabled?: boolean;
  /** DEPRECATED — backoff is now driven by the jittered ladder. Retained for
   *  backward compatibility with existing callers; the value is ignored. */
  reconnectIntervalMs?: number;
  watchdogTimeoutMs?: number;
}

export interface UseFactoryStreamResult {
  packet: FactoryTickPacket;
  connected: boolean;
  /** High-level connection lifecycle: connecting -> open -> reconnecting -> closed. */
  state: FactoryStreamState;
  isStale: boolean;
  hasReceivedData: boolean;
  error: string | null;
  /** 1-indexed reconnect attempt counter; resets to 0 when an open succeeds. */
  reconnectAttempt: number;
  lastTickAt: number | null;
  reconnect: () => void;
}

export function useFactoryStream(options: UseFactoryStreamOptions = {}): UseFactoryStreamResult {
  const { enabled = true, watchdogTimeoutMs = 5000 } = options;
  const [packet, setPacket] = useState<FactoryTickPacket>(INITIAL_FACTORY_PACKET);
  const [connected, setConnected] = useState<boolean>(false);
  const [state, setState] = useState<FactoryStreamState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);

  // Refs hold the latest mutable state so async callbacks (setTimeout, EventSource
  // handlers) see up-to-date values without forcing the consumer to rebuild every
  // callback on every render.
  const enabledRef = useRef<boolean>(enabled);
  enabledRef.current = enabled;
  const isUnmountedRef = useRef<boolean>(false);
  const watchdogMsRef = useRef<number>(watchdogTimeoutMs);
  watchdogMsRef.current = watchdogTimeoutMs;

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (watchdogTimerRef.current !== null) {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  // scheduleReconnect reads the latest reconnectAttempt via ref; this lets the
  // closure avoid depending on the state value directly (which would otherwise
  // rebuild connect() on every increment, retriggering the useEffect).
  const scheduleReconnect = useCallback(() => {
    if (isUnmountedRef.current || !enabledRef.current) return;
    const nextAttempt = reconnectAttemptRef.current;
    if (nextAttempt >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `factory stream exhausted ${MAX_RECONNECT_ATTEMPTS} reconnect attempts; surfacing error to caller`,
      );
      setState("closed");
      setConnected(false);
      setError(
        `Factory stream lost after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts. Reload the dashboard to retry.`,
      );
      return;
    }
    const delayMs = computeBackoffDelayMs(nextAttempt);
    console.warn(
      `factory stream reconnect attempt ${nextAttempt + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delayMs} ms (jittered)`,
    );
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = window.setTimeout(() => {
      if (isUnmountedRef.current || !enabledRef.current) return;
      reconnectAttemptRef.current += 1;
      setReconnectAttempt(reconnectAttemptRef.current);
      connect();
    }, delayMs);
  }, []);

  const connect = useCallback(() => {
    cleanup();
    if (!enabledRef.current || isUnmountedRef.current) return;

    const factoryOrigin = import.meta.env.VITE_FACTORY_STREAM_ORIGIN ?? "";
    const streamUrl = `${factoryOrigin}/api/factory/stream`;

    setState((s) => (s === "open" ? "reconnecting" : s));

    const resetWatchdog = () => {
      if (watchdogTimerRef.current !== null) {
        window.clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      const ms = watchdogMsRef.current;
      if (ms > 0 && !isUnmountedRef.current && enabledRef.current) {
        watchdogTimerRef.current = window.setTimeout(() => {
          if (isUnmountedRef.current) return;
          // Silent connection death detected: no packet or ping within bounded window
          setConnected(false);
          setError("Factory stream heartbeat timed out — attempting auto-reconnect...");
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
          scheduleReconnect();
        }, ms);
      }
    };

    try {
      const es = new EventSource(streamUrl);
      esRef.current = es;
      setState("connecting");
      resetWatchdog();

      es.onopen = () => {
        if (isUnmountedRef.current) return;
        setConnected(true);
        setError(null);
        setState("open");
        // A successful connect resets the attempt counter so the next failure
        // gets the fresh end of the backoff ladder.
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        resetWatchdog();
      };

      const handlePacketData = (rawData: string) => {
        try {
          const parsed = JSON.parse(rawData) as FactoryTickPacket;
          if (isUnmountedRef.current) return;
          setPacket(parsed);
          setLastTickAt(Date.now());
          setConnected(true);
          setError(null);
          resetWatchdog();
        } catch {
          // ignore malformed packets
        }
      };

      es.onmessage = (event: MessageEvent) => {
        resetWatchdog();
        if (event.data) handlePacketData(event.data);
      };

      es.addEventListener("factory_tick", (event: MessageEvent) => {
        resetWatchdog();
        if (event.data) handlePacketData(event.data);
      });

      es.addEventListener("ping", () => {
        if (isUnmountedRef.current) return;
        setConnected(true);
        setError(null);
        resetWatchdog();
      });

      es.onerror = () => {
        if (isUnmountedRef.current) return;
        if (watchdogTimerRef.current !== null) {
          window.clearTimeout(watchdogTimerRef.current);
          watchdogTimerRef.current = null;
        }
        setConnected(false);
        setError("Factory stream disconnected — attempting auto-reconnect...");
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
        scheduleReconnect();
      };
    } catch (err: unknown) {
      if (isUnmountedRef.current) return;
      setConnected(false);
      setError(err instanceof Error ? err.message : "Error connecting to factory stream");
      scheduleReconnect();
    }
  }, [cleanup, scheduleReconnect]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      cleanup();
    };
  }, [connect, cleanup]);

  const reconnect = useCallback(() => {
    cleanup();
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    connect();
  }, [cleanup, connect]);

  const hasReceivedData = lastTickAt !== null;
  const isStale = !connected && hasReceivedData;

  return {
    packet,
    connected,
    state,
    isStale,
    hasReceivedData,
    error,
    reconnectAttempt,
    lastTickAt,
    reconnect,
  };
}
