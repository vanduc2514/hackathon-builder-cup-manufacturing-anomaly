---
document_id: "manuals/mold_spec_im05_4cavity.md"
title: "Tooling Specification & Rheological Analysis: 4-Cavity Enclosure Mold (MOLD-E4C-05)"
category: "spec"
machine_id: "IM-05"
mold_id: "MOLD-E4C-05"
revision: "Rev 2.0"
effective_date: "2025-03-10"
total_pages: 24
tags: ["injection_molding", "im_05", "mold_tooling", "cavity_3", "runner_length", "short_fill", "sink_mark"]
---

# Tooling Specification & Rheological Analysis: 4-Cavity Enclosure Mold
**Mold ID: MOLD-E4C-05**  
**Dedicated Press: IM-05 (180-Ton Injection Molding Machine)**  
**Component Produced: Wireless IoT Gateway Top Housing (Material: ABS GP-22)**

---

<!-- page: 1 -->
## [Page 1] Mold Construction & Cavity Allocation

### 1.1 Tool Architecture & Clamping Layout
MOLD-E4C-05 is a 2-plate cold runner injection mold containing four distinct cavities arranged in an asymmetric H-pattern manifold.

```
                     Runner Layout Schematic (MOLD-E4C-05)
                                  [Sprue Bushing]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │                                           │
             [Sub-Runner A]                              [Sub-Runner B]
             L = 100 mm                                  L = 100 mm
             ┌─────┴─────┐                               ┌─────┴─────┐
             │           │                               │           │
        [Branch 1]   [Branch 2]                     [Branch 3]   [Branch 4]
        L = 80 mm    L = 80 mm                      L = 185 mm   L = 110 mm
             │           │                               │           │
         [Cavity 1]  [Cavity 2]                      [Cavity 3]  [Cavity 4]
```

---

<!-- page: 2 -->
## [Page 2] Hydraulic Runner Length & Flow Resistance Analysis

### 2.1 Runner Channel Dimensions & Cumulative Flow Lengths
The runner system features trapezoidal runners transitioning to submarine edge gates at each cavity gate entry.

| Cavity ID | Runner Path Description | Total Runner Length (mm) | Gate Type / Size | Relative Flow Resistance |
|---|---|---|---|---|
| **Cavity #1** | Sprue $\rightarrow$ Sub-Runner A $\rightarrow$ Branch 1 | **180 mm** | Submarine Gate (1.2 mm Ø) | 1.00 (Baseline) |
| **Cavity #2** | Sprue $\rightarrow$ Sub-Runner A $\rightarrow$ Branch 2 | **180 mm** | Submarine Gate (1.2 mm Ø) | 1.00 (Baseline) |
| **Cavity #3** | **Sprue $\rightarrow$ Sub-Runner B $\rightarrow$ Branch 3 (Offset)** | **285 mm** | **Submarine Gate (1.2 mm Ø)** | **1.26 (+26% $\Delta P$)** |
| **Cavity #4** | Sprue $\rightarrow$ Sub-Runner B $\rightarrow$ Branch 4 | **210 mm** | Submarine Gate (1.2 mm Ø) | 1.08 (+8% $\Delta P$) |

### 2.2 Rheological Sensitivity of Cavity #3
Because of structural interference with the hydraulic side-action core-pull cylinder on the B-plate, Branch 3 was routed around the hydraulic slide mechanism, resulting in a **total runner length of 285 mm**—the longest path in the mold tooling.

```
Rheological & Pressure Drop Calculations (Hagen-Poiseuille Non-Newtonian Flow):
  - Pressure drop: ΔP = (8 * η * Q * L) / (π * R⁴)
  - For Cavity #3 (L = 285 mm vs L = 180 mm for Cavity #1/2):
    - Pressure Drop Increase: +26% higher than Cavity 1 & 2
    - Melt Front Residence Time: +0.42 seconds longer in cold runner
    - Heat Loss in Cold Runner: Melt temperature drops ~4.2 °C lower at gate entry
```

---

<!-- page: 3 -->
## [Page 3] Defect Susceptibility & Troubleshooting Signatures

### 3.1 Why Cavity #3 Fails First Under Elevated Resin Moisture
When ABS resin moisture exceeds the manufacturer threshold ($> 0.02\%$ by weight / $200\text{ ppm}$):
1. **Melt Viscosity Destabilization:** High moisture causes volatile steam bubble nucleation within the runner channels. 
2. **Amplified Pressure Attenuation:** In Cavity #3, because the runner length is **285 mm**, the cumulative shear stress and flow resistance are maximized. The steam void fraction causes compressibility in the melt stream, severely damping the transmission of holding pressure ($P_{hold}$) into Cavity #3.
3. **Defect Manifestation:**
   - **Sink Marks (`sink_mark`):** In Cavity #3, holding pressure drops below the critical threshold required to pack out thick structural boss bosses ($t = 2.4\text{ mm}$), creating visible surface sink marks.
   - **Short Fill (`short_fill`):** Under slightly degraded injection speed or lower melt temperatures, the melt front in Cavity #3 freezes before completing volumetric fill.
   - **Cavities #1, #2, and #4 Remain Intact:** Due to shorter runner lengths ($180\text{ mm}$ and $210\text{ mm}$), holding pressure is adequate to overcome the slight moisture vapor dampening, producing acceptable parts while Cavity #3 fails.

### 3.2 Root Cause Identification Guideline
If Quality Inspection records sink marks or short fill **isolated exclusively to Cavity #3** on machine IM-05:
- **DO NOT** modify mold gate dimensions or clamp tonnage.
- **IMMEDIATELY** verify raw material moisture content and inspect the dehumidifier dryer (Dryer-03) dew point telemetry.
- A dew point reading higher than $-30^\circ\text{C}$ or moisture $> 0.02\%$ indicates damp resin that preferentially starves Cavity #3.
