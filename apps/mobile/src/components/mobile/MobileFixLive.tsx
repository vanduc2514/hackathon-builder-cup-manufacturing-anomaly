import React, { useEffect, useState } from 'react';
import type { WorkOrder } from '../../types/mobile';
import { useCamera } from '../../hooks/useCamera';
import { useGeminiLive, type LiveConnection } from '../../hooks/useGeminiLive';
import { useOemManual } from '../../hooks/useOemManual';
import { copilotPrompts } from './copilotPrompts';
import { IMG } from './mobileData';

interface MobileFixLiveProps {
  order: WorkOrder;
  voiceGuidance: boolean;
  onExit: () => void;
  onSubmit: (notes: string) => void;
}

const CONNECTION_LABEL: Record<LiveConnection, string> = {
  idle: 'Copilot off',
  connecting: 'Connecting…',
  ready: 'Copilot ready',
  reconnecting: 'Reconnecting…',
  unavailable: 'Copilot offline',
  offline: 'Copilot offline',
};

/**
 * Full-screen guided repair: camera, step card from the OEM checkpoints and the Technician
 * Copilot (real Gemini replies streamed as captions and spoken by the browser). The technician
 * talks to the Copilot by tapping scripted prompts. Steps are confirmed by the technician; the
 * backend exposes no checkpoint-verification endpoint, so nothing is marked "verified" by the app.
 */
export default function MobileFixLive({ order, voiceGuidance, onExit, onSubmit }: MobileFixLiveProps): React.ReactElement {
  const { steps: dynamicSteps, loading: manualLoading } = useOemManual(order.machine);
  const steps = order.steps.length > 0 ? order.steps : dynamicSteps;
  const isLiveOrder = Boolean(order.live);
  const [idx, setIdx] = useState(0);
  const [voiceOn, setVoiceOn] = useState(voiceGuidance);
  const [torch, setTorch] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [notes, setNotes] = useState('');
  const camera = useCamera(true);
  const { setTorch: applyTorch } = camera;
  const copilot = useGeminiLive(isLiveOrder, voiceOn);

  const step = steps[idx];
  const isLast = idx === steps.length - 1;

  useEffect(() => {
    applyTorch(torch);
  }, [torch, applyTorch]);

  const next = () => {
    if (isLast) setShowSheet(true);
    else setIdx((i) => i + 1);
  };

  if (!step) {
    return (
      <div className="m-cam">
        <div className="m-cam-top">
          <button className="m-iconbtn dark" onClick={onExit} aria-label="Exit guided repair">
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
        </div>
        <div className="m-hint-pill m-glass-dark">
          {manualLoading ? `Loading OEM manual for ${order.machine}…` : `No OEM repair procedure for ${order.machine}`}
        </div>
      </div>
    );
  }

  const prompts = copilotPrompts(order.machine, order.suspectTool ?? 'cutting tool');
  const lastTech = [...copilot.turns].reverse().find((t) => t.speaker === 'technician');
  const lastReply = [...copilot.turns].reverse().find((t) => t.speaker !== 'technician');
  const awaitingReply = copilot.streaming && (!lastReply || !lastTech || lastReply.id < lastTech.id);
  const canAsk = isLiveOrder && copilot.connection === 'ready' && !copilot.streaming;
  const copilotCaption = ((): string => {
    if (!isLiveOrder) return 'The Copilot is available on live incidents. Follow the manual step above.';
    if (awaitingReply) return 'Thinking…';
    if (lastReply) return lastReply.speaker === 'system' ? lastReply.text : `“${lastReply.text}”${lastReply.interrupted ? ' (stopped)' : ''}`;
    if (copilot.connection === 'offline' || copilot.connection === 'unavailable') {
      return 'Copilot is offline. Follow the manual step above.';
    }
    return copilot.connection === 'ready' ? 'Tap a prompt to ask the Copilot.' : 'Connecting to the Copilot…';
  })();

  return (
    <div className="m-cam">
      {camera.error ? (
        <img className="m-cam-feed" src={IMG.spindle} alt="Camera unavailable" style={{ filter: 'brightness(0.6) grayscale(0.4)' }} />
      ) : (
        <video ref={camera.videoRef} className="m-cam-video" playsInline muted aria-label="Live camera" />
      )}
      <div className="m-cam-vignette" />

      {/* Top bar */}
      <div className="m-cam-top">
        <button className="m-iconbtn dark" onClick={onExit} aria-label="Exit guided repair" id="m-live-exit">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <div className="m-cam-title m-glass-dark">
          <span
            className={`m-dot ${copilot.connection === 'ready' ? 'pulse' : ''}`}
            style={{ color: copilot.connection === 'ready' ? '#8b7bff' : '#ff9500' }}
          />
          <span className="t">
            {isLiveOrder ? CONNECTION_LABEL[copilot.connection] : 'Demo guide'} · {order.machine}
          </span>
        </div>
        <span className="m-chip dark" style={{ height: 30 }}>
          {copilot.service?.language ?? 'en-US'} · Gemini
        </span>
      </div>

      {/* Step card */}
      <div key={step.id} className="m-cam-step m-glass-light-on-dark">
        <div className="m-between">
          <div className="m-row" style={{ gap: 6 }}>
            <span className="m-chip" style={{ background: 'var(--accent)', color: '#fff' }}>
              {idx + 1}/{steps.length}
            </span>
            <span className="m-chip plain">
              <span className="material-symbols-outlined">menu_book</span>
              {step.reference}
            </span>
          </div>
        </div>
        <h2 className="m-h2" style={{ marginTop: 8 }}>{step.title}</h2>
        <p className="m-body" style={{ fontSize: 12.5, marginTop: 2 }}>{step.instruction}</p>
        <div className="m-spec">
          <div>
            <div className="k">Target</div>
            <div className="v">{step.target}</div>
          </div>
          <div>
            <div className="k">Check</div>
            <div className="v acc">{step.tolerance}</div>
          </div>
        </div>
        <div className="m-steps-dots" style={{ marginTop: 10 }}>
          {steps.map((s, i) => (
            <i key={s.id} className={i <= idx ? 'on' : ''} />
          ))}
        </div>
      </div>

      {camera.error && (
        <div className="m-hint-pill m-glass-dark" style={{ top: '49%' }}>
          <span className="material-symbols-outlined">no_photography</span>
          Camera unavailable · {camera.error}
        </div>
      )}
      {idx > 0 && (
        <div className="m-done-tag m-glass-light-on-dark" style={{ left: 24, top: 'calc(49% + 92px)' }}>
          <span className="material-symbols-outlined ms-fill">check_circle</span>
          Step {idx} done
        </div>
      )}

      {/* Transcript: streamed Copilot captions, the Stop button and the scripted prompt chips */}
      <div className="m-transcript m-glass-light-on-dark" style={{ animation: 'm-enter .45s var(--ease) both' }}>
        <div className="m-tline">
          <span className="ic">
            <span className="material-symbols-outlined">person</span>
          </span>
          <div style={{ flex: 1 }}>
            <div className="who">You</div>
            {lastTech ? (
              <div className="txt m-row" style={{ gap: 8 }}>
                {lastTech.photoUrl && <img className="m-turn-photo" src={lastTech.photoUrl} alt="Photo sent to the Copilot" />}
                <span>“{lastTech.text}”</span>
              </div>
            ) : (
              <div className="txt m-sub">Tap a prompt below to ask the Copilot.</div>
            )}
          </div>
        </div>
        <div className="m-tline">
          <span className="ic ai">
            <span className="material-symbols-outlined ms-fill">auto_awesome</span>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="who ai m-between" style={{ gap: 6 }}>
              <span className="m-row" style={{ gap: 6 }}>
                Copilot
                {copilot.speaking && voiceOn && (
                  <span className="m-wave" data-testid="copilot-wave" aria-label="Copilot is speaking">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </span>
              {(copilot.speaking || copilot.streaming) && (
                <button className="m-copilot-stop" onClick={copilot.stop} id="m-live-stop" aria-label="Stop the Copilot">
                  <span className="material-symbols-outlined ms-fill">stop_circle</span>
                  Stop
                </button>
              )}
            </div>
            <div className="txt m-caption" aria-live="polite">{copilotCaption}</div>
          </div>
        </div>
        <div className="m-prompt-chips" role="group" aria-label="Ask the Copilot">
          {prompts.map((p) => (
            <button
              key={p.id}
              className="m-prompt-chip"
              disabled={!canAsk}
              onClick={() => copilot.send(p.text, { presetId: p.presetId, photoUrl: p.photoUrl })}
              title={p.text}
            >
              <span className="material-symbols-outlined">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="m-cam-controls">
        <div className="m-tool-group m-glass-dark">
          <button
            className={`m-tool ${torch ? 'on' : ''}`}
            onClick={() => setTorch((v) => !v)}
            aria-label="Torch"
            disabled={Boolean(camera.error)}
          >
            <span className="material-symbols-outlined">flashlight_on</span>
          </button>
          <button
            className="m-tool"
            onClick={() => idx > 0 && setIdx((i) => i - 1)}
            aria-label="Previous step"
            style={{ opacity: idx > 0 ? 1 : 0.45 }}
          >
            <span className="material-symbols-outlined">undo</span>
          </button>
        </div>
        <button
          className={`m-mic ${voiceOn ? 'live' : ''}`}
          onClick={() => setVoiceOn((v) => !v)}
          aria-label={voiceOn ? 'Mute copilot voice' : 'Unmute copilot voice'}
          id="m-live-mic"
          style={voiceOn ? undefined : { background: '#3a3d4a', boxShadow: 'none' }}
        >
          <span className="material-symbols-outlined ms-fill">{voiceOn ? 'volume_up' : 'volume_off'}</span>
        </button>
        <button className="m-next" onClick={next} id="m-live-next">
          {isLast ? 'Finish' : `Done · next (${idx + 2}/${steps.length})`}
          <span className="material-symbols-outlined">{isLast ? 'flag' : 'arrow_forward'}</span>
        </button>
      </div>

      {showSheet && (
        <>
          <div className="m-sheet-backdrop" onClick={() => setShowSheet(false)} />
          <div className="m-sheet" role="dialog" aria-label="Repair complete">
            <div className="m-sheet-grabber" />
            <div className="m-success-icon">
              <span className="material-symbols-outlined">check</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 className="m-h2">All {steps.length} steps done</h2>
              <p className="m-sub" style={{ marginTop: 4 }}>
                {order.live?.repairDone
                  ? 'The AI has recorded the repair. The inline camera now checks the next parts.'
                  : 'The inline camera checks the next parts before your lead signs off.'}
              </p>
            </div>
            <div className="m-glass m-list" style={{ background: 'rgba(255,255,255,.7)' }}>
              {steps.map((s) => (
                <div key={s.id} className="m-li" style={{ padding: '8px 12px' }}>
                  <span className="material-symbols-outlined ms-fill" style={{ color: 'var(--green)', fontSize: 20 }}>
                    check_circle
                  </span>
                  <div className="m-li-body">
                    <div className="m-li-title" style={{ fontSize: 13 }}>{s.title}</div>
                  </div>
                  <span className="m-sub m-mono">{s.target}</span>
                </div>
              ))}
            </div>
            <textarea
              className="m-textarea"
              placeholder={
                isLiveOrder ? 'Handover note for your lead' : 'Handover note for your lead (optional)'
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              id="m-handover-note"
            />
            <button className="m-btn" onClick={() => onSubmit(notes)} id="m-submit-repair">
              <span className="material-symbols-outlined">{isLiveOrder ? 'task_alt' : 'send'}</span>
              {isLiveOrder ? 'Finish repair' : 'Submit for lead verification'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
