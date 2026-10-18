# Demo Storyboard — 90-Second Pitch Video (TKT-#42 Draft)

> **Status:** DRAFT — skeleton only. Impact numbers below are placeholders pending the real Cloud Run run (#80, ETA 2026-10-17 15:00) and must be swapped for the live screenshot/metric before the final cut.
> **Target Design System:** [`docs/DESIGN.md`](../DESIGN.md) (Lumina Slate liquid glass, light) — no dark canvases outside the mobile camera view and toasts.
> **Companion docs:** [`06_demo_screen_choreography.md`](./06_demo_screen_choreography.md) (split-screen wireframe) · [`07_demo_voiceover_script.md`](./07_demo_voiceover_script.md) (voiceover script) · [`08_demo_pitch_deck_skeleton.md`](./08_demo_pitch_deck_skeleton.md) (slide skeleton)
> **Baseline source:** extends the 5-beat demo script already drafted in [`../Kaizen_Agent_en.md` §7](../Kaizen_Agent_en.md) with explicit timing, phase, and scoring-pillar tags.

---

## 1. Two axes the timeline must satisfy

Every beat below is tagged on **both** axes the Tech Lead asked for:

- **4-phase incident lifecycle:** Detect → Diagnose → Repair + Gatekeeper → Document + Learn.
- **4 scoring pillars** (weights per hackathon rubric): **Technical/GenAI 40%**, **Impact 25%**, **Innovation 25%**, **UX 10%**.

Target pillar-seconds (90s × weight): Technical ≈ 36s, Impact ≈ 22s, Innovation ≈ 22s, UX ≈ 9s. The beat table below is budgeted to land close to that split (see §3 coverage check) — screen time is not literally proportional to score weight, but no pillar should go to zero.

---

## 2. Beat-by-beat timeline

| Beat | Time | Phase | Primary pillar | Secondary pillar | Screen action | Split-screen pane (see choreography doc) |
|---|---|---|---|---|---|---|
| 1. Cold open | `00:00–00:08` (8s) | Detect (pre-roll) | **Impact** | UX | Line Overview dashboard, calm nominal state: green Andon lamp, OEE 88%, defect rate 0.5% — one line of VO states the cost of a missed defect today. | Left pane only, right pane dimmed/hidden. |
| 2. Inject & flag | `00:08–00:20` (12s) | **Detect** | **Technical** | Impact | Press demo `Inject defect` → Gemma edge classifier flags scratched parts in <50ms → SPC chart jumps 0.5%→8% → `AnomalyBanner` (tone danger) slides in on CNC-02. | Left pane flips to red Andon + AnomalyBanner; right pane still idle. |
| 3. Multi-agent trace | `00:20–00:45` (25s) | **Diagnose** | **Technical** | Innovation | Incident Command / System Topology view: Traceability narrows to CNC-02/T07 → Process Analyst + Knowledge run **in parallel** (vibration +35%, manual p.112 citation) → RCA concludes "Tool T07 worn, 87% confidence" with the Ishikawa/5-Whys drawer flashed open for 2s. | Left pane only — StepRail advances 3 of 5 steps; right pane still idle (sets up contrast before voice kicks in). |
| 4. Repair + Gatekeeper | `00:45–00:70` (25s) | **Repair + Gatekeeper** | **Innovation** | UX | Right pane goes live: technician raises phone, Gemini Live camera/voice session opens, live dialogue (see VO script). Left pane in parallel shows `StreakGate` climbing 0→50 and the `Approve 8D & Release Line` button staying hard-locked until 50/50 (Invariant #3). | **True split-screen** — both panes active simultaneously; this is the single beat that must visually prove hands-free voice + evidence-gated closure at once. |
| 5. Close + impact card | `00:70–00:85` (15s) | **Document + Learn** | **Impact** | Technical | StreakGate hits 50/50 → lock releases → Shift Leader taps `Approve 8D & Release Line` → 8D report chip + Impact Card reveal: `[[TODO:#80]] scrap avoided, downtime min, kWh, CO₂e, $ saved`. | Left pane full-width (right pane collapses back, camera session ends). |
| 6. Closing card | `00:85–00:90` (5s) | — | **UX** | — | Calm outro card: Kaizen wordmark on `--bg-app`, one-line tagline, no CTA clutter. | Full-bleed brand card, no dashboard chrome. |

---

## 3. Pillar coverage check (primary-seconds only)

| Pillar | Weight | Target sec (of 90s) | Beats carrying it as primary | Actual sec |
|---|---|---|---|---|
| Technical/GenAI | 40% | ~36s | Beat 2 (12s) + Beat 3 (25s) | 37s |
| Impact | 25% | ~22s | Beat 1 (8s) + Beat 5 (15s) | 23s |
| Innovation | 25% | ~22s | Beat 4 (25s) | 25s |
| UX | 10% | ~9s | Beat 6 (5s) + ergonomics shown as secondary throughout Beat 4 | 5s primary (+ qualitative credit from Beat 4's shop-floor voice/44px CTA framing) |

UX is intentionally thin on *primary* seconds because Calm Technology / Progressive Disclosure / Shop-Floor Ergonomics are demonstrated continuously as the *visual grammar* of every beat (no dark theme, no neon, 3-second-glance Andon lamps, 48px CTA) rather than called out with dedicated screen time — that is itself the UX pitch: it should look invisible, not demoed separately.

---

## 4. Open items before this storyboard is "final"

- [ ] Swap `[[TODO:#80]]` impact numbers once the real Cloud Run demo run completes (ETA 2026-10-17 15:00) — see brief from Kaizen Tech Lead, #42.
- [ ] Confirm the exact hackathon rubric wording for "Impact 25% / Innovation 25% / UX 10%" against the official submission guidelines (this draft takes the weights as given by Kaizen Tech Lead's brief; flag to PM if the sponsor rubric differs).
- [ ] Time the real recording against this table — 25s diagnose beats are tight for a live multi-agent trace; may need to pre-render agent trace as a sped-up replay rather than live execution.
