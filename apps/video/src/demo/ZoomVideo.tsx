import React from 'react';
import { Video } from '@remotion/media';
import { staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { progress } from '../theme';

/** Camera keyframe: at `t` seconds into the shot, show the source point (x, y) magnified `scale`×. */
export interface ZoomKey {
  t: number;
  scale: number;
  x: number;
  y: number;
}

export interface FootageProps {
  /** File under public/footage/clips. */
  src: string;
  /** Source second the shot starts at. */
  start: number;
  /** Source second the shot ends at; the clip is retimed to fill the shot. */
  end: number;
  /** Source frame size in px. */
  sourceWidth: number;
  sourceHeight: number;
  zoom?: ZoomKey[];
}

interface ZoomVideoProps extends FootageProps {
  width: number;
  height: number;
}

/** Playback rate that fits source [start, end] into the shot. */
export function footageRate(start: number, end: number, shotFrames: number, fps: number): number {
  return (end - start) / (shotFrames / fps);
}

function cameraAt(keys: ZoomKey[], seconds: number, fps: number): { scale: number; x: number; y: number } {
  if (seconds <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i += 1) {
    const a = keys[i - 1];
    const b = keys[i];
    if (seconds < b.t) {
      // Hold the previous key, then arrive at `b` exactly at b.t over at most 1.2 s.
      const p = progress(seconds * fps, Math.max(a.t, b.t - 1.2) * fps, b.t * fps);
      return { scale: a.scale + (b.scale - a.scale) * p, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
    }
  }
  return keys[keys.length - 1];
}

/** Screen recording retimed to its shot, with an eased pan/zoom camera that never shows empty edges. */
export default function ZoomVideo({ src, start, end, sourceWidth, sourceHeight, zoom, width, height }: ZoomVideoProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const rate = footageRate(start, end, durationInFrames, fps);
  const cam = cameraAt(zoom ?? [{ t: 0, scale: 1, x: sourceWidth / 2, y: sourceHeight / 2 }], frame / fps, fps);
  const fx = (cam.x / sourceWidth) * width * cam.scale;
  const fy = (cam.y / sourceHeight) * height * cam.scale;
  const tx = Math.min(0, Math.max(width - width * cam.scale, width / 2 - fx));
  const ty = Math.min(0, Math.max(height - height * cam.scale, height / 2 - fy));

  return (
    <div style={{ width, height, overflow: 'hidden', position: 'relative' }}>
      <div style={{ width, height, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${cam.scale})` }}>
        <Video
          src={staticFile(`footage/clips/${src}`)}
          trimBefore={Math.round(start * fps)}
          playbackRate={rate}
          muted
          objectFit="fill"
          style={{ width, height }}
        />
      </div>
    </div>
  );
}
