# Kaizen UI Design System — Lumina Slate (Liquid Glass, Light)

> **Surfaces:** Desktop Plant Ops dashboard (`dashboard_frontend/`, PR #105) and Technician mobile app (`app_frontend/`, PR #106).  
> **Stack:** Plain CSS + CSS custom properties. No Tailwind, no shadcn/Radix.  
> **Core Principles:** Light mode, calm precision, frosted glass over a pastel backdrop, token-driven.

---

## 1. Design Methodology

### 1.1. Principle 1: Calm Technology & Signal-to-Noise Ratio

In a manufacturing plant, production lines run nominally 90% of the time. The interface must be **exceptionally calm, quiet, and minimalist** to prevent operator eye fatigue. When an anomaly occurs, the system activates **only the single Actionable Signal**, rather than overwhelming operators with dozens of irrelevant metrics.

- **Cognitive Overload Prevention (Calm Glass):** The canvas is a light lavender-grey (`#eef1fb`) with soft pastel radial gradients under frosted white glass cards. Dark themes, neon glows, faux-3D dials, and cluttered metric walls stay banned. Dark surfaces are allowed only for:
  - toasts and the demo run-status box (`.glass-dark`);
  - full-screen mobile camera views.
- **The 3-Second Glance Rule (Glanceability):** A Shift Leader standing 2 meters away must assess cell health in under 3 seconds without reading small text or deciphering raw telemetry graphs.

### 1.2. Principle 2: Progressive Disclosure (3 Tiers)

Never dump all data onto a single flat surface. All information must be partitioned across 3 cognitive tiers:

| Tier | Reception Time | Displayed Content | Purpose |
|---|---|---|---|
| **Tier 1: Glance** | 1 second | Line health status: Nominal (Green) vs. Incident (Red) + Machine Bay (`CNC-02`). | Instantly detect whether an issue exists without reading text. |
| **Tier 2: Focus** | 5 seconds | What the issue is (`Tool T07 Flank Wear`) + Who is assigned (`Tech Tuan`) + Immediate next action. | Decide on an immediate operational action. |
| **Tier 3: Deep Dive** | On-demand | Detailed SPC charts, 5-Whys causal tree, vibration frequency analysis, draft 8D report, technical SOP video. | Accessed only when clicking for deep investigation (Dedicated Drawer / Modal / Tab). |

### 1.3. Principle 3: Single Job-to-be-Done per Screen (Single JTBD)

- **Shift Leader Screen:** Not a place to read bolt-tightening guides, but **where line health is monitored and incident approvals are signed off**.
- **Technician Copilot Screen:** No need to see SPC control charts or formal 8D reports; rather, **focused on a 3-step physical bay checklist and a prominent "Confirm Repair Completed" button**.
- **QC Inspector Screen:** Strictly focused on **exit product quality, defect containment, and inspection streak verification**.
- **Plant Manager / ESG Screen:** Focused on **institutional knowledge retention (RAG), SOP evolution, and cumulative sustainability savings (scrap avoided, cost saved, CO₂ reduction)**.

### 1.4. Principle 4: Shop-Floor Ergonomics & Bay-Side Usability

- **Gloved Operation:** Technicians frequently wear safety gloves and operate rugged mobile terminals with one hand at the bay.
  - Interactive tap targets have a minimum size of **44 × 44 px**.
  - Primary completion CTA is a full-width bottom CTA (`.m-btn`, 50 px) with a minimum height of **48 px**.
  - Controls in the current technician app that violate this rule are listed in [§4.4](#44-tap-target-compliance).
- **Hands-Free Multimodal Assistance (Gemini Live):** When hands are greasy or handling tooling, technicians interact entirely via voice or camera without touching the glass.

### 1.5. Principle 5: Product-Evidence Driven Incident Closure (Invariant #3)

- Never close an incident solely based on verbal claims or technician manual taps.
- The system strictly enforces **Invariant #3**: The Shift Leader's closure approval button is **hard-disabled** until the conveyor optical inspection camera validates **50 consecutive clean workpieces** (`verification_count >= 50`).

### 1.6. Six-Stage Industrial Workflow

```
[Stage 1: Personas & JTBD]
        │
        ▼
[Stage 2: User Stories & Acceptance Criteria]
        │
        ▼
[Stage 3: Information Architecture & Functional Loops]
        │
        ▼
[Stage 4: Low-Fi ASCII Wireframing & Ergonomics]
        │
        ▼
[Stage 5: Design System Token Binding (Lumina Slate tokens)]
        │
        ▼
[Stage 6: Hi-Fi Stitch Prototype & Production Code]
```

---

## 2. Foundations

### 2.1. Implementation Stack

| Concern | Rule |
|---|---|
| Styles | One stylesheet per surface. Desktop: `dashboard_frontend/src/index.css`. Mobile: `app_frontend/src/components/mobile/mobile.css`, scoped under `.m-app`. No Tailwind, no shadcn/Radix. |
| Icons | Material Symbols Outlined web font, default FILL 0. Filled variant: `.icon-fill` (desktop), `.ms-fill` (mobile). |
| Charts | Hand-built SVG (`lib/chart.ts`). No chart library. |
| Motion | CSS keyframes only, honouring `prefers-reduced-motion`. No animation library. |
| Dependencies | React 18.3 + Vite 5 + TypeScript only. |
| API calls | Relative `/api` paths (Vite proxy in dev). |

### 2.2. Color Tokens

Canonical values are the desktop `:root` tokens. Mobile deltas are listed in [§4.1](#41-token-deltas).

```css
:root {
  /* Canvas */
  --bg-app: #eef1fb;                     /* Light lavender-grey page canvas */

  /* Text */
  --ink: #0b1220;                        /* Titles, primary text */
  --ink-2: #1e2638;                      /* Secondary strong text */
  --text: #334155;                       /* Body copy */
  --muted: #64748b;                      /* Captions, units, subtitles */
  --faint: #94a3b8;                      /* Eyebrow labels, placeholders */

  /* Hairlines */
  --hair: rgba(15, 23, 42, .07);         /* Dividers, table rules */
  --hair-strong: rgba(15, 23, 42, .12);  /* Stronger separators */

  /* Accent (brand / active) */
  --accent: #5b5bf0;                     /* Indigo: active nav, selection, links */
  --accent-2: #7c6cff;                   /* Gradient partner for accent */
  --accent-soft: rgba(91, 91, 240, .1);  /* Accent tinted fills */
  --accent-ring: rgba(91, 91, 240, .28); /* Active rings; also the focus outline */

  /* Status */
  --red: #e5484d;                        /* Anomaly / critical */
  --red-soft: rgba(229, 72, 77, .1);
  --amber: #f5a524;                      /* Investigating / drift */
  --amber-soft: rgba(245, 165, 36, .12);
  --green: #12a150;                      /* Nominal / verified */
  --green-soft: rgba(18, 161, 80, .1);
  --blue: #3b82f6;                       /* Info */

  /* Glass */
  --glass-bg: rgba(255, 255, 255, .58);        /* .glass card fill */
  --glass-bg-strong: rgba(255, 255, 255, .78); /* .glass-strong: sidebar, drawers */
  --glass-border: rgba(255, 255, 255, .75);    /* 1px glass border */
}
```

**Status semantics**

| Status | Base | Soft fill | Text-on-soft | Use |
|---|---|---|---|---|
| Red | `#e5484d` | `--red-soft` | `#c9343a` (banner text `#9f1d22`) | anomaly / critical |
| Amber | `#f5a524` | `--amber-soft` | `#b4710a` | investigating / drift |
| Green | `#12a150` | `--green-soft` | `#0e8a43` | nominal / verified (streak cells `#22b573`) |
| Accent | `#5b5bf0` | `--accent-soft` | `--accent` | active step / selection |
| Blue | `#3b82f6` | — | — | info |

Primary buttons are the dark ink gradient (`#1f2937 → #0b1220`), not the accent colour.

### 2.3. Backdrop & Glass Surfaces

- **Backdrop:** `.app-backdrop` is `linear-gradient(180deg,#f4f6fd,#eceffa)` plus 4 radial washes: violet `rgba(139,132,255,.28)`, blue `rgba(96,165,250,.22)`, pink `rgba(244,170,210,.2)` and sky `rgba(125,211,252,.18)`. On top sits a 22px dot grid in `rgba(15,23,42,.07)` with a fade mask.
- **Surface classes:**

| Class | Background / effect | Radius |
|---|---|---|
| `.glass` | `--glass-bg`, `blur(28px) saturate(180%)`, 1px glass border | 22px |
| `.glass-strong` | `--glass-bg-strong` (`.78` white) | — |
| `.glass-inset` | `rgba(244,246,255,.7)` | 16px |
| `.inset` | `rgba(240,242,255,.72)` | 14px |
| `.glass-dark` | `linear-gradient(160deg, rgba(17,24,39,.92), rgba(30,27,75,.9))` | — |
| `.tone-red` / `.tone-accent` / `.tone-green` / `.tone-green-soft` | Gradient tints, e.g. tone-red `rgba(255,241,242,.85)→rgba(255,228,230,.7)` with border `rgba(229,72,77,.28)` | — |

- **Glass shadow:** `0 1px 1px rgba(15,23,42,.03), 0 8px 24px -6px rgba(30,41,90,.1), 0 24px 48px -24px rgba(30,41,90,.12)` plus an inset highlight. Hover strengthens the shadow and adds `translateY(-1px)`.

### 2.4. Radius Scale

| Level | Token | Value | Elements |
|---|---|---|---|
| Pill | — | 999px | Chips, pills, progress bars, header crumb |
| Shell | — | 24–26px | Sidebar 24, drawer `24px 0 0 24px`, DemoController 26 |
| Card | `--r-lg` | 22px | Glass cards |
| Media | — | 18px | Video stage, jump palette |
| Inset | `--r-md` | 16px | `.glass-inset`, toast |
| Inset / search | — | 14px | `.inset`, search field |
| Control | `--r-sm` | 12px | Buttons, nav items, segmented track (inner buttons 9) |
| Small button | — | 10px | `.btn-sm` |
| Tags | — | 6–8px | `TagChip` 6, `.step-tag` / `.eightd-d` 8 |

### 2.5. Typography

- **Fonts:**
  - `--font-main`: Inter (font-feature-settings `'cv11','ss01'`) for body text.
  - `--font-display`: Geist for headings and KPIs.
  - `--font-mono`: JetBrains Mono for data.

| Token | Font | Size | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `.page-title` | Geist | 1.85rem (incident 1.6rem) | 700 | -0.035em | Page titles |
| `.card-title` | Geist | 1.02rem | 650 | -0.015em | Card titles |
| `.kpi-value` | Geist | 2.35rem | 700 | -0.045em | KPIs; tabular-nums, often `.mono` |
| `.drawer-title` | Geist | 1.3rem | 700 | — | Drawer titles |
| `.anomaly-title` | Geist | 1.08rem | 650 | — | Anomaly banner title |
| `.step-title` | Geist | 0.98rem | 650 | — | Incident step titles |
| Body | Inter | 0.78–0.9rem | — | — | Body copy (table cells 0.82rem, nav 0.86rem 500 / 650 active) |
| `.eyebrow` | Inter | 0.66rem | 700 | 0.09em | Uppercase, `--faint` |
| Table head | Inter | 0.68rem | 700 | 0.08em | Uppercase |
| `.sev-chip` | Inter | 0.64rem | 750 | 0.06em | Uppercase |
| `.mono` | JetBrains Mono | — | — | — | IDs, SOP codes, %, KPI values, `.kbd` |

### 2.6. Motion

- Easing: `--ease cubic-bezier(.16,1,.3,1)`.
- Keyframes:
  - `fadeUp` on page enter; `.stagger` children are delayed 0.05s apart.
  - `toastIn`, `pulseGlow` (live dots), `drawerIn`, `scrimIn`, `flashRing`.
- All animations are disabled under `prefers-reduced-motion`.

---

## 3. Components Catalog (Desktop Class Names)

### 3.1. Chip
- `.chip`: pill (999px), 0.7rem / 600, white 70% background.
- Variants: accent / red / green / amber / dark, each with a leading `.dot`. The dot pulses (`pulseGlow`) for live and critical states.
- `.sev-chip`: solid uppercase severity pill (0.64rem / 750).
- `TagChip`: rectangular tag, radius 6.

### 3.2. Button
- `.btn`: default glass-white button, radius 12, `0 1px 2px` shadow plus inset white highlight.
- `.btn-dark`: primary action, ink gradient `#1f2937 → #0b1220`, coloured drop shadow.
- `.btn-accent`: accent action with coloured drop shadow.
- `.btn-danger`: destructive action.
- `.btn-sm`: compact button, radius 10.
- `.btn-locked`: disabled-with-reason state (e.g. approval gated by Invariant #3).
- `.pill` / `.pill-on` (ink-filled) / `.pill-lg` (44px touch target): filter and tab pills.

### 3.3. Glass Card & KPI Card
- Glass card: `.glass` + `.card-pad` (padding `1.25rem 1.4rem`), header = `.card-title` + `.card-sub`.
- `.kpi-card`: padding `1.25rem 1.3rem`, min-height 228px. Anatomy: `.eyebrow` + chip → mono `.kpi-value` with `.kpi-unit` → `.kpi-hint` / `.kpi-line` → thin 6px bars.

### 3.4. Banners
- **`AnomalyBanner`:** `.glass.tone-red` row with a 40px red-outlined icon tile, `.anomaly-title`, `.sev-chip`, a pulsing status chip, mono SPC meta in `#9f1d22`, then `Open INC →` (`.btn-dark`) and a Dismiss link.
- **`StatusReasonBanner`** tones:

| State | Text | Background |
|---|---|---|
| escalated | `#92400e` | `rgba(255,247,237,.97)` |
| error | `#991b1b` | — |
| dismissed | `#334155` | — |

### 3.5. Table
- `.fleet-table` inside a glass card; toolbar `.fleet-toolbar` padding `1rem 1.25rem`.
- Cells padding `0.9rem 1.25rem`, 0.82rem text; head uppercase 0.68rem / 700 / 0.08em, muted.
- `row-hot` (critical row): pink background and a 3px red inset left edge.

### 3.6. Segmented Control & Pill Tabs
- `.seg`: 12px track with 9px inner buttons; each option may carry a mono count.
- `.pill` tabs: filter tabs in toolbars. The active Anomaly pill is solid red; other active pills use `.pill-on` (ink).

### 3.7. Drawer & Modal
- **`SideDrawer`:** portal with a blur scrim and a right-side `.glass-strong` panel, radius `24px 0 0 24px`, configurable width 560–1040px. Head (eyebrow chips + `.drawer-title`), close button, scrollable body, optional footer. Closes on Esc.
- **Centred glass modal:** max-width 880px (e.g. `DiagnosticsModal`).
- **DemoController slide-over:** `.glass-strong`, 420px wide, radius 26.

### 3.8. Progress & Streak Gate
- `.progress`: pill track with an accent gradient fill.
- **`StreakGate`:** 25-column proof grid; done cells `#22b573`; the next cell pulses with an accent outline; mono `count/target`; red reset notice when a defect resets the streak.

### 3.9. Incident Step
- **`StepSection`:** collapsible glass step. Number circle states:
  - done: green with a check;
  - active: accent with a 4px soft ring (the whole step gets an accent border plus 4px ring);
  - pending: dashed circle, step at 0.7 opacity.
  - Header: `.step-title`, one-line summary, trailing chips (Done / pulsing active label / "Waiting" with lock icon), chevron.
- **`StepRail`:** fixed right-side vertical glass pill, 26px wide, with state-coloured dots; the step in view stretches to 18px; dark tooltip on hover. Hidden below 760px.

### 3.10. Toast
- `.toast.glass-dark`, fixed bottom-right, with a filled icon (`tone-red` for errors). Auto-dismisses after 5s.

---

## 4. Mobile Surface (`app_frontend`, PR #106)

The technician app uses the same visual language (light liquid glass, frosted white surfaces, pill chips, Material Symbols, JetBrains Mono for numbers). Tokens live in `mobile.css` under `.m-app`; values that differ from §2 are listed here.

### 4.1. Token Deltas

| Token | Desktop | Mobile |
|---|---|---|
| canvas | `#eef1fb` | `#eef1f8` (+ 3 blurred blobs `#c4bcff` / `#a6dcff` / `#ffd3e8`, `blur(46px)`, opacity .6) |
| ink-2 | `#1e2638` | `#3b4357` |
| ink-3 / ink-4 | — | `#7b8398` / `#a9b0c0` |
| accent | `#5b5bf0` / `#7c6cff` | `#5b4cf5` / `#8b7bff`, soft `rgba(91,76,245,.12)` |
| red | `#e5484d` | `#ff3b30` (chip text `#d70015`) |
| amber | `#f5a524` | orange `#ff9500` (chip text `#b25000`) |
| green | `#12a150` | `#30c25a` (chip text `#1b8a3c`) |
| blue | `#3b82f6` | `#0a84ff` (chip text `#0062cc`) |
| teal | — | `#32ade6` |
| glass | `.58` white, blur 28 | `rgba(255,255,255,.56)`, blur 26 / saturate 180 |
| card radius | 22 | 24 |
| primary CTA | ink gradient | `.m-btn` default `#0d0f17`; `.accent` = `linear-gradient(135deg,#5b4cf5,#8b7bff)` |
| ease | `(.16,1,.3,1)` | `(.22,1,.36,1)` + spring `(.34,1.4,.5,1)` |
| fonts | Inter body, Geist display | Inter only (Geist loaded but unused) + JetBrains Mono |

### 4.2. Mobile Type Scale

| Class | Size / Weight / Tracking | Use |
|---|---|---|
| Large title (`.m-largetitle h1`) | 30 / 800 / -0.03em | Root tab titles |
| `.m-h2` | 17 / 700 | Section headings |
| `.m-h3` | 15 / 700 | Card titles |
| `.m-body` | 13.5 | Body copy |
| `.m-sub` | 12 / 500 | Secondary text (ink-3) |
| `.m-label` | 11.5 / 700 / .06em, uppercase | Section headers |
| `.m-chip` | 10.5 / 700 / .03em, uppercase | Status chips |
| Dock label | 10.5 / 650 | Dock tab labels |

### 4.3. Mobile Components
- `.m-glass`: default glass card (radius 24).
- `.m-btn`: heights 50 (default) / `.sm` 40 / `.xs` 32; variants default black, `.accent` gradient, `.glass`.
- `.m-iconbtn`: 38px circle (`.dark` variant over camera).
- `.m-seg`: 3-way segmented control with a white sliding thumb and `.m-count` badges.
- `.m-chip`: tones red / orange / green / blue / indigo / dark / live / demo.
- **Dock:** floating, 66px tall, radius 999, glass `rgba(255,255,255,.62)` blur 28; black `#0d0f17` sliding thumb; red unread badge on Notifications.
- `.m-sheet`: bottom sheet, radius 32.
- `.m-toast`: dark pill at top with a green check (`.is-error` dark red).
- `.m-timeline`: progress milestones (done green, current blue with halo, todo grey).
- `ConfidenceRing`: SVG ring (orange for evidence confidence, green for "AI sure", blue 66px for verification count).
- `.m-ai` card: gradient hairline border (accent → teal) with a 22px `auto_awesome` spark badge.
- **WorkOrderCard:** `.m-glass` with a 3px stage accent bar on the left edge (warm = evidence, indigo = fix, blue = processing).

### 4.4. Tap-Target Compliance

The 44px rule from §1.4 is mandatory. Current sizes in PR #106:

| Control | Current size | Status |
|---|---|---|
| `.m-btn` | 50 | OK |
| mic | 58 | OK |
| shutter | 74 | OK |
| `m-next` | 44 | OK |
| dock cell | ~54 × 117 | OK |
| list rows | 54–68 | OK |
| `.m-btn.sm` | 40 | **Below 44 — must fix** |
| `.m-iconbtn` / back / camera tools | 38 | **Below 44 — must fix** |
| `.m-seg` buttons | 36 | **Below 44 — must fix** |
| `.m-btn.xs` | 32 | **Below 44 — must fix** |
| `.m-switch` | 50 × 30 | **Below 44 — must fix** (height) |

---

## 5. Screen Architecture & Wireframe References

For individual screen architectures, comprehensive user stories, acceptance criteria, and full ASCII wireframes, refer to:
- [`docs/wireframes/README.md`](./wireframes/README.md) — Master Overview & UI State Transitions Matrix
- [`docs/wireframes/00_base_layout.md`](./wireframes/00_base_layout.md) — Base Shells: Desktop Floating Glass Sidebar & Mobile Device Frame + Dock
- [`docs/wireframes/01_line_overview.md`](./wireframes/01_line_overview.md) — Screen 1: Line Overview & Machine Fleet (Desktop)
- [`docs/wireframes/02_technician_copilot.md`](./wireframes/02_technician_copilot.md) — Screen 2: Technician Mobile App — Work List, Evidence & Guided Repair (Mobile 396×852 frame)
- [`docs/wireframes/03_incident_workspace.md`](./wireframes/03_incident_workspace.md) — Screen 3: Incident Command — 5-Step Investigation & 8D Sign-Off (Desktop)
- [`docs/wireframes/04_knowledge_sustainability_hub.md`](./wireframes/04_knowledge_sustainability_hub.md) — Screen 4: Knowledge Loop — Tech Walkthroughs, Knowledge Base & SOP Library (Desktop)
