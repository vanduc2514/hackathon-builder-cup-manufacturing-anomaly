# Kaizen UI Design System — shadcn/ui Edition

> **Official Design System Companion aligned with [@shadcn/ui Figma Design System by Pietro Schirano](https://www.figma.com/community/file/1203061493325953101/shadcn-ui-design-system)**  
> **Framework:** Radix UI primitives + Tailwind CSS + CSS Variables  
> **Core Principles:** Light Mode, Calm Precision, Zero Clutter, Token-driven Variables, Generous Radius (`--radius: 0.75rem / 12px`).

---

## 1. Design Tokens & CSS Variables

### 1.1. Color Tokens (Light Mode — Slate/Zinc Theme)

In accordance with `shadcn/ui`, all colors are defined as semantic CSS variables that adapt effortlessly to components:

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

  /* Primary Interactive Elements (Solid Dark) */
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

  /* Border Radius Tokens */
  --radius: 0.75rem;                   /* 12px: Base border radius */
}
```

### 1.2. Radius Scale Tokens

Following the strict shadcn/ui mathematical relationship:
- **`rounded-full` / Badge & Status Pill:** `9999px` (Official shadcn/ui pill badge standard)
- **`rounded-xl` / Card Radius:** `var(--radius)` = `12px` (`0.75rem`)
- **`rounded-lg` / Banner Radius:** `calc(var(--radius) - 2px)` = `10px`
- **`rounded-md` / Button & Input:** `calc(var(--radius) - 4px)` = `8px`
- **`rounded-sm` / Checkbox & Code Snippet:** `calc(var(--radius) - 6px)` = `6px`

---

### 1.3. Typography Hierarchy

Utilizing **Geist / Plus Jakarta Sans** with **JetBrains Mono** for numeric telemetry:

| Token | Class | Size / Leading | Weight | Application |
|---|---|---|---|---|
| `H1` | `text-2xl font-bold tracking-tight` | `24px` / `32px` | 700 | Page titles, major section headers |
| `H2` | `text-xl font-semibold tracking-tight` | `20px` / `28px` | 600 | Card titles, modal headers |
| `H3` | `text-lg font-semibold` | `18px` / `24px` | 600 | Alert banner title, machine names |
| `Body` | `text-sm font-normal` | `14px` / `20px` | 400 | Descriptive copy, table cell content |
| `Small` | `text-xs font-medium text-muted-foreground` | `12px` / `16px` | 500 | Metadata, timestamps, table headers |
| `Mono Data` | `font-mono font-semibold` | `13px` / `18px` | 600 | IDs (`CNC-02`, `T07`), rates (`1.42%`) |

---

## 2. Base Components Catalog (shadcn/ui Primitives)

### 2.1. Alert (`components/ui/alert.tsx`)
Clean, accessible notification banners with icon, title, and description:
- **Variant `destructive` (Active Line Anomaly):**
  - Background: `hsl(var(--destructive-muted))` (`#FEF2F2`)
  - Border: `1px solid hsl(var(--destructive) / 0.3)` (`#FECACA`)
  - Icon: Exclamation triangle in `hsl(var(--destructive))` (`#EF4444`)
  - Title: `AlertTitle` — `CNC-02 Anomaly Detected: Tool T07 Flank Wear`
  - Description: `AlertDescription` — `SPC Defect rate jumped to 1.42% exceeding UCL (0.25%).`
  - Trailing Action: Button `variant="outline"` size `sm`: `View Diagnostics →`
- **Variant `default` (General System Note):**
  - Background: `hsl(var(--card))` with `1px solid hsl(var(--border))`.

### 2.2. Card (`components/ui/card.tsx`)
The foundational container for all dashboard modules:
- **Anatomy:**
  - `Card`: `rounded-xl border bg-card text-card-foreground shadow-sm`
  - `CardHeader`: `flex flex-col space-y-1.5 p-6`
  - `CardTitle`: `text-base font-semibold leading-none tracking-tight`
  - `CardDescription`: `text-xs text-muted-foreground`
  - `CardContent`: `p-6 pt-0`
  - `CardFooter`: `flex items-center p-6 pt-0`
- **Application:** Machine Status Card, KPI Metric Card, Verification Progress Card.

### 2.3. Badge (`components/ui/badge.tsx`)
Pill badges for real-time Andon status and categories (`rounded-full px-2.5 py-0.5 text-xs font-semibold`):
- **Radius:** Strictly `rounded-full` (`border-radius: 9999px`) for smooth modern pill silhouette.
- **Variant `default`:** Solid black background `hsl(var(--primary))`, white text.
- **Variant `secondary`:** Light gray `hsl(var(--secondary))` background, dark text.
- **Variant `outline`:** Transparent with `1px solid hsl(var(--border))` border.
- **Variant `destructive`:** Muted red background with red text and pulsing indicator dot.
- **Variant `success`:** Muted green background with emerald text and steady green dot.
- **Variant `warning`:** Muted amber background with amber text and steady amber dot.

### 2.4. Button (`components/ui/button.tsx`)
Tactile, accessible interactive triggers:
- **Variants:**
  - `default`: Solid Slate `bg-primary text-primary-foreground hover:bg-primary/90`
  - `secondary`: `bg-secondary text-secondary-foreground hover:bg-secondary/80`
  - `outline`: `border border-input bg-background hover:bg-accent hover:text-accent-foreground`
  - `ghost`: `hover:bg-accent hover:text-accent-foreground`
  - `destructive`: `bg-destructive text-destructive-foreground hover:bg-destructive/90`
- **Sizes:** `sm` (h-8 px-3 text-xs), `default` (h-9 px-4 text-sm), `lg` (h-10 px-8 text-base), `icon` (h-9 w-9).

### 2.5. Table (`components/ui/table.tsx`)
Clean, spacious tabular view for the Machine List:
- `TableHeader` & `TableHead`: Uppercase `text-xs font-medium text-muted-foreground bg-muted/40`
- `TableRow`: `border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted`
- `TableCell`: `p-4 align-middle [&:has([role=checkbox])]:pr-0 text-sm`

### 2.6. Progress (`components/ui/progress.tsx`)
Slim verification progress bar:
- Track: `relative h-2 w-full overflow-hidden rounded-full bg-secondary`
- Indicator: `h-full w-full flex-1 bg-emerald-500 transition-all`

---

## 3. Industrial Customization Rules
1. **Zero Clutter:** No decorative gauges or 3D dials. Metric values sit cleanly inside `Card` with `CardHeader` label and large `font-mono` values.
2. **Predictable Layout:** Anomaly banners sit in the top slot; machine list resides in a clean `Table` or flat `Card` grid below.
3. **One Click to Action:** Every alert and machine row includes a dedicated shadcn `Button` triggering the exact workflow.
