# Hamlet and engine fluidity profile (2026-11-01)

Owner request: find what blocks smooth movement, zoom and general fluidity, with Hamlet as the workload, and fix the worst offenders in the engine or in the game.

## Method

- Probe: `ZINC_HAMLET_PERF=<n>` (examples/hamlet/src/ui/PerfTrace.ts) prints, every n drawn frames, the frame time p50/p95/p99/max, hitches (frames over twice the median), the split of a frame (update, village picture, upload, interface) and the bake counters; the last `perf-total` line is the whole run.
- Village: `ZINC_HAMLET="3,<size>,0"` (seed 3, preset Vallee), sizes 24, 64, 96, with the animals the generator places (43, 311 and 702 slots). No built village: the roads and houses of `session.input` were not scripted at every size (not measured).
- Scenarios (`ZINC_INPUT`, window 1100x900, `ZINC_HEADLESS=1 ZINC_BACKGROUND=1`): idle; pan (four arrow keys held 150 frames each); drag (right button drag, 300 frames); zoom (wheel: 5 in, 10 out, 5 in, one notch per 30 frames).
- Engines: `--interp` (what `zinc run` does by default), `--native` (AOT, what a built app does). QuickJS was run for output parity only: its clock steps by 50 ms in this mode, so its frame times are not usable here.
- Profiler: `zinc profile src/main.ts` (sampling, 1 kHz, CPU time) from the hamlet directory, with its folded stacks.
- Machine: the shared M1 Pro, other agents building and testing. Every row records the load average; the rows below were taken at load 4 to 10 (under 10 cores), before and after in the same conditions, the frame times of an AOT process on its own core hold at that load. No number was taken above load 10; the first runs at load 15 to 70 were thrown away. Windowed (Metal present) runs were tried once and are inconclusive (see "What was not measured").
- Pixel check: every change below was compared byte for byte (`cmp`) on `ZINC_SHOT` frames of the pan and zoom scenarios, before against after, interpreter at size 24 and AOT at size 64 (10 frames), and on the 3 frames of `tests/data/hamlet/session.input` (AOT): identical.

## Findings: the top 5 blockers

1. **Zoom step: 100 to 400 ms (AOT), 350 to 1250 ms (interpreter).** `setZoom` rebakes the whole window at the new level. CPU split of a step on the interpreter (size 64): ground painting (`paintChunk`) 25 %, occlusion bake 24 %, models of the level (`useModels`, first visit of a level) 22 %, the 9 buffer reallocations of `resizeBuffer` 4 %, the rest model drawing, tufts, edges.
2. **The ground layer of a level was a flat array of every pixel of the map.** At size 96 and the closest zoom, 5830 x 3150 pixels, two arrays of 18 M slots, allocated by a callback per element when zooming to a level: 700 to 860 MB resident after a zoom run, and the largest single cost of the step (`bakeLayer` 17 % of the CPU of a zoom run).
3. **Panning slid six full-window buffers one element at a time** (`shiftNumbers`, `shiftColors`: 29 % of the CPU of a pan on the interpreter; 2.3 ms for one 140 k array even on AOT, against 0.02 ms for `copyWithin`). `Array.copyWithin` existed in the engine; the game did not use it.
4. **The idle frame processes the whole window.** `drawVillage` merges the dirty rectangles of the animals into their bounding box; with 55 to 65 animals in view (every rectangle is 44 x 46 px for a sprite of about 20 x 12) the merge chain becomes one rectangle of 108 216 px, the whole window, on every frame: restore from the static picture, redraw, edges (`shadeEdgesRect` 20 to 27 % of an idle frame), tufts. That is why the idle frame grows with the map (12.5, 21.7, 24.9 ms on the interpreter at sizes 24, 64, 96) and why "cost follows what moves" does not hold with herds. A disjoint cover of the same union brings the area to about 65 % and is pixel-identical (tested), but was slower on AOT (+5 %) and only 8 % better on the interpreter, so it was reverted. A real fix needs tight sprite bounds (the atlas knows them): left in later.md.
5. **The interpreter is 5 times slower than AOT on the pixel loops** (idle frame 13.3 ms against 2.7 ms at size 24). Everything per pixel (restore, edges, tufts, bake, occlusion) is a JS loop; on the interpreter that is the whole frame. There is no bulk copy or fill between two arrays (only `copyWithin` inside one): `pix[i] = bakedPix[i]` rectangles, `copyInto`, the rectangle restores stay loops. A cross-array native (`Array.prototype.set` style) is the missing engine piece: later.md.

Also seen, not fixed: `Array.from({ length: n }, () => 0)` called the callback n times (the window buffers, 9 arrays per zoom step, and every pixel-plays game); the idle frames at size 96 on the interpreter p95 31 ms (animals); the first bake of a new village (88 ms AOT).

## Fixes

| # | Change | Where | Effect |
|---|---|---|---|
| F1 | The slides use `copyWithin` (one memmove) | `examples/hamlet/src/view/scenery.ts` `shiftNumbers`, `shiftColors` | interpreter pan p50 -35 % to -42 %, drag -29 % to -40 %; AOT pan p50 -8 % to -18 % |
| F2 | The ground is kept by chunks of 32 x 32, made when first painted or written | `scenery.ts` `Layer`, `openChunk`, `cellKind`, `loadRect`, `paintChunk` | size 96 after a zoom run: 773 MB to 208 MB resident, peak 872 MB to 178 MB; AOT zoom p99 at size 96 248 ms to 125 ms |
| F3 | `Array.from({ length: n }, () => literal)` is one fill (`__arrayFilled`: the callback runs once, `length = n`, `fill`) | `src/frontend/check.cpp`, `src/frontend/modules.cpp`, test `array_from_filled` | allocation of the window buffers on every zoom step, every game's buffers: `resizeBuffer` 285 ms to 100 ms of CPU in a zoom run |
| F4 | While the camera rests (20 frames), the ground under the window is painted at the zoom levels next to this one, 4 rows of a chunk at a time, at most 4 ms a frame | `scenery.ts` `warmGround` | AOT zoom, 90 frames between notches, size 96: worst step 295 ms to 180 ms, p99 165 to 90 ms. Cost: the first seconds after a stop are 3 to 4 ms slower per frame (idle p95 5.7 to 8.2 ms at size 64 on AOT); the step still takes 90 to 180 ms |
| F5 | PerfTrace probe | `examples/hamlet/src/ui/PerfTrace.ts` | the tool |

F1 and F2 reached `develop` inside another agent's commit of `scenery.ts` (`1d122035d`); F3 is `6bd6a1fbc`, F4 `334a4c730` and `caff66ca9`, the probe `549578809` and `2bbb3a444`.

Tried and dropped (measured, no gain or a loss): drawing the water glints as loose pixels instead of rectangles (the animals, not the river, fill the window: no change at the river preset); a disjoint cover of the dirty rectangles (see 4).

## Before and after

Frame time in ms between two drawn frames, `perf-total` of each run (matrix files: `matrix-before.txt`, `matrix-after3.txt`, `matrix-after3n.txt` in the session scratch). "p50 / p95 / p99 / frames over 50 ms". The after tree has F1 to F4 and the F3 engine; the before has none (the first before rows ran on the engine without F3).

### AOT (`--native`)

| size | scenario | before | after |
|---|---|---|---|
| 24 | idle | 2.81 / 3.19 / 3.39 / 0 | 2.86 / 3.45 / 7.28 / 0 |
| 24 | pan | 3.34 / 5.75 / 7.71 / 0 | 2.65 / 6.97 / 9.83 / 0 |
| 24 | drag | 3.30 / 4.24 / 4.99 / 0 | 2.53 / 5.57 / 7.08 / 0 |
| 24 | zoom | 3.08 / 62.6 / 105 / 17 | 3.26 / 52.2 / 89.5 / 16 |
| 64 | idle | 4.54 / 5.66 / 7.67 / 0 | 4.95 / 8.20 / 9.22 / 0 |
| 64 | pan | 5.81 / 9.55 / 12.1 / 0 | 5.32 / 10.9 / 16.4 / 0 |
| 64 | drag | 4.87 / 5.96 / 7.34 / 0 | 4.23 / 7.55 / 9.38 / 0 |
| 64 | zoom | 4.99 / 99.2 / 186 / 19 | 5.22 / 78.4 / 119 / 19 |
| 96 | idle | 4.94 / 5.97 / 7.44 / 0 | 5.14 / 8.35 / 9.92 / 0 |
| 96 | pan | 7.02 / 12.1 / 14.6 / 0 | 5.87 / 11.2 / 13.5 / 0 |
| 96 | drag | 5.88 / 9.70 / 12.0 / 0 | 5.12 / 8.51 / 10.7 / 0 |
| 96 | zoom | 5.31 / 111 / 248 / 19 | 5.63 / 81.2 / 124 / 19 |

The AOT frames stay under the 16.7 ms of 60 Hz everywhere except the zoom steps (19 frames over 50 ms in the run: every one of the 20 notches). The idle p95 is higher after: that is F4 spending its 4 ms a frame while resting.

### Interpreter (`--interp`, what `zinc run` does)

| size | scenario | before | after |
|---|---|---|---|
| 24 | idle | 12.5 / 13.9 / 14.5 / 0 | 13.8 / 18.6 / 19.9 / 0 |
| 24 | pan | 23.7 / 34.3 / 43.0 / 2 | 13.8 / 21.9 / 31.6 / 0 |
| 24 | drag | 23.8 / 29.2 / 39.1 / 2 | 14.1 / 19.2 / 21.3 / 2 |
| 24 | zoom | 14.0 / 351 / 598 / 20 | 17.5 / 317 / 536 / 20 |
| 64 | idle | 21.7 / 25.9 / 32.7 / 0 | 23.6 / 29.8 / 32.7 / 0 |
| 64 | pan | 39.1 / 56.1 / 68.5 / 41 | 28.5 / 45.8 / 55.8 / 27 |
| 64 | drag | 31.7 / 38.5 / 44.5 / 3 | 22.7 / 31.0 / 41.9 / 2 |
| 64 | zoom | 22.9 / 584 / 979 / 43 | 27.3 / 455 / 733 / 43 |
| 96 | idle | 24.9 / 31.1 / 35.8 / 0 | 26.9 / 36.5 / 49.2 / 2 |
| 96 | pan | 43.2 / 67.0 / 71.5 / 71 | 32.1 / 55.4 / 59.7 / 56 |
| 96 | drag | 38.4 / 44.6 / 61.3 / 11 | 28.4 / 35.7 / 60.0 / 6 |
| 96 | zoom | 26.8 / 705 / 1257 / 47 | 30.1 / 489 / 777 / 51 |

Memory (resident, AOT, zoom run): size 24 181 MB to 132 MB; size 96 691 to 774 MB (two runs) to 170 MB (peak footprint 862 MB to 148 MB). Idle: size 24 68 MB to 43 MB; size 96 191 MB to 49 MB.

## What remains

- Zoom is still a hitch: 90 to 190 ms on AOT, 350 to 1200 ms on the interpreter, one per notch. The window is rebaked whole (occlusion bake 24 %, the models of a level on its first visit, the models and the tufts search). The next steps, by weight: bake the new level in slices into the second buffer set the renderer already has (`enterBake`/`leaveBake`, made for the scrolling chunks) while the old picture is shown scaled, then swap; or keep one baked window per neighbouring level and swap when the village is unchanged. Warming the models of the neighbour levels at rest.
- The idle frame on the interpreter (13 to 27 ms) and the AOT idle that grows with herds: tight sprite rectangles, a cross-array native copy, edges skipped where nothing was redrawn.
- The camera is stepped (pan by pixel, zoom by level); easing was not attempted.
- Hamlet's rules test (`tests/data/hamlet/rules.ts`) fails at the base I measured on (2 checks, then a null reference): not caused by this work (the same on the untouched tree); the T1 session frames are byte-identical before and after.

## What was not measured

- A windowed run (Metal present). One try at load 4 with `ZINC_PRESENT_STATS=1` showed the present itself cheap (raster 0.9 ms, upload 0, draw 0.1 to 7.4 ms, interval p50 16.5 ms on vsync) but the village draw at 17 to 21 ms in the first 150 frames against 5 ms headless, with other agents running windows: inconclusive, no number is claimed.
- QuickJS frame times (clock steps of 50 ms in this mode); its outputs were compared (identical) through the existing tests only for the engine change.
- A built village (roads, houses, people) and zoom levels 0 to 10 one by one: the scripted zoom walks levels 5 to 0 and back to 10 and then 5.
- The first runs (load 15 to 70) are discarded.

## Fluidity pass (2026-11-01, second part)

Same method as above (headless, `ZINC_HAMLET="3,<size>,0"`, 100-frame windows, load 4 to 7). T0 is HEAD's view code, T1 the new code; both drive the same scripted input.

### 1. Zoom step (AOT, scripted zoom walk 5 to 0 and back to 10 and 5)

| Size | | p50 | p95 | p99 | max | frames over 50 ms |
|---|---|---|---|---|---|---|
| 24 | before | 4.24 | 7.22 | 71.3 | 106.2 | 13 |
| 24 | after | 3.49 | 10.6 | 16.4 | 26.6 | 0 |
| 64 | before | 8.05 | 17.1 | 96.7 | 176.3 | 19 |
| 64 | after | 7.84 | 17.5 | 25.9 | 40.5 | 0 |
| 96 | before | 8.18 | 20.8 | 102.3 | 189.5 | 18 |
| 96 | after | 8.19 | 20.2 | 28.6 | 45.2 | 0 |

The new level is baked in 4 ms slices into the second buffer set while the old picture is shown scaled and eased, then swapped; the neighbours' models are baked at idle (`warmModels`), once per level, season and window size. The frame count is higher after because the glide draws the frames it takes. Pixels: 20 shots over AOT 24, AOT 64 and interpreter 24, 0 differ. Interpreter, size 24: max 698.6 to 70.9 ms, over 50 ms 20 to 10 frames (p50 18.7 to 20.6, the glide frames are drawn).
A first version re-entered the neighbour bake on every idle frame (idle p50 2.5 to 6.2 ms); the guard on a ready key brought idle back to 2.4 (24) and 4.1 (64) ms, as before.

### 3. Camera easing (AOT)

| Size | Scene | | p50 | p95 | max | frames over 17 ms |
|---|---|---|---|---|---|---|
| 24 | pan | before | 2.40 | 5.83 | 8.9 | 0 |
| 24 | pan | after | 1.95 | 5.75 | 12.0 | 0 |
| 24 | drag | before | 2.77 | 5.90 | 7.1 | 0 |
| 24 | drag | after | 2.26 | 5.90 | 11.6 | 0 |
| 64 | pan | before | 4.94 | 11.4 | 19.9 | 1 |
| 64 | pan | after | 3.54 | 9.49 | 13.9 | 0 |
| 64 | drag | before | 4.70 | 7.89 | 10.6 | 0 |
| 64 | drag | after | 3.72 | 7.53 | 13.7 | 0 |

Velocity and damping for keys and edge pan, inertia after a drag, eased jumps (minimap, messages), time-based so the frame rate does not change the motion. The pan moves in whole pixels (no shimmer) and `pauseOnMove` is kept.

### 4. Bulk copy

`Array.prototype.set(source, offset?)` on the interpreter, AOT, QuickJS (polyfill) and the checker; test `tests/t0/array_set.sh` on four engines; used in the bake and restore loops.

### 2. Idle frame and the map size: not done

No tight-rect change landed: the per-kind extents could not be separated from the other things drawn in a first probe, and a disjoint cover was +5% on AOT before. Left in `backlog/later.md`.

### 5. Windowed (Metal), size 64, load 4 on a shared Mac (not quiet)

| Scene | | p50 | p95 | max |
|---|---|---|---|---|
| zoom | before | 42.6 | 321 | 1149 |
| zoom | after | 29.3 | 48.4 | 362 |
| pan | before | 18.6 | 50.3 | 338 |
| pan | after | 17.4 | 47.0 | 347 |

The windowed frame is bound by the presentation, not the village; the max of 340 ms is the first frames (window and GPU setup). Not measured: QuickJS (its clock steps 50 ms) and a quiet machine.
