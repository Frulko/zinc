# Official Murdoku reference collection

Public sources retrieved on 1 November 2026 at the owner's explicit request. Original game and artwork: Manuel Garand / Murdoku.

Open [index.html](index.html) locally for the searchable gallery and tint preview. No server or package install is required.

| Folder / file | Contents |
| --- | --- |
| `puzzles/en/` | 42 public puzzle files actually requested by the logged-out page; original bytes preserved. |
| `sources.json` | URLs, sizes and SHA-256 hashes of these puzzle files. |
| `catalog.json` | The public catalogue contains 73 entries; this is not a claim that all 73 are visible or playable. |
| `analysis.json` | Sizes, difficulty labels, source versions, object IDs and conservative structural statistics. |
| `asset-library/objects/` | 268 SVGs: furniture, variants and multi-cell object tiles. |
| `asset-library/textures/` | 16 floor textures. |
| `asset-library/portraits/` | 345 SVGs: templates, bodies, clothes, hair, hats, facial details and accessories. |
| `asset-library/objects.json` | 149 object catalogue entries with IDs, names and occupiability. |
| `asset-library/portrait-colors.json` | 10 skin, 21 hair and 21 clothing colour entries. |
| `asset-library/portrait-proportions.json` | Body-specific layer scaling and offsets present in the shipped constants. |
| `asset-library/manifest.json` | Provenance and checksums for all 629 SVGs. |
| `24h-delivery/` | Its original puzzle data, 37 SVGs plus stylesheet, 6 assembled portrait captures, layer styles, tint filters and exact RGB/CSS palettes. |

The SVGs were decoded from embedded data URIs or downloaded from URLs declared in the public application chunks:

- <https://murdoku.com/play/assets/app-core--JsLR4BI.js>
- <https://murdoku.com/play/assets/GameScreen-Bm8Aqj6V.js>
- <https://murdoku.com/play/assets/puzzle-core-Cla4GAxx.js>

The 42 cases range from 5×5 to 16×16, with one 9×10 board and casts of 5–16 people. They provide comparison data, not automatically translated constraints: the text clues still need formal semantic annotations before our solver can validate them. The analysis explicitly records its limits around subareas, ships and natural-language interpretation.

Rebuild statistics with `python3 examples/murdoku/authoring/analyze_official.py`; validate the archive with `tests/run --only murdoku_references`.

This collection is kept outside the prototype's runtime assets. No redistribution licence is presumed, no copied puzzle is presented as a newly generated case, and nothing was published. The gallery and analysis are our own reference tools; the original SVG and puzzle files remain official content.
