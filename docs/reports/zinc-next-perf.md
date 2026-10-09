# Zinc Next: performance tracker

Goal of the owner: the fastest possible engine, measured, because apps will be ported to weak hardware (Raspberry Pi 1 and 3, PSP, PS Vita, 3DS, iPhone 4S, NTC CHIP).
This file is the tracker: section 1 is the table (one row per point, a backlog id once the task exists), section 3 the evidence per point, section 5 how to measure again. The M4 kernel table stays in
`zinc-next-m4-benchmarks.md` (`tools/bench-m4`); the render corpus in `next/bench/render.csv` (`tools/bench-render`). Earlier work (ZN-041, ZN-042) is kept at the end, with a correction of ZN-042's diagnosis (section 4).

Audit of 2026-10-09, after ZN-397's first changes (direct host entries `zn::host::hostFast`, registers as C++ locals in non-leaf AOT functions; both uncommitted at the time of the audit and treated as the baseline here).

## 0. Method, machine, noise

- Machine: Apple M1 Pro (8 performance + 2 efficiency cores), 16 GB, macOS 15.7. Another session was building during the audit: load average moved between 8 and 127, so every number is a median of 5 to 25 runs and the
  minimum is quoted where the spread was large. Ratios between variants measured back to back are more reliable than absolute values.
- No engine rebuild was allowed. Engine numbers come from the existing `next/build/zinc` and AOT programs; candidate fixes were measured as **experiments**: hand edits of generated AOT C++ compiled with the exact `zinc build` line, and
  small harnesses linked against the engine's own `libzn_host_gfx.a` (the real `zrt::raster::render`, `diff_rects`) or reproducing its algorithm. Every experiment checks equality: program output md5 for AOT edits, a pixel hash for raster
  variants. Nothing measured here changes pixels or output.
- Stress scene: `examples/bouncing-ball` with 200,000 balls (the owner's case), headless and deterministic, frame 400 (balls spread). Surface 320x240 logical; the macOS window renders it at 1280x960 physical (zoom 2 x Retina 2),
  `ZINC_SCALE=4` reproduces that headless. Overdraw of that frame: 144.8 M pixels of rectangles on a 1.2 M pixel surface (118x).
- Target hardware (for the "matters most for" column): **single core** Pi 1/Zero (ARM1176 700 MHz, VFPv2, no NEON), PSP (Allegrex 333 MHz, FPU single precision only), NTC CHIP (Cortex-A8 1 GHz, NEON), old 3DS (ARM11 268 MHz, app core);
  **multi core** Pi 3 (4x Cortex-A53, NEON, VC4 GLES2), PS Vita (3 usable Cortex-A9, NEON), iPhone 4S (2x Cortex-A9, SGX543 GLES2), New 3DS. Single-core devices gain nothing from threading and everything from less work per pixel.

## 1. Tracker

Ranked by gain / effort (S = 1, M = 2, L = 3; gain 1 to 5, see section 2). Status: `open` until a backlog task exists, then the task id and its status. Baselines are measured (section 3); targets are what the fix must show.

| # | id | point | status | measured baseline | target | gain | effort | matters most for |
|---|---|---|---|---|---|---|---|---|
| 1 | PERF-01 | SDL HAL rasterizes in dynamic bands (`zbands::Pool`) instead of N equal bands | open | 200k scene, 1280x960: 1 band 65.3 ms, 8 equal bands 41.4 ms (62% of the pixels in one band) | <= 15 ms on 8 threads, same pixels | 4 | S | Pi 3, Vita, i4S, desktop |
| 2 | PERF-02 | Solid fills by row (`fill_n`/NEON), SIMD row blend | open | per-pixel `at()` loop: 0.45 ns/px; CLEAR 1000x640 0.27 ms; experiment: row fill 60.7 -> 19.7 ms (3.1x) | 3x on solid fills, CLEAR <= 0.06 ms | 4 | S | all, single core first |
| 3 | PERF-03 | Frame diff fast paths: containment test, bbox mode for frames that changed everything, `to_physical` folded into `push` | open | diff phase 4.4-4.8 ms per frame at 200k (`diff_rects` alone 2.9 ms) | <= 0.5 ms at 200k | 3 | S | all, single core first |
| 4 | PERF-04 | Shadows, borders and AA edges: exact reuse of the per-row and per-column coverage outside the corners | open | SHADOW 15.9 us per 60x40 blur-10 shadow = 78% of `b2-rounded` (40.7 ms, 1 thread) | <= 4 us per shadow, `b2-rounded` <= 15 ms on 1 thread, same pixels | 4 | M | all UI, single core first |
| 5 | PERF-05 | Fold top-level numeric `const` into constants | open | `GRAVITY` and 3 others reloaded from `m.globals` per ball per frame | no `GetGlobal` of a constant global in the corpus | 2 | S | in-order cores: Pi 1, CHIP, PSP, 3DS |
| 6 | PERF-06 | Host rows read program arrays in place (polygon, path, stroke) | open | navigation AOT: array copies (`arr`, `push_raw`, TLSF, `add_points`, memmove) ~10% of main-thread samples | one copy (into the frame pool) | 2 | S | maps, charts, vector apps everywhere |
| 7 | PERF-07 | Stroke joins from precomputed unit-circle tables | open | `stroke_contours` + `sincosf` ~12% of navigation AOT samples | no trigonometry per join, same contours | 2 | S | maps everywhere; PSP/Pi 1 (slow libm) |
| 8 | PERF-08 | Text fast path: ASCII glyph table, clip once per glyph | open | `b3-text` 250 commands 0.96 ms on 1 thread; binary search per code point, clip test per pixel | 2x on `b3-text`, same pixels | 2 | S | all UI |
| 9 | PERF-09 | String concat and template literals without the double copy and rescan | open | `StrConcat` builds a `std::string` then `newStr` copies and rescans; jsonout interpreter 0.45x QuickJS (LOSS) | interpreter >= QuickJS on jsonout | 2 | S | all |
| 10 | PERF-10 | Typed AOT emission: one C++ struct per class, typed scalar locals, field kinds known statically | open (after ZN-397) | nbody AOT 107 ms vs plain C++ 36 ms; bouncing-ball script 4.2 ms per frame; experiments: 37 ms and 2.1 ms | AOT / native <= 1.2x on every M4 kernel; bouncing-ball script <= 2.2 ms | 5 | L | all, the CPU-bound ones most |
| 11 | PERF-11 | Tile binning and tile-level occlusion in the software raster | open | 200k scene 1280x960, 1 thread 60-65 ms; experiment: 16 px tiles + occlusion 7.3 ms (1 thread), 6.0 ms (8 threads) | <= 10 ms on 1 thread for the 200k scene; UI corpus no slower | 5 | L | single core: Pi 1, PSP, CHIP, 3DS |
| 12 | PERF-12 | WebGL present without readback | open | webgl-cube: `zincPresent` 47% of the main thread (`glReadPixels` 35%, of it 22% GPU sync; CPU 2x2 downsample 11%) | <= 5% of the main thread | 5 | L | Pi 3 (VC4), i4S, Vita: every WebGL target |
| 13 | PERF-13 | GPU 2D backend by default where there is a GPU (display-gl, `gpu-renderer-design.md`) | open (design exists, phase 1 done) | all raster on CPU in the desktop window | 200k quads in <= 2 ms GPU, CPU free for script | 5 | L | Pi 3, Vita, i4S, desktop |
| 14 | PERF-14 | RC elision per value range; host rows marked as never releasing; inline release | open | 400k retain/release pairs per frame at 200k balls; `op::release` out of line 6% of navigation AOT | no RC in the ball loops; release inlined | 3 | M | all |
| 15 | PERF-15 | Per-target CPU flags and number profiles | open | every armhf build is `-mcpu=arm1176jzf_s` (ARMv6, no NEON) also for Pi 2/3 32-bit; no PSP profile (`number` would be soft double) | armv7+NEON variant measured under QEMU and on the Pi rig; `psp` profile with `number` = f32 | 3 | M | Pi 2/3 32-bit, CHIP, PSP |
| 16 | PERF-16 | `zinc run` / `zinc dev` startup: faster passes and a ZBC cache | open | hero: 1.7 s before the first instruction (lower 436, RC 353, emit 269, check 227, parse 85 ms) | <= 100 ms with a warm cache, <= 0.8 s cold | 3 | M | dev loop; Pi when run from source |
| 17 | PERF-17 | Pipeline: script of frame N+1 runs while bands rasterize frame N | open | main thread waits on bands 63% of the frame (window, 200k) | frame time = max(script + diff, raster) | 3 | M | multi core only |
| 18 | PERF-18 | Borrowed (+0) parameters, `this` included | open | parameters are owned: a call retains, the callee releases; a comparison does 3 retains + 3 releases | -10% or better on method-heavy code (zinc:ui) | 3 | L | all |
| 19 | PERF-19 | Packed numeric arrays and narrow fields | open (with ZN-145, ZN-158) | every array element and field is an 8-byte Slot (u8[] uses 8x its size) | element size = type size | 3 | L | memory-poor: PSP, 3DS, ESP32 |
| 20 | PERF-20 | Native RGB565 raster for 16-bit panels | open (ZN-194, ZN-195) | 32-bit raster plus a 32 -> 16 conversion pass (fbdev) | no conversion pass, half the frame bandwidth | 3 | L | Pi 1/Zero panels, CHIP, PSP, 3DS |
| 21 | PERF-21 | Sort with a comparator: direct native call, no retains, key comparators specialised | open | navigation AOT: `mergeSort` + `callComparator` + `exec` ~12% of samples | <= 4% | 2 | M | all |
| 22 | PERF-22 | Interpreter: typed field opcodes, cached globals, fewer checks | open | bouncing-ball script: interpreter 13.2 ms vs AOT 4.2 ms per frame | -25% on the ball loop | 2 | M | ESP32 bytecode core, device-sim, dev |
| 23 | PERF-23 | Allocation registry replaced by counters and a mimalloc heap | open | each alloc pushes on `Machine::allocated`, each free swap-removes and writes another object's header | -5 to -15% on binarytrees and allocation-heavy UI build | 2 | M | all, small caches first |
| 24 | PERF-24 | LTO between the runtime, the host and the program | open | host rows are calls through function pointers (`hostFast`); runtime built -O3, program -O2, no LTO | measured, kept if >= 3% | 2 | M | all |
| 25 | PERF-25 | PGO for the runtime, raster and host libraries | open | not measured | measured, kept if >= 5% | 2 | M | all |
| 26 | PERF-26 | Render scale option for pixel-art gfx programs on HiDPI windows | open | 320x240 program rendered at 1280x960 (16x the logical pixels) | opt-in `pixelScale`, 4x fewer pixels at zoom 2 on Retina | 1 | S | desktop only |
| 27 | PERF-27 | Metal-native texture format in the SDL HAL | open | XRGB8888 is not native on SDL's Metal renderer: every upload is converted (`Blit8888to8888PixelSwizzleNEON`), 1.6% of the main thread | no conversion | 1 | S | macOS (and iOS if Metal) |
| 28 | PERF-28 | AOT build in parallel translation units | open | `zinc build` of navigation: 81 s (one TU at -O2) | <= 30 s at `-j3` | 1 | M | dev loop |

Expected effect on the owner's case if 1, 2, 3 and 10 land (estimate from the measured parts, window, 200k balls): script 4.2 -> ~2.1 ms, diff 4.5 -> < 0.5 ms, raster 41 -> ~5-8 ms on 8 threads: from ~30 fps to the 60 Hz vsync.
On a single-core device the same scene needs 11 (occlusion) and 2: 65 ms of raster on one M1 core becomes ~7 ms.

## 2. How the gain and effort were scored

Gain: 5 = removes a multiple of the frame or a 2x+ on a whole class of programs; 4 = 2-3x on a hot stage every graphics program has; 3 = 10-50% of a frame or a 2x on a stage some programs have; 2 = 5-15% or one demo class;
1 = < 5% or one platform. Effort: S = hours to one session, local change; M = 2-3 sessions or a shared module; L = 4+ sessions or a cross-cutting change (IR conventions, raster architecture, ABI).

## 3. Points

### PERF-01: dynamic raster bands in the SDL HAL

- **Where**: `targets/macos/hal_sdl.cpp:373-430` (`start_workers`, `render_rows_parallel`, `run_band`): the damaged rows are cut into `workers + 1` equal bands; every band renders the whole command list.
- **Cost now**: `zinc capture --scene bb4.scn --bench 15 T`: 1 thread 65.3 ms, 2: 51.3 ms, 4: 50.7 ms, 8: 41.4 ms. The pixels of that frame are 62.1% in band 4 of 8 (`[0, 0, 15.3, 62.1, 10.0, 5.2, 4.1, 3.3]%`), so 8 threads buy 1.6x.
  The window profile (`sample`, 4026 samples of the main thread) agrees: 63% waiting in `__psynch_cvwait` for the slowest band, 8% rendering its own band. Any uneven scene (a map under a sky, a list under a header) behaves the same.
- **Fix**: use `zbands::Pool` from `runtime/include/render_bands.h` (already used by `plugins/display-fbdev`: 16-row bands pulled from an atomic counter, a frame barrier, bit-identical pixels). Delete the HAL's own worker code.
  Harness check (same algorithm): 8 equal bands 18.0 ms -> 32-row bands from a counter 9.8 ms on the same scene.
- **Gain**: raster wall time 41 -> <= 15 ms at 200k (65 ms / 8 cores plus the per-band walk of the command list); nothing changes when the work is already even. **Effort** S. **Risk** low (pixels identical by construction, `ZINC_RENDER_THREADS` keeps working).
- **Hardware**: every multi-core target (Pi 3: 4 cores, Vita: 3, i4S: 2, desktop).

### PERF-02: solid fills by row, SIMD row blend

- **Where**: `runtime/raster.cpp:528-535` (CLEAR and the opaque RECT path: per-pixel `at(t, x, y) = c`, which recomputes `(y - y0) * w + x`), the covered runs inside `fill_rrect` / `shadow_rrect` (`:85`, `:131`), `blend` (`:29`, scalar).
- **Cost now**: CLEAR of 1000x640 = 0.27 ms (0.42 ns/px, scalar store per pixel); the 200k-rect scene on one thread 60-65 ms (0.45 ns/px). Harness `ref/fill.cpp`, 1280x960, 1 thread: per-pixel loop 60.7 ms, `std::fill_n` per row 19.7 ms, same pixel hash.
- **Fix**: row pointer once per row, `std::fill_n` (the compiler emits 128-bit stores) for opaque runs; a row blend with constant colour and alpha in NEON / SSE2 (4 pixels per step) for the alpha and covered runs; CLEAR as a row fill over the clip.
  Compile `zn_host_gfx` at -O3 (it is -O2 today, `next/CMakeLists.txt:196`) once the loops are vectorizable.
- **Gain**: 3x on solid fills, which are most of the pixels of UI backgrounds, cards and immediate-mode games. **Effort** S. **Risk** low (same integer arithmetic; pixel goldens must stay exact).
- **Hardware**: all; single-core devices first (Pi 1, PSP, CHIP, 3DS), where nothing else hides the cost. ARMv6 (Pi 1) has no NEON: the row loop still saves the index arithmetic and allows `stm` multi-stores.

### PERF-03: frame diff fast paths

- **Where**: `runtime/gfx.cpp:767-800` (`end_frame`: `to_physical` then `raster::diff_rects` into 8 rectangles), `runtime/raster.cpp:577-650` (`cmd_bounds`, `same`, `damage_add`, `diff_rects`).
- **Cost now**: headless `ZINC_PROFILE=1`, 200k balls: `diff` phase p50 4.4 ms (scale 1) and 4.8 ms (scale 4); `diff_rects` alone 2.86 ms (harness `ref/diff.cpp` on two consecutive dumps). After the script fix (PERF-10 experiment) it is the largest main-thread item:
  `damage_add` 723, `cmd_bounds` 415, `diff_rects` 201, `same` 106 samples vs 970 for the whole script. The damage never reaches the whole screen (75%: the top quarter is empty), so an "already full" early exit would not fire.
- **Fix**: (a) in `damage_add`, return at once when the new rectangle is inside an existing one (harness: 2.86 -> 2.06 ms); (b) when the previous frame changed more than half of its commands, skip `same()` and the join logic and take the bounding box,
  accumulated in `push()` at no cost (harness bbox-only 1.78 ms; with the box from `push` the diff disappears); (c) do the logical -> physical scale in `box()`/`push()` instead of a second pass over the frame (`to_physical`, ~0.3 ms at 200k, scale 4)
  — plugin-emitted commands keep the pass.
- **Gain**: 4.5 -> < 0.5 ms per frame at 200k; UI frames with few changes are unaffected (they keep the exact rectangles). **Effort** S. **Risk** low-medium: damage must stay a superset; `zinc capture --damage-check` style test (`render_bench.cpp:damageCheck`) covers it.
- **Hardware**: all; on a single core this is pure frame time.

### PERF-04: shadows, borders and AA edges without a distance function per pixel

- **Where**: `runtime/raster.cpp:131` (`shadow_rrect`: `rr_sdf` with a square root, then a smoothstep, for every pixel of the blur band), `:111` (`border_rrect`: two `rr_sdf` per ring pixel), `:85` (`fill_rrect` edge pixels).
- **Cost now**: harness `ref/kinds.cpp` (the engine's `render()` per command kind, 1000x640, 1 thread) on `bench/render/b2-rounded.ts`: SHADOW 15.9 us per command (2000 shadows 31.8 ms = 78% of the scene), rounded RECT 1.9 us, BORDER 1.8 us.
  The whole case: 40.7 ms on 1 thread, 10.8 ms on 4 (`zinc capture --scene --bench`). Cards with shadows are the default look of zinc:ui and of the kit.
- **Fix, exact**: in the rows of the straight middle section of the box (`|py - cy| <= hh - r`, minus the blur), the distance depends only on the column: compute the coverage of one row and blend it into every middle row; in the columns of the straight top
  and bottom sections it depends only on the row: one alpha per row over a constant run. Only the four corner squares keep the per-pixel distance. Same float expressions on the same inputs, so the same pixels. Same split for borders and AA edges.
- **Gain**: shadows 4x or more (most of a 60x40 shadow's blur band is straight edge), `b2-rounded` to <= 15 ms on 1 thread. **Effort** M. **Risk** medium (the equality argument must be checked on the pixel goldens of every UI demo; ZN-223 tolerances stay 0).
- **Hardware**: all UI on weak CPUs (Pi 3 kit apps, CHIP, i4S, Vita).

### PERF-05: fold top-level numeric constants

- **Where**: the frontend lowers a module-level `const GRAVITY = 240` to a global: every use is `GetGlobal` (AOT: `r = m.globals[17]`, `next/src/aot/aot.cpp:169`; a load of the vector's data then of the slot). `src/ir/opt.cpp:461` has no pass for it.
- **Cost now**: in the ball update loop 4 constants are reloaded per ball per frame (800k loads per frame), and they block constant folding (`-vy * FLOOR_DAMPING`). Part of the 2x of the PERF-10 experiment, which hoisted them.
- **Fix**: an IR pass: a global with one `SetGlobal` (in the module init) of a `Const` and no other store becomes that constant at every `GetGlobal`; then `hoistConsts` and CSE do the rest.
- **Gain**: a few percent on numeric loops; more on in-order cores where load latency is not hidden. **Effort** S. **Risk** low (a read before the initialisation would see the value instead of 0: the checker rejects use before definition).
- **Hardware**: in-order cores (Pi 1 ARM1176, CHIP Cortex-A8, PSP Allegrex, 3DS ARM11).

### PERF-06: host rows read program arrays in place

- **Where**: `next/src/host/gfx_host.cpp:35` (`arr()`: a `zrt::Array<double>` allocated from TLSF and filled element by element), `:124-126` (polygon, path, stroke), then `runtime/gfx.cpp` `add_points` copies again into the frame's point pool.
- **Cost now**: `sample` of navigation AOT (headless, 3000 frames): `push_raw` 81, `arr` 35, `add_points` 27, `tlsf::malloc`/`mfree` 54, memmove 34 of 2285 main-thread samples = ~10%.
- **Fix**: a `zrt::gfx` overload taking `(const double*, n)`; the host row passes the `ArrObj`'s storage (the Slots of an `f64[]` are the doubles). One copy remains: into the pool as float.
- **Gain**: most of that 10% of navigation's paint; every chart, map and vector program. **Effort** S. **Risk** low. **Hardware**: all.

### PERF-07: stroke joins from tables

- **Where**: `runtime/raster.cpp:730` (`stroke_contours`: `cosf`/`sinf` for every vertex of every join disc, 6/10/16 segments).
- **Cost now**: navigation AOT: `stroke_contours` 187 + `__sincosf_stret` 84 of 2285 samples (~12%).
- **Fix**: three static tables of unit-circle points (6, 10, 16 segments) computed with the same expression once; the disc is `centre + table * r`. Same floats, same contours.
- **Gain**: most of that 12%. **Effort** S. **Risk** low. **Hardware**: all; most on PSP and Pi 1 (slow libm, no NEON).

### PERF-08: text fast path

- **Where**: `runtime/raster.cpp:290` (`glyph_of`: binary search per code point), `:325` (`draw_text`: clip test per pixel inside each glyph).
- **Cost now**: `b3-text` (250 text commands, 1000x640): 0.96 ms on 1 thread, 0.63 ms on 4.
- **Fix**: a 128-entry direct table for ASCII per baked font; per glyph, one clip test of the glyph box and an inner loop without tests when it is inside (the common case).
- **Gain**: ~2x on text-heavy screens (lists, editors, the dashboard). **Effort** S. **Risk** low. **Hardware**: all UI.

### PERF-09: string building

- **Where**: `next/src/rt/rtcalls.cpp:933` (`StrConcat`: `std::string r(x); r.append(y)`, then `newStr` copies again), `next/src/rt/machine.cpp:265` (`newStr` scans every byte for `ascii` and the UTF-16 length).
- **Cost now**: two copies and one heap `std::string` per concatenation; the M4 table: jsonout interpreter 16.0 ms vs QuickJS 9.0 ms (the published LOSS), AOT 7.4 vs native 6.8.
- **Fix**: allocate the `StrObj` at `x->len + y->len` and copy once; `ascii = x->ascii && y->ascii`, `u16len = x->u16len + y->u16len` (no rescan); a builder for template literals with more than two parts (`StrConcatM`).
- **Gain**: 1.3-2x on concatenation-heavy code; jsonout interpreter to QuickJS parity. **Effort** S. **Risk** low. **Hardware**: all.

### PERF-10: typed AOT emission

- **Where**: `next/src/aot/aot.cpp:120-200` (every value is a `Slot`; fields are `o->fields()[c]`; `SetField` checks `o->cls->fieldRef[c]` at run time even when the IR knows the field is a number).
- **Cost now**: M4 table nbody AOT 109.8 ms vs native 40.7 ms (2.7x); bouncing-ball script 4.2 ms per frame at 200k vs prototype 1.9 ms.
- **Experiments** (output md5 identical in all):

  | nbody variant (`zinc build` line, -O2, `-ffp-contract=off`) | median ms |
  |---|---:|
  | AOT as generated (leaf: registers already C++ locals) | 107 |
  | + `SetField` without the `fieldRef` test, no null checks, no bounds checks | 106 |
  | + `double*` field access, or a struct with `Slot` locals | 107-109 |
  | typed `double` locals + `fields()[k]` array access | 109 |
  | AOT as generated + `-mllvm -aarch64-enable-ldst-opt=false` | 56 |
  | that + all checks removed | 39 |
  | **typed `double` locals + one C++ struct per class (`bi->vx`), all checks kept** | **37** |
  | plain C++ reference, same algorithm, `-ffp-contract=off` (no FMA) | 36 |
  | -O3, `-mcpu=native`, `-ffp-contract=on` on the generated code | no change |

  Diagnosis: with `Slot` arrays the compiler cannot tell `bi.vx` from `bj.x` (same type, unknown bases), reloads fields after every store, and pairs the reloads into `ldp` that span two earlier 8-byte stores: the store-to-load forwarding
  fails and each iteration stalls. A struct per class gives type-based alias information per member, the values stay in registers and the stores vectorize as in the C++ reference. FMA and NEON are not the cause (section 4).
  Bouncing-ball: the update and draw loops of the AOT output rewritten by hand the same way (struct `BallT`, `double` locals, constants hoisted, no element retain/release): script 4.22 -> 2.12 ms per frame (headless, 60 frames, 3 runs each).
- **Fix**: emit a `struct C<id> { const ClassRT* cls; uint32_t rc, pad; <typed members>; }` per class, typed C++ locals per IR value type (`double`, `int32_t`, `uint32_t`, `Obj*`), `SetField` of a scalar member as a plain store, of a reference
  member with the release inline; keep null and bounds checks (they cost nothing once typed). Builds on ZN-397's locals in non-leaf functions (window copies only at calls) and on ZN-144's typed calling convention; ZN-145 (4-byte
  references on 32-bit targets) uses the same struct layout.
- **Gain**: AOT / native from 2.7x to ~1x on object-heavy kernels; 2x on the bouncing-ball script; every zinc:ui program (ui.ts is object code). Smaller C++ too (hero AOT text is 18 MB today), which matters for i-cache on in-order cores.
- **Effort** L. **Risk** medium (byte-identical interpreter/AOT outputs stay the gate; `-ffp-contract=off` stays). **Hardware**: all; CPU-bound targets most (Pi 1/3, PSP, 3DS, CHIP).

### PERF-11: tile binning and tile-level occlusion

- **Where**: `runtime/raster.cpp:516` (`render`: every band walks every command), `hal_sdl.cpp` bands, `runtime/include/render_bands.h`.
- **Cost now**: 200k scene at 1280x960: 60-65 ms on one core for 144.8 M pixel writes (118x overdraw).
- **Experiment** (`ref/fill.cpp`, same pixel hash for every variant, 1280x960, after the load dropped): 32-64 px tiles binned and pulled from a counter: 8 threads 13-16 ms; **16 px tiles, each tile starting at the last opaque command that
  covers it whole: 1 thread 7.3 ms, 8 threads 6.0 ms** (the single-threaded binning, 6.9 ms, is now the bottleneck; at 320x240 the 4-9 px balls rarely cover a 16 px tile and occlusion buys nothing).
- **Fix**: bin each command's effective bounds (intersected with the clip stack, so content inside a clip that misses the tile is skipped) into tiles once per frame, in parallel; workers pull tiles; per tile, start at the last opaque,
  axis-aligned, unrotated command covering it (CLEAR, opaque RECT, opaque image without alpha); CLIP/UNCLIP and rounded-clip corners are replayed per tile. Pass the per-tile context instead of thread-local scratch
  (`ZRT_TLS`, `_tlv_get_addr` is a call on macOS, ~1% of navigation).
- **Gain**: overdraw-bound scenes 5-9x on one core; UI scenes with full-screen panels under cards skip the panels under opaque cards. **Effort** L. **Risk** medium (order inside a tile is preserved and tiles never share pixels, so pixels stay
  identical; text overhang bounds must be right). **Hardware**: single core first (Pi 1, PSP, CHIP, 3DS): the only way to cut pixels rather than spread them.

### PERF-12: WebGL present without readback

- **Where**: `next/src/gl/webgl_js.cpp:387` (`zincPresent`: `Offscreen::read` = `glReadPixels` of the whole canvas into a new vector), `next/src/main.cpp:489` (`glPresent`: flips rows, drops alpha and averages 2x2 supersamples on the CPU), then the
  software raster draws the image and the HAL uploads the frame again; `webgl1.cpp` `compositeClear` queries ~15 `glGet*` per frame.
- **Cost now**: `sample` of `examples/webgl-cube` (720x480 canvas, SS = 2): `zincPresent` 1077 of 2310 main-thread samples (47%): `glReadPixels` 809 (of which 506 waiting for the GPU), CPU downsample 253.
- **Fix**: compose the canvas texture on the GPU: when the window renderer and the WebGL context share a GL context (or the canvas is the only content, as in a full-screen WebGL app), draw the canvas texture and upload only the software
  UI layer; MSAA (or a `glBlitFramebuffer` downsample on the GPU) instead of CPU supersampling. Interim: two PBOs (asynchronous readback of frame N-1) and the GPU downsample. Shadow state instead of `glGet*` in `compositeClear`.
- **Gain**: ~half of the main thread of a WebGL app on the Mac; on VC4 (Pi 3) a full readback costs tens of ms. **Effort** L (interim M). **Risk** medium (context sharing differs per platform; WebGL conformance must stay green).
- **Hardware**: every WebGL target: Pi 3 (WebGL1, VC4), i4S (GLES2), Vita, desktop.

### PERF-13: GPU 2D backend by default

- **Where**: `plugins/display-gl`, `docs/reports/gpu-renderer-design.md` (phase 1 done on macOS and the Pi), `zn::gfx::Backend` (`include/zn/scene.h`), `HalFrame.frames` (`runtime/gfx.cpp:frame_lists`).
- **Cost now**: the desktop window and the Pi KMS path rasterize on the CPU; 200k quads cost 41 ms of 8 cores.
- **Fix**: make the GL backend the default renderer where a GL context exists (instanced quads, SDF rounded rects and shadows, glyph atlas), the software raster stays the oracle and the fallback (tolerance policy of `ui-rendering-architecture.md` 4.17).
- **Gain**: raster off the CPU. **Effort** L. **Risk** medium (pixels differ within tolerance; VC4 quirks recorded in the design). **Hardware**: Pi 3, Vita (GXM backend), i4S (GLES2), desktop; PSP (GU) and 3DS (PICA200) need their own backends.

### PERF-14: reference counting elided per value range

- **Where**: `next/src/ir/rc.cpp:76` (`lendsForever`: a borrowed load skips its retain/release only if the **whole function** has no call, no runtime call, no reference store); `src/rt/rt.h:220` (`retain` checks `mem` statistics on every call);
  `op::release` is out of line in AOT programs (navigation sample: 130 samples, 6%).
- **Cost now**: `zinc mem` on 200k balls, 10 frames: 4.6 M retains and releases: 400k pairs per frame, all for loop elements that nothing can free (the loop bodies only call `width()`, `height()`, `rect()`). In the draw loop they turn a read-only
  pass into writes to 200k objects.
- **Fix**: per borrowed value, check only the instructions inside its live range; flag runtime rows that never release program references (all scalar gfx and sys rows) in the runtime table; inline the release fast path
  (`--rc == 0` test, call `destroy` out of line); move the `mem` statistics test out of `retain` (counted by the profiler build only).
- **Gain**: part of the PERF-10 2x; the interpreter gains too (RC is in the IR). **Effort** M. **Risk** medium (a wrong elision is a use-after-free: ASan corpus and `ZN_LEAK_CHECK` gate it). **Hardware**: all.

### PERF-15: per-target CPU flags and number profiles

- **Where**: `next/src/main.cpp:1250`, `src/tc/tc.cpp:321,362`, `src/tc/plugin_build.cpp:87`: armhf is always `-mcpu=arm1176jzf_s`; aarch64 has no `-mcpu`; `src/frontend/profile.cpp:8-15` has no psp, vita, 3ds, chip, iphone profile.
- **Cost now**: a Pi 2/3 running a 32-bit OS gets ARMv6 code: no NEON (so no vector fill of PERF-02), VFPv2 scheduling, no ARMv7 instructions. On PSP `number` (f64) would be software double: the Allegrex FPU is single precision.
- **Fix**: two armhf variants (armv6+vfp2 for Pi 0/1; `-mcpu=cortex-a7`/`cortex-a53 -mfpu=neon-vfpv4` for Pi 2/3/4 32-bit), `-mcpu=cortex-a53` for aarch64 Pi 3, `cortex-a8+neon` for CHIP; picked by `zinc deploy`/`export` from the board;
  profiles `psp` (`number` = f32), `vita`, `3ds`, `chip` with their heaps and screens. Measure each under QEMU user and on the Pi rig.
- **Gain**: estimated 10-30% on Pi 2/3 32-bit (more with PERF-02's NEON rows); on PSP the difference between hardware and soft float. **Effort** M. **Risk** low (`-ffp-contract=off` stays: same digits).
- **Hardware**: Pi 2/3 32-bit, CHIP, PSP.

### PERF-16: `zinc run` / `zinc dev` startup

- **Where**: the compile pipeline, `next/src/ir/rc.cpp` (liveness as dense `std::vector<std::vector<char>>` of blocks x values per function), `src/ir/lower.cpp`, `src/zbc`.
- **Cost now**: `zinc run examples/hero -v`: parse 85, check 227, lower 436, optimise 100, reference counting 353, emit ZBC 269 ms; the program itself 36 ms; 1.7 s wall before the first frame on the M1 (a Pi 3 is roughly 10x slower).
  AOT hero starts in 50-60 ms warm (no compile).
- **Fix**: sparse liveness (bitsets per block over the tracked values only), profile `lower` and `emit` for quadratic spots; a ZBC cache keyed by the hash of the sources, the profile and the engine version, so an unchanged project starts at once
  and `zinc dev` restarts recompile only what changed.
- **Gain**: restart 1.7 s -> <= 0.1 s warm, <= 0.8 s cold. **Effort** M. **Risk** low. **Hardware**: the dev loop; any device that runs from source.

### PERF-17: pipeline the script with the raster

- **Where**: `runtime/gfx.cpp:767` (`end_frame` presents synchronously), `hal_sdl.cpp:432` (`hal_present` waits for the bands, uploads, presents).
- **Cost now**: window, 200k: the main thread waits for the bands 63% of the frame while the script and diff of the next frame could run.
- **Fix**: a third command buffer; `end_frame` hands frame N to the band workers and returns; frame N+1's script and diff run; the upload of N happens when its bands are done (before N+1 is handed over). One frame of extra latency, opt-out for
  input-latency-sensitive programs; `ZINC_SHOT` and deterministic runs keep the synchronous path.
- **Gain**: frame time = max(script + diff, raster) instead of the sum (today ~30 ms -> ~21 ms at 200k, before the raster fixes). **Effort** M. **Risk** medium (plugins reading the frame buffer, live resize). **Hardware**: multi-core only.

### PERF-18: borrowed (+0) parameters

- **Where**: `next/src/ir/rc.cpp:24` (`consumes`: a call consumes its arguments), the native ABI.
- **Cost now**: every call that passes an object it keeps (a method's `this`, a node handle) retains it and the callee releases it; `callComparator` does 3 retains and 3 releases per comparison; `zinc mem` on hero's start: 153k retains for 2.4k allocations.
- **Fix**: parameters are borrowed by default; the callee retains only what it stores or returns; the RC pass and the native ABI change together.
- **Gain**: estimated 10-30% on method-heavy code (zinc:ui, kit). **Effort** L. **Risk** high (a convention used by every back end and native module). **Hardware**: all.

### PERF-19: packed numeric arrays and narrow fields

- **Where**: `next/src/rt/rt.h` (`ArrObj::v` is `ObjVec<Slot>`; every field is a `Slot`).
- **Cost now**: a `u8[]` uses 8 bytes per element, an `i32[]`/`f32[]` 8; a `Ball` is 64 bytes. Memory and bandwidth 2-8x on numeric arrays.
- **Fix**: element storage at the element's size for numeric arrays (typed views in the AOT, a size switch in the interpreter), fields at their size in the PERF-10 structs.
- **Gain**: memory and cache 2-8x on numeric data. **Effort** L. **Risk** medium (natives, JSON, sort see arrays). **Hardware**: PSP (24 MB for the program), 3DS, ESP32. With ZN-145 and ZN-158.

### PERF-20: native RGB565 raster for 16-bit panels

- **Where**: `plugins/display-fbdev/fbdev.cpp:60-75` (32 -> 16 conversion per band, already fused and parallel), `runtime/raster.cpp` (32-bit only).
- **Cost now**: every frame is rasterized at 32 bits and converted; `render-perf-options.md` measured the Pi 3 with the 7" DSI panel (RGB565).
- **Fix**: the raster templated on the pixel format (ZN-194 plans it for ESP32, ZN-195 the fixed-point template); fbdev and SPI panels render straight into 565.
- **Gain**: half the frame bandwidth, no conversion pass. **Effort** L. **Risk** medium (pixel goldens per format). **Hardware**: Pi 1/Zero panels, CHIP, PSP and 3DS 16-bit modes, MCU panels.

### PERF-21: sort with a comparator

- **Where**: `next/src/rt/rtcalls.cpp:276` (`mergeSort`), `src/rt/machine.cpp:334` (`callComparator`: retains the closure and both elements, goes through `Machine::exec`, the callee releases them).
- **Cost now**: navigation AOT: `mergeSort` 79, `callComparator` 59, `exec` 125 of 2285 samples (~12%).
- **Fix**: AOT calls the comparator's native function directly with borrowed arguments; the optimizer extends ZN-042's `specializeSort` to `(a, b) => a.k - b.k` on objects (extract the keys once, sort indices, stable).
- **Gain**: most of the 12%. **Effort** M. **Risk** low (the stability and NaN cases have goldens). **Hardware**: all.

### PERF-22: interpreter hot paths

- **Where**: `next/src/vm/vm.cpp` (`L_SetField` through `op::setField`: three dependent loads for `fieldRef` per store; `L_GetGlobal` through the `globals` vector; Rt rows through `rtCall`).
- **Cost now**: bouncing-ball script at 200k: interpreter 13.2 ms, AOT 4.2 ms per frame; navigation paint: interpreter 6.5 ms, AOT 3.5 ms.
- **Fix**: `SetFieldS` / `SetFieldR` opcodes chosen by the compiler from the field type (no run-time `fieldRef`); the globals' data pointer in a local of the loop; the hostFast entry tested before `rtCall` in `L_Rt`.
- **Gain**: ~25% on object-heavy scripts (estimate). **Effort** M. **Risk** low (ZBC opcode table change: the device core of an older release needs the version check). **Hardware**: the ESP32 bytecode core, device-sim, `zinc run`.

### PERF-23: allocation registry

- **Where**: `next/src/rt/rt.h:207` (`track`: `allocated.push_back`), `src/rt/machine.cpp:161-163` (swap-remove on free, writing into the header of the object moved).
- **Cost now**: one vector push per allocation and a write into an unrelated object per free (a likely cache miss); the registry exists to count and free leftovers at exit. Not isolated by measurement (needs a runtime rebuild).
- **Fix**: live counters for the leak count; objects in a dedicated `mi_heap_t`, `mi_heap_destroy` at exit; `mi_heap_visit_blocks` when a leak listing is asked for; `traceFree` keeps its serials.
- **Gain**: estimated 5-15% on allocation-heavy code (binarytrees, strings, building a UI tree). **Effort** M. **Risk** low-medium (leak reports and destruction-order tests must stay identical). **Hardware**: all; small caches most.

### PERF-24: LTO across runtime, host and program

- **Where**: `next/src/main.cpp:1349` (the program at -O2 links `libzn_rt.a`, `libzn_host_gfx.a` built separately); host rows are function pointers (`zn::host::hostFast`), so `gfx::rect` and `push` are never inlined into the loop.
- **Cost now**: not measured (needs LTO builds of the libraries). `push` + `rect` + `width`/`height` entries are ~0.9 ms of the 2.1 ms typed script at 200k.
- **Fix**: ThinLTO objects for the runtime and the host; direct calls instead of `hostFast` pointers when the host is linked statically (keep the table for the interpreter and plugins).
- **Gain**: estimated 3-10% of script time in host-call-heavy loops. **Effort** M (link time grows; see PERF-28). **Risk** low. **Hardware**: all.

### PERF-25: PGO

- **Where**: the CMake build of `zn_rt`, `zn_host_gfx`, `zinc` (interpreter loop).
- **Cost now**: not measured.
- **Fix**: a profile from the M4 kernels, the render corpus and three demos; `-fprofile-use` for the release build; optional `zinc build --pgo` for programs.
- **Gain**: estimated 5-15% for the interpreter and the raster. **Effort** M. **Risk** low (profile data must be versioned). **Hardware**: all.

### PERF-26: render scale for pixel-art gfx programs on HiDPI windows

- **Where**: `targets/macos/hal_sdl.cpp:54` (`k = zoom * density`): a 320x240 program opens at zoom 2 and renders at 1280x960 on Retina.
- **Cost now**: 16x the logical pixels (the 200k scene: 144.8 M pixel writes instead of 9 M at 1x).
- **Fix**: zinc.json `targets.<id>.pixelScale: "density" | "logical"` (default unchanged): render at the density only and let the GPU magnify the zoom (nearest), or at 1x for pixel art.
- **Gain**: 4x fewer pixels at zoom 2. **Effort** S. **Risk** low (opt-in). **Hardware**: desktop only (the target devices are 1x).

### PERF-27: Metal-native texture format

- **Where**: `targets/macos/hal_sdl.cpp:42` (`SDL_PIXELFORMAT_XRGB8888`). SDL3's Metal renderer supports ARGB8888 and ABGR8888 only (`third_party/SDL3/src/render/metal/SDL_render_metal.m:2410`), so it creates a native ARGB texture and
  converts every `SDL_UpdateTexture` (`Blit8888to8888PixelSwizzleNEON`).
- **Cost now**: `SDL_UpdateTexture` 64 of 4026 main-thread samples (1.6%, ~0.5 ms per 1280x960 frame).
- **Fix**: ARGB8888 with `SDL_BLENDMODE_NONE` (the alpha byte is ignored), as the transparent-window path already does.
- **Gain**: ~0.5 ms per full frame on macOS. **Effort** S. **Risk** low. **Hardware**: macOS (iOS if it uses Metal; the i4S uses GLES2, where XRGB is native).

### PERF-28: parallel AOT compile

- **Where**: `next/src/main.cpp:1349` (one C++ file per program at -O2).
- **Cost now**: `zinc build examples/maps/navigation`: 81 s wall (68 s user); bouncing-ball 5.6 s; nbody 1.3 s.
- **Fix**: split the generated functions into N translation units compiled with the machine's job limit (`WGC_JOBS`, 16 GB machines: 3), cache objects by the hash of their functions.
- **Gain**: <= 30 s for navigation; incremental rebuilds in seconds. **Effort** M. **Risk** low. **Hardware**: the dev loop.

## 4. Correction of ZN-042's diagnosis (nbody)

ZN-042 concluded that the typed backend would not help nbody and that the 2.9x to native came from NEON and fused multiply-adds, which `-ffp-contract=off` forbids. The experiments of PERF-10 contradict both parts:
the plain C++ reference compiled **with** `-ffp-contract=off` runs in 36 ms (native-class speed without any FMA), and the AOT reaches 37 ms with typed locals and a struct per class while keeping every null and bounds check.
The earlier experiment converted to `double` locals and `double*` field accesses: that variant is still 109 ms here too, because the field accesses remain array-indexed and the compiler cannot separate `bi.vx` from `bj.x`.
The cost is a store-to-load forwarding stall (`ldp` reloads spanning two 8-byte stores of the previous iteration): disabling the AArch64 load/store pairing alone takes the generated code from 107 to 56 ms.
So no fast-math profile is needed; a typed backend with per-class structs is (PERF-10).

## 5. Reproducing the measurements

Scratch harnesses of this audit (to be added under `next/bench/` by the first task that needs them): `ref/fill.cpp` (fill variants, bands, stripes, tiles, occlusion on a scene dump), `ref/kinds.cpp` (cost per command kind through the
engine's `zrt::raster::render`), `ref/diff.cpp` / `ref/diff2.cpp` (`diff_rects` and candidate variants on two consecutive dumps), `ref/nbody.cpp` (plain C++ reference). They link `next/build/libzn_host_gfx.a libzn_rt.a libzn_mimalloc.a`
with `-I runtime`.

```sh
# 200k-ball project: bouncing-ball with `for (let i = 0; i < 199999; i++) balls.push(new Ball(width() / 2, height() / 3));` after the first ball
zinc build bb -o bb-aot                                                                           # 5.6 s
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 ZINC_PROFILE=1 ./bb-aot 2>&1 >/dev/null   # effects (= script) and diff per frame
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=400 ZINC_SCALE=4 ZINC_SCENE_DUMP=$PWD/bb4.scn ./bb-aot
zinc capture --scene bb4.scn bb/src/main.ts --bench 15 8                                         # raster, 8 threads
# AOT experiments: zinc --emit=cpp kernel.ts > k.cpp; edit; compile with the line `zinc build -vv` prints
# window profile: zinc run bb (hold no key), then `sample <pid> 4 -file out.sample` and read the main thread
```

Numbers to re-measure after each fix: the table's "measured baseline" column, on the same scene files, idle machine, median of 11 (`TESTING.md`), and the Pi rig for the single-core and Pi 3 rows.

## 6. Earlier work (ZN-041, ZN-042)

### ZN-041: interpreter speed (2026-10-06)

Interpreter vs QuickJS went from fib 4.4x, mandelbrot 2.9x, spectralnorm 4.2x to **5.4x, 6.9x, 5.4x** (nbody 5.4x, fannkuchredux 6.2x; the machine was not idle, ratios carry a few percent of noise).
All in `src/ir/opt.cpp` unless said:

- **Branch threading**: `a && b` joined in a block holding only `condbr %p`; an edge that already knows the answer (a constant, or the value its own branch tested) goes straight to the target and an `br` takes
  the test with it, so the loop test of mandelbrot is two fused compare-and-jumps. Only when the join's parameters are used nowhere else.
- **Common subexpressions** of pure operations along chains of single-predecessor blocks (`x * x`, `y * y` of mandelbrot's test and body).
- **Division by a constant power of two** is a multiply by the reciprocal (exact).
- **Constants hoisted after inlining**, so an inlined body's constants are loaded once.
- **Self-recursion inlined once** (functions up to 24 instructions): fib runs two levels per call and return.
- **Superinstructions in the interpreter** (`src/vm/vm.cpp`): `AddI32K` + `Call`, `AddI32` + `Ret` as one dispatch, in a copy of the code that the interpreter makes for the functions that have such a pair (second word unchanged:
  jumps, handler positions and the bytecode format do not change).
- The sampling profiler's `curFn` stores happen only under `zinc profile` (a second instantiation of the loop).

### ZN-042: AOT against native (2026-10-06)

AOT / native: fib 1.93x to 1.42x, sort 2.68x to **1.15x**, spectralnorm 1.14x, mandelbrot 1.17x, binarytrees 1.12x, strings 1.21x, nbody 2.88x (unchanged). What was done and what was found:

- **A typed backend from the IR was not written, because the experiments say the 8-byte Slot is not what costs.** nbody's hot function was converted by hand to typed `double` locals and to `double*` field accesses (no `Slot`, no bit casts):
  the time did not move (106 ms before and after); removing every null check and bounds check did not move it either. The difference to the native build is in its machine code: it uses NEON 2-wide vectors (`fmul.2d`, `fmla.2d`)
  and fused multiply-adds (`fmadd`), which the engine does not allow itself: every host rounds `a * b + c` twice (`-ffp-contract=off`, so the interpreter, the AOT programs and a build for any target print the same digits).
  Matching that needs a decision of the maintainers (a fast-math AOT profile that may differ in the last digit from the interpreter), not a backend. **Superseded by section 4 (2026-10-09): the cost is the array-indexed field
  access, a struct per class fixes it without FMA.**
- **Startup**: an AOT program linked the SDL3 library even when it never draws, which cost about 4 ms of dynamic loading per run (9.5 ms for `console.log(1)`, now 5.3 ms); `zinc build` links the graphics host only for programs that use it.
  fib is 13 ms of work, so this alone moved it from 1.93x to about 1.3x. About 3 ms of startup remains before `main` (the process maps 8 MB it never touches in `main`; not found yet).
- **`arr.sort((a, b) => a - b)`** (and `b - a`) on an `f64[]` called a closure per comparison (20 million calls for the sort kernel). The optimizer now recognises a comparator closure that does only the subtraction and rewrites the call to
  `internal.arrSortAsc` / `arrSortDesc` (two rows at the end of the runtime table), which sorts without callbacks (the library's stable sort when there is no NaN, the same merge as before when there is). Results are identical, NaN,
  infinities and signed zeros included (`tests/golden/run/sort_numbers.ts` compares with the generic path). Programs for a device core are compiled without the rewrite (the core of an older release lacks the rows).
- Not done: the typed C calling convention for numeric functions (fib is 1.4x because every call goes through the `Slot` window), and 4-byte references on 32-bit targets (acceptance criterion 2 of ZN-042).
