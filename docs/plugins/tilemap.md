# zinc:tilemap — levels of Tiled and LDtk maps

`plugins/tilemap` (module `zinc:tilemap`, pure Zinc) reads the maps the asset build imports from the rules `"as": "tilemap"` of
`zinc.json` (`docs/reports/zinc-next-assets.md`, "Tile maps"): Tiled maps (`.tmj`) and LDtk projects (`.ldtk`). A level's tiles are frames
of a `zinc:sprite` atlas, drawn with `drawImageRect`; only the cells whose tiles reach the view are drawn. A level drawn at whole positions
is the editor's render (`tests/t1/tilemap.sh` compares both with their exports).

```json
"assets": { "rules": [{ "match": "levels/**/*.{tmj,ldtk}", "as": "tilemap" }] }
```

```ts
import { onFrame, clear } from 'zinc:gfx';
import { load } from 'zinc:tilemap';

const world = load('levels/world.ldtk');                   // its table (levels/world.ldtk.tilemap) and its atlas, from the packs
const level = world.level('Level_1');                      // '' or nothing: the first level (a Tiled map has one)
const walls = level.layer('Collisions');                   // an LDtk IntGrid layer
const spawn = level.objects[0];                            // an entity: o.type is its identifier, o.props its fields
let camX = 0;
onFrame((dt: number) => {
  camX += dt * 40;
  clear(level.background >= 0 ? level.background : 0x101418);
  level.draw(camX, 0);                                     // the level's point (camX, 0) at the screen's top left; the cells in view
  const solid = walls.value(walls.col(spawn.x), walls.row(spawn.y + 16)) === 1;
});
```

| API | |
|---|---|
| `load(name): TileMap` | the imported map of that file of the assets; throws when no rule imported it |
| `TileMap.level(name = '')`, `levels`, `frames`, `dx`, `dy`, `atlas` | a level by name (LDtk's identifier; a Tiled map's level is named by its file's stem); tile `i` of a cell is `frames[i - 1]`, drawn `dx`, `dy` from its cell's corner |
| `Level.draw(camX?, camY?, viewW?, viewH?, alpha?, flags?)`, `drawLayer(layer, ...)` | the visible layers, bottom first: the level's point (camX, camY) at the screen's (0, 0) (`translate` moves it), each layer shifted by its parallax, the cells within the view (0: the screen's size) and those whose tiles reach into it; `flags` (ImageFlag.Nearest for pixel art at fractional positions) and `alpha` apply to every tile; returns the tiles drawn |
| `Level` fields | `name`, `x y` (its place in the LDtk world), `width height`, `background` (0xRRGGBB, -1: none), `layers`, `objects` (every layer's), `props`; `layer(name)` |
| `Layer` | `name`, `cols rows`, `cellWidth cellHeight`, `x y` (its offset), `opacity`, `visible`, `parallaxX parallaxY`, `tint`, `cells` (tile index * 4 + flips: 1 mirrored in x, 2 in y), `values` (LDtk IntGrid), `objects`, `props`; `tile(col, row)`, `value(col, row)` (0 outside), `col(x)`, `row(y)` |
| `MapObject` | `id`, `name`, `type` (Tiled's class, LDtk's entity), `shape` (rect, ellipse, point, polygon, polyline, text, tile), `x y width height` (in its layer; a tile object stands on x, y), `rotation` (degrees), `tile`, `points`, `props` |
| `Properties` | `has(name)`, `type(name)` (string, int, float, bool, color, file, enum, object, json), `string(name, def?)`, `number(name, def?)`, `bool(name, def?)`; `names`, `types`, `values` |

A map's tiles share the atlas with any other map on the same tileset image; a changed tileset image under `zinc dev` swaps the atlas's pages
into the running program, as for sprites. The levels need the packs: without them (`ZINC_PACKS=""`, the browser export) `load` throws.
What the importer does not read yet is listed in `docs/reports/zinc-next-assets.md`.
