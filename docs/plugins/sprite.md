# zinc:sprite — frames and animations of sprite atlases

`plugins/sprite` (module `zinc:sprite`, pure Zinc) reads the atlases the asset build packs from the rules `"as": "sprite"` of `zinc.json`
(`docs/reports/zinc-next-assets.md`, "Sprites and atlases") and draws their frames with `zinc:gfx` `drawImageRect`. The frames of a page
are rectangles of one texture: the GL renderer draws a scene of them in one batch (game-2d's play scene: 4 draw calls a frame with two
loose images, 3 with its atlas). A frame drawn at its size is the loose image's pixels, at whole and fractional positions.

```json
"assets": { "rules": [{ "match": "sprites/**", "as": "sprite", "atlas": "sprites" }] }
```

```ts
import { onFrame, clear } from 'zinc:gfx';
import { atlas } from 'zinc:sprite';

const sprites = atlas('sprites');                         // its table (sprites.atlas) and its pages, from the packs
const ship = sprites.frame('sprites/ship.svg');           // a frame by the path of its file
const walk = sprites.animation('sprites/hero.aseprite#walk');   // an Aseprite tag
let t = 0;
onFrame((dt: number) => {
  t += dt * 1000;
  clear(0x101418);
  ship.draw(40, 40);                                      // where the whole image would be, at its size
  ship.draw(120, 40, 64, 44, 255, 1, Math.PI / 8);        // stretched, mirrored, turned around its pivot
  walk.frameAt(t).draw(200, 40);
});
```

| API | |
|---|---|
| `atlas(name = 'sprites'): Atlas` | the atlas of that name: `pages` (zinc:gfx images), `frames` (by name), `animations` |
| `Atlas.frame(name)`, `has(name)`, `animation(name)` | a frame: the path of its file in the assets (an `@2x` file without the `@2x`), `file.aseprite#3`, or a sheet's own name; an animation: `file.aseprite` (all its frames), `file.aseprite#tag`, a sheet's tag or animation, or the stem of numbered files (`walk` for `walk_1.png`, `walk_2.png`). Unknown names throw |
| `Frame.draw(x, y, w?, h?, alpha?, flags?, rotation?, tint?, blend?)` | the frame where its whole source image would be drawn on (x, y, w, h) (0: its size, in points); `flags` ImageFlag bits (FlipX, FlipY, Nearest); `rotation` radians, clockwise around the pivot; `tint` 0xRRGGBB; `blend` a Blend mode |
| `Frame` fields | `image` (the page), `x y w h` (texels of the page), `ox oy` (where the trimmed rectangle starts in the source, points), `width height` (the source, points), `scale` (texels a point), `pivotX pivotY` (0..1), `duration` (ms) |
| `Animation.frameAt(ms, loop = true)`, `duration()`, `mode`, `frames` | the frame shown `ms` after the start (`forward`, `reverse`, `pingpong`: there and back, the ends once); without `loop` the last frame stays |

Without its packs (the browser export, a board, `ZINC_PACKS=""`) an atlas has no page and `frame(name)` is the loose image of that name,
drawn whole, so a program keeps drawing; animations need the table. Tests: `tests/t1/sprite_atlas.sh` (tables, pixels at scales 1 and 2,
the interpreter, AOT and QuickJS, the run without packs), `tests/t0/assets.sh` (the importer, its errors, the cache).
