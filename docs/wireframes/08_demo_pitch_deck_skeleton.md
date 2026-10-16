# Pitch Deck Skeleton (TKT-#42 Draft)

> **Status:** DRAFT layout skeleton only — no final numbers, no final screenshots. Architecture diagram slide reuses the already-rendered SVGs in `docs/`; impact card slide is a placeholder until #80 lands (ETA 2026-10-17 15:00).
> **Visual system:** Every slide background is light Lumina Slate (`--bg-app` `#eef1fb` + soft radial washes), frosted `GlassCard` content blocks, Inter/Geist/JetBrains Mono, indigo accent (`#5b5bf0`), dark-ink primary CTAs. No dark-mode slide backgrounds — the one allowed exception is a single inset screenshot of the technician's live camera view (`DarkGlass`), never the slide canvas itself.
> **Companion assets:** [`05_demo_storyboard_90s.md`](./05_demo_storyboard_90s.md) · [`06_demo_screen_choreography.md`](./06_demo_screen_choreography.md) · [`07_demo_voiceover_script_vi.md`](./07_demo_voiceover_script_vi.md)

---

## Slide-by-slide skeleton

| # | Slide | Layout | Content placeholder | Speaker-note placeholder |
|---|---|---|---|---|
| 1 | **Title** | Full-bleed `--bg-app`, centred wordmark + one-line tagline, no chrome | "Kaizen Agent — [tagline TBD]" | [TODO] one-sentence hook |
| 2 | **Problem** | Left: 3-line pain-point list (`Chip` tone `danger` markers); right: single illustrative stat callout | Pain points from `Kaizen_Agent_en.md` §1 (missed defects, English-only manuals, no institutional memory) | [TODO] anchor to judge's own manufacturing pain if panel is industry-specific |
| 3 | **Solution, one sentence** | Centred `GlassCard`, single large Title-L sentence, no bullets | "Detect from the product → trace to the cause → guide the repair in Vietnamese → confirm with the product → keep the knowledge." | [TODO] |
| 4 | **Architecture diagram** | Full-width `GlassCard`, diagram centred, caption strip below | Reuse `docs/kaizen-agent-architecture.svg` (already rendered) — do not redraw | [TODO] narrate the 4 phases (A Detection, B Diagnosis, C Resolution, D Learning) in ≤30s |
| 5 | **Multi-agent protocol** | `GlassCard` with the Orchestrator flow mermaid, 3 chips calling out "finding – evidence – confidence – citation" | Reuse `docs/kaizen-agent-incident-flow.svg` / `kaizen-agent-team.svg` | [TODO] emphasize Invariant #3 (evidence-driven closure) as the credibility anchor |
| 6 | **Live demo marker** | Minimal: single centred `Chip` "LIVE DEMO — 90s", everything else blank | (no content — hand off to the recorded/live demo) | [TODO] cue control to start video/live session |
| 7 | **Impact card** | `AiCard` centred, 4 KPI tiles (Scrap avoided / Downtime / Energy+CO₂ / $ saved) | All 4 values `[[TODO:#80]]` — swap once real run completes | [TODO] tie back to Impact 25% rubric pillar explicitly |
| 8 | **Innovation differentiation** | Two-column compare: "typical factory AI (process-optimization only)" vs. "Kaizen Agent (product-first + Vietnamese voice + institutional memory)" | Draws on `Kaizen_Agent_en.md` §6 Creativity rationale (contrast with Gen AI Exchange 2025 cement-track winner) | [TODO] keep this slide honest — name the contrast, don't disparage |
| 9 | **Technical merit recap** | 5-item `Chip` row: multi-agent orchestration · multimodal (image/sensor/audio/video) · Gemini Live voice · edge+cloud split (Gemma + Gemini) · citation-grounded, no fabrication | Mirrors `Kaizen_Agent_en.md` §6 Technical merit (40%) bullet list | [TODO] |
| 10 | **Ask / closing** | Centred `GlassCard`, one CTA line | "[TODO] what we're asking judges/sponsors for" | [TODO] |

---

## Open items

- [ ] Confirm final tagline for Slide 1 with Kaizen PM before lock.
- [ ] Slide 7 numbers depend on #80; do not present to judges with `[[TODO]]` visible — placeholder must be swapped before the real run-through.
- [ ] Decide whether Slide 8 (differentiation) is safe to show as-is or needs softer framing — flag to PM, since naming another team's approach in a competitive deck carries some risk.
- [ ] Export target: Slides built in Google Slides / Figma Slides by Kaizen PM using this skeleton; this file is the content/layout brief, not the final deck file.
