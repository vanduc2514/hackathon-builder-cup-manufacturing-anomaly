/**
 * Subscribes to the incident SSE stream with reconnect and exposes the connection state,
 * so a dropped stream is visible instead of looking like "nothing is happening".
 */
import { useEffect, useState } from 'react';
import { fetchCurrentIncident, streamUrl } from '../api/kaizenApi';
import type { IncidentState, StreamStatus } from '../types';

const STREAM_URLS = ['/api/incidents/stream', '/api/incidents/events'].map(streamUrl);
const MAX_BACKOFF_MS = 15000;
// A dev proxy can keep the browser side of the stream open after the backend dies, so the
// stream alone cannot detect an outage; a periodic snapshot fetch does.
const LIVENESS_MS = 10000;

export interface IncidentStream {
  incident: IncidentState | null;
  status: StreamStatus;
}

export function useIncidentStream(): IncidentStream {
  const [incident, setIncident] = useState<IncidentState | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let livenessTimer: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;
    let disposed = false;

    const refreshSnapshot = () => {
      fetchCurrentIncident()
        .then((data) => {
          if (!disposed) setIncident(data);
        })
        .catch((err: unknown) => console.warn('Incident snapshot unavailable:', err));
    };

    const connect = () => {
      if (disposed) return;
      // Alternate between the two stream aliases in case one is blocked by a proxy.
      const url = STREAM_URLS[attempt % STREAM_URLS.length];
      const es = new EventSource(url);
      source = es;

      es.onopen = () => {
        attempt = 0;
        setStatus('live');
        // Catch up on anything missed while disconnected.
        refreshSnapshot();
      };

      es.addEventListener('incident_update', (event: MessageEvent<string>) => {
        try {
          setIncident(JSON.parse(event.data) as IncidentState);
        } catch (err) {
          console.error('Failed to parse incident SSE event:', err);
        }
      });

      es.onerror = () => {
        // The browser retries on its own while readyState is CONNECTING; take over once it gives up.
        if (es.readyState === EventSource.CONNECTING) {
          setStatus('reconnecting');
          return;
        }
        reconnect();
      };
    };

    const reconnect = () => {
      if (disposed) return;
      source?.close();
      source = null;
      if (retryTimer) clearTimeout(retryTimer);
      attempt += 1;
      setStatus(attempt >= 3 ? 'offline' : 'reconnecting');
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 4));
      retryTimer = setTimeout(connect, delay);
    };

    livenessTimer = setInterval(() => {
      if (source?.readyState !== EventSource.OPEN) return;
      fetchCurrentIncident()
        .then((data) => {
          if (!disposed) setIncident(data);
        })
        .catch(() => reconnect());
    }, LIVENESS_MS);

    refreshSnapshot();
    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (livenessTimer) clearInterval(livenessTimer);
      source?.close();
    };
  }, []);

  return { incident, status };
}
