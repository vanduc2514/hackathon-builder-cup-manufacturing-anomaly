import durations from './voiceover-durations.json';
import narration from './narration.json';
import { buildTimeline } from './timeline';

type LineId = keyof typeof durations;

/** [lead, hold] seconds per line: silence before speech, screen time after it. */
export const DEMO = buildTimeline<LineId>(narration, durations, {
  'hook-1': [1.0, 0.8],
  'hook-2': [0.3, 1.2],
  'topo-1': [0.4, 0.6],
  'topo-2': [0.3, 1.0],
  'detect-1': [0.4, 0.8],
  'detect-2': [0.3, 1.2],
  'diag-1': [0.4, 1.0],
  'diag-3': [0.3, 1.2],
  'diag-4': [0.3, 1.2],
  'resolve-1': [0.4, 1.5],
  'resolve-2': [0.3, 2.5],
  'resolve-3': [0.3, 2.0],
  'resolve-4': [0.3, 1.5],
  'resolve-5': [0.3, 1.2],
  'verify-1': [0.4, 1.5],
  'verify-2': [0.3, 1.5],
  'learn-1': [0.4, 1.0],
  'learn-2': [0.3, 1.5],
  'learn-3': [0.3, 1.5],
  'close-1': [0.4, 1.2],
  'close-2': [0.4, 2.0],
});
