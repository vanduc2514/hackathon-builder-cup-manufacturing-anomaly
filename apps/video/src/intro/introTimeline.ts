import { buildTimeline } from '../demo/timeline';
import durations from './voiceover-durations.json';
import narration from './narration.json';

/** [lead, hold] seconds per re-voiced intro line; the film is retimed to span exactly these slots. */
export const INTRO = buildTimeline<keyof typeof durations>(narration, durations, {
  'intro-1': [0.5, 0.2],
  'intro-2': [0.2, 0.3],
  'intro-3': [0.2, 0.3],
  'intro-4': [0.2, 0.3],
  'intro-5': [0.2, 0.3],
});
