# Kaizen UI Design System — shadcn/ui Edition

> **Official Design System Specification for Kaizen Agent (shadcn/ui Light Mode)**  
> **Framework:** Radix UI primitives + Tailwind CSS + CSS Variables  
> **Core Principles:** Light Mode, Calm Precision, Zero Clutter, Token-driven Variables, Generous Radius Hierarchy (`--radius: 0.75rem / 12px`).


---

## 1. Design Methodology

### 1.1. Principle 1: Calm Technology & Signal-to-Noise Ratio

In a manufacturing plant, production lines run nominally 90% of the time. The interface must be **exceptionally calm, quiet, and minimalist** to prevent operator eye fatigue. When an anomaly occurs, the system activates **only the single Actionable Signal**, rather than overwhelming operators with dozens of irrelevant metrics.

- **Cognitive Overload Prevention (Anti-Cyberpunk):** Dark cyberpunk themes, glowing neon borders, faux-futuristic 3D dials, and cluttered metric walls are strictly banned. The canvas uses a clean white background (`#FFFFFF`) with high-contrast Slate/Zinc semantics.
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
  - Primary completion CTA is a sticky bottom button with a minimum height of **48 px** (`h-12`) spanning full mobile width.
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
[Stage 5: Design System Token Binding (shadcn/ui)]
        │
        ▼
[Stage 6: Hi-Fi Stitch Prototype & Production Code]
```

---

## 2. Design Tokens & CSS Variables

### 2.1. Color Tokens (Light Mode — Slate/Zinc Theme)


In accordance with `shadcn/ui`, all colors are defined as semantic CSS variables that adapt effortlessly across components:

```css
:root {
  /* Canvas & Viewport Base */
  --background: 0 0% 100%;             /* #FFFFFF: Main canvas background */
  --foreground: 222.2 84% 4.9%;        /* #020817: High-contrast primary text */

  /* Card & Surface Containers */
  --card: 0 0% 100%;                   /* #FFFFFF: Elevated cards and dialogs */
  --card-foreground: 222.2 84% 4.9%;   /* #020817: Text inside cards */

  /* Popover & Flyouts */
  --popover: 0 0% 100%;                /* #FFFFFF */
  --popover-foreground: 222.2 84% 4.9%;/* #020817 */

  /* Primary Interactive Elements (Solid Slate Dark) */
  --primary: 222.2 47.4% 11.2%;        /* #0F172A: Primary action buttons */
  --primary-foreground: 210 40% 98%;   /* #F8FAFC: Text on primary button */

  /* Secondary & Subtle Surfaces */
  --secondary: 210 40% 96.1%;          /* #F1F5F9: Secondary buttons, chip backgrounds */
  --secondary-foreground: 222.2 47.4% 11.2%; /* #0F172A */

  /* Muted Content & Metadata */
  --muted: 210 40% 96.1%;              /* #F1F5F9: Disabled tabs, subtle backgrounds */
  --muted-foreground: 215.4 16.3% 46.9%;/* #64748B: Captions, units, timestamps */

  /* Interactive Accents & Hover States */
  --accent: 210 40% 96.1%;             /* #F1F5F9: Row hover states, dropdown hover */
  --accent-foreground: 222.2 47.4% 11.2%; /* #0F172A */

  /* Destructive & Urgent Anomaly States */
  --destructive: 0 84.2% 60.2%;        /* #EF4444: Urgent anomaly borders & icons */
  --destructive-foreground: 210 40% 98%; /* #F8FAFC */
  --destructive-muted: 0 86% 97%;      /* #FEF2F2: Alert banner soft background */

  /* Warning & In-Progress States */
  --warning: 38 92% 50%;               /* #F59E0B: Investigation / parameter drift */
  --warning-muted: 48 96% 96%;         /* #FFFBEB: Amber alert soft background */
  --warning-foreground: 32 95% 36%;    /* #B45309: Amber text */

  /* Success & Verified States */
  --success: 142 71% 45%;              /* #10B981: Nominal Andon / streak passed */
  --success-muted: 152 76% 96%;        /* #ECFDF5: Emerald soft background */
  --success-foreground: 161 94% 24%;   /* #047857: Emerald text */

  /* Structural Borders & Focus Ring */
  --border: 214.3 31.8% 91.4%;         /* #E2E8F0: 1px clean container border */
  --input: 214.3 31.8% 91.4%;          /* #E2E8F0: Form input borders */
  --ring: 222.2 84% 4.9%;              /* #020817: High-contrast focus ring */

  /* Border Radius Base Token */
  --radius: 0.75rem;                   /* 12px: Base border radius */
}
```

---

### 3.2. Mathematical Border Radius Hierarchy

Following shadcn/ui proportional scaling from `--radius` (12px / `0.75rem`):

| Component Level | Tailwind Class | Computed Value | Formula | Rationale |
|---|---|---|---|---|
| **Badge / Status Pill** | `rounded-full` | `9999px` | Fixed pill | Pill silhouette matches official shadcn/ui spec; soft friendly status indicator. |
| **Card / Modal Container** | `rounded-xl` | `12px` | `var(--radius)` | Generous outer container boundary; modern card silhouette. |
| **Alert / Banner** | `rounded-lg` | `10px` | `calc(var(--radius) - 2px)` | Nested or full-width notification surface with refined inner curve. |
| **Button / Input** | `rounded-md` | `8px` | `calc(var(--radius) - 4px)` | Standard interactive touch and click target radius. |
| **Checkbox / Code Tag** | `rounded-sm` | `6px` | `calc(var(--radius) - 6px)` | Tight, precise inner interactive elements. |

---

### 3.3. Typography Hierarchy

Utilizing **Geist / Plus Jakarta Sans** with **JetBrains Mono** for numeric telemetry:

| Token | Class | Size / Leading | Weight | Application |
|---|---|---|---|---|
| `H1` | `text-2xl font-bold tracking-tight` | `24px` / `32px` | 700 | Page titles, major section headers |
| `H2` | `text-xl font-semibold tracking-tight` | `20px` / `28px` | 600 | Card titles, modal headers |
| `H3` | `text-lg font-semibold` | `18px` / `24px` | 600 | Alert banner title, machine names |
| `Body` | `text-sm font-normal` | `14px` / `20px` | 400 | Descriptive copy, table cell content |
| `Small` | `text-xs font-medium text-muted-foreground` | `12px` / `16px` | 500 | Metadata, timestamps, table headers |
| `Mono Data` | `font-mono font-semibold` | `13px` / `18px` | 600 | IDs (`CNC-02`, `T07`), rates (`1.42%`, `45 Nm`) |

---

## 3. Base Components Catalog (shadcn/ui Primitives)

### 3.1. Alert (`components/ui/alert.tsx`)
Clean, accessible notification banners with icon, title, and description:
- **Variant `destructive` (Active Line Anomaly):**
  - Background: `hsl(var(--destructive-muted))` (`#FEF2F2`)
  - Border: `1px solid hsl(var(--destructive) / 0.3)` (`#FECACA`)
  - Icon: Exclamation triangle in `hsl(var(--destructive))` (`#EF4444`)
  - Title: `AlertTitle` — `CNC-02 Anomaly Detected: Tool T07 Flank Wear`
  - Description: `AlertDescription` — `SPC Defect rate jumped to 1.42% exceeding UCL (0.25%).`
  - Trailing Action: Button `variant="default"` or `variant="outline"` size `sm`: `Dispatch Copilot →`
- **Variant `default` (General System Note):**
  - Background: `hsl(var(--card))` with `1px solid hsl(var(--border))`.

### 3.2. Card (`components/ui/card.tsx`)
The foundational container for all dashboard modules:
- **Anatomy:**
  - `Card`: `rounded-xl border bg-card text-card-foreground shadow-sm`
  - `CardHeader`: `flex flex-col space-y-1.5 p-6`
  - `CardTitle`: `text-base font-semibold leading-none tracking-tight`
  - `CardDescription`: `text-xs text-muted-foreground`
  - `CardContent`: `p-6 pt-0`
  - `CardFooter`: `flex items-center p-6 pt-0`
- **Application:** Machine Status Card, KPI Metric Card, Verification Progress Card.

### 3.3. Badge (`components/ui/badge.tsx`)
Pill badges for real-time Andon status and categories (`rounded-full px-2.5 py-0.5 text-xs font-semibold`):
- **Radius:** Strictly `rounded-full` (`border-radius: 9999px`) for smooth modern pill silhouette.
- **Variant `default`:** Solid black background `hsl(var(--primary))`, white text.
- **Variant `secondary`:** Light gray `hsl(var(--secondary))` background, dark text.
- **Variant `outline`:** Transparent with `1px solid hsl(var(--border))` border.
- **Variant `destructive`:** Muted red background with red text and pulsing indicator dot.
- **Variant `success`:** Muted green background with emerald text and steady green dot.
- **Variant `warning`:** Muted amber background with amber text and steady amber dot.

### 3.4. Button (`components/ui/button.tsx`)
Tactile, accessible interactive triggers:
- **Variants:**
  - `default`: Solid Slate `bg-primary text-primary-foreground hover:bg-primary/90`
  - `secondary`: `bg-secondary text-secondary-foreground hover:bg-secondary/80`
  - `outline`: `border border-input bg-background hover:bg-accent hover:text-accent-foreground`
  - `ghost`: `hover:bg-accent hover:text-accent-foreground`
  - `destructive`: `bg-destructive text-destructive-foreground hover:bg-destructive/90`
- **Sizes:** `sm` (h-8 px-3 text-xs), `default` (h-9 px-4 text-sm), `lg` (h-10 px-8 text-base), `icon` (h-9 w-9).

### 3.5. Table (`components/ui/table.tsx`)
Clean, spacious tabular view for the Machine List:
- `TableHeader` & `TableHead`: Uppercase `text-xs font-medium text-muted-foreground bg-muted/40`
- `TableRow`: `border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted`
- `TableCell`: `p-4 align-middle [&:has([role=checkbox])]:pr-0 text-sm`

### 3.6. Progress (`components/ui/progress.tsx`)
Slim verification progress bar:
- Track: `relative h-2 w-full overflow-hidden rounded-full bg-secondary`
- Indicator: `h-full w-full flex-1 bg-emerald-500 transition-all`

---

## 4. Screen Architecture & Wireframe References


For individual screen architectures, comprehensive user stories, acceptance criteria, and full ASCII wireframes, refer to:
- [`docs/wireframes/README.md`](./wireframes/README.md) — Master Overview & UI State Transitions Matrix
- [`docs/wireframes/00_base_layout.md`](./wireframes/00_base_layout.md) — Base Application Shell & Navigation (Desktop 1440px / Mobile 390px)
- [`docs/wireframes/01_line_overview.md`](./wireframes/01_line_overview.md) — Screen 1: Line Overview & Machine List (Desktop 1440px)
- [`docs/wireframes/02_technician_copilot.md`](./wireframes/02_technician_copilot.md) — Screen 2: Technician Floor Copilot & Machine Queue (Mobile 390px)
- [`docs/wireframes/03_incident_workspace.md`](./wireframes/03_incident_workspace.md) — Screen 3: Incident Workspace & 8D Approval (Desktop / Tablet)
- [`docs/wireframes/04_knowledge_sustainability_hub.md`](./wireframes/04_knowledge_sustainability_hub.md) — Screen 4: Kaizen Knowledge & Sustainability Hub (Desktop 1440px)

