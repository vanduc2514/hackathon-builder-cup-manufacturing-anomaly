/**
 * Technician Copilot voice channel over `WS /api/gemini-live/ws`.
 *
 * Checks `/status`, pre-allocates a session with `POST /session`, streams text turns and
 * plays the 24 kHz PCM reply. On a dropped socket it looks the session up in `/sessions`
 * and resumes with the last `resumption_handle`, or starts a new session.
 *
 * Camera frames are deliberately not sent: the backend treats any image frame as field
 * evidence and moves the incident back to `analyzing`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGeminiLiveSession,
  fetchGeminiLiveStatus,
  geminiLiveSocketUrl,
  listGeminiLiveSessions,
} from '../api/kaizenApi';
import type { GeminiLiveServerMessage, GeminiLiveServiceStatus } from '../types';

export type LiveConnection = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'unavailable';

export interface LiveTurn {
  id: number;
  speaker: 'technician' | 'copilot' | 'system';
  text: string;
  interrupted?: boolean;
}

export interface GeminiLive {
  connection: LiveConnection;
  service: GeminiLiveServiceStatus | null;
  mode: string | null;
  turns: LiveTurn[];
  speaking: boolean;
  send: (text: string) => boolean;
  interrupt: () => void;
}

const PCM_RATE = 24000;
const MAX_RECONNECTS = 5;

/** Plays signed 16-bit little-endian mono PCM chunks back to back. */
class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextAt = 0;
  private sources: AudioBufferSourceNode[] = [];

  play(base64: string): void {
    try {
      if (!this.ctx) this.ctx = new AudioContext({ sampleRate: PCM_RATE });
      const ctx = this.ctx;
      const bin = atob(base64);
      const samples = new Float32Array(Math.floor(bin.length / 2));
      for (let i = 0; i < samples.length; i += 1) {
        let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
        if (v >= 0x8000) v -= 0x10000;
        samples[i] = v / 0x8000;
      }
      const buffer = ctx.createBuffer(1, samples.length, PCM_RATE);
      buffer.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const at = Math.max(ctx.currentTime, this.nextAt);
      src.start(at);
      this.nextAt = at + buffer.duration;
      this.sources.push(src);
      src.onended = () => {
        this.sources = this.sources.filter((s) => s !== src);
      };
    } catch (err) {
      console.warn('Copilot audio playback failed:', err);
    }
  }

  stop(): void {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // Already stopped.
      }
    });
    this.sources = [];
    this.nextAt = 0;
  }

  close(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}

export function useGeminiLive(enabled: boolean, voiceOn: boolean): GeminiLive {
  const [connection, setConnection] = useState<LiveConnection>('idle');
  const [service, setService] = useState<GeminiLiveServiceStatus | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [speaking, setSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const voiceRef = useRef(voiceOn);
  const turnId = useRef(0);

  useEffect(() => {
    voiceRef.current = voiceOn;
    if (!voiceOn) playerRef.current?.stop();
  }, [voiceOn]);

  const addTurn = useCallback((speaker: LiveTurn['speaker'], text: string, interrupted = false) => {
    turnId.current += 1;
    const id = turnId.current;
    setTurns((list) => [...list.slice(-19), { id, speaker, text, interrupted }]);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let sessionId: string | undefined;
    let resumptionHandle: string | undefined;
    let reconnects = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    playerRef.current = new PcmPlayer();

    const handleMessage = (raw: string) => {
      let msg: GeminiLiveServerMessage;
      try {
        msg = JSON.parse(raw) as GeminiLiveServerMessage;
      } catch {
        return;
      }
      if (msg.session_id) sessionId = msg.session_id;
      if (msg.resumption_handle) resumptionHandle = msg.resumption_handle;

      switch (msg.type) {
        case 'setup_complete':
          reconnects = 0;
          setConnection('ready');
          break;
        case 'server_content': {
          const c = msg.server_content;
          if (!c) break;
          if (c.input_transcription) addTurn('technician', c.input_transcription);
          if (c.output_transcription) {
            setSpeaking(true);
            addTurn('copilot', c.output_transcription);
          }
          if (c.audio_pcm_base64 && voiceRef.current) playerRef.current?.play(c.audio_pcm_base64);
          if (c.interrupted) {
            playerRef.current?.stop();
            setTurns((list) =>
              list.map((t, i) => (i === list.length - 1 && t.speaker === 'copilot' ? { ...t, interrupted: true } : t)),
            );
          }
          if (c.turn_complete) setSpeaking(false);
          break;
        }
        case 'error':
          addTurn('system', msg.error_message ?? 'Copilot error');
          break;
        case 'go_away':
          wsRef.current?.close();
          break;
        default:
          break;
      }
    };

    const open = () => {
      if (disposed) return;
      const ws = new WebSocket(geminiLiveSocketUrl(sessionId, resumptionHandle));
      wsRef.current = ws;
      ws.onmessage = (e: MessageEvent<string>) => handleMessage(e.data);
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setSpeaking(false);
        if (disposed) return;
        if (reconnects >= MAX_RECONNECTS) {
          setConnection('unavailable');
          return;
        }
        reconnects += 1;
        setConnection('reconnecting');
        retryTimer = setTimeout(() => void resume(), 1000 * reconnects);
      };
    };

    /** Reuses the session if the server still holds it; otherwise allocates a new one. */
    const resume = async () => {
      try {
        const sessions = await listGeminiLiveSessions();
        if (!sessionId || !sessions.some((s) => s.session_id === sessionId)) {
          const fresh = await createGeminiLiveSession();
          sessionId = fresh.session_id;
          resumptionHandle = undefined;
          setMode(fresh.mode);
        }
      } catch {
        // Backend unreachable: the socket attempt below fails and schedules the next retry.
      }
      open();
    };

    const start = async () => {
      setConnection('connecting');
      try {
        const status = await fetchGeminiLiveStatus();
        if (disposed) return;
        setService(status);
        const session = await createGeminiLiveSession();
        if (disposed) return;
        sessionId = session.session_id;
        setMode(session.mode);
        open();
      } catch (err) {
        console.warn('Gemini Live unavailable:', err);
        if (!disposed) setConnection('unavailable');
      }
    };

    void start();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
      playerRef.current?.close();
      playerRef.current = null;
      setConnection('idle');
      setSpeaking(false);
    };
  }, [enabled, addTurn]);

  const send = useCallback((text: string): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ client_content: { text, end_of_turn: true } }));
    return true;
  }, []);

  const interrupt = useCallback(() => {
    playerRef.current?.stop();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ interrupt: true }));
  }, []);

  return { connection, service, mode, turns, speaking, send, interrupt };
}
