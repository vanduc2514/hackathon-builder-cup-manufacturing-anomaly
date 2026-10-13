/**
 * Opens the device's rear camera with getUserMedia and grabs JPEG frames from it.
 * `error` is set when there is no camera or permission was denied, so callers can fall back
 * to a file picker instead of uploading a fake image.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Camera {
  videoRef: React.RefObject<HTMLVideoElement>;
  ready: boolean;
  error: string | null;
  /** Current frame as a JPEG data URL, or null when the camera is not ready. */
  grab: () => string | null;
  setTorch: (on: boolean) => void;
}

export function useCamera(enabled: boolean): Camera {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not available in this browser');
      return undefined;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            void video.play();
            setReady(true);
          };
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Camera permission denied');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  const grab = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.88);
  }, []);

  const setTorch = useCallback((on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    // `torch` is a non-standard constraint supported on most Android browsers.
    track
      .applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      .catch(() => undefined);
  }, []);

  return { videoRef, ready, error, grab, setTorch };
}

/** Reads a user-picked image file as a data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
