# Preset Evidence Benchmark Dataset

Curated visual inspection images for the Kaizen demo: aluminum AL-5083 CNC-02 / tool T07 images (`cnc02/`, third-party licensed) and the injection molding `IM-05` (mold `MOLD-03`) damp-material scenario images (team photos).

## Assets & Provenance

| Filename | Defect Archetype | Dimensions | Target Asset / Tool | Description & Ground Truth | Source & License |
|---|---|---|---|---|---|
| `preset_im05_normal.jpg` | `normal` | 1000x750 px | IM-05 / MOLD-03 | Intact molded plastic tray with uniform surface finish and structural integrity matching nominal CAD specifications. | Team photos (Drive knowledge base, 2026-10-12: `Original Image/20261012_224035.jpg`). No third-party licence. |
| `preset_im05_surface_scratch.jpg` | `surface_scratch` | 1000x750 px | IM-05 / MOLD-03 | Linear abrasive scratches and scuff marks across the molded component face. | Team photos (Drive knowledge base, 2026-10-12: `image error/Error_part_4`). Defect variants are digitally edited illustrations of the originals, not real failure photos; no third-party licence. |
| `preset_im05_crack.jpg` | `crack` | 750x1000 px | IM-05 / MOLD-03 | Visible longitudinal surface crack along the molded housing wall section. | Team photos (Drive knowledge base, 2026-10-12: `image error/Error_part_3`). Defect variants are digitally edited illustrations of the originals, not real failure photos; no third-party licence. |
| `preset_im05_fracture.jpg` | `fracture` | 750x1000 px | IM-05 / MOLD-03 | Through-thickness fracture and corner breakage on molded plastic housing. | Team photos (Drive knowledge base, 2026-10-12: `image error/Error_part_7`). Defect variants are digitally edited illustrations of the originals, not real failure photos; no third-party licence. |
| `preset_im05_assembly_gap.jpg` | `assembly_gap` | 750x1000 px | IM-05 / MOLD-03 | Seam gap and perimeter parting line misalignment from uneven thermal shrinkage. | Team photos (Drive knowledge base, 2026-10-12: `image error/Error_part_65`). Defect variants are digitally edited illustrations of the originals, not real failure photos; no third-party licence. |

## CNC-02 / T07 Image Attribution (`cnc02/`)

Roles: `streak_good` = good part (expected `none`), `qa_defect` = QA defect part, `tool_worn` / `tool_new` = removed T07 insert (expected `replace` / `ok`), `reference` = not used by scripted flows. Files are normalised (EXIF transpose, RGB, long edge <= 1024 px, JPEG q90).

| File | Role | Expected | Source | Author | Licence |
|---|---|---|---|---|---|
| `good_parts_flickr_theleadsa.jpg` | `streak_good` | `none` | <https://www.flickr.com/photos/116341146@N06/19916773638> | TheLeadSA | CC BY 2.0 |
| `good_housing_commons_mitrpak.jpg` | `streak_good` | `none` | <https://commons.wikimedia.org/wiki/File:MITRPAK_aluminum_alloy_housing.jpg> | Whoisjohngalt | CC BY-SA 4.0 |
| `good_part_flickr_tweakie_ring.jpg` | `streak_good` | `none` | <https://www.flickr.com/photos/22267456@N05/7619992542> | tweakie.cnc | CC BY-SA 2.0 |
| `good_part_commons_lampin_components.jpg` | `streak_good` | `none` | <https://commons.wikimedia.org/wiki/File:Lampin_Components_1.jpg> | Whoisjohngalt | CC BY-SA 4.0 |
| `good_inprocess_flickr_zombieite_billet.jpg` | `streak_good` | `none` | <https://www.flickr.com/photos/78593866@N00/10339203625> | zombieite | CC BY 2.0 |
| `defect_scratch_vertical_flickr_ansik.jpg` | `qa_defect` | `scratch_vertical` | <https://www.flickr.com/photos/92132559@N00/3847432987> | ansik | CC BY 2.0 |
| `defect_scratch_flickr_virtually_supine.jpg` | `qa_defect` | `scratch_vertical` | <https://www.flickr.com/photos/14666009@N06/4112344073> | virtually_supine | CC BY-SA 2.0 |
| `defect_gouged_flickr_filterforge.jpg` | `qa_defect` | `scratch_vertical` | <https://www.flickr.com/photos/93421824@N06/9552727137> | Filter Forge | CC BY 2.0 |
| `defect_chipping_flickr_gogovisual_boltholes.jpg` | `qa_defect` | `chipping` | <https://www.flickr.com/photos/23344620@N07/4001710889> | GOGO Visual | CC BY 2.0 |
| `tool_worn_insert_commons_bautsch_cc0.jpg` | `tool_worn` | `replace` | <https://commons.wikimedia.org/wiki/File:Wendeschneidplatte.Wolframcarbid.P1149516.jpg> | Bautsch | CC0 |
| `tool_new_insert_commons_raizy_1.jpg` | `tool_new` | `ok` | <https://commons.wikimedia.org/wiki/File:VHM-WSP-F-45-2.jpg> | Raizy | CC BY-SA 3.0 |
| `tool_new_insert_commons_raizy_2.jpg` | `tool_new` | `ok` | <https://commons.wikimedia.org/wiki/File:VHM-WSP-FDS-2.jpg> | Raizy | CC BY-SA 3.0 |
| `tool_dulled_nonastreda_T5R12B3.jpg` | `reference` | `replace` | <https://data.mendeley.com/datasets/m892d2wtzh/1> | Truchan, Ahmadi | CC BY 4.0 |
| `tool_sharp_nonastreda_T5R1B1.jpg` | `reference` | `ok` | <https://data.mendeley.com/datasets/m892d2wtzh/1> | Truchan, Ahmadi | CC BY 4.0 |
| `tool_flank_wear_sem_adc12_pmc7956700.jpg` | `reference` | `replace` | <https://pmc.ncbi.nlm.nih.gov/articles/PMC7956700/> | Materials 2021, 14, 1054 | CC BY 4.0 |

Licence notes:

- CC BY-SA images (2.0 / 3.0 / 4.0) are share-alike: any crop, resize or other derivative of them must keep the same licence and attribution. The normalisation above (resize / re-encode) is such a derivative and is distributed under the original CC BY-SA licence.
- CC BY images require attribution, provided in the table above. CC0 needs none.
- The reference image `tool_flank_wear_sem_adc12_pmc7956700.jpg` is from an MDPI Materials article marked CC BY 4.0 (verify on the article page).

## Other Image Provenance

- IM-05 images (`preset_im05_*.jpg` in `apps/*/public/presets/evidence/`) are team photos, see the table above.
- Walkthrough images `apps/web/public/knowledge/wt-*.jpg` are AI-generated illustrations committed in #108, not photographs.

## Deployment Locations

- Web Application: `apps/web/public/presets/evidence/` (CNC-02 images in `cnc02/`)
- Mobile Application: `apps/mobile/public/presets/evidence/` (CNC-02 images in `cnc02/`)
- Backend copy (used by Gemini Vision): `data/datasets/preset_evidence/cnc02/`
- Standard Web URI: `/presets/evidence/<filename>`
