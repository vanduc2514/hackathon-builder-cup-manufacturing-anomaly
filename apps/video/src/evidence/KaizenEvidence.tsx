import React from 'react';
import { Track } from 'remotion';
import { BrowserShot } from '../demo/BrowserShot';
import { EndScene } from '../demo/EndScene';
import { PhoneShot } from '../demo/PhoneShot';
import { buildTimeline } from '../demo/timeline';
import Voiceover from '../demo/Voiceover';
import durations from './voiceover-durations.json';
import narration from './narration.json';

type LineId = keyof typeof durations;

/** [lead, hold] seconds per line. */
export const EVIDENCE = buildTimeline<LineId>(narration, durations, {
  'ev-1': [0.6, 1.5],
  'ev-2': [0.3, 1.5],
  'ev-3': [0.3, 2.0],
  'ev-4': [0.3, 1.2],
  'ev-5': [0.3, 2.0],
  'ev-6': [0.4, 2.0],
});

const WEB = { sourceWidth: 1920, sourceHeight: 1080 };
const MOBILE = { sourceWidth: 860, sourceHeight: 1864 };
const S = 30; // fps: seconds → frames for callout timing

/** Supplement: the evidence loop, where the Root Cause agent asks the technician for a photo before repair. */
export default function KaizenEvidence(): React.ReactElement {
  const { lines: l, captionsFor } = EVIDENCE;

  return (
    <>
      <Track name="Shots">
        <BrowserShot
          name="Agents pause"
          from={l['ev-1'].from}
          durationInFrames={l['ev-1'].duration}
          windowTitle="Plant Ops dashboard"
          step="Evidence loop · Root Cause"
          title="The agents ask for proof"
          services={['Google ADK', 'Gemini', 'BigQuery']}
          footage={{
            ...WEB,
            src: 'G1-web.mp4',
            start: 6,
            end: 73,
            zoom: [
              { t: 0, scale: 1.2, x: 1075, y: 480 },
              { t: 9.5, scale: 1.55, x: 1000, y: 510 },
            ],
          }}
          captions={captionsFor(['ev-1'], l['ev-1'].from)}
        />
        <PhoneShot
          name="Request"
          from={l['ev-2'].from}
          durationInFrames={l['ev-2'].duration}
          step="Evidence loop · technician app"
          title="What the AI needs to see"
          services={['Gemini', 'Firestore']}
          footage={{ ...MOBILE, src: 'G2-mobile.mp4', start: 0.6, end: 5.6 }}
          captions={captionsFor(['ev-2'], l['ev-2'].from)}
          callouts={[
            { at: 1 * S, title: 'Needs evidence', body: '"Please take a close-up photo of insert T07 to confirm flank wear or chipping."' },
            { at: 5 * S, title: 'AI needs your eyes', body: 'Sensor evidence is already attached; one photo is still missing.' },
          ]}
        />
        <PhoneShot
          name="Library"
          from={l['ev-3'].from}
          durationInFrames={l['ev-3'].duration}
          step="Evidence loop · evidence library"
          title="Pick the photo, check the shot"
          services={['Cloud Storage']}
          footage={{ ...MOBILE, src: 'G2-mobile.mp4', start: 9.6, end: 30 }}
          captions={captionsFor(['ev-3'], l['ev-3'].from)}
          callouts={[{ at: 2 * S, title: 'T07 insert · severe flank wear', body: 'Chosen from the evidence library, reviewed before it is saved.' }]}
        />
        <PhoneShot
          name="Submit"
          from={l['ev-4'].from}
          durationInFrames={l['ev-4'].duration}
          step="Evidence loop · submit"
          title="Back to the agents"
          services={['Gemini']}
          footage={{ ...MOBILE, src: 'G3-mobile.mp4', start: 0, end: 30 }}
          captions={captionsFor(['ev-4'], l['ev-4'].from)}
          callouts={[{ at: 1 * S, title: 'Submit evidence to AI', body: 'The job moves to "AI re-checking" while Gemini analyses the photo.' }]}
        />
        <BrowserShot
          name="Re-analysis"
          from={l['ev-5'].from}
          durationInFrames={l['ev-5'].duration}
          windowTitle="Plant Ops dashboard"
          step="Evidence loop · Gemini vision"
          title="90% → 98% confident"
          services={['Gemini', 'Vertex AI Search']}
          footage={{
            ...WEB,
            src: 'G3-web.mp4',
            start: 20,
            end: 64.3,
            zoom: [
              { t: 0, scale: 1.2, x: 1075, y: 520 },
              { t: 7, scale: 1.45, x: 900, y: 600 },
              { t: 11, scale: 1.7, x: 1500, y: 440 },
            ],
          }}
          captions={captionsFor(['ev-5'], l['ev-5'].from)}
        />
        <EndScene name="End" from={l['ev-6'].from} durationInFrames={l['ev-6'].duration} caption={l['ev-6'].text} captionFrom={l['ev-6'].speechAt} />
      </Track>
      <Voiceover lines={Object.values(l)} />
    </>
  );
}
