import React from 'react';
import { Track } from 'remotion';
import { BrowserShot } from './BrowserShot';
import { DEMO } from './demoTimeline';
import { EndScene } from './EndScene';
import { INTRO } from '../intro/introTimeline';
import { IntroScene } from './IntroScene';
import { LearnScene } from './LearnScene';
import { MeetScene } from './MeetScene';
import { PhoneShot } from './PhoneShot';
import { SolutionScene } from './SolutionScene';
import Voiceover from './Voiceover';

// Prod recordings of INC-1028C4 (run C), its close-out (C2), the manual step card (F) and the knowledge pages (E).
const WEB = { src: 'C-web.mp4', sourceWidth: 1920, sourceHeight: 1080 };
const WEB_CLOSE = { src: 'C2-web.mp4', sourceWidth: 1920, sourceHeight: 1080 };
const MOBILE = { src: 'C-mobile.mp4', sourceWidth: 860, sourceHeight: 1864 };
const MOBILE_CLOSE = { src: 'C2-mobile.mp4', sourceWidth: 860, sourceHeight: 1864 };
const S = 30; // fps: seconds → frames for callout timing

/** Product demo: intro film, then prod screen recordings of one real incident with Gemini TTS voiceover and subtitles. */
export default function KaizenDemo(): React.ReactElement {
  const { lines: l, span, captionsFor } = DEMO;
  const topo = span('topo-1', 'topo-2');
  const detect = span('detect-1', 'detect-2');
  const learn = span('learn-2', 'learn-3');

  return (
    <>
      <Track name="Shots">
        <IntroScene name="Intro" durationInFrames={INTRO.totalFrames} />
        <MeetScene name="Meet" from={l['meet-1'].from} durationInFrames={l['meet-1'].duration} captions={captionsFor(['meet-1'], l['meet-1'].from)} />
        <SolutionScene
          name="Solution"
          from={l['solution-1'].from}
          durationInFrames={l['solution-1'].duration}
          captions={captionsFor(['solution-1'], l['solution-1'].from)}
          speechAt={l['solution-1'].speechAt}
          speech={l['solution-1'].speech}
          text={l['solution-1'].text}
        />
        <BrowserShot
          name="Topology"
          from={topo.from}
          durationInFrames={topo.duration}
          url="kaizen-lab-demo.web.app"
          step="System topology"
          title="Edge to cloud, one incident loop"
          services={['Gemma 3', 'Pub/Sub', 'Google ADK', 'Gemini', 'BigQuery', 'Vertex AI Search', 'Firestore']}
          footage={{ src: 'topology.mp4', sourceWidth: 1920, sourceHeight: 1080, start: 1, end: 46, zoom: [{ t: 0, scale: 1.5, x: 980, y: 560 }] }}
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
            src: 'C-factory.mp4',
            sourceWidth: 1920,
            sourceHeight: 1080,
            start: 3,
            end: 26,
            zoom: [
              { t: 0, scale: 1.4, x: 700, y: 240 },
              { t: 5, scale: 1.7, x: 800, y: 570 },
              { t: 9, scale: 1.5, x: 790, y: 830 },
              { t: 13, scale: 1.8, x: 1425, y: 830 },
              { t: 17.5, scale: 1.6, x: 950, y: 330 },
            ],
          }}
          captions={captionsFor(['detect-1', 'detect-2'], detect.from)}
        />
        <BrowserShot
          name="Alert"
          from={l['diag-1'].from}
          durationInFrames={l['diag-1'].duration}
          url="kaizen-lab-web.web.app"
          step="2 · Diagnose · Quality Inspector"
          title="One clear alert on Plant Ops"
          services={['Gemini', 'Google ADK', 'Firestore']}
          footage={{
            ...WEB,
            start: 2,
            end: 17,
            zoom: [
              { t: 0, scale: 1, x: 960, y: 540 },
              { t: 2.5, scale: 1.6, x: 700, y: 160 },
              { t: 7.5, scale: 1.2, x: 1075, y: 480 },
            ],
          }}
          captions={captionsFor(['diag-1'], l['diag-1'].from)}
        />
        <BrowserShot
          name="Traceability"
          from={l['diag-3'].from}
          durationInFrames={l['diag-3'].duration}
          url="kaizen-lab-web.web.app"
          step="2 · Diagnose · Traceability"
          title="Traced to CNC-02, tool T07"
          services={['BigQuery']}
          footage={{ ...WEB, start: 18, end: 31, zoom: [{ t: 0, scale: 1.25, x: 1075, y: 420 }] }}
          captions={captionsFor(['diag-3'], l['diag-3'].from)}
        />
        <BrowserShot
          name="Root cause"
          from={l['diag-4'].from}
          durationInFrames={l['diag-4'].duration}
          url="kaizen-lab-web.web.app"
          step="2 · Diagnose · Root Cause"
          title="Chipped edge on T07, 95% confident"
          services={['Vertex AI Search', 'Gemini']}
          footage={{
            ...WEB,
            start: 32,
            end: 61,
            zoom: [
              { t: 0, scale: 1.2, x: 1075, y: 620 },
              { t: 12, scale: 1.7, x: 1450, y: 440 },
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
          footage={{ ...MOBILE, start: 54, end: 66 }}
          captions={captionsFor(['resolve-1'], l['resolve-1'].from)}
          callouts={[
            { at: 1 * S, title: 'Repair brief · 95% AI sure', body: 'A chipped edge on tool T07, straight from the agent findings.' },
            { at: 5 * S, title: 'Work order · Incident Scribe', body: 'Drafted by Gemini from the incident board: tools, parts and a five-step repair plan.' },
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
          footage={{ ...MOBILE, start: 71, end: 92 }}
          captions={captionsFor(['resolve-2'], l['resolve-2'].from)}
          callouts={[
            { at: 1 * S, title: '"What is wrong?"', body: 'A real Gemini reply, streamed from the live incident context: CNC-02, tool T07, the chipped edge.' },
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
          footage={{ ...MOBILE, start: 92, end: 110 }}
          captions={captionsFor(['resolve-3'], l['resolve-3'].from)}
          callouts={[
            { at: 1 * S, title: 'Multimodal check', body: '"I see a triangular insert with a severely chipped and fractured top corner."' },
          ]}
        />
        <PhoneShot
          name="Manual steps"
          from={l['resolve-4'].from}
          durationInFrames={l['resolve-4'].duration}
          url="kaizen-lab-mobile.web.app"
          step="3 · Resolve · OEM manual"
          title="Every step cites the manual"
          services={['Vertex AI Search']}
          footage={{ src: 'F-mobile-book.mp4', sourceWidth: 860, sourceHeight: 1864, start: 0.5, end: 17 }}
          captions={captionsFor(['resolve-4'], l['resolve-4'].from)}
          callouts={[
            { at: 1 * S, title: 'Tap the manual icon', body: 'Step 1/5 · LOTO lockout & power isolation · CNC-02 manual, p.112, sec. 4.2.1.' },
            { at: 6 * S, title: 'Target and check per step', body: 'Each card says what "done" means and how it is checked, so nothing is guessed.' },
          ]}
        />
        <PhoneShot
          name="Submit"
          from={l['resolve-5'].from}
          durationInFrames={l['resolve-5'].duration}
          url="kaizen-lab-mobile.web.app"
          step="3 · Resolve · submit"
          title="All five steps done"
          services={['Firestore']}
          footage={{ ...MOBILE_CLOSE, start: 12, end: 25 }}
          captions={captionsFor(['resolve-5'], l['resolve-5'].from)}
          callouts={[{ at: 1 * S, title: 'Repair submitted', body: 'A handover note goes to the shift leader; the inline camera starts checking parts.' }]}
        />
        <BrowserShot
          name="Streak"
          from={l['verify-1'].from}
          durationInFrames={l['verify-1'].duration}
          url="kaizen-lab-web.web.app"
          step="4 · Verify"
          title="The product proves the fix"
          services={['Gemini', 'Firestore']}
          footage={{ ...WEB_CLOSE, start: 18, end: 36, zoom: [{ t: 0, scale: 1.3, x: 1250, y: 480 }] }}
          captions={captionsFor(['verify-1'], l['verify-1'].from)}
        />
        <BrowserShot
          name="Sign-off"
          from={l['verify-2'].from}
          durationInFrames={l['verify-2'].duration}
          url="kaizen-lab-web.web.app"
          step="4 · Sign off"
          title="8D report, approved by a human"
          services={['Gemini', 'Firestore']}
          footage={{ ...WEB_CLOSE, start: 36, end: 53 }}
          captions={captionsFor(['verify-2'], l['verify-2'].from)}
        />
        <LearnScene
          name="Documents"
          from={l['learn-1'].from}
          durationInFrames={l['learn-1'].duration}
          incidentId="INC-1028C4"
          captions={captionsFor(['learn-1'], l['learn-1'].from)}
        />
        <BrowserShot
          name="Knowledge"
          from={learn.from}
          durationInFrames={learn.duration}
          url="kaizen-lab-web.web.app"
          step="5 · Learn · knowledge loop"
          title="Knowledge Base and SOP Change Log"
          services={['Vertex AI Search', 'Gemini', 'Cloud Storage']}
          footage={{
            src: 'E-web-knowledge.mp4',
            sourceWidth: 1920,
            sourceHeight: 1080,
            start: 3.5,
            end: 39,
            zoom: [
              { t: 0, scale: 1.2, x: 1075, y: 640 },
              { t: 7, scale: 1.2, x: 1075, y: 460 },
              { t: 12, scale: 1, x: 960, y: 540 },
            ],
          }}
          captions={captionsFor(['learn-2', 'learn-3'], learn.from)}
        />
        <EndScene
          name="End"
          from={l['close-2'].from}
          durationInFrames={l['close-2'].duration}
          caption={l['close-2'].text}
          captionFrom={l['close-2'].speechAt}
        />
      </Track>
      <Voiceover lines={Object.values(l)} />
    </>
  );
}
