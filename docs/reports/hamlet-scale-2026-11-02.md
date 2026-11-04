# Hamlet at scale: stress pass (2026-11-02), PARTIAL

Status: partial. The pass was stopped twice; what is here is measured and committed, what is missing is listed under "Not done". Machine: M1 Pro shared with other agents, load average 4.3 to 10.5 (recorded per run in the runner output). Binary: the main tree's `build/zinc` (no C++ changed in this pass). Runners: `tests/data/hamlet/stress.sh` (game, Cite view, headless or windowed), `stress-sim.sh` + `stress.ts` (generation and simulation, headless), `stress-walk.input` (zoom sweeps, four-side fast pan, drag, wheel storm, edge pan), `tests/t1/hamlet_ground.sh` (the black-ground test).

## Fixed in this pass

| Item | Evidence | Verdict |
|---|---|---|
| `ZINC_HAMLET_CROWD` crash 'array index out of bounds' (not STILL) | crowd people had `job = -1`; `updateWorker` indexed `world.buildings[p.job]` | fixed: crowd gives each walker a home and a job; crowd animals are exactly the number asked (it kept the generator's herd on top); third crowd number = buildings |
| Generation quadratic in animals | `spawnDeer` scanned the whole herd for a free slot: 63 % of CPU at 512 | fixed (`append` flag): 512 tiles 12.4 s to 3.1 s, 256 1.3 s to 0.7 s, same world hash on every size |
| Black ground while the camera moves (owner bug) | `drawGround` drew regions whose first slice had started but whose pixels were not uploaded (blank image), and nothing was under missing regions | fixed: whole-map overview image (1 px a tile, 0.3 s at 256) drawn first, only ready regions drawn, bake queue by distance with look-ahead along the camera velocity, more budget while a view region is missing; test `hamlet_ground` fails (3.4 M background pixels) with the overview off and passes with it |
| Simulation hitches at 2000 people (windowed frame p50 945 ms, `update` 900 ms) | transport searches (`findLoad`, `fetchInput`, `haulOut`, `nearestStore`) each ran a whole-network search (20 000 tiles, about 35 ms) per idle porter per tick, plus an O(buildings) scan; freeTime scanned all buildings per resident | fixed: search debt (`path.ts` `pathBusy`, `payPathDebt`, 6000 tiles a tick): optional searches (porters, visits, strolls) wait while earlier ones are owed; planned trips always run; free places cached per revision. Stress sim people part 4.6 to 1.1 ms/tick |
| Animals: drink search scanned the whole map (1 M tiles at 1024), explored the whole radius | profile `goDrink` 11 % self | fixed: search stops at the first shore (exact, same tile), shore mask cached, failures cached per 4x4 cells for a minute, herd moves use A* toward the goal |

## Numbers

Generation (`stress-sim.sh --native`, headless, load 5 to 7, gen only):

| size | before | after | trees / rocks / lodes / animals |
|---|---|---|---|
| 128 | 389 ms | 389 ms | 1727 / 1307 / 62 / 1245 |
| 256 | 1286 ms | 700 ms | 8332 / 4529 / 287 / 5003 |
| 512 | 12374 ms | 3087 ms | 32663 / 18221 / 1129 / 19993 |
| 1024 | not run | 12161 ms (244 MB RSS) | 132365 / 77078 / 4506 / 79988 |

The deposit generator (`gen/deposits.ts`) is no longer the cost: its share at 512 is 4.8 % self (`terrain` 15 %, `biomePass` 16 %, `touches` 11 %, `nearby` 11 %, `hash` 10 %); generation is linear in tiles after the fix (about 12 us a tile). The animal count the generator places grows with the area (80 000 at 1024): see "what remains".

Simulation step at 256 (1000 buildings, 2000 people, 1000 animals, 2560 ticks = 4 days, ms per tick, load 7):

| | mean | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| before | 12.4 | 4.3 | 38.7 | 69.5 | 160.7 |
| after | 6.3 | 3.2 | 21.5 | 36.1 | 161.6 (the first tick: everybody wakes) |

Parts after: people 1.1, animals 5.0 (1300 animals, about 3.7 us each), day 0.2. The real-time budget at x1 is 31 ms a tick; p99 36 ms is still over it.

Game, Cite view, windowed Metal (`WINDOWED=1`, load 6), size 256, 2000 people, 1000 animals, 1000 buildings, zoom 1:
- before: frame p50 945 ms, p95 1820 ms (`update` p50 897 ms); first minute unplayable. After the porter and visit fix: p50 55 to 105 ms with `update` p50 25 to 69 ms (the simulation: 2000 workers on random jobs of the debug crowd, not a balanced village) and `village` 13 ms p50 / 61 ms p99 (bake slices of 47 to 62 ms windowed, against the 3 ms budget: the slices are not bounded by their budget, one diagonal of a 512 px region is that expensive there).
- STILL=1 (simulation off), scripted walk, windowed: frame p50 16.5 ms (vsync), p95 18.1, p99 35 to 93, max 1003 ms (first frames); present `draw` p50 10 to 14 ms on the 60 Hz pace, `raster` 0.5 ms. 770 of 2000 frames over 17 ms. Headless frames are not comparable (0.2 ms: nothing is rasterised).
- memory: resident 300 MB headless, 410 to 690 MB windowed at 256; peak footprint 1.25 GB.
- region bakes: 60 to 87 regions in the walk, 3.9 s of bake CPU headless (first regions about 450 ms each, 1.7 us a pixel), 12 to 16 s windowed under load.
Not measured: 512 in the game, interpreter windowed, `tools/resmon`, p99 tables for every scenario (see below).

## Engine findings (ranked)

1. **Baking region textures on the CPU, per pixel, in the interpreter language (HIGH).** Evidence: first regions 450 ms headless AOT, 1.7 us a pixel, `groundAt` (the old view's shader) 26 % of a startup profile, `tri` 38 %, 3.9 s of bake for the first regions at 256; windowed slices of 47 to 62 ms against a 3 ms budget. Cause: no render-to-texture with alpha (`beginImage` targets are opaque, so every translucent layer takes the CPU path), no GPU shader path for generated art. Verdict: needs a task: render-to-texture with alpha for `zinc:gfx` images (a ground region is a draw of cached tile images onto a target), and a way to run the bake in the background.
2. **No job system with shared memory (HIGH).** `zinc:worker` (`lib/std/worker.ts`) passes messages with copy or a `transfer` of `u8[][]`; there is no shared array. A region bake or the generator in a worker needs the world arrays copied in (8 arrays of n squared) and the pixels copied back (1 MB a region). Verdict: needs a task: SharedArrayBuffer-like typed memory read by workers, or `transfer` for `u32[]`; then move generation (3 s at 512, 12 s at 1024) and region baking off the frame thread. Not attempted here: the ground shader needs the whole `view/scenery.ts` in the worker.
3. **Frame budget is not enforced inside a bake slice (MEDIUM).** Evidence: `worst slice 47 to 62 ms` windowed with a 3 ms budget (the deadline is checked per tile diagonal and the first slice always runs). Verdict: fixed in part (smaller budget unit not done); proposed: slice by tile rows of 8, deadline per row.
4. **Profiler gaps (MEDIUM).** `zinc profile` is CPU-sampled on its own engine: it showed 900 ms of CPU for a 3000 ms run (512 generation) and a different profile from the AOT run (a closure `lambda358` at 22 % with no name). It cannot see GPU time, texture upload, present or vsync wait (`ZINC_PRESENT_STATS` does: `draw` p50 10 to 14 ms in the windowed walk is the only GPU-side signal, and it blends wait and work). Verdict: needs a task: sample the AOT binary, name closures by their enclosing function and line, report upload bytes and ms per frame.
5. **Bulk typed operations (MEDIUM).** Still missing: cross-array `set`/copy (pixel loops `pix[i] = baked[i]`), `Array.from({length}, cb)` was fixed earlier; `fill` exists. `ovBuf.fill` and `buf.fill` are used. Verdict: needs a task (`Array.prototype.set`/`subarray` copy), as in the 2026-11-01 report.
6. **Interpreter about 5x slower than AOT on pixel loops (MEDIUM).** Not re-measured here (the `stress.ts` runs gave the same time on `--native` and `--interp` for a `.ts` entry, so a stand-alone `.ts` is probably run by the interpreter in both cases: repro `HAMLET_SIZE=256 tests/data/hamlet/stress-sim.sh --native` and `--interp`, gen 708 ms both). Verdict: needs a task to make `run --native` of a lone `.ts` actually AOT, or say so.
7. **Draw submission cost (MEDIUM, unmeasured).** At zoom 1.3 the Cite view submits 230 to 380 sprites at zoom 1 and up to several thousand dense; each is a TS call with 14 arguments. Present `draw` 10 to 14 ms windowed with only 5 to 16 quads (zoom 0.2) suggests the cost is region texture size (514 x 514 each, sampled and scaled) or the wait, not the sprite count. Verdict: needs a measurement task with `ZINC_GL_FINISH=1`.
8. **Silent AOT compile message on stderr (LOW).** The first run of a changed program prints `zinc: compiling for this machine` on stderr, which every test that asserts an empty stderr (`hamlet_cite`, `hamlet`) treats as a failure on a cold cache. Verdict: needs a task (print only with `--verbose`, or on a TTY).
9. **Deterministic clock never reaches a deadline (LOW).** With `ZINC_DETERMINISTIC=1` `performance.now()` is frozen, so every time-sliced job (bakes) runs whole in one frame and tests cannot observe the slicing; this pass added `ZINC_HAMLET_BAKE_DIAGS` for it. Verdict: needs a task (deterministic clock that advances a fixed step per frame).
10. Not examined: the 256-register limit of the interpreter, the PNG encoder cost (`cite/png.ts` is TS), GC pauses (no hitch pattern at the 1 s scale was seen in the headless runs: the hitches were all the simulation), index-buffer and sprite batch size in the GL replay, partial texture uploads (`updatePixels` uploads a whole 514 x 514 region at once; a region in the walk uploads 1 MB).

## What a 1000 x 1000 Augustus-class city needs (from these numbers)

- Static layers in chunks with dirty regions: already the model (regions, signature checks); needs GPU baking (finding 1) and a coarse level always available (the overview added here; at 1000 tiles it is 4 MP, so it needs two levels).
- Simulation level of detail: 2000 people cost 1.1 ms/tick, 1300 animals 5 ms; at 20 000 animals (512 map as generated) the animals alone are 75 ms a tick. Animals far from any person or the camera need a daily statistical model, not a tick. Walker searches need a per-tick budget (added) and cached route fields; the 6000 tiles a tick bound is a number to tune with a real city.
- Spatial hashing: people and animals already use a grid; the free-place and shore lookups were linear scans and are now cached.
- Job system: generation 12 s at 1024 and the region bakes must leave the frame thread (finding 2).
- Streaming: regions are evicted by age at 56; at 1024 with prefetch, the cache holds a screen and a half; fine.

## Not done

- Tables of p50/p95/p99/max per scenario for 512 and 1024 in the game; the view-frame cost per sprite; `tools/resmon`; `zinc profile` of the windowed game; interpreter windowed runs; the `ZINC_HAMLET_CROWD` + generated animals at 1024.
- Cheaper region bake (item 3 of the owner's black-ground request): not done beyond the budget and prefetch changes; the ground shader (`groundAt`) is the cost, see finding 1. A region bake in a worker: see finding 2.
- `tests/t1/hamlet.sh` fails in this tree: the scripted session reports `no tree was felled (33 -> 40)` (the economy session of `session-work.input`). With my engine changes reverted the same script exits 1 earlier (the game run of the session, silent), so the failure is not clearly mine; `rules.ts` passes on the three engines (interpreter, AOT, QuickJS) with my changes and `hamlet_atlas`, `hamlet_cite`, `hamlet_ground` pass. `hamlet_bot` fails (`planks goal late`): not compared with a clean tree, may be caused by the search debt starving workers on a 24-tile village (debt only owes tiles of searches, so it should not trigger at that size). To check first.
- The walker search budget changes the simulation (hashes differ from before on crowded maps; small villages never owe).

## Lines for backlog/later.md

- ZINC-engine: render-to-texture with alpha for `zinc:gfx` images, so ground regions and sprite sheets are drawn on the GPU instead of baked per pixel in TS (hamlet-scale finding 1).
- ZINC-engine: shared typed memory or `u32[]` transfer for `zinc:worker`, then generation and region bakes in workers (finding 2).
- ZINC-engine: `zinc profile` on the AOT binary with named closures, upload and present time (finding 4).
- ZINC-engine: `Array.prototype.set`/typed copy between arrays (finding 5); lone `.ts` entry under `--native` really AOT (finding 6); quiet the first-compile stderr line (finding 8); deterministic clock that advances per frame (finding 9).
- Hamlet: cap the animals the generator places by area (80 000 at 1024) and give far animals a statistical daily model; slice region bakes by 8 rows; check `hamlet`/`hamlet_bot` T1 (session no tree felled, planks late) against a clean develop.
