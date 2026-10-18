# apps/video — Demo video (Remotion)

Programmatic videos for the AI Builder Cup submission, styled with the Lumina Slate tokens from `docs/DESIGN.md`.

| Composition | Length | What it is |
|---|---|---|
| `KaizenDemo` | ~3:19 | Submission video: prod screen recordings of one real incident (INC-3A510E), Gemini TTS voiceover, burned-in English subtitles, Google service badges per shot |
| `KaizenTeaser` | 0:30 | Fully animated teaser (no footage) |

## Tasks

```bash
mise run video:studio          # Remotion Studio preview
mise run video:render          # out/kaizen-demo.mp4
mise run video:render:teaser   # out/kaizen-teaser.mp4
mise run video:voiceover       # regenerate all voiceover lines (Gemini TTS on Vertex AI)
mise run video:voiceover -- --only diag-4   # regenerate one line
mise run video:typecheck
```

## Where things live

| Path | Purpose |
|---|---|
| `src/demo/narration.json` | Voiceover script, voice (`Puck`) and TTS model; also the subtitle text |
| `src/demo/voiceover-durations.json` | Measured line lengths written by the generator; drives all timing |
| `src/demo/timeline.ts` | Per-line lead/hold pacing, slot frames, subtitle chunking |
| `src/demo/KaizenDemo.tsx` | Shot list: footage file, source in/out seconds, camera zoom keys, callouts, services |
| `scripts/generate_voiceover.py` | Gemini TTS (`gemini-2.5-flash-tts`, Vertex AI, ADC) → `public/voiceover/<line>.mp3` |
| `public/voiceover/` | Generated narration (committed) |
| `public/footage/clips/` | H.264 screen recordings (not in git, ~70 MB) |

Changing a line: edit `narration.json`, run `video:voiceover -- --only <id>`; the timeline re-flows from the new duration.
Footage is retimed to fill each shot; shots played faster than 1.3× show an "N× speed" tag.

## Footage

Recorded on prod (`kaizen-lab-*.web.app`) with Puppeteer `page.screencast` in dedicated 1920×1080 headless windows
(mobile 430×932), then normalised: `ffmpeg -i in.webm -vf "crop=W:H:0:0,fps=30" -c:v libx264 -crf 18 -pix_fmt yuv420p clips/out.mp4`.
The crop drops the black margin the screencast adds when device pixel ratio ≠ 1.
