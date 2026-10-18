# apps/video — Demo videos (Remotion)

Programmatic videos for the AI Builder Cup submission, styled with the Lumina Slate tokens from `docs/DESIGN.md`.

| Composition | Length | What it is |
|---|---|---|
| `KaizenDemo` | ~3:41 | Submission video: the intro film re-voiced with the same Gemini TTS voice, no subtitles (its title card replaced by the kAIzen logo card), then prod screen recordings of one real incident (INC-1028C4) from detection to sign-off and the knowledge loop, Gemini TTS voiceover, burned-in English subtitles, Google service badges per shot |
| `KaizenEvidence` | ~1:02 | Supplement: the evidence loop — the Root Cause agent pauses for a photo, the technician picks it from the evidence library, Gemini re-checks (90% → 98%) before repair |
| `KaizenTeaser` | 0:30 | Fully animated teaser (no footage) |

## Tasks

```bash
mise run video:studio                      # Remotion Studio preview
mise run video:render                      # out/kaizen-demo.mp4
mise run video:render:evidence             # out/kaizen-evidence.mp4
mise run video:render:teaser               # out/kaizen-teaser.mp4
mise run video:voiceover                   # regenerate the KaizenDemo narration (Gemini TTS on Vertex AI)
mise run video:voiceover -- --only diag-4  # regenerate one line
mise run video:voiceover -- --script evidence   # or --script intro
mise run video:typecheck
```

## Where things live

| Path | Purpose |
|---|---|
| `src/{demo,evidence,intro}/narration.json` | Voiceover script, voice (`Puck`) and TTS model; also the subtitle text (the intro has none) |
| `src/*/voiceover-durations.json` | Measured line lengths written by the generator; drive all timing |
| `src/demo/timeline.ts` | `buildTimeline`: lead/hold pacing per line, slot frames, subtitle chunking |
| `src/demo/demoTimeline.ts` | KaizenDemo pacing |
| `src/demo/KaizenDemo.tsx`, `src/evidence/KaizenEvidence.tsx` | Shot lists: footage file, source in/out seconds, camera zoom keys, callouts, services |
| `scripts/generate_voiceover.py` | Gemini TTS (`gemini-2.5-flash-tts`, Vertex AI, ADC) → `public/voiceover/<line>.mp3` |
| `public/footage/clips/` | H.264 screen recordings and `intro.mp4` (first 31.5 s of the team's intro film, with its audio); not in git, ~150 MB |
| `public/brand/logo.png` | App logo (copy of `apps/web/public/logo.png`) for the title card |

Changing a line: edit the narration file, run `video:voiceover -- --only <id>`; the timeline re-flows from the new duration.
Footage is retimed to fill each shot; shots played faster than 1.3× show an "N× speed" tag.
Shots without a `url` (the evidence video) show a window title instead of a live address.

## Footage

Recorded with Puppeteer `page.screencast` in dedicated 1920×1080 headless windows (mobile 430×932 at DPR 2), then
normalised: `ffmpeg -i in.webm -vf "fps=30" -c:v libx264 -crf 18 -pix_fmt yuv420p clips/out.mp4` (mobile also
`scale=860:1864`). Mobile screencasts are not real-time, so pick mobile in/out points from a contact sheet of the clip.

The evidence footage needs `require_evidence`, which prod cannot trigger (`/api/simulation/inject` is blocked there), so it
was recorded against a local backend running the same code with Gemini on Vertex AI:
`AI_PROVIDER=gemini GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT=<project> GOOGLE_CLOUD_LOCATION=global GCP_REGION=global`,
with `GCP_PROJECT_ID` unset so Firestore and BigQuery stay on the in-memory/mock fallbacks.
