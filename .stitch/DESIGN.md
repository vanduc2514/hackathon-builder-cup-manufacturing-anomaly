---
name: Kaizen UI — Lumina Slate
colors:
  background: '#eef1fb'
  surface-glass: 'rgba(255,255,255,0.58)'
  surface-glass-strong: 'rgba(255,255,255,0.78)'
  glass-border: 'rgba(255,255,255,0.75)'
  ink: '#0b1220'
  ink-2: '#1e2638'
  text: '#334155'
  muted: '#64748b'
  faint: '#94a3b8'
  hairline: 'rgba(15,23,42,0.07)'
  accent: '#5b5bf0'
  accent-2: '#7c6cff'
  accent-soft: 'rgba(91,91,240,0.10)'
  danger: '#e5484d'
  danger-text: '#c9343a'
  warning: '#f5a524'
  warning-text: '#b4710a'
  success: '#12a150'
  success-text: '#0e8a43'
  info: '#3b82f6'
  primary-button: '#0b1220'
---

# Kaizen UI — Lumina Slate (Liquid Glass, Light)

Design system for the Kaizen Agent manufacturing-anomaly product: a desktop Plant Ops dashboard
for shift leaders and a technician mobile app. Plain CSS custom properties. Source of truth: `docs/DESIGN.md`.

## 1. Visual Theme & Atmosphere

- **Mode:** light only. Apple-style liquid glass: frosted translucent white cards floating over a
  light lavender-grey canvas (`#eef1fb`).
- **Backdrop:** vertical gradient `#f4f6fd → #eceffa` with four soft pastel radial washes —
  violet `rgba(139,132,255,.28)`, blue `rgba(96,165,250,.22)`, pink `rgba(244,170,210,.2)`,
  sky `rgba(125,211,252,.18)` — plus a 24px dot grid in `rgba(15,23,42,.07)` that fades out.
- **Mood:** calm, quiet, low-clutter industrial control room. Lines run nominal 90% of the time;
  the UI lights up only the single actionable signal (one red banner, one hot table row).
- **Banned:** dark-mode canvases, neon glows, faux-3D dials, walls of metrics. Dark surfaces are
  allowed only for toasts / the demo run-status box (DarkGlass surface) and full-screen mobile camera
  views.

## 2. Color Palette & Roles

### Foundation
- **Lavender Canvas** `#eef1fb` — page background (`--bg-app`).
- **Frosted Glass** `rgba(255,255,255,.58)` — default GlassCard fill (`--glass-bg`), blur 28px,
  saturate 180%.
- **Strong Glass** `rgba(255,255,255,.78)` — GlassCard variant `strong`: sidebar, drawers
  (`--glass-bg-strong`).
- **Glass Edge** `rgba(255,255,255,.75)` — 1px border on every glass surface (`--glass-border`).
- **Hairline** `rgba(15,23,42,.07)` — dividers and table rules (`--hair`; `--hair-strong`
  `rgba(15,23,42,.12)` for control borders).

### Text hierarchy
- **Ink** `#0b1220` — titles, primary text, primary buttons.
- **Ink 2** `#1e2638` — secondary strong text.
- **Slate Text** `#334155` — body copy.
- **Muted Slate** `#64748b` — captions, units, subtitles.
- **Faint Slate** `#94a3b8` — eyebrow labels, placeholders.

### Accent & interactive
- **Indigo Accent** `#5b5bf0` — active nav, selection, links, active step.
- **Violet Accent 2** `#7c6cff` — gradient partner for accent fills and progress bars.
- **Accent Soft** `rgba(91,91,240,.10)` — tinted accent fills; focus ring `rgba(91,91,240,.28)`.
- **Primary buttons are the dark ink gradient `#1f2937 → #0b1220`, not the accent colour.**

### Status tones
| Tone | Base | Soft fill | Text on soft | Use |
|---|---|---|---|---|
| `danger` | `#e5484d` | `rgba(229,72,77,.1)` | `#c9343a` (banner meta `#9f1d22`) | anomaly / critical |
| `warning` | `#f5a524` | `rgba(245,165,36,.12)` | `#b4710a` | investigating / drift |
| `success` | `#12a150` | `rgba(18,161,80,.1)` | `#0e8a43` | nominal / verified (streak cells `#22b573`) |
| `accent` | `#5b5bf0` | `rgba(91,91,240,.1)` | `#5b5bf0` | active step / selection |
| `info` | `#3b82f6` | — | — | info |
| `neutral` | `#334155` | white 70% | `#334155` | default chips |
| `inverse` | `#0b1220` | — | white | dark chips, tags |

## 3. Typography

- **Inter** — body text (font-feature-settings `'cv11','ss01'`): neutral, highly legible.
- **Geist** — display: page titles, card titles, KPI numbers. Tight negative tracking.
- **JetBrains Mono** — data: IDs, SOP codes, percentages, KPI values, keyboard hints.
- **Icons:** Material Symbols Outlined, FILL 0 by default.
- **Scale:** sizes 11, 12, 13, 14, 16, 18, 20, 24, 30, 36px; weights 400 / 500 / 600 / 700.

| Text style | Font | Size | Weight | Tracking | Used by |
|---|---|---|---|---|---|
| Display | Geist, tabular-nums | 36px | 700 | -0.04em | KpiValue (often mono) |
| Title L | Geist | 30px (incident page 24px) | 700 | -0.03em | PageTitle (desktop pages, mobile root tabs) |
| Title M | Geist | 20px | 700 | -0.02em | DrawerTitle |
| Title S | Geist | 18px | 600 | -0.02em | AnomalyBanner title, mobile section headings |
| Heading | Geist | 16px | 600 | -0.01em | CardTitle, StepSection title, KpiUnit |
| Body M | Inter | 14px | 400 (nav 500, active 600) | 0 | body copy, nav, mobile body |
| Body S | Inter | 13px | 400 | 0 | table cells, KpiLine, banner meta, Button label |
| Caption | Inter | 12px | 500 | 0 | CardSubtitle, KpiHint, Chip `md`, Button `sm`, SegmentedControl, mobile subtitles |
| Overline | Inter, uppercase | 11px | 700 | 0.08em | Eyebrow, table head, mobile section labels |
| Label XS | Inter, uppercase | 11px | 700 | 0.06em | Chip `sm` and `solid`, Dock labels (600, sentence case) |
| Mono | JetBrains Mono | inherits | — | — | IDs, SOP codes, %, KPI values, Kbd |

The technician app uses the same text styles: PageTitle 30 for root tab titles, Title S 18 for
section headings, Heading 16 for card titles, Body M 14 for body, Caption 12 for subtitles,
Overline 11 for section labels, Label XS 11 for chips and Dock labels.

## 4. Component Stylings

One component per concept; desktop and mobile differ only by size (desktop defaults to `md`/`sm`,
mobile to `lg`/`md`) and by the mobile colour deltas. Component sizes: `sm` 32, `md` 40, `lg` 48px
tall; touch controls always reach a 44px hit area.

- **GlassCard:** frosted white `.58`, blur 28px saturate 180%, 1px white `.75` border, radius 24px
  on both surfaces, padding 20px 24px (16px on mobile). Shadow
  `0 1px 1px rgba(15,23,42,.03), 0 8px 24px -6px rgba(30,41,90,.1), 0 24px 48px -24px rgba(30,41,90,.12)`
  plus an inset top highlight. Hover: stronger shadow and `translateY(-1px)`. Variant `strong`
  uses `.78` fill. Tones `danger` / `accent` / `success` add gradient tints.
- **Inset:** `rgba(244,246,255,.7)` fill, 1px white border, radius 16.
- **KpiCard:** GlassCard with min-height 224px. Eyebrow + Chip → mono KpiValue with KpiUnit →
  KpiHint / KpiLine → thin 6px bars.
- **Chip:** pill 999px with optional leading 6px StatusDot (pulses for live and critical states).
  Appearance `soft` (default; tinted fill, 1px tone border) or `solid` (filled tone, white
  uppercase text, used for severity, e.g. solid danger "CRITICAL"). Tones neutral / accent /
  success / warning / danger / info / inverse. Sizes `md` (desktop, 24px tall, Caption 12/600) and
  `sm` (mobile and severity, 20px tall, Label XS uppercase).
- **Tag:** rectangular label, radius 8, mono 11–12px; variant `outline` (part / tool codes) or
  `inverse` (step numbers, 8D disciplines).
- **Button:** variants `primary` (ink gradient `#1f2937 → #0b1220` with a coloured drop shadow;
  the main action of a view), `secondary` (default; glass-white fill, hairline border, soft shadow
  and inset highlight), `accent` (`#7c6cff → #5b5bf0` gradient, for AI / agent actions),
  `destructive` (danger-soft fill, `#c9343a` text) and `ghost` (text only, e.g. Dismiss). Sizes
  `sm` 32 (radius 8, Caption 12), `md` 40 (radius 12, Body S 13), `lg` 48 (full-width bottom
  CTA, radius 16). States: hover lift 1px, active scale .98, 2px accent focus ring, disabled
  opacity .55, `locked` (disabled with a lock icon and a reason).
- **IconButton:** 40px, round or radius 12; variant `secondary` or `inverse` (over camera views);
  44px hit area.
- **PillTab:** filter / tab pill, sizes `sm` 32 and `lg` 48. Active state is ink-filled; the
  active Anomaly tab uses tone `danger` (solid red).
- **AnomalyBanner:** GlassCard row, tone `danger` (pink gradient tint, border
  `rgba(229,72,77,.28)`): 40px red-outlined icon tile (radius 12), Title S title (e.g. "CNC-02:
  Tool T07 Flank Wear"), solid danger "CRITICAL" Chip, pulsing status Chip, mono meta in
  `#9f1d22`, then an `Open INC →` primary Button and a Dismiss ghost Button.
- **StatusReasonBanner:** escalated text `#92400e` on `rgba(255,247,237,.97)`; error text
  `#991b1b`; dismissed text `#334155`.
- **MachineFleetTable:** inside a GlassCard; toolbar and cells padding 16px 20px, Body S 13px;
  head in Overline style, muted. The hot (critical) row has a pink background with a 4px red
  inset left edge and an `OPEN INC →` primary Button size `sm`; nominal rows get a `Diagnostics`
  secondary Button size `sm`.
- **SegmentedControl:** track radius 12 with radius 8 inner buttons and a white sliding thumb;
  each option may carry a mono count. Sizes `sm` (track 32, buttons 28; desktop toolbars) and
  `md` (track 40, buttons 36; mobile, 44 hit area).
- **SideDrawer:** right-side GlassCard variant `strong`, radius `24px 0 0 24px`, width
  560–1040px, blur scrim. BottomSheet (mobile) uses radius 32 top corners.
- **StreakGate:** 25-column grid of small cells; done cells `#22b573`, next cell pulses with an
  accent outline, mono `38/50` counter; closure approval stays locked until 50/50.
- **StepSection:** collapsible glass step with a 32px number circle — done success with check,
  active accent with a 4px soft ring, pending dashed at 0.7 opacity.
- **Toast:** dark glass `linear-gradient(160deg, rgba(17,24,39,.92), rgba(30,27,75,.9))`,
  radius 16; bottom-right on desktop, top pill on mobile.
- **Dock (mobile):** floating, 64px tall, left/right 12, bottom 16, radius 999, glass `.62`
  blur 28, `#0d0f17` sliding thumb, danger unread badge.
- **WorkOrderCard (mobile):** GlassCard with a 4px stage accent bar on the left edge (warm =
  evidence, indigo = fix, blue = processing), chips row, 64px thumbnail (48px on completed
  cards), title, mono `#id · machine`, evidence ProgressBar, footer with a Tag and a `Collect`
  Button size `sm`.

### Mobile colour deltas
The technician app shares every component, scale and font above; only colours differ: canvas
`#eef1f8` with three blurred blobs (`#c4bcff` / `#a6dcff` / `#ffd3e8`, blur 48px), accent
`#5b4cf5` / `#8b7bff`, danger `#ff3b30`, warning `#ff9500`, success `#30c25a`, info `#0a84ff`,
glass fill `rgba(255,255,255,.56)`, primary Button solid `#0d0f17`, accent Button
`linear-gradient(135deg,#5b4cf5,#8b7bff)`.

## 5. Layout Principles

- **Spacing:** 4px grid (4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64).
- **Radius tokens:** `--radius-sm` 8 (Tag, Button `sm`, segmented inner buttons, logo tile) ·
  `--radius-md` 12 (Button `md`, IconButton square, nav items, segmented track) · `--radius-lg` 16
  (Inset, Toast, search field, mobile Button) · `--radius-xl` 24 (GlassCard, sidebar, SideDrawer) ·
  `--radius-2xl` 32 (BottomSheet) · `--radius-full` 999 (Chip, PillTab, ProgressBar, Dock).
- **Desktop shell:** floating strong-glass sidebar 240px wide, inset 12px from the viewport,
  radius 24; floating header pills (top 12, height 56); main Page column max-width 1680px with
  20px gap.
- **Breakpoints:** 640 (`sm`), 768 (`md`), 1024 (`lg`), 1280 (`xl`). At 1280 KPI grids go 4 → 2;
  at 1024 two-column layouts and ESG KPIs collapse to 1; at 768 the StepRail hides, KPI grids go
  to 1 and the banner stacks; at 640 the walkthrough duration hides.
- **Mobile:** 396 × 852 device frame, 44px status bar, screen padding 16, gap 16, floating 64px
  Dock at left/right 12, bottom 16.
- **Tap targets:** ≥ 44 × 44px everywhere on the technician app; the primary completion CTA is a
  full-width bottom Button size `lg` (48px).
- **Progressive disclosure:** glance (status colour + machine) → focus (issue, owner, next
  action) → deep dive in drawers / modals only.

## 6. Stitch Generation Notes

- **Atmosphere keywords:** liquid glass, frosted translucent white cards, pastel lavender
  backdrop, indigo accent, dark ink primary buttons, calm industrial control room.
- **Canonical colours:** Lavender Canvas `#eef1fb`, Ink `#0b1220`, Slate Text `#334155`, Muted
  `#64748b`, Indigo Accent `#5b5bf0`, Violet `#7c6cff`, Danger `#e5484d`, Warning `#f5a524`,
  Success `#12a150`, Info `#3b82f6`.
- **Component prompts:**
  - A frosted white glass KPI card with 24px corners on a pastel lavender backdrop, an uppercase
    faint 11px eyebrow "OEE", a small pill chip "-2.1%", a large 36px JetBrains Mono value
    "88.4 %", and three thin 6px dark ink progress bars labelled Availability, Performance and
    Quality.
  - A full-width anomaly banner with 24px corners, a pink frosted-glass tint and a soft red
    border, a 40px red-outlined warning icon tile, the 18px Geist title "CNC-02: Tool T07 Flank
    Wear", a solid red CRITICAL pill, a mono line "Defect rate 1.42% · UCL 0.25%" in dark red,
    and on the right a 40px dark ink gradient button "Open INC →" next to a quiet text-only
    "Dismiss" button.
  - A mobile work-order card in frosted white glass with 24px corners and a 4px warm accent bar
    on its left edge, a row of small uppercase pill chips (red "Needs evidence", red "P1"), a
    64px thumbnail beside the title "Tool T07 flank wear" and mono "#INC · CNC-02", an "Evidence
    collected 1 of 3" progress bar, and a footer with a "2 shots needed" tag and a 32px indigo
    gradient "Collect" button.
