---
document_id: "manuals/injection_molding_guide.md"
title: "Industrial Injection Molding Machine & Polymer Processing Guide"
category: "manual"
machines: ["IM-05", "IM-06"]
revision: "Rev 3.1"
effective_date: "2025-02-01"
total_pages: 94
tags: ["injection_molding", "abs_resin", "moisture_limit", "dew_point", "dehumidifier", "sink_mark", "short_fill"]
---

# Industrial Injection Molding Machine & Polymer Processing Guide
**Target Machines: IM-05 & IM-06 (180-Ton Electric Toggle Injection Molding Units)**  
**Target Resin: High-Impact ABS (Acrylonitrile Butadiene Styrene) Engineering Thermoplastic**

---

<!-- page: 1 -->
## [Page 1] Chapter 1: Machine Specifications & Clamping Units

### 1.1 Hydraulic & Electric Clamp Specifications
Machines IM-05 and IM-06 are high-precision toggle clamping injection molding presses configured for multi-cavity electronic enclosures and automotive dashboard sub-assemblies.

| Machine Parameter | Nominal Specification | Operating Range | Unit |
|---|---|---|---|
| Clamping Force | 1,800 kN (180 Ton) | 1,400 – 1,800 | kN |
| Platen Dimensions | 760 x 760 | — | mm |
| Tie Bar Spacing | 520 x 520 | — | mm |
| Screw Diameter | 45 | — | mm |
| Maximum Shot Weight (PS) | 320 | 80 – 290 | g |
| Maximum Injection Pressure | 175 | 90 – 160 | MPa |
| Maximum Mold Weight | 1,200 | — | kg |

---

<!-- page: 32 -->
## [Page 32] Chapter 2: Raw Material Properties — ABS Resin Processing

### 2.1 ABS Resin Hygroscopic Characteristics
Acrylonitrile Butadiene Styrene (ABS) is a terpolymer composed of acrylonitrile, butadiene, and styrene. Because of polar nitrile groups (-C≡N) in the acrylonitrile phase, ABS is inherently **hygroscopic** and actively absorbs atmospheric moisture during storage, bagging, and transit.

```
Moisture Content Thresholds for Injection Molding Grade ABS:
  - Equilibrium Moisture in Ambient Air (60% RH):  0.25% – 0.40% (2,500 – 4,000 ppm)
  - Processing Limit (Critical Upper Bound):        0.02% by weight (200 ppm)
  - Recommended Target Processing Moisture:       <= 0.01% by weight (100 ppm)
```

### 2.2 Mechanism of Moisture-Induced Defects: Sink Marks & Short Fill
When ABS resin containing moisture in excess of **$0.02\%$ ($> 200\text{ ppm}$)** enters the heated plastification barrel ($220^\circ\text{C} - 250^\circ\text{C}$):
1. **Steam Vaporization & Thermal Degradation:** Water is instantaneously flashed into superheated steam at barrel pressure. Water vapor cannot dissolve into the polymer melt and forms micro-voids and bubbles.
2. **Effective Viscosity Anomaly:** Trapped micro-steam voids alter non-Newtonian shear viscosity and increase flow resistance through narrow cold runners.
3. **Sink Marks (`sink_mark`):** Trapped vapor expansion prevents the packing phase ($P_{hold}$) from transmitting hydrostatic holding pressure to thick ribs and bosses. When the polymer cools and contracts, localized depressions (**sink marks**) develop on the cosmetic surface opposite the structural ribs.
4. **Short Fill (`short_fill`):** As resin melt front advances toward the farthest cavity cavities, increased flow resistance and premature localized skin freeze cause incomplete cavity filling (**short fill**).

---

<!-- page: 58 -->
## [Page 58] Chapter 3: Dehumidifying Dryer Operation & Maintenance

### 3.1 Desiccant Honeycomb Dryer Specifications (Dryer-03)
Machines IM-05 and IM-06 are coupled to dedicated closed-loop desiccant honeycomb dehumidifiers (Model: DryMax DM-100 / Dryer-03).

```
Desiccant Air Quality & Dew Point Operating Ranges:
  - Optimal Dew Point (Target):       -45 °C to -40 °C
  - Operational Warning Threshold:    -30 °C
  - Critical Alarm / Failure Limit:   -18 °C
```

> **CRITICAL PROCESS SPECIFICATION [Page 58, Rule 3.1-D]:**  
> If the process air dew point climbs above **$-30^\circ\text{C}$**, or reaches the failure limit of **$-18^\circ\text{C}$**, the desiccant wheel is saturated or process airflow is choked. At $-18^\circ\text{C}$ dew point, drying air fails to extract moisture from ABS pellets, resulting in residual moisture exceeding $0.02\%$.

### 3.2 Pre-Drying Protocol for New Material Lots
Whenever changing material lots or adding raw pellets from the warehouse:
1. **Drying Temperature:** $80^\circ\text{C} - 85^\circ\text{C}$ (Do not exceed $90^\circ\text{C}$ to avoid resin pellet softening or bridging in hopper throat).
2. **Drying Duration:** Minimum **4 hours** continuous drying at operating dew point $\le -40^\circ\text{C}$.
3. **Moisture Verification:** Verify pellet moisture content with a Karl Fischer titrator or loss-on-drying moisture analyzer before opening hopper feed slide. Value must read **$\le 0.02\%$**.

### 3.3 Dehumidifier Air Filter Maintenance Schedule
- **Intake Dust Filter Cartridge (FLT-DM-04):** Must be inspected every 7 days and thoroughly cleaned/replaced every 30 days. Fine polymer dust and ambient airborne particulates accumulate on the intake filter surface, restricting volumetric airflow across the desiccant rotor.
- **Consequence of Filter Clogging:** Reduced airflow velocity chokes regeneration heat, preventing moisture desorption and driving process air dew point from $-40^\circ\text{C}$ up to $-18^\circ\text{C}$ within 60 minutes.

---

<!-- page: 75 -->
## [Page 75] Chapter 4: Troubleshooting Multi-Cavity Quality Imbalances

### 4.1 Cavity-Specific Short Fill & Sink Mark Diagnostics
When defects occur selectively in only one cavity while other cavities produce acceptable parts:
1. **Inspect Mold Runner Geometry:** Check mold layout blueprint. Cavities situated at the end of the longest runner channels experience the greatest pressure loss ($\Delta P$) and melt cooling.
2. **Evaluate Material Moisture & Rheology:** If the mold runner is longer for a specific cavity (e.g., Cavity #3), that cavity acts as the "canary in the coal mine"—it exhibits sink marks and short fill first whenever material moisture drifts $> 0.02\%$ or dew point drifts $> -30^\circ\text{C}$.
3. **Root Cause Differentiation:**
   - *If ALL cavities exhibit short fill:* Suspect machine injection stroke, screw cushion, or hydraulic pressure fault.
   - *If ONLY the longest-runner cavity exhibits short fill / sink marks:* Suspect raw material moisture ($> 0.02\%$), desiccant dryer filter clogging, or elevated dew point.
