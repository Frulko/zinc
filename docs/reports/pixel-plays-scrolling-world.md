# Pixel Plays: a continuous scrolling world

Proposal, 2026-11-01. Goal: let a Pixel Plays game walk through a world bigger than the 360 × 280 window (the pirate game *Droit devant*
today changes scene behind a mist) without breaking the five original games, the quay, the river, the fishing game or Hamlet.

## What Hamlet does

- A village is bigger than the window, so its **ground is baked once per zoom level into a `Layer`** (pix, depth, kind, tile, tuft per pixel). The camera is the position of the
  W × H window over that layer; `loadWindow` copies the visible part into the renderer's buffers.
- `setView(S, originX - camera.x, originY - camera.y)` shifts every projection by the camera, so cached models, people, deer and smoke are drawn the same way whatever the camera.
  `resizeBuffer` lets the window be wider when zoomed out. Depth is camera independent (`d = v·cos + z·sin`), which is what makes a baked layer reusable.
- Every static object is a `CachedModel` stamped with `drawAt` and culled with `onScreen`.
- On a pan, `rebakeStatic()` redoes the whole static picture: `loadWindow`, dirt, trees, rocks, buildings, `bakeOcclusion`, static shadows, tuft list.
  That is fine for a mouse drag or an edge scroll. It is **not** a walk: see below.

## What it costs (measured on the dev Mac, jungle scene of Droit devant)

| step | default engine | interpreter |
|---|---|---|
| bake of one scene (ground, 22 trees, occlusion, shadows) | 325 ms | 222 ms |
| one frame, the whole pipeline | 28 ms | 33 ms |
| copy of the two baked buffers | 5.9 ms | 3.6 ms |
| `shadeEdges` | 4.2 ms | 4.3 ms |
| `bakeOcclusion` alone | 57 ms | 55 ms |

The game poses at 24 per second: 41 ms a frame. A frame already takes 28 ms, and `bakeOcclusion` alone is 1.4 frames. So rebaking per camera step is out, and
simply adding a `loadWindow` to the current frame leaves nothing for the rest. Two things have to change: bake **ahead and in slices**, and make the frame **proportional to what moves**.

## Proposal: `ScrollLayer`, an additive module

### 1. A world made of chunks, baked ahead

- The static world is stored at a fixed scale in **chunks** (core 128 × 96 pixels, 24 pixels of margin so occlusion, shadows and tree crowns cross the seams).
- A chunk is baked by the **existing bake code**, unchanged: `setView(S, ox, oy)` points the renderer's buffer at the chunk, the game's painter runs (ground, trees, signs), the core is copied into the chunk store
  (pix, depth, kind, static-shadow flag, tuft pixels, captured leaf pixels with their chunk offset).
- A painter is a pure function of the chunk coordinates and a seed (`hash`), so the world is endless, deterministic and **revisitable**: the original's "lost in the jungle" comes back as a seed mapping.
- Baking is **time-sliced**: ground, objects, occlusion on the chunk's rectangle, store, each stage under about 8 ms, at most one stage per frame, ring of chunks ahead of the walking direction.
  Walking at 70 px/s needs a new 128 px chunk about every 1.8 s, so a 100 ms chunk spreads over a dozen frames with room to spare. Chunks behind are dropped (a 3 × 3 ring is about 0.4 MB).

### 2. A frame proportional to what moves

- `loadWindow` becomes row copies from the chunk store (a `copyRows` primitive in the engine, native, under 1 ms instead of 4 to 6).
- `shadeEdges`, `applyShadows` and the mist run on **dirty rectangles** (pirate, gull, wave band, footprints: about 40 × 40 pixels each) instead of the whole window; edges and static shadows of the chunk are already baked.
  Estimate: 28 ms becomes about 10 ms. To be proven by measure, not assumed.
- Leaves and tufts are per-chunk lists drawn with the camera offset and culled to the window (the wind keeps its 8 per second stepping).
- Dynamic things (pirate, gull, swells, footprints, items) are drawn through the same projection, so they need no change except the origin.

### 3. The camera

A follow camera with a dead zone, moving by whole pixels at the pose cadence, clamped by nothing (the world is endless). `ZOOM_SCALES` and `resizeBuffer` of Hamlet stay available for a cinematic zoom.
The mist stays, now as a vignette that hides the chunk being baked and the world beyond the window.

## What changes in the shared renderer (all additive, defaults reproduce today)

1. `bakeOcclusion`, `applyShadows`, `shadeEdges` take an optional rectangle.
2. `copyRows(dst, dstOffset, src, srcOffset, count)` native primitive.
3. Leaf and tuft capture exported with an offset (today they are module-private lists tied to the window).
4. Hamlet's `Layer` class moves to a shared file; Hamlet adopts it later, when someone touches it.

## Proof that nothing breaks

1. Rectangle variants and `copyRows`: the existing goldens (`last_boat_art`, `pixel_plays`, Hamlet's capture) are byte for byte identical.
2. **Seam test**: a window assembled from chunks equals the same window from one big bake, pixel for pixel, on a static scene (the check that matters most).
3. Pirate game: endless jungle strip, no scene change, N/S included; scripted walk, frame time gate (96th percentile under 16 ms for the frame, under 8 ms for any bake slice), then the usual visual check.
4. Not claimed until measured: the other engines (AOT, QuickJS) and slower devices.

## Risks

- Seams: depth ties and shadows at chunk borders (margin plus the seam test cover it).
- Wind phase continuity of leaves across chunks (phase from world position, not from the chunk).
- The 8 ms slice target depends on the engine; if one stage is bigger, it is split again.

## Order of work

Rectangles and `copyRows`, then `ScrollLayer` with the seam test, then the pirate world on it, then Hamlet's `Layer` if wanted. The scene change currently in `examples/pixel-plays/src/native/straight` stays as the fallback until the endless world passes its gates.

## Status, 2026-11-01

Done and proven:

- `renderer.ts`: the layer pixel origin (`PX`, `PY`) read by every pixel pattern and by the projection; `growGrass` seeds on layer pixels; `drawTuftList` and `drawLeafList` draw a list moved by an offset (`drawTufts` and `drawLeaves` call them with 0, so the five games and Hamlet draw the same); `enterBake`, `leaveBake` swap in a private buffer set so a chunk bakes without touching the frame on screen.
- `scroll.ts`: `ScrollLayer` (chunks, slices of a bake, `missing`, `drop`, `load` into the baked buffers, `wind` for grass and leaves) and the `ScrollPainter` contract (a pure function of the layer position, canonical object order, step 0 = ground and grass).
- `tests/t0/scroll_seam.sh`: a world of ground, tufts, trees with captured leaves, rocks and shadows is baked as 3 x 2 chunks and as one piece; colours, ground masks, kinds, static shadows, tuft and leaf counts are identical (depth within 1e-9: float rounding of the origin). With a 2 px margin the same test fails on dozens of pixels, so it does see seams. Interpreter and default engine.
- Measured (default engine, 128 x 96 chunk, margin 12, dev Mac): ground 8 ms, objects 8 to 11 ms, occlusion 13 to 14 ms, copy of the core 3.5 ms: a chunk is baked in four slices, the largest 14 ms (occlusion; it can be cut in two bands); `load` of a 360 x 280 window 5.9 ms.

Pirate world (done, 2026-11-01):

- `straight/state.ts` places tiles side by side in the world (`world`, `place`, `placeBeside`: a north or south tile is shifted so its gap lines up). `lookahead` asks the rules for the tile behind an exit a little before the pirate gets there (`peekExit` changes nothing: the run state and the generator are put back) and places it, so it is baked before it is seen; `crossExit` runs the rules for real and keeps that tile when it is what they give. A tile that would land on tiles in view, or the beach again, is a jump (`needsJump`) and keeps the mist fade.
- `straight/scenery.ts`: `PirateWorld` is the painter (ground by layer pixel, walls and extras per tile, objects culled before they are drawn); `render.ts` draws every visible tile's moving things in its own frame; `StraightGame.ts` follows the pirate with a dead zone, bakes one slice a pose ahead of him, keeps a changed chunk on screen until its new bake replaces it.
- Browser export (headless Chrome, a pointer held to walk east, 15 s): 60 frames/s, JavaScript time per frame mean 2.2 ms, p95 6 ms, p99 8.7 ms, one frame of 20 to 26 ms; a draw 3 ms, a bake slice 3 to 12 ms.
- Native frame (dev Mac, same walk): AOT (`zinc build`) about 3 ms a draw, like the browser; `zinc run` (the interpreter, also the default engine) 30 ms before and about 19 ms after restricting the load, the copy, the shadows, the edges and the wind to the shown rectangle (load 8.5 to 4.1, copy 4 to 2, shadows 4.6 to 2.6, edges 5 to 3.3). The cost is the interpreter's array loops, not the game.

Not done:

- A row-copy primitive for arrays (the interpreter pays about 40 ns an element) and the rest of the interpreter's array speed.
- `last_boat_art` fails on develop for a reason of its own: `examples/pixel-plays/src/harbor/state.js` no longer exports `study` (the JavaScript harbor).
