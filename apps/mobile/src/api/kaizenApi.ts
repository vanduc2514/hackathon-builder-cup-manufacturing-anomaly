/**
 * Thin fetch wrappers for the FastAPI backend. REST URLs are relative (`/api/...`) so the
 * Vite proxy (dev) and Firebase Hosting rewrite (prod) route them; SSE and WebSocket go to
 * VITE_STREAM_ORIGIN when set, because the Hosting rewrite cannot carry streams.
 * Every call carries the session token (REST: Bearer header; streams: `?token=`).
 */
import { authFetch, withToken } from './auth';
import type {
  EvidenceUploadResponse,
  GeminiLiveServiceStatus,
  GeminiLiveSessionStatus,
  HandoverNote,
  IncidentState,
  IncidentSummary,
  MultiMachineTelemetryResponse,
  TelemetryBaselineResponse,
} from '../types';

const STREAM_ORIGIN = (import.meta.env.VITE_STREAM_ORIGIN ?? '').replace(/\/+$/, '');

/** URL for a streaming endpoint: Cloud Run origin in production builds, relative in dev. */
export function streamUrl(path: string): string {
  return `${STREAM_ORIGIN}${path}`;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, init);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Body is not JSON; keep the status text.
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export function fetchCurrentIncident(): Promise<IncidentState> {
  return getJson<IncidentState>('/api/incidents/current');
}

export function fetchIncidentHistory(limit = 20, status?: string): Promise<IncidentSummary[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (status) params.set('status', status);
  const q = params.toString();
  return getJson<IncidentSummary[]>(`/api/incidents/history${q ? `?${q}` : ''}`);
}

/** `POST /api/incidents/evidence`: one technician photo plus optional notes. */
export function uploadIncidentEvidence(
  file: Blob,
  filename: string,
  notes?: string,
): Promise<EvidenceUploadResponse> {
  const form = new FormData();
  form.append('file', file, filename);
  if (notes) form.append('notes', notes);
  return getJson<EvidenceUploadResponse>('/api/incidents/evidence', { method: 'POST', body: form });
}

/** `POST /api/incidents/handover`: records a technician shift handover note on the active incident. */
export function postHandoverNote(note: string): Promise<HandoverNote> {
  return getJson<HandoverNote>('/api/incidents/handover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
}


export function fetchTelemetryBaseline(): Promise<TelemetryBaselineResponse> {
  return getJson<TelemetryBaselineResponse>('/api/telemetry/baseline');
}

export function fetchTelemetryHistory(machineId?: string): Promise<MultiMachineTelemetryResponse> {
  const q = machineId ? `?machine_id=${encodeURIComponent(machineId)}` : '';
  return getJson<MultiMachineTelemetryResponse>(`/api/telemetry/history${q}`);
}

export function fetchGeminiLiveStatus(): Promise<GeminiLiveServiceStatus> {
  return getJson<GeminiLiveServiceStatus>('/api/gemini-live/status');
}

export function createGeminiLiveSession(): Promise<GeminiLiveSessionStatus> {
  return getJson<GeminiLiveSessionStatus>('/api/gemini-live/session', { method: 'POST' });
}

export function listGeminiLiveSessions(): Promise<GeminiLiveSessionStatus[]> {
  return getJson<GeminiLiveSessionStatus[]>('/api/gemini-live/sessions');
}

/** Absolute ws:// or wss:// URL for the Gemini Live socket (stream origin, else current host). */
export function geminiLiveSocketUrl(sessionId?: string, resumptionHandle?: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = STREAM_ORIGIN
    ? STREAM_ORIGIN.replace(/^http/, 'ws')
    : `${proto}//${window.location.host}`;
  const params = new URLSearchParams();
  if (sessionId) params.set('session_id', sessionId);
  if (resumptionHandle) params.set('resumption_handle', resumptionHandle);
  const q = params.toString();
  return withToken(`${base}/api/gemini-live/ws${q ? `?${q}` : ''}`);
}

/** Turns a data: URL (from a canvas capture) into a Blob for upload. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
