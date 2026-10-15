# Kaizen UI Design System — Lumina Slate (Liquid Glass, Light)

> **Surfaces:** Desktop Plant Ops dashboard (shift leaders, plant ops) and Technician mobile app (bay-side technicians).  
> **Stack:** Plain CSS + CSS custom properties. No Tailwind, no shadcn/Radix.  
> **Core Principles:** Light mode, calm precision, frosted glass over a pastel backdrop, token-driven.

---

## 1. Design Methodology

### 1.1. Principle 1: Calm Technology & Signal-to-Noise Ratio

In a manufacturing plant, production lines run nominally 90% of the time. The interface must be **exceptionally calm, quiet, and minimalist** to prevent operator eye fatigue. When an anomaly occurs, the system activates **only the single Actionable Signal**, rather than overwhelming operators with dozens of irrelevant metrics.

- **Cognitive Overload Prevention (Calm Glass):** The canvas is a light lavender-grey (`#eef1fb`) with soft pastel radial gradients under frosted white glass cards. Dark themes, neon glows, faux-3D dials, and cluttered metric walls stay banned. Dark surfaces are allowed only for:
  - toasts and the demo run-status box (`DarkGlass` surface);
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
  - Primary completion CTA is a full-width bottom `Button` (size `lg`, 48 px), never shorter than **48 px**.
  - Controls drawn smaller than 44 px must extend their hit area to 44 px; see [§4.4](#44-tap-target-compliance).
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
| Styles | One stylesheet per surface. Shared tokens live on `:root`; the mobile app overrides only the colour tokens listed in [§4.1](#41-colour-deltas). No Tailwind, no shadcn/Radix. |
| Icons | Material Symbols Outlined web font, default FILL 0, with a filled variant. |
| Charts | Hand-built SVG. No chart library. |
| Motion | CSS keyframes only, honouring `prefers-reduced-motion`. No animation library. |
| Dependencies | React 18.3 + Vite 5 + TypeScript only. |
| API calls | Relative `/api` paths (Vite proxy in dev). |

### 2.2. Scales

The system follows the usual design-system conventions (Material 3, Apple HIG, Carbon): every dimension sits on a fixed scale, and each component has a small, named set of variants and sizes.

| Scale | Values |
|---|---|
| Spacing & sizing | 4 px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64. Hairline-scale items (borders, 6 px dots and bars, 4 px accent edges) may sit on a 2 px step. |
| Type sizes | 11, 12, 13, 14, 16, 18, 20, 24, 30, 36 px (rem = px / 16). |
| Font weights | 400 regular, 500 medium, 600 semibold, 700 bold. |
| Tracking | -0.04em, -0.03em, -0.02em, -0.01em, 0, 0.06em, 0.08em. |
| Radius | See [§2.5](#25-radius-scale). |
| Breakpoints | 640 (`sm`), 768 (`md`), 1024 (`lg`), 1280 (`xl`). |
| Component sizes | `sm` 32, `md` 40, `lg` 48 px tall; touch-only controls always reach a 44 px hit area. |

### 2.3. Color Tokens

Shared values for both surfaces. The mobile colour overrides are listed in [§4.1](#41-colour-deltas).

```css
:root {
  /* Canvas */
  --bg-app: #eef1fb;                     /* Light lavender-grey page canvas */

  /* Text */
  --ink: #0b1220;                        /* Titles, primary text, primary buttons */
  --ink-2: #1e2638;                      /* Secondary strong text */
  --text: #334155;                       /* Body copy */
  --muted: #64748b;                      /* Captions, units, subtitles */
  --faint: #94a3b8;                      /* Eyebrow labels, placeholders */

  /* Hairlines */
  --hair: rgba(15, 23, 42, .07);         /* Dividers, table rules */
  --hair-strong: rgba(15, 23, 42, .12);  /* Stronger separators, control borders */

  /* Accent (brand / active) */
  --accent: #5b5bf0;                     /* Indigo: active nav, selection, links */
  --accent-2: #7c6cff;                   /* Gradient partner for accent */
  --accent-soft: rgba(91, 91, 240, .1);  /* Accent tinted fills */
  --accent-ring: rgba(91, 91, 240, .28); /* Active rings; also the focus outline */

  /* Status (semantic) */
  --danger: #e5484d;                     /* Anomaly / critical */
  --danger-soft: rgba(229, 72, 77, .1);
  --warning: #f5a524;                    /* Investigating / drift */
  --warning-soft: rgba(245, 165, 36, .12);
  --success: #12a150;                    /* Nominal / verified */
  --success-soft: rgba(18, 161, 80, .1);
  --info: #3b82f6;                       /* Info */

  /* Glass */
  --glass-bg: rgba(255, 255, 255, .58);        /* GlassCard fill */
  --glass-bg-strong: rgba(255, 255, 255, .78); /* GlassCard strong: sidebar, drawers */
  --glass-border: rgba(255, 255, 255, .75);    /* 1px glass border */
}
```

**Status semantics**

| Tone | Base | Soft fill | Text on soft | Use |
|---|---|---|---|---|
| `danger` | `#e5484d` | `--danger-soft` | `#c9343a` (banner meta `#9f1d22`) | anomaly / critical |
| `warning` | `#f5a524` | `--warning-soft` | `#b4710a` | investigating / drift |
| `success` | `#12a150` | `--success-soft` | `#0e8a43` | nominal / verified (streak cells `#22b573`) |
| `accent` | `#5b5bf0` | `--accent-soft` | `--accent` | active step / selection |
| `info` | `#3b82f6` | — | — | info |
| `neutral` | `--text` | white 70% | `--text` | default chips |
| `inverse` | `--ink` | — | white | dark chips, tags |

Primary buttons are the dark ink gradient (`#1f2937 → #0b1220`), not the accent colour.

### 2.4. Backdrop & Surfaces

- **`AppBackdrop`:** `linear-gradient(180deg,#f4f6fd,#eceffa)` plus 4 radial washes: violet `rgba(139,132,255,.28)`, blue `rgba(96,165,250,.22)`, pink `rgba(244,170,210,.2)` and sky `rgba(125,211,252,.18)`. On top sits a 24px dot grid in `rgba(15,23,42,.07)` with a fade mask.
- **Surfaces:**

| Component | Background / effect | Radius |
|---|---|---|
| `GlassCard` | `--glass-bg`, `blur(28px) saturate(180%)`, 1px glass border | `--radius-xl` 24 |
| `GlassCard` variant `strong` | `--glass-bg-strong` | per container |
| `Inset` | `rgba(244,246,255,.7)`, 1px white border | `--radius-lg` 16 |
| `DarkGlass` | `linear-gradient(160deg, rgba(17,24,39,.92), rgba(30,27,75,.9))` | per container |
| tone `danger` / `accent` / `success` | Gradient tints on `GlassCard`, e.g. `danger` `rgba(255,241,242,.85)→rgba(255,228,230,.7)` with border `rgba(229,72,77,.28)` | — |

- **Glass shadow:** `0 1px 1px rgba(15,23,42,.03), 0 8px 24px -6px rgba(30,41,90,.1), 0 24px 48px -24px rgba(30,41,90,.12)` plus an inset highlight. Hover strengthens the shadow and adds `translateY(-1px)`.

### 2.5. Radius Scale

| Token | Value | Elements |
|---|---|---|
| `--radius-sm` | 8px | `Tag`, `Button` size `sm`, `SegmentedControl` inner buttons, logo tile |
| `--radius-md` | 12px | `Button` (desktop `md`), `IconButton` square, nav items, `SegmentedControl` track, banner icon tile |
| `--radius-lg` | 16px | `Inset`, search field, `Toast`, video stage, jump palette, mobile `Button` |
| `--radius-xl` | 24px | `GlassCard` (both surfaces), Sidebar, `SideDrawer` (`24px 0 0 24px`), DemoController |
| `--radius-2xl` | 32px | `BottomSheet` |
| `--radius-full` | 999px | `Chip`, `PillTab`, `ProgressBar`, header crumb, Dock, `IconButton` round |

### 2.6. Typography

- **Fonts (both surfaces):**
  - `--font-main`: Inter (font-feature-settings `'cv11','ss01'`) for body text.
  - `--font-display`: Geist for titles and KPIs.
  - `--font-mono`: JetBrains Mono for data.

| Text style | Font | Size | Weight | Tracking | Used by |
|---|---|---|---|---|---|
| Display | Geist, tabular-nums | 36px | 700 | -0.04em | `KpiValue` (often `Mono`) |
| Title L | Geist | 30px (incident page 24px) | 700 | -0.03em | `PageTitle` (desktop pages, mobile root tabs) |
| Title M | Geist | 20px | 700 | -0.02em | `DrawerTitle` |
| Title S | Geist | 18px | 600 | -0.02em | `AnomalyBanner` title, mobile section headings |
| Heading | Geist | 16px | 600 | -0.01em | `CardTitle`, `StepSection` title, `KpiUnit` |
| Body M | Inter | 14px | 400 (nav 500, active 600) | 0 | Body copy, nav, mobile body |
| Body S | Inter | 13px | 400 | 0 | Table cells, `KpiLine`, banner meta, `Button` label |
| Caption | Inter | 12px | 500 | 0 | `CardSubtitle`, `KpiHint`, `Chip` `md`, `Button` `sm`, `SegmentedControl`, mobile subtitles |
| Overline | Inter, uppercase | 11px | 700 | 0.08em | `Eyebrow`, table head, mobile section labels |
| Label XS | Inter, uppercase | 11px | 700 | 0.06em | `Chip` `sm` and `solid`, Dock labels (600, sentence case) |
| Mono | JetBrains Mono | inherits | — | — | IDs, SOP codes, %, KPI values, `Kbd` |

### 2.7. Motion

- Easing (both surfaces): `--ease cubic-bezier(.16,1,.3,1)`; `--ease-spring cubic-bezier(.34,1.4,.5,1)` for sliding thumbs.
- Keyframes:
  - `fadeUp` on page enter; staggered children are delayed 0.05s apart.
  - `toastIn`, `pulseGlow` (live dots), `drawerIn`, `scrimIn`, `flashRing`.
- All animations are disabled under `prefers-reduced-motion`.

---

## 3. Components Catalog

One component per concept; the surfaces differ only by size (desktop defaults to `md`/`sm`, mobile to `lg`/`md`) and by the mobile colour deltas in §4.1.

### 3.1. Chip & Tag
- **`Chip`:** pill (`--radius-full`).
  - Appearance: `soft` (default; tinted fill, 1px tone border) or `solid` (filled tone, white uppercase text; replaces the old severity chip).
  - Tone: `neutral` / `accent` / `success` / `warning` / `danger` / `info` / `inverse`.
  - Size: `md` (desktop, 24px tall, Caption 12/600) or `sm` (mobile and severity, 20px tall, Label XS uppercase).
  - Optional leading `StatusDot` (6px). The dot pulses (`pulseGlow`) for live and critical states.
- **`Tag`:** rectangular label, `--radius-sm`, Mono 11–12px. Variant `outline` (part / tool codes) or `inverse` (step numbers, 8D disciplines).

### 3.2. Button & IconButton
- **`Button`** variants:
  - `primary`: ink gradient `#1f2937 → #0b1220`, coloured drop shadow. The main action of a view.
  - `secondary` (default): glass-white fill, `--hair-strong` border, `0 1px 2px` shadow plus inset white highlight.
  - `accent`: `--accent-2 → --accent` gradient with coloured drop shadow (AI / agent actions).
  - `destructive`: `--danger-soft` tinted fill, `#c9343a` text.
  - `ghost`: text only (e.g. Dismiss).
- **Sizes:** `sm` 32 (radius 8, Caption 12), `md` 40 (radius 12, Body S 13), `lg` 48 (full-width bottom CTA). Desktop uses `md` and `sm`; mobile uses `lg` for the main CTA, `md` and `sm` inline. On touch, `sm` and `md` extend their hit area to 44.
- **States:** hover (lift 1px), active (scale .98), focus-visible (2px `--accent-ring` outline), disabled (opacity .55), `locked` (disabled with a lock icon and a reason, e.g. approval gated by Invariant #3).
- **`IconButton`:** 40px, round or `--radius-md`; variant `secondary` or `inverse` (over camera views). Hit area 44.
- **`PillTab`:** filter / tab pill. Sizes `sm` 32 and `lg` 48 (touch). Active state is ink-filled; the active Anomaly tab uses tone `danger` (solid red).

### 3.3. Cards
- **`GlassCard`:** padding 20px 24px; header = `CardTitle` + `CardSubtitle`. Same component on mobile (padding 16px).
- **`KpiCard`:** a `GlassCard` with min-height 224px. Anatomy: `Eyebrow` + `Chip` → mono `KpiValue` with `KpiUnit` → `KpiHint` / `KpiLine` → thin 6px bars.

### 3.4. Banners
- **`AnomalyBanner`:** `GlassCard` row, tone `danger`, with a 40px red-outlined icon tile, title, `Chip` (`solid`, `danger`, "Critical"), a pulsing status `Chip`, mono SPC meta in `#9f1d22`, then `Open INC →` (`Button` `primary`) and a Dismiss `Button` `ghost`.
- **`StatusReasonBanner`** tones:

| Tone | State | Text | Background |
|---|---|---|---|
| `warning` | escalated | `#92400e` | `rgba(255,247,237,.97)` |
| `danger` | error | `#991b1b` | `--danger-soft` tint |
| `neutral` | dismissed | `#334155` | `--glass-bg-strong` |

### 3.5. Table
- `MachineFleetTable` inside a `GlassCard`; toolbar padding 16px 20px.
- Cells padding 16px 20px, Body S 13px; head in Overline style, muted.
- Hot row (critical row): pink background and a 4px red inset left edge.

### 3.6. Segmented Control
- **`SegmentedControl`:** track `--radius-md` with `--radius-sm` inner buttons and a white sliding thumb (`--ease-spring`); each option may carry a mono count badge. Sizes `sm` (track 32, buttons 28; desktop toolbars) and `md` (track 40, buttons 36; mobile, 44 hit area).

### 3.7. Drawer, Modal & Sheet
- **`SideDrawer`:** portal with a blur scrim and a right-side `GlassCard` (variant `strong`) panel, radius `24px 0 0 24px`, width 560–1040px. Head (eyebrow chips + `DrawerTitle`), close `IconButton`, scrollable body, optional footer. Closes on Esc.
- **Modal:** centred `GlassCard`, max-width 880px (e.g. `DiagnosticsModal`).
- **DemoController slide-over:** `GlassCard` variant `strong`, 420px wide, `--radius-xl`.
- **`BottomSheet`** (mobile): `--radius-2xl` top corners.

### 3.8. Progress & Streak Gate
- **`ProgressBar`:** 6px pill track with an accent gradient fill (tone `warning` gradient for evidence progress, `info` for verification).
- **`StreakGate`:** 25-column proof grid; done cells `#22b573`; the next cell pulses with an accent outline; mono `count/target`; red reset notice when a defect resets the streak.
- **`ProgressTimeline`** (mobile): milestones done `success`, current `info` with halo, todo grey.
- **`ConfidenceRing`:** SVG ring, 64px; `warning` for evidence confidence, `success` for "AI sure", `info` for verification count.

### 3.9. Incident Step
- **`StepSection`:** collapsible glass step. Number circle (32px) states:
  - done: `success` with a check;
  - active: `accent` with a 4px soft ring (the whole step gets an accent border plus 4px ring);
  - pending: dashed circle, step at 0.7 opacity.
  - Header: title, one-line summary, trailing chips (Done / pulsing active label / "Waiting" with lock icon), chevron.
- **`StepRail`:** fixed right-side vertical glass pill, 28px wide, with state-coloured dots; the step in view stretches to 16px; dark tooltip on hover. Hidden below 768px.

### 3.10. Toast
- **`Toast`** on a `DarkGlass` surface, `--radius-lg`, with a filled icon (`success` check, `danger` for errors). Placement: bottom-right on desktop, top pill on mobile. Auto-dismisses after 5s.

### 3.11. AI Card
- **`AiCard`:** `GlassCard` with a gradient hairline border (accent → teal) and a 24px `auto_awesome` spark badge.

---

## 4. Mobile Surface (Technician App)

The technician app uses the same components, scales and fonts as the desktop (§2–§3). Only the colour tokens below differ, plus the mobile-only patterns in §4.3.

### 4.1. Colour Deltas

| Token | Desktop | Mobile |
|---|---|---|
| canvas | `#eef1fb` | `#eef1f8` (+ 3 blurred blobs `#c4bcff` / `#a6dcff` / `#ffd3e8`, `blur(48px)`, opacity .6) |
| ink-2 | `#1e2638` | `#3b4357` |
| ink-3 / ink-4 | — | `#7b8398` / `#a9b0c0` |
| accent | `#5b5bf0` / `#7c6cff` | `#5b4cf5` / `#8b7bff`, soft `rgba(91,76,245,.12)` |
| danger | `#e5484d` | `#ff3b30` (chip text `#d70015`) |
| warning | `#f5a524` | orange `#ff9500` (chip text `#b25000`) |
| success | `#12a150` | `#30c25a` (chip text `#1b8a3c`) |
| info | `#3b82f6` | `#0a84ff` (chip text `#0062cc`) |
| teal | — | `#32ade6` |
| glass fill | `rgba(255,255,255,.58)` | `rgba(255,255,255,.56)` |
| `Button` `primary` | ink gradient | solid `#0d0f17`; `accent` = `linear-gradient(135deg,#5b4cf5,#8b7bff)` |

### 4.2. Mobile Type Usage

Mobile uses the shared text styles from §2.6: `PageTitle` (Title L 30) for root tab titles, Title S 18 for section headings, Heading 16 for card titles, Body M 14 for body, Caption 12 for subtitles (ink-3), Overline 11 for section labels, Label XS 11 for chips and Dock labels.

### 4.3. Mobile Patterns
- **Dock:** floating, 64px tall, left/right 12, bottom 16, `--radius-full`, glass `rgba(255,255,255,.62)` blur 28; `#0d0f17` sliding thumb; `danger` unread badge on Notifications.
- **WorkOrderCard:** `GlassCard` with a 4px stage accent bar on the left edge (warm = evidence, indigo = fix, blue = processing), 64px thumbnail (48px on completed cards).
- **Screen layout:** padding 16, gap 16; 44px status bar; Dock reserved at the bottom.

### 4.4. Tap-Target Compliance

The 44px rule from §1.4 is mandatory. A control may be drawn smaller than 44 px, but its hit area (padding or an invisible `::before` overlay) must reach 44 × 44 px.

| Control | Visual size | Minimum hit area |
|---|---|---|
| `Button` `lg` | 48 | 48 |
| mic | 56 | 56 |
| shutter | 72 | 72 |
| `NextStepButton` | 48 | 48 |
| Dock cell | 56 × ~116 | 56 × ~116 |
| list rows | 56–72 | 56–72 |
| `Button` `md` | 40 | 44 |
| `IconButton` / back / camera tools | 40 | 44 × 44 |
| `SegmentedControl` `md` buttons | 36 | 44 |
| `Button` `sm` | 32 | 44 |
| `Switch` | 52 × 32 | 52 × 44 |

---

## 5. Screen Architecture & Wireframe References

For individual screen architectures, comprehensive user stories, acceptance criteria, and full ASCII wireframes, refer to:
- [`docs/wireframes/README.md`](./wireframes/README.md) — Master Overview & UI State Transitions Matrix
- [`docs/wireframes/00_base_layout.md`](./wireframes/00_base_layout.md) — Base Shells: Desktop Floating Glass Sidebar & Mobile Device Frame + Dock
- [`docs/wireframes/01_line_overview.md`](./wireframes/01_line_overview.md) — Screen 1: Line Overview & Machine Fleet (Desktop)
- [`docs/wireframes/02_technician_copilot.md`](./wireframes/02_technician_copilot.md) — Screen 2: Technician Mobile App — Work List, Evidence & Guided Repair (Mobile 396×852 frame)
- [`docs/wireframes/03_incident_workspace.md`](./wireframes/03_incident_workspace.md) — Screen 3: Incident Command — 5-Step Investigation & 8D Sign-Off (Desktop)
- [`docs/wireframes/04_knowledge_sustainability_hub.md`](./wireframes/04_knowledge_sustainability_hub.md) — Screen 4: Knowledge Loop — Tech Walkthroughs, Knowledge Base & SOP Library (Desktop)
