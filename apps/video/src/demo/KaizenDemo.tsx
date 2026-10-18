import React from 'react';
import { Audio } from '@remotion/media';
import { Sequence, Track, staticFile } from 'remotion';
import { ProblemScene } from '../scenes/ProblemScene';
import { BrowserShot } from './BrowserShot';
import { EndScene } from './EndScene';
import { ImpactScene } from './ImpactScene';
import { InsightScene } from './InsightScene';
import { PhoneShot } from './PhoneShot';
import { LINES, captionsFor, span } from './timeline';

const WEB = { src: 'A-web.mp4', sourceWidth: 1920, sourceHeight: 1080 };
const MOBILE = { src: 'A-mobile.mp4', sourceWidth: 860, sourceHeight: 1864 };
const S = 30; // fps: seconds → frames for callout timing

/** 3:15 product demo: prod screen recordings of one real incident, Gemini TTS voiceover, burned-in subtitles. */
export default function KaizenDemo(): React.ReactElement {
  const topo = span('topo-1', 'topo-2');
  const detect = span('detect-1', 'detect-2');
  const l = LINES;

  return (
    <>
      <Track name="Shots">
        <ProblemScene name="Hook" from={l['hook-1'].from} durationInFrames={l['hook-1'].duration} caption={l['hook-1'].text} />
        <InsightScene
          name="Insight"
          from={l['hook-2'].from}
          durationInFrames={l['hook-2'].duration}
          caption={l['hook-2'].text}
          captionFrom={l['hook-2'].speechAt}
        />
        <BrowserShot
          name="Topology"
          from={topo.from}
          durationInFrames={topo.duration}
          url="kaizen-lab-demo.web.app"
          step="System topology"
          title="Edge to cloud, one incident loop"
          services={['Gemma 3', 'Pub/Sub', 'Google ADK', 'Gemini', 'BigQuery', 'Vertex AI Search', 'Firestore']}
          footage={{ src: 'topology.mp4', sourceWidth: 1920, sourceHeight: 1080, start: 1, end: 52, zoom: [{ t: 0, scale: 1.5, x: 980, y: 560 }] }}
          captions={captionsFor(['topo-1', 'topo-2'], topo.from)}
        />
        <BrowserShot
          name="Detect"
          from={detect.from}
          durationInFrames={detect.duration}
          url="kaizen-lab-factory.web.app"
          step="1 · Detect · simulated factory line"
          title="A worn tool on CNC-02"
          services={['Gemma 3 edge', 'Cloud Pub/Sub']}
          footage={{
            src: 'A-factory.mp4',
            sourceWidth: 1920,
            sourceHeight: 1080,
            start: 2,
            end: 25,
            zoom: [
              { t: 0, scale: 1, x: 960, y: 540 },
              { t: 3.5, scale: 1.6, x: 795, y: 570 },
              { t: 8, scale: 1.5, x: 915, y: 790 },
              { t: 12.5, scale: 1.9, x: 1600, y: 860 },
              { t: 17.5, scale: 1.6, x: 960, y: 345 },
            ],
          }}
          captions={captionsFor(['detect-1', 'detect-2'], detect.from)}
        />
        <BrowserShot
          name="Alert"
          from={l['diag-1'].from}
          durationInFrames={l['diag-1'].duration}
          url="kaizen-lab-web.web.app"
          step="2 · Diagnose"
          title="One clear alert on Plant Ops"
          services={['Google ADK', 'Firestore', 'Cloud Run']}
          footage={{
            ...WEB,
            start: 3,
            end: 14.5,
            zoom: [
              { t: 0, scale: 1, x: 960, y: 540 },
              { t: 2.5, scale: 1.7, x: 700, y: 250 },
              { t: 8.5, scale: 1, x: 960, y: 540 },
            ],
          }}
          captions={captionsFor(['diag-1'], l['diag-1'].from)}
        />
        <BrowserShot
          name="Inspection"
          from={l['diag-2'].from}
          durationInFrames={l['diag-2'].duration}
          url="kaizen-lab-web.web.app"
          step="2 · Diagnose · Quality Inspector"
          title="Defect confirmed from camera frames"
          services={['Gemini']}
          footage={{ ...WEB, start: 14.5, end: 21.5, zoom: [{ t: 0, scale: 1.2, x: 1075, y: 480 }] }}
          captions={captionsFor(['diag-2'], l['diag-2'].from)}
        />
        <BrowserShot
          name="Traceability"
          from={l['diag-3'].from}
          durationInFrames={l['diag-3'].duration}
          url="kaizen-lab-web.web.app"
          step="2 · Diagnose · Traceability"
          title="Traced to CNC-02, tool T07"
          services={['BigQuery']}
          footage={{
            ...WEB,
            start: 22,
            end: 34,
            zoom: [
              { t: 0, scale: 1, x: 960, y: 540 },
              { t: 1.5, scale: 1.2, x: 1075, y: 470 },
            ],
          }}
          captions={captionsFor(['diag-3'], l['diag-3'].from)}
        />
        <BrowserShot
          name="Root cause"
          from={l['diag-4'].from}
          durationInFrames={l['diag-4'].duration}
          url="kaizen-lab-web.web.app"
          step="2 · Diagnose · Root Cause"
          title="Root cause found, 85% confident"
          services={['Vertex AI Search', 'Gemini']}
          footage={{
            ...WEB,
            start: 36,
            end: 55,
            zoom: [
              { t: 0, scale: 1.2, x: 1075, y: 620 },
              { t: 14, scale: 1.7, x: 1450, y: 435 },
            ],
          }}
          captions={captionsFor(['diag-4'], l['diag-4'].from)}
        />
        <PhoneShot
          name="Repair brief"
          from={l['resolve-1'].from}
          durationInFrames={l['resolve-1'].duration}
          url="kaizen-lab-mobile.web.app"
          step="3 · Resolve · technician app"
          title="The job reaches the technician"
          services={['Gemini', 'Firestore']}
          footage={{ ...MOBILE, start: 50, end: 63 }}
          captions={captionsFor(['resolve-1'], l['resolve-1'].from)}
          callouts={[
            { at: 1 * S, title: 'Repair brief · 85% AI sure', body: 'Root cause and suspect tool T07, straight from the agent findings.' },
            { at: 5 * S, title: 'Work order · Incident Scribe', body: 'Drafted by Gemini from the incident board: equipment, tool station, parts.' },
          ]}
        />
        <PhoneShot
          name="Copilot question"
          from={l['resolve-2'].from}
          durationInFrames={l['resolve-2'].duration}
          url="kaizen-lab-mobile.web.app"
          step="3 · Resolve · Copilot"
          title="Guided repair with Gemini"
          services={['Gemini']}
          footage={{ ...MOBILE, start: 64, end: 82 }}
          captions={captionsFor(['resolve-2'], l['resolve-2'].from)}
          callouts={[
            { at: 1 * S, title: '"What is wrong?"', body: 'A real Gemini reply, streamed from the live incident context: CNC-02, tool T07, the vibration evidence.' },
          ]}
        />
        <PhoneShot
          name="Copilot photo"
          from={l['resolve-3'].from}
          durationInFrames={l['resolve-3'].duration}
          url="kaizen-lab-mobile.web.app"
          step="3 · Resolve · Copilot"
          title="Gemini looks at the removed insert"
          services={['Gemini']}
          footage={{ ...MOBILE, start: 84, end: 104 }}
          captions={captionsFor(['resolve-3'], l['resolve-3'].from)}
          callouts={[
            { at: 1 * S, title: 'Multimodal check', body: '"I see a triangular cutting insert with severe chipping and wear on its top corner."' },
          ]}
        />
        <PhoneShot
          name="Repair steps"
          from={l['resolve-4'].from}
          durationInFrames={l['resolve-4'].duration}
          url="kaizen-lab-mobile.web.app"
          step="3 · Resolve · guided steps"
          title="Five cited steps, then submit"
          services={['Gemini']}
          footage={{ ...MOBILE, start: 104, end: 124 }}
          captions={captionsFor(['resolve-4'], l['resolve-4'].from)}
          callouts={[
            { at: 1 * S, title: 'Every step cites its source', body: 'e.g. LOTO lockout: CNC-02 manual, p.112, sec. 4.2.1. No source, no guess.' },
          ]}
        />
        <PhoneShot
          name="Streak"
          from={l['verify-1'].from}
          durationInFrames={l['verify-1'].duration}
          url="kaizen-lab-mobile.web.app"
          step="4 · Verify"
          title="The product proves the fix"
          services={['Firestore']}
          footage={{ ...MOBILE, start: 180, end: 196 }}
          captions={captionsFor(['verify-1'], l['verify-1'].from)}
          callouts={[
            { at: 1 * S, title: 'Optical streak gate', body: '50 defect-free parts in a row close the incident. One bad part resets the count.' },
          ]}
        />
        <BrowserShot
          name="Sign-off"
          from={l['verify-2'].from}
          durationInFrames={l['verify-2'].duration}
          url="kaizen-lab-web.web.app"
          step="4 · Sign off"
          title="8D report, approved by a human"
          services={['Gemini', 'Firestore']}
          footage={{ src: 'B-web-approve.mp4', sourceWidth: 1920, sourceHeight: 1080, start: 3, end: 25 }}
          captions={captionsFor(['verify-2'], l['verify-2'].from)}
        />
        <ImpactScene
          name="Impact"
          from={l['close-1'].from}
          durationInFrames={l['close-1'].duration}
          caption={l['close-1'].text}
          captionFrom={l['close-1'].speechAt}
        />
        <EndScene
          name="End"
          from={l['close-2'].from}
          durationInFrames={l['close-2'].duration}
          caption={l['close-2'].text}
          captionFrom={l['close-2'].speechAt}
        />
      </Track>
      <Track name="Voiceover">
        {Object.values(LINES).map((line) => (
          <Sequence key={line.id} name={line.id} from={line.from + line.speechAt} durationInFrames={line.speech + 6}>
            <Audio src={staticFile(`voiceover/${line.id}.mp3`)} />
          </Sequence>
        ))}
      </Track>
    </>
  );
}
