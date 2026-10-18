import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import MobileFixLive from '../MobileFixLive';
import { takeSentences } from '../../../hooks/useGeminiLive';
import { NEW_INSERT_PRESET_ID, WORN_INSERT_PRESET_ID } from '../copilotPrompts';
import {
  createGeminiLiveSession,
  fetchGeminiLiveStatus,
  listGeminiLiveSessions,
} from '../../../api/kaizenApi';
import type { WorkOrder } from '../../../types/mobile';
import type { GeminiLiveServiceStatus } from '../../../types';

vi.mock('../../../hooks/useOemManual', () => ({
  useOemManual: vi.fn(() => ({ steps: [], loading: false })),
}));

vi.mock('../../../api/kaizenApi', () => ({
  fetchGeminiLiveStatus: vi.fn(),
  createGeminiLiveSession: vi.fn(),
  listGeminiLiveSessions: vi.fn(),
  geminiLiveSocketUrl: vi.fn(() => 'ws://test/api/gemini-live/ws'),
}));

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  sent: Array<Record<string, unknown>> = [];
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.onclose?.();
  }

  emit(msg: Record<string, unknown>): void {
    act(() => {
      this.onmessage?.({
        data: JSON.stringify({ interrupted: false, timestamp: '10:00:00', ...msg }),
      } as MessageEvent<string>);
    });
  }
}

class FakeUtterance {
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const speak = vi.fn();
const cancel = vi.fn();

const status: GeminiLiveServiceStatus = {
  status: 'healthy',
  service: 'Technician Copilot (Gemini streaming)',
  copilot_available: true,
  active_sessions: 0,
  model: 'gemini-3.5-flash',
  language: 'en-US',
  timestamp: '10:00:00',
};

const order = {
  id: 'WO-1',
  kind: 'fix',
  stage: 'active',
  priority: 'P1',
  title: 'Replace T07 insert',
  machine: 'CNC-02',
  location: 'Cell 1',
  summary: 'Flank wear',
  image: '/x.jpg',
  aiConfidence: 90,
  createdAt: '10:00',
  suspectTool: 'T07',
  sensors: [],
  evidence: [],
  steps: [
    { id: 1, title: 'Stop the spindle', instruction: 'Stop it.', target: 'Stopped', reference: 'OEM p.112' },
  ],
  partsNeeded: [],
  live: {
    status: 'repairing',
    canSubmitEvidence: false,
    repairDone: false,
    approved: false,
    defectRate: 0.05,
    verificationCount: 0,
    verificationTarget: 50,
    spcUcl: 0.03,
    sensorSource: 'none',
  },
} as unknown as WorkOrder;

function chip(name: RegExp): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

async function renderReady(): Promise<FakeWebSocket> {
  render(<MobileFixLive order={order} voiceGuidance onExit={vi.fn()} onSubmit={vi.fn()} />);
  await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
  const ws = FakeWebSocket.instances[0];
  ws.emit({ type: 'setup_complete', session_id: 's1', resumption_handle: 'h1' });
  await waitFor(() => expect(chip(/What is wrong/).disabled).toBe(false));
  return ws;
}

describe('MobileFixLive Copilot', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    speak.mockClear();
    cancel.mockClear();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    Object.defineProperty(window, 'speechSynthesis', { value: { speak, cancel }, configurable: true });
    vi.mocked(fetchGeminiLiveStatus).mockResolvedValue(status);
    vi.mocked(createGeminiLiveSession).mockResolvedValue({
      session_id: 's1',
      status: 'active',
      client_messages_received: 0,
      server_messages_sent: 0,
      created_at: '10:00:00',
      last_active_at: '10:00:00',
    });
    vi.mocked(listGeminiLiveSessions).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the five scripted English prompt chips', async () => {
    await renderReady();
    for (const label of [
      'What is wrong?',
      'Show removed insert',
      'Replacement steps',
      'New insert fitted',
      'Before restart',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
    expect(screen.queryByText(/Start|Step done/)).toBeNull();
  });

  it('shows the stored defect image and no torch control', async () => {
    await renderReady();
    const img = screen.getByAltText('Defective part') as HTMLImageElement;
    expect(img.src.endsWith('tool_worn_insert_commons_bautsch_cc0.jpg')).toBe(true);
    expect(screen.queryByLabelText('Torch')).toBeNull();
  });

  it('sends the tapped prompt, streams captions and speaks each completed sentence', async () => {
    const ws = await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /What is wrong/ }));

    expect(ws.sent).toEqual([
      { type: 'user_turn', text: 'What is the defect on CNC-02 and what is causing it?' },
    ]);
    // Chips lock while the reply streams.
    expect(chip(/Before restart/).disabled).toBe(true);

    ws.emit({ type: 'text_delta', text: 'T07 shows flank wear. Replace the in' });
    expect(screen.getByText(/T07 shows flank wear\. Replace the in/)).toBeTruthy();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toMatchObject({ text: 'T07 shows flank wear.', lang: 'en-US' });

    ws.emit({ type: 'text_delta', text: 'sert per the SOP.' });
    expect(speak).toHaveBeenCalledTimes(1);
    ws.emit({ type: 'turn_complete', model: 'gemini-3.5-flash' });

    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1][0]).toMatchObject({ text: 'Replace the insert per the SOP.' });
    expect(screen.getByText(/Replace the insert per the SOP\./)).toBeTruthy();
    expect(chip(/Before restart/).disabled).toBe(false);
  });

  it('attaches the worn-insert preset when showing the removed insert', async () => {
    const ws = await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /Show removed insert/ }));
    expect(ws.sent[0]).toEqual({
      type: 'user_turn',
      text: 'This is the T07 insert I just removed. What do you see?',
      preset_id: WORN_INSERT_PRESET_ID,
    });
    expect(WORN_INSERT_PRESET_ID).toBe('preset-cnc02-tool-worn-insert-commons-bautsch-cc0');
    expect(screen.getByAltText('Photo sent to the Copilot')).toBeTruthy();
  });

  it('attaches the new-insert preset when confirming the replacement', async () => {
    const ws = await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /New insert fitted/ }));
    expect(ws.sent[0]).toMatchObject({ type: 'user_turn', preset_id: NEW_INSERT_PRESET_ID });
    expect(NEW_INSERT_PRESET_ID).toBe('preset-cnc02-tool-new-insert-commons-raizy-1');
  });

  it('Stop cancels the speech and interrupts the streaming reply', async () => {
    const ws = await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /Replacement steps/ }));
    ws.emit({ type: 'text_delta', text: 'Isolate the machine first. Then' });
    expect(screen.getByTestId('copilot-wave')).toBeTruthy();

    cancel.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Stop the Copilot' }));
    expect(cancel).toHaveBeenCalled();
    expect(ws.sent[ws.sent.length - 1]).toEqual({ type: 'interrupt' });

    // Text that is still in flight is dropped until the server acknowledges the interrupt.
    ws.emit({ type: 'text_delta', text: ' stale words.' });
    expect(screen.queryByText(/stale words/)).toBeNull();
    ws.emit({ type: 'turn_complete', interrupted: true });
    await waitFor(() => expect(chip(/Before restart/).disabled).toBe(false));
    expect(screen.getByText(/\(stopped\)/)).toBeTruthy();
  });

  it('does not speak when the voice is muted', async () => {
    const ws = await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Mute copilot voice' }));
    fireEvent.click(screen.getByRole('button', { name: /What is wrong/ }));
    ws.emit({ type: 'text_delta', text: 'First sentence. ' });
    ws.emit({ type: 'turn_complete' });
    expect(speak).not.toHaveBeenCalled();
    expect(screen.getByText(/First sentence\./)).toBeTruthy();
  });

  it('shows the offline message and disables the chips when the backend has no Gemini', async () => {
    vi.mocked(fetchGeminiLiveStatus).mockResolvedValue({ ...status, copilot_available: false });
    render(<MobileFixLive order={order} voiceGuidance onExit={vi.fn()} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Copilot is offline/)).toBeTruthy());
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(chip(/What is wrong/).disabled).toBe(true);
  });
});

describe('takeSentences', () => {
  it('splits on terminators followed by whitespace and keeps the unfinished tail', () => {
    expect(takeSentences('One. Two! Thr')).toEqual({ sentences: ['One.', 'Two!'], rest: ' Thr' });
  });

  it('keeps decimals and a trailing terminator without whitespace in the buffer', () => {
    expect(takeSentences('Torque is 4.2 N·m. Then')).toEqual({
      sentences: ['Torque is 4.2 N·m.'],
      rest: ' Then',
    });
    expect(takeSentences('Done.')).toEqual({ sentences: [], rest: 'Done.' });
  });
});
