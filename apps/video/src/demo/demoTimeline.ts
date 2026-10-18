import { INTRO } from '../intro/introTimeline';
import durations from './voiceover-durations.json';
import narration from './narration.json';
import pauses from './voiceover-pauses.json';
import { buildTimeline } from './timeline';

type LineId = keyof typeof durations;

/** [lead, hold] seconds per line: silence before speech, screen time after it. Narration starts after the intro film. */
export const DEMO = buildTimeline<LineId>(
  narration,
  durations,
  {
    'meet-1': [0.4, 0.8],
    'solution-1': [0.4, 1.0],
    'topo-1': [0.4, 0.6],
    'topo-2': [0.3, 0.6],
    'detect-1': [0.4, 0.6],
    'detect-2': [0.3, 0.8],
    'diag-1': [0.4, 0.6],
    'diag-3': [0.3, 0.8],
    'diag-4': [0.3, 0.8],
    'resolve-1': [0.4, 1.0],
    'resolve-2': [0.3, 2.0],
    'resolve-3': [0.3, 1.5],
    'resolve-4': [0.3, 1.0],
    'resolve-5': [0.3, 0.8],
    'verify-1': [0.4, 1.0],
    'verify-2': [0.3, 1.0],
    'learn-1': [0.4, 0.6],
    'learn-2': [0.3, 1.0],
    'learn-3': [0.3, 1.0],
    'close-2': [0.4, 2.0],
  },
  INTRO.totalFrames,
  pauses,
);
