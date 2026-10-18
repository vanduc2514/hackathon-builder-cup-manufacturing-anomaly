/**
 * Technician Copilot over `WS /api/gemini-live/ws`.
 *
 * Checks `/status`, pre-allocates a session with `POST /session` and sends one `user_turn`
 * per tapped prompt (optionally naming a catalog preset photo). The backend answers with a
 * real Gemini stream: `text_delta` chunks become live captions and every completed sentence
 * is spoken with the browser's `speechSynthesis` as it arrives. On a dropped socket it looks
 * the session up in `/sessions` and resumes, or starts a new session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGeminiLiveSession,
  fetchGeminiLiveStatus,
  geminiLiveSocketUrl,
  listGeminiLiveSessions,
} from '../api/kaizenApi';
import type { GeminiLiveServerMessage, GeminiLiveServiceStatus } from '../types';

export type LiveConnection = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'unavailable' | 'offline';

export interface LiveTurn {
  id: number;
  speaker: 'technician' | 'copilot' | 'system';
  text: string;
  interrupted?: boolean;
  /** Thumbnail of the preset photo sent with a technician turn. */
  photoUrl?: string;
}

export interface SendOptions {
  /** Catalog preset whose photo the backend attaches to the turn. */
  presetId?: string;
  photoUrl?: string;
}

export interface GeminiLive {
  connection: LiveConnection;
  service: GeminiLiveServiceStatus | null;
  turns: LiveTurn[];
  /** The browser is speaking (or has queued) a sentence of the reply. */
  speaking: boolean;
  /** A reply is in flight: waiting for Gemini or still receiving text. */
  streaming: boolean;
  send: (text: string, options?: SendOptions) => boolean;
  /** Stops the speech and cuts the reply that is still streaming. */
  stop: () => void;
}

const MAX_RECONNECTS = 5;
const DEFAULT_LANGUAGE = 'en-US';

/** Splits off the complete sentences of `buffer`; a terminator counts only when whitespace follows (keeps "4.2 N·m" whole). */
export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const terminator = /[.!?]+(?=\s)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = terminator.exec(buffer)) !== null) {
    const end = match.index + match[0].length;
    const sentence = buffer.slice(last, end).trim();
    if (sentence) sentences.push(sentence);
    last = end;
  }
  return { sentences, rest: buffer.slice(last) };
}

export function useGeminiLive(enabled: boolean, voiceOn: boolean): GeminiLive {
  const [connection, setConnection] = useState<LiveConnection>('idle');
  const [service, setService] = useState<GeminiLiveServiceStatus | null>(null);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const voiceRef = useRef(voiceOn);
  const langRef = useRef(DEFAULT_LANGUAGE);
  const turnId = useRef(0);
  // Streaming reply bookkeeping (refs: read from socket callbacks).
  const replyOpen = useRef(false);
  const sentenceBuffer = useRef('');
  // After `stop`, text is dropped until the server acknowledges with an interrupted turn_complete.
  const awaitingAck = useRef(false);
  // Speech queue: `speechGen` invalidates callbacks of utterances cancelled by `cancel()`.
  const speechGen = useRef(0);
  const speechPending = useRef(0);

  const cancelSpeech = useCallback(() => {
    speechGen.current += 1;
    speechPending.current = 0;
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((sentence: string) => {
    if (!sentence || !voiceRef.current) return;
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = langRef.current;
    const gen = speechGen.current;
    const finished = () => {
      if (gen !== speechGen.current) return;
      speechPending.current = Math.max(0, speechPending.current - 1);
      if (speechPending.current === 0) setSpeaking(false);
    };
    utterance.onend = finished;
    utterance.onerror = finished;
    speechPending.current += 1;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    voiceRef.current = voiceOn;
    if (!voiceOn) cancelSpeech();
  }, [voiceOn, cancelSpeech]);

  const addTurn = useCallback((turn: Omit<LiveTurn, 'id'>) => {
    turnId.current += 1;
    const id = turnId.current;
    setTurns((list) => [...list.slice(-19), { ...turn, id }]);
  }, []);

  const appendToCopilotTurn = useCallback((text: string) => {
    setTurns((list) => {
      const i = list.length - 1;
      if (i < 0 || list[i].speaker !== 'copilot') return list;
      return [...list.slice(0, i), { ...list[i], text: list[i].text + text }];
    });
  }, []);

  const markLastCopilotInterrupted = useCallback(() => {
    setTurns((list) => {
      const i = list.length - 1;
      if (i < 0 || list[i].speaker !== 'copilot') return list;
      return [...list.slice(0, i), { ...list[i], interrupted: true }];
    });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let sessionId: string | undefined;
    let resumptionHandle: string | undefined;
    let reconnects = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const endReply = () => {
      replyOpen.current = false;
      sentenceBuffer.current = '';
      awaitingAck.current = false;
      setStreaming(false);
    };

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
        case 'text_delta': {
          if (!msg.text || awaitingAck.current) break;
          if (!replyOpen.current) {
            replyOpen.current = true;
            addTurn({ speaker: 'copilot', text: '' });
          }
          appendToCopilotTurn(msg.text);
          const { sentences, rest } = takeSentences(sentenceBuffer.current + msg.text);
          sentenceBuffer.current = rest;
          sentences.forEach(speak);
          break;
        }
        case 'turn_complete':
          if (awaitingAck.current && !msg.interrupted) break;
          if (msg.interrupted) markLastCopilotInterrupted();
          else speak(sentenceBuffer.current.trim());
          endReply();
          break;
        case 'offline':
          endReply();
          setConnection('offline');
          addTurn({ speaker: 'system', text: msg.error_message ?? 'Copilot offline' });
          break;
        case 'error':
          endReply();
          addTurn({ speaker: 'system', text: msg.error_message ?? 'Copilot error' });
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
        endReply();
        cancelSpeech();
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
        langRef.current = status.language || DEFAULT_LANGUAGE;
        if (!status.copilot_available) {
          setConnection('offline');
          return;
        }
        const session = await createGeminiLiveSession();
        if (disposed) return;
        sessionId = session.session_id;
        open();
      } catch (err) {
        console.warn('Copilot unavailable:', err);
        if (!disposed) setConnection('unavailable');
      }
    };

    void start();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
      endReply();
      cancelSpeech();
      setConnection('idle');
    };
  }, [enabled, addTurn, appendToCopilotTurn, markLastCopilotInterrupted, speak, cancelSpeech]);

  const send = useCallback(
    (text: string, options?: SendOptions): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      cancelSpeech();
      replyOpen.current = false;
      sentenceBuffer.current = '';
      awaitingAck.current = false;
      addTurn({ speaker: 'technician', text, photoUrl: options?.photoUrl });
      setStreaming(true);
      ws.send(JSON.stringify({ type: 'user_turn', text, preset_id: options?.presetId }));
      return true;
    },
    [addTurn, cancelSpeech],
  );

  const stop = useCallback(() => {
    cancelSpeech();
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (replyOpen.current || streaming) {
      awaitingAck.current = true;
      ws.send(JSON.stringify({ type: 'interrupt' }));
    }
  }, [cancelSpeech, streaming]);

  return { connection, service, turns, speaking, streaming, send, stop };
}
