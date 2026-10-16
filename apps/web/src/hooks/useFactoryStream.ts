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

export interface UseFactoryStreamOptions {
  enabled?: boolean;
  reconnectIntervalMs?: number;
  watchdogTimeoutMs?: number;
}

export interface UseFactoryStreamResult {
  packet: FactoryTickPacket;
  connected: boolean;
  isStale: boolean;
  hasReceivedData: boolean;
  error: string | null;
  lastTickAt: number | null;
  reconnect: () => void;
}

export function useFactoryStream(options: UseFactoryStreamOptions = {}): UseFactoryStreamResult {
  const { enabled = true, reconnectIntervalMs = 3000, watchdogTimeoutMs = 8000 } = options;
  const [packet, setPacket] = useState<FactoryTickPacket>(INITIAL_FACTORY_PACKET);
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);
  const connectionIdRef = useRef<number>(0);
  const isUnmountedRef = useRef<boolean>(false);

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

  const connect = useCallback(() => {
    cleanup();
    if (!enabled || isUnmountedRef.current) return;

    connectionIdRef.current += 1;
    const connectionId = connectionIdRef.current;

    const armWatchdog = () => {
      if (watchdogTimerRef.current !== null) {
        window.clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      watchdogTimerRef.current = window.setTimeout(() => {
        if (isUnmountedRef.current || connectionIdRef.current !== connectionId) return;
        setConnected(false);
        setError("Factory stream timed out — no data received, reconnecting...");
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!isUnmountedRef.current && enabled && connectionIdRef.current === connectionId) {
            connect();
          }
        }, reconnectIntervalMs);
      }, watchdogTimeoutMs);
    };

    const factoryOrigin = import.meta.env.VITE_FACTORY_STREAM_ORIGIN ?? "";
    const streamUrl = `${factoryOrigin}/api/factory/stream`;

    try {
      const es = new EventSource(streamUrl);
      esRef.current = es;
      armWatchdog();

      es.onopen = () => {
        if (isUnmountedRef.current || connectionIdRef.current !== connectionId) return;
        setConnected(true);
        setError(null);
        armWatchdog();
      };

      const handlePacketData = (rawData: string) => {
        try {
          const parsed = JSON.parse(rawData) as FactoryTickPacket;
          if (isUnmountedRef.current || connectionIdRef.current !== connectionId) return;
          setPacket(parsed);
          setLastTickAt(Date.now());
          setConnected(true);
          setError(null);
          armWatchdog();
        } catch {
          // ignore malformed packets
        }
      };

      es.onmessage = (event: MessageEvent) => {
        if (event.data) handlePacketData(event.data);
      };

      es.addEventListener("factory_tick", (event: MessageEvent) => {
        if (event.data) handlePacketData(event.data);
      });

      es.addEventListener("ping", () => {
        if (isUnmountedRef.current || connectionIdRef.current !== connectionId) return;
        setConnected(true);
        setError(null);
        armWatchdog();
      });

      es.onerror = () => {
        if (isUnmountedRef.current || connectionIdRef.current !== connectionId) return;
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
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!isUnmountedRef.current && enabled && connectionIdRef.current === connectionId) {
            connect();
          }
        }, reconnectIntervalMs);
      };
    } catch (err: unknown) {
      if (isUnmountedRef.current) return;
      setConnected(false);
      setError(err instanceof Error ? err.message : "Error connecting to factory stream");
    }
  }, [cleanup, enabled, reconnectIntervalMs, watchdogTimeoutMs]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      cleanup();
    };
  }, [connect, cleanup]);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  const hasReceivedData = lastTickAt !== null;
  const isStale = !connected && hasReceivedData;

  return {
    packet,
    connected,
    isStale,
    hasReceivedData,
    error,
    lastTickAt,
    reconnect,
  };
}
