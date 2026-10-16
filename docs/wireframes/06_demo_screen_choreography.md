# Demo Screen Choreography — Split-Screen Wireframe (TKT-#42 Draft)

> **Status:** DRAFT skeleton. Pairs with [`05_demo_storyboard_90s.md`](./05_demo_storyboard_90s.md) beat-by-beat.
> **Layout:** Desktop Plant Ops dashboard (Andon lamps + incident trace) **left**, Technician mobile camera / Live Copilot audio wave **right**, both captured on one recording canvas for beat 4.
> **Design standard:** [`docs/DESIGN.md`](../DESIGN.md) — light Lumina Slate on the left pane; the mobile camera full-screen view is one of the two surfaces explicitly allowed to use `DarkGlass` (§1.1), so the right pane going dark during the live camera session is spec-compliant, not a violation.
> **HTML prototype:** [`.stitch/designs/demo_split_screen_choreography.html`](../../.stitch/designs/demo_split_screen_choreography.html) renders Beat 4 (the true split-screen moment) at Lumina Slate token fidelity.

---

## 1. Recording canvas anatomy

```text
╭────────────────────────────────────────────────────────────────────────────────────────────╮
│  RECORDING CANVAS  1920 × 1080                                                              │
│  ╭─ LEFT PANE · Desktop dashboard, 1120px ─────────────╮ ╭─ RIGHT PANE · Mobile frame, 420px╮│
│  │  (scaled Line Overview / Incident Command screen)   │ │ (396×852 device frame, centred)  ││
│  │  background var(--bg-app) #eef1fb                   │ │ background DarkGlass during live ││
│  ╰───────────────────────────────────────────────────── ╯ ╰───────────────────────────────── ╯│
│   gap: 24px on var(--bg-app) canvas · both panes get GlassCard var(--radius-xl) 24 corners   │
╰────────────────────────────────────────────────────────────────────────────────────────────╯
```

Right pane is **hidden (0 width, left pane full-bleed at 1680px max per DESIGN.md §2.4)** for Beats 1–3 and 5–6, and only slides in for Beat 4 — this is the one moment the pitch needs to prove hands-free voice *and* evidence-gated closure happening at the same time.

---

## 2. Per-beat frame states

### Beat 1 — Cold open (`00:00–00:08`)
```text
╭── LEFT PANE (full-bleed) ─────────────────────────────────────────────────╮
│ Cell Line 1 Overview                                                      │
│ ╭─ OEE ──────────╮ ╭─ DEFECT RATE ──────╮ ╭─ ACTIVE INC ─╮ ╭─ ESG CO₂ ───╮│
│ │ 88.4 %  (●)Nom │ │ 0.50 % ▬▭▭▭▭▭ UCL  │ │ 0 · —        │ │ 0 kg        ││
│ ╰────────────────╯ ╰────────────────────╯ ╰──────────────╯ ╰─────────────╯│
│ MachineFleetTable — all rows (●) Nominal, green StatusDot, no pulse       │
╰────────────────────────────────────────────────────────────────────────────╯
```
Right pane: not rendered.

### Beat 2 — Inject & flag (`00:08–00:20`)
```text
╭── LEFT PANE (full-bleed) ─────────────────────────────────────────────────╮
│ ╭── AnomalyBanner (GlassCard, tone danger) ───────────────────────────╮  │
│ │ [⚠] CNC-02: Tool T07 Flank Wear [CRITICAL] (●pulse)                 │  │
│ │ Defect rate 8.0 % · UCL 0.25 %       [■ Open INC → ■]    Dismiss    │  │
│ ╰───────────────────────────────────────────────────────────────────╯  │
│ ▌CNC-02 row flips to (●) Critical, pink hot-row background, 4px red edge │
╰────────────────────────────────────────────────────────────────────────────╯
```
Right pane: not rendered. Canvas motion: `flashRing` on the SPC card as it crosses UCL (CSS keyframe only, per DESIGN.md §2.7).

### Beat 3 — Multi-agent trace (`00:20–00:45`)
```text
╭── LEFT PANE (full-bleed, Incident Command) ───────────────────────────────╮
│ INVESTIGATION STEPS                                              StepRail │
│ ╭─(✓)─ Inspection ──────────────────────────────────── [Done] ⌄ ╮   │●│   │
│ ╭─(✓)─ Traceability ────────────────────────────────── [Done] ⌄ ╮   │●│   │
│ ╔═(③)═ Analysis ─────────────────────────────── (●) Analysing ⌃ ═╗   │○│   │
│ ║ Process Analyst: vibration +35 % since 09:30 · Knowledge: p.112  ║   │○│   │
│ ║ RCA: "Tool T07 worn" — confidence ring 87 % (tone success)       ║   │○│   │
│ ╚════════════════════════════════════════════════════════════════╝   │○│   │
╰────────────────────────────────────────────────────────────────────────────╯
```
Right pane: not rendered. Optional 2s cutaway to the Ishikawa/5-Whys drawer (`SideDrawer`, 24px left radius) before collapsing back.

### Beat 4 — Repair + Gatekeeper (`00:45–00:70`) — **the split-screen moment**
```text
╭─ LEFT PANE 1120px ──────────────────────────────╮╭─ RIGHT PANE 420px, DarkGlass ───────────╮
│ ╔═(④)═ Repair & Proof ── (●) Verifying ⌃ ════╗  ││  9:41                      ▂▄▆ ▮        │
│ ║ StreakGate                                 ║  ││  ( ‹ )  [● Copilot Live]  [vi-VN]       │
│ ║ ■■■■■■■■■■■■■■■■■■▣□□□□□□□□□□□  29/50      ║  ││  ╭ [2/3] Replace insert ────────────╮  │
│ ╚══════════════════════════════════════════════╝ ││  │ Target 45 Nm │ Check within tol   │  │
│ ╭─(5┄)─ Sign-off ──────────────────── [🔒Waiting]⌄╮││  ╰────────────────────────────────────╯  │
│ │ [ 🔒 Approve 8D & Release Line · 29/50 ]       │││  ╭ ∿∿∿ live audio waveform (accent2) ╮  │
│ ╰───────────────────────────────────────────────╯││  ╰────────────────────────────────────╯  │
│                                                   ││  [(ϟ mute)(↶ repeat)]  (🔊) [Done · next] │
╰───────────────────────────────────────────────────╯╰──────────────────────────────────────────╯
```
Key choreography notes:
- The **lock stays visibly engaged** on the left (`🔒`, opacity .55, lock icon) the entire time the right pane shows the technician completing physical steps — this is the single frame judges should screenshot to "get" Invariant #3.
- `StreakGate` count animates up in real time as the camera/voice session on the right progresses — the two panes are driven by the same incident SSE stream, not two disconnected mockups.
- Right pane audio wave: `∿∿∿` 56px band, `--accent-2 → --accent` gradient, animates amplitude on voice input/output (mic hit-area 56px per DESIGN.md §4.4).
- VO dialogue for this beat lives in [`07_demo_voiceover_script_vi.md`](./07_demo_voiceover_script_vi.md) §2.

### Beat 5 — Close + impact card (`00:70–00:85`)
```text
╭── LEFT PANE (full-bleed) ─────────────────────────────────────────────────╮
│ StreakGate 50/50 → lock releases → [■ Approve 8D & Release Line ■] tapped │
│ ╭── Impact Card (AiCard, accent→teal hairline) ───────────────────────╮  │
│ │ Scrap avoided [[TODO:#80]] · Downtime [[TODO:#80]] min               │  │
│ │ Energy [[TODO:#80]] kWh · CO₂e [[TODO:#80]] kg · $ [[TODO:#80]]      │  │
│ ╰────────────────────────────────────────────────────────────────────╯  │
╰────────────────────────────────────────────────────────────────────────────╯
```
Right pane: slides out / collapses to 0 width over 300ms (`--ease`), camera session ends.

### Beat 6 — Closing card (`00:85–00:90`)
Full-bleed brand card on `--bg-app`, Kaizen wordmark, one-line tagline, no chrome. No pane split.

---

## 3. Token checklist for whoever builds the real recording overlay

| Element | Token / component | Source |
|---|---|---|
| Canvas background | `--bg-app` `#eef1fb` + `app-backdrop` radial washes | DESIGN.md §2.4 |
| Left pane card | `GlassCard` `--radius-xl` 24, `--glass-bg` | DESIGN.md §2.4, §3.3 |
| Right pane (live) | `DarkGlass` gradient `rgba(17,24,39,.92)→rgba(30,27,75,.9)` | DESIGN.md §2.4 — one of the two sanctioned dark surfaces |
| Lock state | `Button` `primary` variant `locked`, opacity .55 + lock icon | DESIGN.md §3.2 |
| Streak proof | `StreakGate`, done cells `#22b573`, pulsing next cell | DESIGN.md §3.8 |
| Audio wave | custom SVG band, `--accent-2 → --accent` gradient | DESIGN.md §2.3 (no chart library, hand-built SVG per §2.1) |
| Impact card | `AiCard`, accent→teal hairline border, 24px spark badge | DESIGN.md §3.11 |
| Motion | `flashRing` (UCL breach), `pulseGlow` (live dots), `--ease` 300ms pane transitions | DESIGN.md §2.7 |

No neon, no dark canvas outside the Beat-4 right pane. Tap targets referenced (mic 56px, mute/repeat `IconButton` 44px hit area) follow §4.4.
