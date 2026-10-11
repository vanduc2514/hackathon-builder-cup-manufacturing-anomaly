/**
 * Thin fetch wrappers for the FastAPI backend. All URLs are relative (`/api/...`) so the
 * Vite proxy (dev) and the server (prod) route them.
 */
import type {
  EvidenceUploadResponse,
  GeminiLiveServiceStatus,
  GeminiLiveSessionStatus,
  IncidentState,
  MultiMachineTelemetryResponse,
  TelemetryBaselineResponse,
} from '../types';

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
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

/** Absolute ws:// or wss:// URL for the Gemini Live socket on the current host. */
export function geminiLiveSocketUrl(sessionId?: string, resumptionHandle?: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  if (sessionId) params.set('session_id', sessionId);
  if (resumptionHandle) params.set('resumption_handle', resumptionHandle);
  const q = params.toString();
  return `${proto}//${window.location.host}/api/gemini-live/ws${q ? `?${q}` : ''}`;
}

/** Turns a data: URL (from a canvas capture) into a Blob for upload. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
