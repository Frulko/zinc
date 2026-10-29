# tilemap documentation audit

## What it is
Levels from Tiled (`.tmj`) and LDtk (`.ldtk`) maps: layers, IntGrid values, objects and properties, tiles drawn from a sprite atlas, for 2D games.

## Targets and status
`plugin.json`: macos, linux, windows, rpi1, wasm, esp32, ps2 (pure Zinc). Levels need the packs; the browser export and `ZINC_PACKS=""` throw on `load`. The doc has no target table. No backlog line names tilemap.

## What the docs have
- [x] overview (`docs/plugins/tilemap.md`, 41 lines)
- [~] install: the `zinc.json` rule is given
- [x] quick start
- [x] API reference tables (TileMap, Level, Layer, MapObject, Properties) match `index.ts`
- [x] example code
- [~] runnable examples: `examples/platformer`, `examples/marble`, `examples/n3ds-platformer` (not named on the page)
- [ ] screenshots (level in Tiled/LDtk next to Zinc render)
- [ ] tutorial
- [ ] commands
- [~] notes: parallax, flips, packs requirement; what the importer does not read is only a link to a report
- [x] tests: `tilemap` (compares with the editors' exports), `assets`

## What is missing
1. Screenshot comparing a level in the LDtk editor and in Zinc (`tests/t1/tilemap.sh` already renders both).
2. A 6-step tutorial "Your first level": draw in LDtk, add the `tilemap` rule, load and draw, read the Collisions IntGrid for a player, spawn from entities, scroll the camera.
3. Name the examples and link `examples/platformer` and `examples/marble` with a screenshot of each.
4. Copy the "not read yet" list from `docs/reports/zinc-next-assets.md` into the page.
5. Collision recipe (`value(col,row)`, `col(x)`, `row(y)`) as a worked 15-line snippet.
6. Tiled-specific instructions (embedded tilesets, format `.tmj` not `.tmx`) and LDtk setup (save settings).
7. Troubleshooting: "no rule imported it" error, tile index off by one (`frames[i - 1]`).
8. Point to `sprite` (shared atlas).

## Wrong or stale
- No contradiction found with `index.ts` signatures.
- Page title says "levels of Tiled and LDtk maps" but does not state `.tmx` is unsupported; add it.

## Suggested pages
- Tile maps: overview
- Your first level (tutorial)
- API reference (generated)
- Tiled and LDtk setup
- Collisions and objects
- Parallax and camera
- Examples
