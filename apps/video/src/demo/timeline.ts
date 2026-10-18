export const FPS = 30;

export interface Line {
  id: string;
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

export interface Caption {
  text: string;
  /** Frames relative to the shot. */
  from: number;
  to: number;
}

export interface Timeline<Id extends string> {
  lines: Record<Id, Line>;
  /** Frames spanned by consecutive lines `first`..`last`. */
  span: (first: Id, last?: Id) => { from: number; duration: number };
  /** Subtitles for `ids`, timed relative to a shot starting at `shotFrom`. */
  captionsFor: (ids: Id[], shotFrom: number) => Caption[];
  totalFrames: number;
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
 * Lays narration lines end to end: each slot is lead silence + measured speech + hold.
 * `pacing` gives [lead, hold] seconds per line id; durations come from the voiceover generator.
 */
export function buildTimeline<Id extends string>(
  narration: { lines: { id: string; text: string }[] },
  durations: Record<Id, number>,
  pacing: Record<Id, [lead: number, hold: number]>,
): Timeline<Id> {
  const sec = (s: number): number => Math.round(s * FPS);
  const lines = {} as Record<Id, Line>;
  let cursor = 0;
  for (const { id, text } of narration.lines) {
    const key = id as Id;
    const [lead, hold] = pacing[key];
    const speech = sec(durations[key]);
    const duration = sec(lead) + speech + sec(hold);
    lines[key] = { id, text, from: cursor, duration, speechAt: sec(lead), speech };
    cursor += duration;
  }

  return {
    lines,
    totalFrames: cursor,
    span: (first, last = first) => {
      const a = lines[first];
      const b = lines[last];
      return { from: a.from, duration: b.from + b.duration - a.from };
    },
    // Each line is split into short chunks paced by character count; the last chunk stays until the slot ends.
    captionsFor: (ids, shotFrom) =>
      ids.flatMap((id) => {
        const l = lines[id];
        const parts = chunk(l.text);
        const total = parts.reduce((n, p) => n + p.length, 0);
        let at = l.from - shotFrom + l.speechAt;
        return parts.map((text, i) => {
          const from = at;
          at += Math.round((l.speech * text.length) / total);
          return { text, from, to: i === parts.length - 1 ? l.from - shotFrom + l.duration : at };
        });
      }),
  };
}
