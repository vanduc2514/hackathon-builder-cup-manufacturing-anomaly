import React, { useEffect, useRef, useState } from 'react';
import type { VisualEvidencePreset } from '../../types';
import type { EvidenceItem, MediaType, WorkOrder } from '../../types/mobile';
import { readFileAsDataUrl, useCamera } from '../../hooks/useCamera';
import PresetGallerySheet from './PresetGallerySheet';

interface MobileEvidenceCaptureProps {
  order: WorkOrder;
  item: EvidenceItem;
  onClose: () => void;
  onSave: (itemId: string, thumbnail: string) => void;
}

type Phase = 'aim' | 'recording' | 'review';

/**
 * Camera view for one evidence shot. Uses the real camera when available, otherwise a file
 * picker; the saved image is what gets uploaded. The evidence endpoint accepts one image, so
 * video mode keeps a still frame from the end of the clip.
 */
export default function MobileEvidenceCapture({
  order,
  item,
  onClose,
  onSave,
}: MobileEvidenceCaptureProps): React.ReactElement {
  const [mode, setMode] = useState<MediaType>(item.mediaType);
  const [phase, setPhase] = useState<Phase>('aim');
  const [seconds, setSeconds] = useState(0);
  const [flash, setFlash] = useState(false);
  const [torch, setTorch] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [showPresetGallery, setShowPresetGallery] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camera = useCamera(phase !== 'review');
  const { grab, setTorch: applyTorch } = camera;

  const guidance = item.guidance ?? [];
  const noCamera = Boolean(camera.error);

  useEffect(() => {
    applyTorch(torch);
  }, [torch, applyTorch]);

  useEffect(() => {
    if (phase !== 'recording') return;
    if (seconds >= 10) {
      setShot(grab());
      setPhase('review');
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s + 1), 1000);
    return () => clearTimeout(t);
  }, [phase, seconds, grab]);

  const shoot = () => {
    if (noCamera) {
      fileRef.current?.click();
      return;
    }
    if (mode === 'photo') {
      const frame = camera.grab();
      if (!frame) return;
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
      setShot(frame);
      setPhase('review');
    } else if (phase === 'recording') {
      setShot(camera.grab());
      setPhase('review');
    } else {
      setSeconds(0);
      setPhase('recording');
    }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setShot(await readFileAsDataUrl(file));
      setPickError(null);
      setPhase('review');
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not read the photo');
    }
  };

  /** A sample image is reviewed and saved like a camera shot; nothing is sent until the order is submitted. */
  const onPickPreset = async (preset: VisualEvidencePreset) => {
    setShowPresetGallery(false);
    try {
      const res = await fetch(preset.image_url);
      if (!res.ok) throw new Error(`Could not load the sample image (HTTP ${res.status})`);
      setShot(await readFileAsDataUrl(await res.blob()));
      setPickError(null);
      setPhase('review');
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not load the sample image');
    }
  };

  const retake = () => {
    setShot(null);
    setPhase('aim');
    setSeconds(0);
  };

  return (
    <div className="m-cam">
      {phase === 'review' && shot ? (
        <img className="m-review-shot" src={shot} alt={`Captured ${item.label}`} />
      ) : (
        <video ref={camera.videoRef} className="m-cam-video" playsInline muted aria-label="Camera view" />
      )}
      <div className="m-cam-vignette" />

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />

      <div className="m-cam-top">
        <button className="m-iconbtn dark" onClick={onClose} aria-label="Close camera" id="m-cam-close">
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="m-cam-title m-glass-dark">
          {phase === 'recording' ? (
            <span className="m-dot pulse m-rec" />
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
              {mode === 'video' ? 'videocam' : 'photo_camera'}
            </span>
          )}
          <span className="t">
            {phase === 'recording' ? `REC 00:${String(seconds).padStart(2, '0')} / 00:10` : item.label}
          </span>
        </div>
        <button
          className="m-iconbtn dark"
          onClick={() => setTorch((v) => !v)}
          aria-label="Toggle flash"
          disabled={noCamera}
          style={torch ? { background: '#ffd60a', color: '#000' } : undefined}
        >
          <span className="material-symbols-outlined">{torch ? 'flash_on' : 'flash_off'}</span>
        </button>
      </div>

      {phase !== 'review' && (
        <>
          <div className="m-guide-card m-glass-light-on-dark">
            <div className="m-between">
              <span className="m-ai-badge">
                <span className="spark">
                  <span className="material-symbols-outlined ms-fill">auto_awesome</span>
                </span>
                How to take this shot
              </span>
              <span className="m-sub m-mono">#{order.id}</span>
            </div>
            {order.live && order.aiRequest && (
              <p className="m-body" style={{ fontSize: 12.5, marginTop: 6 }}>“{order.aiRequest}”</p>
            )}
            <ul className="m-guide-list">
              {guidance.map((g, i) => (
                <li key={g}>
                  <b>{i + 1}</b>
                  {g}
                </li>
              ))}
            </ul>
          </div>

          <div className="m-frame" style={{ top: '52%' }}>
            <i />
            <i />
            <i />
            <i />
          </div>

          <div className="m-hint-pill m-glass-dark">
            <span className="material-symbols-outlined">{noCamera ? 'no_photography' : 'center_focus_weak'}</span>
            {pickError ??
              (noCamera
                ? 'No camera access · tap the shutter to choose a photo'
                : phase === 'recording'
                  ? 'Keep the part in frame'
                  : camera.ready
                    ? 'Frame the part inside the box'
                    : 'Starting camera…')}
          </div>

          {!noCamera && (
            <div className="m-mode-switch m-glass-dark">
              {(['photo', 'video'] as MediaType[]).map((m) => (
                <button key={m} className={mode === m ? 'on' : ''} onClick={() => phase === 'aim' && setMode(m)}>
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="m-shutter-row">
            <div className="m-sub" style={{ color: 'rgba(255,255,255,.8)', fontSize: 11 }}>
              {mode === 'video' ? 'A still from the clip is sent' : mode === item.mediaType ? 'Required format' : `AI asked for ${item.mediaType}`}
            </div>
            <button
              className={`m-shutter ${mode === 'video' && !noCamera ? 'video' : ''} ${phase === 'recording' ? 'recording' : ''}`}
              onClick={shoot}
              disabled={!noCamera && !camera.ready}
              aria-label={
                noCamera ? 'Choose photo' : mode === 'photo' ? 'Take photo' : phase === 'recording' ? 'Stop recording' : 'Start recording'
              }
              id="m-shutter"
            >
              <span />
            </button>
            <button
              className="m-shutter-side m-glass-dark"
              onClick={() => setShowPresetGallery(true)}
              aria-label="Choose sample image"
              id="m-open-preset-gallery"
            >
              <span className="material-symbols-outlined">photo_library</span>
            </button>
          </div>
        </>
      )}

      {phase === 'review' && (
        <>
          <div className="m-guide-card m-glass-light-on-dark">
            <div className="m-row" style={{ gap: 10 }}>
              <span className="material-symbols-outlined ms-fill" style={{ color: 'var(--accent)', fontSize: 26 }}>
                image_search
              </span>
              <div>
                <div className="m-h3">Check your shot</div>
                <div className="m-sub">Is the area the AI asked about sharp and in frame? The AI analyses it after you submit.</div>
              </div>
            </div>
          </div>
          <div className="m-review-actions">
            <button className="m-btn glass" onClick={retake}>
              <span className="material-symbols-outlined">refresh</span>
              Retake
            </button>
            <button className="m-btn accent" onClick={() => shot && onSave(item.id, shot)} disabled={!shot} id="m-use-capture">
              <span className="material-symbols-outlined">check</span>
              Use photo
            </button>
          </div>
        </>
      )}

      {flash && <div className="m-flash" />}

      <PresetGallerySheet
        open={showPresetGallery}
        onClose={() => setShowPresetGallery(false)}
        onSelect={(preset) => void onPickPreset(preset)}
      />
    </div>
  );
}
