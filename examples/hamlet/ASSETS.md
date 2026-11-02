# Hamlet art: the Cité sprite atlas

The Cité view (`ZINC_HAMLET_VIEW=cite`) draws the old Pixel Plays look with GPU quads. Its sprites come from the same generators as the old view: the Pixel Plays
renderer, `view/models.ts` (trees, rocks, buildings), `view/actors.ts` (people, deer, carried loads), `view/beasts.ts`, with the same light and ramps. They are baked at
the art scale of the old view (1 atlas pixel = 1 art pixel, `S = 10`) and, for zoom 2 and above, again at twice the scale (re-lit, not upscaled). The ground is not
sprites: `src/cite/ground.ts` paints region images per pixel with the old ground painting (`view/scenery.ts` `groundAt`).

## Two modes, same frames

| Mode | What it does |
|---|---|
| `computed` | The sprites are baked at start from the generators and sliced over a few frames. |
| `files` | The exported sheets `assets/atlas/{1x,2x}/*.png` and `index.json` are loaded, nothing is baked. |

Switch: `ZINC_HAMLET_ATLAS=computed|files` (`code` is an alias of `computed`), or the settings panel row "Atlas Cité". Default: `files` when `index.json` carries
the hash of the current generators (`generator`), else `computed`. The hash covers the drawing code version, the group layout and a digest of probe frames (house, pine,
person with shadow, deer): change a model or the light and the shipped sheets are stale, the view bakes instead, and `tests/t1/hamlet_atlas.sh` fails until you export again.

## Groups, poses and names

`index.json` (version 2) lists groups: `name`, `generator` (what draws it), `sheet`, `x, y, w, h` (a cell, 1x pixels), `anchor` (the foot in a cell), `frames`
(columns), `directions` (rows: 8 screen directions from the right, clockwise, or the seasons for trees), and for animated groups `pose: {name, frames, fps, loop}`.
Names are stable: `tree/<species>/<season>`, `rock`, `building/<model>`, `person/<role>/<pose>`, `carry/<load>`, `animal/<kind>/<pose>`, `fx/<name>`.
People: walk, chop, aim, fish, pick, idle. Deer: walk, flee, graze, dead, fall; rabbit, boar and wolf (crouch, howl) likewise. Not exported yet: a sleep pose,
animated props (sails, flames), building footprints larger than 1x1.

## Export

```sh
ZINC_HEADLESS=1 ZINC_HAMLET_VIEW=cite ZINC_SIZE=3400x1500 ZINC_HAMLET_ATLAS_DUMP=<abs dir> zinc run --interp examples/hamlet
```

(`--interp` because the native run enforces the fs permission.) It writes `<dir>/1x/*.png`, `<dir>/2x/*.png`, `index.json` and `atlas-preview.png` (the sheets plus
people, houses, a pine and a deer at 6x). Options: `ZINC_HAMLET_ATLAS_SCALES=1` only 1x; `ZINC_HAMLET_ATLAS_ONLY=person/smith,tree/0` bakes only the groups whose name
starts so, the other cells stay empty (there is no PNG decoder: merge such a partial export into the shipped sheets by hand); `ZINC_HAMLET_ATLAS_CHECK=1` prints
the pixel check of a baked person and house against the old view's own frames (must say `0 differ`). To update the shipped sheets, export into
`examples/hamlet/assets/atlas` and run `tests/t1/hamlet_atlas.sh`, which also checks that files and computed draw the same picture at zoom 1 and 2.5.
