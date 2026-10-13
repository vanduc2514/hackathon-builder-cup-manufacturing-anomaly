# Project Base Layout: Desktop Floating Glass Sidebar & Mobile Device Frame + Dock

> **File:** `docs/wireframes/00_base_layout.md`  
> **Viewports:** Desktop `1440 × 900 px` (Plant Ops dashboard) · Mobile `396 × 852 px` device frame (Technician app)  
> **Design Standard:** [`docs/DESIGN.md`](../DESIGN.md) (Lumina Slate liquid glass)  
> **Terminology:** Unified **Agent Team** across all pages and documentation.

---

## 1. Architectural Principle: Separation of Shell & Content

To ensure visual consistency and prevent cognitive fatigue across the manufacturing floor:
1. **The Base Shell handles all global concerns:**
   - tab switching (React state, no URL router);
   - demo controls (DemoController drawer);
   - the SSE / backend latency dot;
   - the user card.
2. **Individual pages focus exclusively on their single JTBD content.** They mount into the shell's content slot and do not redefine navigation or the outer shell.

```mermaid
flowchart TD
    A["Kaizen Agent"] --> B{"Surface"}

    subgraph Desktop ["Desktop Plant Ops dashboard"]
        B -->|"Shift Leader / Plant Ops"| C["Floating glass Sidebar + floating TopHeader pills + main"]
        C --> D{"Sidebar groups (DashboardTab state)"}
        D -->|"Operational Loop"| D1["Line Overview (overview) • Incidents (incident-detail + per-incident sub-tabs)"]
        D -->|"Knowledge Loop"| D2["Tech Walkthroughs (walkthroughs) • Knowledge Base (impact) • SOP Change Log (sops)"]
        C --> E["TopHeader: crumb pill • N Active Anomaly chip • ⌘K jump palette • sound toggle • avatar"]
        C --> F["Sidebar footer: latency dot • shift chip • role card (icon + Shift Leader)"]
        C --> G["New Run → DemoController slide-over (Inject / Reset)"]
    end

    subgraph Mobile ["Technician mobile app"]
        B -->|"Technician"| H["396×852 device frame • iOS status bar • floating dock"]
        H --> I{"Dock tabs"}
        I -->|"Work List"| I1["Root list + in-memory stack: evidence | capture | fix | live | status"]
        I -->|"Notifications"| I2["Notification groups"]
        I -->|"Settings"| I3["Profile & preferences"]
    end
```

---

## 2. Desktop Shell Components

```
Root App
│
├── AppBackdrop (fixed; pastel radial washes + 24px dot grid)
│
├── Sidebar (GlassCard variant strong; fixed left/top/bottom 12px; width 240px; radius 24; --sidebar-w 252 incl. gap)
│   ├── Brand: "K" logo tile (dark gradient, 32px, radius 8) + "KAIZEN AGENT" (Geist 700)
│   ├── line-select inset: "Cell Line 1: Turning & Milling"
│   ├── Eyebrow "Operational Loop"
│   │   ├── NavItem: Line Overview
│   │   └── NavItem: Incidents
│   │       └── closable mono sub-tabs, one per opened incident (indented left rule)
│   ├── Eyebrow "Knowledge Loop"
│   │   ├── NavItem: Tech Walkthroughs
│   │   ├── NavItem: Knowledge Base
│   │   └── NavItem: SOP Change Log
│   └── Footer: backend latency dot (pulsing green / red) • shift chip • role card (role icon avatar · "Shift Leader"; no personal name)
│       (active NavItem: white 85% background, accent icon, weight 600)
│
├── TopHeader (fixed top 12, height 56, no bar background)
│   ├── Left: glass pill breadcrumb "Cell Line 1 / {Crumb}"
│   └── Right: red "N Active Anomaly" chip (only while an incident is open)
│             • ⌘K glass search pill "Search telemetry or jump to…" (44px; opens 360px jump palette)
│             • 44px round sound toggle
│             • name + 40px dark avatar
│
├── <main> (margin-left calc(var(--sidebar-w) + 12px); padding-top calc(64px + 32px); right padding 16px)
│   └── Page (column, max-width 1680px, gap 20px)
│       ├── Page header: PageTitle + muted Caption subtitle | contextual buttons (Button secondary / primary)
│       └── Page body: mounted screen components
│
├── DemoController (right slide-over, GlassCard variant strong, 420px, radius 24, blur scrim)
│   ├── Scenario cards: CNC Tool Wear (CNC-02/T07) • IM Damp Material (IM-05/MOLD-03)
│   ├── demo / fast timing • Inject • Reset
│   └── DarkGlass run-status box with danger→warning progress bar
│
└── Toast (DarkGlass, radius 16, fixed bottom-right; tone danger for errors; auto-dismiss 5s)
```

---

## 3. Low-Fi ASCII Wireframe: Desktop Base Layout (1440px)

```text
 AppBackdrop (pastel washes + dot grid) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  ╭──────────────────────╮   ╭─────────────────────────────╮                     (●) 1 Active Anomaly  ╭ ⌘K Search telemetry or jump to… ╮ (♪) Shift Leader (◉)
  │ [K] KAIZEN AGENT     │   │ Cell Line 1 / Line Overview │                                           ╰──────────────────────────────────╯
  │ ╭──────────────────╮ │   ╰─────────────────────────────╯   <-- floating TopHeader pills (top 12, h 56, no bar)
  │ │Cell Line 1:      │ │
  │ │Turning & Milling │ │   PageTitle (Geist 30px)                                        [ Contextual Button ] [ Button primary ]
  │ ╰──────────────────╯ │   muted subtitle (14px)
  │                      │
  │ OPERATIONAL LOOP     │   ╭── GlassCard (radius 24) ────────────────────────────────────────────────────────────────────────────────────╮
  │ ▣ Line Overview  *   │   │                                                                                                             │
  │ ⚠ Incidents          │   │   {Each tab mounts its focused content into Page}                                                           │
  │   │ #INC-… ×         │   │                                                                                                             │
  │                      │   │   - overview:        AnomalyBanner + 4 KPI cards + MachineFleetTable                                        │
  │ KNOWLEDGE LOOP       │   │   - incident-detail: 5 StepSections + StepRail + 8D sign-off                                                │
  │ ▶ Tech Walkthroughs  │   │   - walkthroughs / impact / sops: Knowledge Loop pages                                                      │
  │ ▤ Knowledge Base     │   │                                                                                                             │
  │ ☰ SOP Change Log     │   ╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
  │                      │
  │ (●) 24 ms  [Shift A] │                                                                                       ╭─ Toast (DarkGlass) ──────╮
  │ (◉) Shift Leader     │                                                                                       │ ✓ Message (auto 5s)      │
  │                      │                                                                                       ╰──────────────────────────╯
  ╰──────────────────────╯
   ^-- floating Sidebar, GlassCard strong (240px, inset 12px, radius 24)    ^-- <main> Page (max 1680px)
```

---

## 4. Desktop Breakpoints

The sidebar never collapses.

| Width | Change |
|---|---|
| 1280px (`xl`) | Overview KPI grid 4 → 2 columns |
| 1024px (`lg`) | Impact two-column layouts → 1; ESG KPIs 3 → 1 |
| 768px (`md`) | Step rail hidden; KPI and diagnostics grids → 1, banner stacks |
| 640px (`sm`) | Walkthrough duration hidden |

---

## 5. Mobile Shell (Technician App)

- **Device frame (`MobileDeviceFrame`):** 396 × 852 phone, 10px bezel, radius 58 (screen 48), scaled 0.55–1 to the window height, on the dark host page `#090D16`. Dynamic Island 112×32; home indicator 128×5.
- **iOS status bar:** 44px, "9:41".
- **`MobileHeader` (root tabs):** brand tile + "kAIgen", stream status line Live / Connecting… / Offline, 36px gradient avatar, then the `PageTitle` + Caption subtitle.
- **`MobileNavBar` (detail screens):** 40px round `IconButton` back button, centered title + `#id` subtitle, trailing priority `Chip`.
- **Scroll area:** padding `44px 0 112px` (reserves status bar and Dock); screen padding 16, gap 16. No media queries.
- **Floating `Dock`:** left/right 12, bottom 16, 64px tall, radius 999, glass `rgba(255,255,255,.62)` blur 28; black `#0d0f17` sliding thumb; 3 tabs:
  - Work List (`assignment`)
  - Notifications (`notifications`, `danger` unread badge)
  - Settings (`tune`)
- **Navigation:** tab state + in-memory stack on Work List (`evidence | capture | fix | live | status`). Tapping Work List again pops to root.
- **Full-screen routes (`capture`, `live`):** scroll padding removed, status bar turns white, Dock switches to on-dark `rgba(240,242,250,.78)` and stays visible over the camera.

```text
        ╭──────────────────────────────────────╮  <-- device frame 396×852, radius 58, on #090D16
        │ 9:41          ▬▬▬▬▬▬▬▬        ▂▄▆ ▮  │  <-- iOS status bar (44px)
        │ [⚙] kAIgen                      (AV) │  <-- MobileHeader topbar (36px tiles)
        │     (●) Live                         │
        │                                      │
        │ Work List                            │  <-- PageTitle 30/700
        │ 2 jobs need you · Bay 4              │
        │                                      │
        │ ╭──────────────────────────────────╮ │
        │ │  GlassCard (radius 24)           │ │  <-- screen padding 16, gap 16
        │ ╰──────────────────────────────────╯ │
        │ ╭──────────────────────────────────╮ │
        │ │  GlassCard                       │ │
        │ ╰──────────────────────────────────╯ │
        │                                      │
        │ ╭──────────────────────────────────╮ │
        │ │ [█WorkList█]  Notifs(2)  Settings│ │  <-- floating Dock 64px, black sliding thumb
        │ ╰──────────────────────────────────╯ │
        │              ────────                │  <-- home indicator
        ╰──────────────────────────────────────╯

  Detail screen top:  ( ‹ )      Repair brief       [P1]      <-- MobileNavBar: 40px back IconButton, title + #id, priority Chip
                               #INC-… · CNC-02
```
