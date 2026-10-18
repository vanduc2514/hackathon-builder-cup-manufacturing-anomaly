import durations from './voiceover-durations.json';
import narration from './narration.json';

export const FPS = 30;

type LineId = keyof typeof durations;

/** Silence before the line starts and screen time kept after it ends, in seconds. */
const PACING: Record<LineId, [lead: number, hold: number]> = {
  'hook-1': [1.2, 1.0],
  'hook-2': [0.4, 1.8],
  'topo-1': [0.6, 1.0],
  'topo-2': [0.3, 1.5],
  'detect-1': [0.5, 1.0],
  'detect-2': [0.3, 2.0],
  'diag-1': [0.5, 1.2],
  'diag-2': [0.3, 2.5],
  'diag-3': [0.3, 2.0],
  'diag-4': [0.3, 2.0],
  'resolve-1': [0.5, 2.5],
  'resolve-2': [0.3, 3.0],
  'resolve-3': [0.3, 3.0],
  'resolve-4': [0.3, 3.5],
  'verify-1': [0.5, 2.0],
  'verify-2': [0.3, 2.5],
  'close-1': [0.5, 1.5],
  'close-2': [0.5, 2.0],
};

export interface Line {
  id: LineId;
  text: string;
  /** Slot start in the composition (frames). */
  from: number;
  /** Slot length (frames): lead + speech + hold. */
  duration: number;
  /** Speech start, relative to the slot (frames). */
  speechAt: number;
  /** Speech length (frames). */
  speech: number;
}

const sec = (s: number): number => Math.round(s * FPS);

export const LINES: Record<LineId, Line> = (() => {
  const out = {} as Record<LineId, Line>;
  let cursor = 0;
  for (const { id, text } of narration.lines) {
    const key = id as LineId;
    const [lead, hold] = PACING[key];
    const speech = sec(durations[key]);
    const duration = sec(lead) + speech + sec(hold);
    out[key] = { id: key, text, from: cursor, duration, speechAt: sec(lead), speech };
    cursor += duration;
  }
  return out;
})();

/** Frames spanned by consecutive lines `first`..`last`. */
export function span(first: LineId, last: LineId = first): { from: number; duration: number } {
  const a = LINES[first];
  const b = LINES[last];
  return { from: a.from, duration: b.from + b.duration - a.from };
}

/** Longest subtitle chunk (chars) that still fits two lines over a screen recording. */
const MAX_CHUNK = 100;

/** Sentences, with any sentence over MAX_CHUNK split at the comma nearest its middle. */
function chunk(text: string): string[] {
  return text.split(/(?<=[.!?:])\s+/).flatMap((s) => {
    if (s.length <= MAX_CHUNK) return [s];
    const commas = [...s.matchAll(/, /g)].map((m) => m.index);
    if (commas.length === 0) return [s];
    const cut = commas.reduce((best, i) => (Math.abs(i - s.length / 2) < Math.abs(best - s.length / 2) ? i : best));
    return [s.slice(0, cut + 1), s.slice(cut + 2)];
  });
}

/**
 * Subtitles for lines `ids`, timed relative to a shot starting at `shotFrom`.
 * Each line is split into short chunks paced by character count across its speech; the last chunk stays until the slot ends.
 */
export function captionsFor(ids: LineId[], shotFrom: number): { text: string; from: number; to: number }[] {
  return ids.flatMap((id) => {
    const l = LINES[id];
    const parts = chunk(l.text);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let at = l.from - shotFrom + l.speechAt;
    return parts.map((text, i) => {
      const from = at;
      at += Math.round((l.speech * text.length) / total);
      return { text, from, to: i === parts.length - 1 ? l.from - shotFrom + l.duration : at };
    });
  });
}

export const TOTAL_FRAMES = Object.values(LINES).reduce((end, l) => Math.max(end, l.from + l.duration), 0);
