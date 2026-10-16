# Preset Evidence Benchmark Dataset

Curated industrial macro inspection images representing key machining defect archetypes and nominal baselines for visual metrology analysis.

## Assets & Provenance

| Filename | Defect Archetype | Dimensions | Target Asset / Tool | Description & Ground Truth | Source & License |
|---|---|---|---|---|---|
| `preset_flank_wear_vb38.jpg` | `flank_wear` | 800x600 px | CNC-02 / T07 | Flank wear $VB = 0.38\text{ mm}$ exceeding $0.30\text{ mm}$ tolerance limit. Micro-grooves on carbide relief face. | AI synthetic macro photograph generated via Imagen 3 (Prompt: Industrial macro photo of CNC carbide cutting insert showing severe flank wear VB 0.38mm), licensed CC0 / Public Domain dedication. |
| `preset_edge_chipping_t07.jpg` | `chipping` | 800x600 px | CNC-02 / T07 | Localized brittle edge fracture ($0.65\text{ mm}$ notch width) along cutting margin due to thermal shock. | AI synthetic macro photograph generated via Imagen 3 (Prompt: Industrial macro photo of Sandvik WNMG cutting insert with brittle edge chipping), licensed CC0 / Public Domain dedication. |
| `preset_chatter_marks_wp.jpg` | `chatter_marks` | 800x600 px | CNC-02 / Workpiece | Periodic surface waviness pitch $1.2\text{ mm}$, vertical chatter stripes from spindle vibration peak at $4.8\text{ mm/s}$. | AI synthetic macro photograph generated via Imagen 3 (Prompt: Industrial photo of machined steel shaft workpiece with periodic vibration chatter marks), licensed CC0 / Public Domain dedication. |
| `preset_normal_tool_t07.jpg` | `normal` | 800x600 px | CNC-02 / T07 | Pristine TiAlN coated cutting edge. $VB = 0.04\text{ mm} \le 0.30\text{ mm}$. Sharp radius, no micro-fracture. | AI synthetic macro photograph generated via Imagen 3 (Prompt: Industrial macro photo of pristine Sandvik SNMG insert toolholder within nominal tolerance), licensed CC0 / Public Domain dedication. |

## Deployment Locations

- Web Application: `apps/web/public/presets/evidence/`
- Mobile Application: `apps/mobile/public/presets/evidence/`
- Standard Web URI: `/presets/evidence/<filename>`
