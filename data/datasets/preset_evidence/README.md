# Preset Evidence Benchmark Dataset

Curated industrial visual inspection images representing injection molding defect archetypes and nominal baseline for visual metrology analysis on machine `IM-05` (mold `MOLD-03`).

## Assets & Provenance

| Filename | Defect Archetype | Dimensions | Target Asset / Tool | Description & Ground Truth | Source & License |
|---|---|---|---|---|---|
| `preset_im05_normal.jpg` | `normal` | 1000x750 px | IM-05 / MOLD-03 | Intact molded plastic tray with uniform surface finish and structural integrity matching nominal CAD specifications. | Team photos (Drive knowledge base, 2026-10-12: `Original Image/20261012_224035.jpg`). No third-party licence. |
| `preset_im05_surface_scratch.jpg` | `surface_scratch` | 1000x750 px | IM-05 / MOLD-03 | Linear abrasive scratches and scuff marks across the molded component face. | Team photos (Drive knowledge base, 2026-10-12: `image error/Error_part_4`). Defect variants are digitally edited illustrations of the originals, not real failure photos; no third-party licence. |
| `preset_im05_crack.jpg` | `crack` | 750x1000 px | IM-05 / MOLD-03 | Visible longitudinal surface crack along the molded housing wall section. | Team photos (Drive knowledge base, 2026-10-12: `image error/Error_part_3`). Defect variants are digitally edited illustrations of the originals, not real failure photos; no third-party licence. |
| `preset_im05_fracture.jpg` | `fracture` | 750x1000 px | IM-05 / MOLD-03 | Through-thickness fracture and corner breakage on molded plastic housing. | Team photos (Drive knowledge base, 2026-10-12: `image error/Error_part_7`). Defect variants are digitally edited illustrations of the originals, not real failure photos; no third-party licence. |
| `preset_im05_assembly_gap.jpg` | `assembly_gap` | 750x1000 px | IM-05 / MOLD-03 | Seam gap and perimeter parting line misalignment from uneven thermal shrinkage. | Team photos (Drive knowledge base, 2026-10-12: `image error/Error_part_65`). Defect variants are digitally edited illustrations of the originals, not real failure photos; no third-party licence. |

## Deployment Locations

- Web Application: `apps/web/public/presets/evidence/`
- Mobile Application: `apps/mobile/public/presets/evidence/`
- Standard Web URI: `/presets/evidence/<filename>`
