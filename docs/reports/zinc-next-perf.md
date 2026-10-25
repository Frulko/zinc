# Zinc Next: performance tracker

Goal of the owner: the fastest possible engine, measured, because apps will be ported to weak hardware (Raspberry Pi 1 and 3, PSP, PS Vita, 3DS, iPhone 4S, NTC CHIP).
This file is the tracker: section 1 is the table (one row per point, a backlog id once the task exists), section 3 the evidence per point, section 5 how to measure again. The M4 kernel table stays in
`zinc-next-m4-benchmarks.md` (`tools/bench-m4`); the render corpus in `bench/render.csv` (`tools/bench-render`). Earlier work (ZN-041, ZN-042) is kept at the end, with a correction of ZN-042's diagnosis (section 4).

Audit of 2026-10-09, after ZN-397's first changes (direct host entries `zn::host::hostFast`, registers as C++ locals in non-leaf AOT functions; both uncommitted at the time of the audit and treated as the baseline here).

## 0. Method, machine, noise

- Machine: Apple M1 Pro (8 performance + 2 efficiency cores), 16 GB, macOS 15.7. Another session was building during the audit: load average moved between 8 and 127, so every number is a median of 5 to 25 runs and the
  minimum is quoted where the spread was large. Ratios between variants measured back to back are more reliable than absolute values.
- No engine rebuild was allowed. Engine numbers come from the existing `build/zinc` and AOT programs; candidate fixes were measured as **experiments**: hand edits of generated AOT C++ compiled with the exact `zinc build` line, and
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
| 16 | PERF-16 | `zinc run` / `zinc dev` startup: faster passes and a ZBC cache | done (ZN-415, ZN-614; lazy plugin load ZN-615) | hero: 1.7 s before the first instruction (lower 436, RC 353, emit 269, check 227, parse 85 ms) | <= 100 ms with a warm cache, <= 0.8 s cold | 3 | M | dev loop; Pi when run from source |
| 17 | PERF-17 | Pipeline: script of frame N+1 runs while bands rasterize frame N | open | main thread waits on bands 63% of the frame (window, 200k) | frame time = max(script + diff, raster) | 3 | M | multi core only |
| 18 | PERF-18 | Borrowed (+0) parameters, `this` included | done (ZN-417, D51; sentinels ZN-616) | parameters are owned: a call retains, the callee releases; a comparison does 3 retains + 3 releases | -10% or better on method-heavy code (zinc:ui) | 3 | L | all |
| 19 | PERF-19 | Packed numeric arrays and narrow fields | open (with ZN-145, ZN-158) | every array element and field is an 8-byte Slot (u8[] uses 8x its size) | element size = type size | 3 | L | memory-poor: PSP, 3DS, ESP32 |
| 20 | PERF-20 | Native RGB565 raster for 16-bit panels | open (ZN-194, ZN-195) | 32-bit raster plus a 32 -> 16 conversion pass (fbdev) | no conversion pass, half the frame bandwidth | 3 | L | Pi 1/Zero panels, CHIP, PSP, 3DS |
| 21 | PERF-21 | Sort with a comparator: direct native call, no retains, key comparators specialised | done (ZN-420: i32[] specialised, navigation paint -40%) | navigation AOT: `mergeSort` + `callComparator` + `exec` ~12% of samples | <= 4% | 2 | M | all |
| 22 | PERF-22 | Interpreter: typed field opcodes, cached globals, fewer checks | open | bouncing-ball script: interpreter 13.2 ms vs AOT 4.2 ms per frame | -25% on the ball loop | 2 | M | ESP32 bytecode core, device-sim, dev |
| 23 | PERF-23 | Allocation registry replaced by counters and a mimalloc heap | open | each alloc pushes on `Machine::allocated`, each free swap-removes and writes another object's header | -5 to -15% on binarytrees and allocation-heavy UI build | 2 | M | all, small caches first |
| 24 | PERF-24 | LTO between the runtime, the host and the program | open | host rows are calls through function pointers (`hostFast`); runtime built -O3, program -O2, no LTO | measured, kept if >= 3% | 2 | M | all |
| 25 | PERF-25 | PGO for the runtime, raster and host libraries | not adopted (ZN-424, D54: about -1%) | measured: -6% to +7% per kernel | measured, kept if >= 5% | 2 | M | all |
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
  Compile `zn_host_gfx` at -O3 (it is -O2 today, `CMakeLists.txt:196`) once the loops are vectorizable.
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

- **Where**: the frontend lowers a module-level `const GRAVITY = 240` to a global: every use is `GetGlobal` (AOT: `r = m.globals[17]`, `src/aot/aot.cpp:169`; a load of the vector's data then of the slot). `src/ir/opt.cpp:461` has no pass for it.
- **Cost now**: in the ball update loop 4 constants are reloaded per ball per frame (800k loads per frame), and they block constant folding (`-vy * FLOOR_DAMPING`). Part of the 2x of the PERF-10 experiment, which hoisted them.
- **Fix**: an IR pass: a global with one `SetGlobal` (in the module init) of a `Const` and no other store becomes that constant at every `GetGlobal`; then `hoistConsts` and CSE do the rest.
- **Gain**: a few percent on numeric loops; more on in-order cores where load latency is not hidden. **Effort** S. **Risk** low (a read before the initialisation would see the value instead of 0: the checker rejects use before definition).
- **Hardware**: in-order cores (Pi 1 ARM1176, CHIP Cortex-A8, PSP Allegrex, 3DS ARM11).

### PERF-06: host rows read program arrays in place

- **Where**: `src/host/gfx_host.cpp:35` (`arr()`: a `zrt::Array<double>` allocated from TLSF and filled element by element), `:124-126` (polygon, path, stroke), then `runtime/gfx.cpp` `add_points` copies again into the frame's point pool.
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

- **Where**: `src/rt/rtcalls.cpp:933` (`StrConcat`: `std::string r(x); r.append(y)`, then `newStr` copies again), `src/rt/machine.cpp:265` (`newStr` scans every byte for `ascii` and the UTF-16 length).
- **Cost now**: two copies and one heap `std::string` per concatenation; the M4 table: jsonout interpreter 16.0 ms vs QuickJS 9.0 ms (the published LOSS), AOT 7.4 vs native 6.8.
- **Fix**: allocate the `StrObj` at `x->len + y->len` and copy once; `ascii = x->ascii && y->ascii`, `u16len = x->u16len + y->u16len` (no rescan); a builder for template literals with more than two parts (`StrConcatM`).
- **Gain**: 1.3-2x on concatenation-heavy code; jsonout interpreter to QuickJS parity. **Effort** S. **Risk** low. **Hardware**: all.

### PERF-10: typed AOT emission

- **Where**: `src/aot/aot.cpp:120-200` (every value is a `Slot`; fields are `o->fields()[c]`; `SetField` checks `o->cls->fieldRef[c]` at run time even when the IR knows the field is a number).
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

- **Where**: `src/gl/webgl_js.cpp:387` (`zincPresent`: `Offscreen::read` = `glReadPixels` of the whole canvas into a new vector), `src/main.cpp:489` (`glPresent`: flips rows, drops alpha and averages 2x2 supersamples on the CPU), then the
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

- **Where**: `src/ir/rc.cpp:76` (`lendsForever`: a borrowed load skips its retain/release only if the **whole function** has no call, no runtime call, no reference store); `src/rt/rt.h:220` (`retain` checks `mem` statistics on every call);
  `op::release` is out of line in AOT programs (navigation sample: 130 samples, 6%).
- **Cost now**: `zinc mem` on 200k balls, 10 frames: 4.6 M retains and releases: 400k pairs per frame, all for loop elements that nothing can free (the loop bodies only call `width()`, `height()`, `rect()`). In the draw loop they turn a read-only
  pass into writes to 200k objects.
- **Fix**: per borrowed value, check only the instructions inside its live range; flag runtime rows that never release program references (all scalar gfx and sys rows) in the runtime table; inline the release fast path
  (`--rc == 0` test, call `destroy` out of line); move the `mem` statistics test out of `retain` (counted by the profiler build only).
- **Gain**: part of the PERF-10 2x; the interpreter gains too (RC is in the IR). **Effort** M. **Risk** medium (a wrong elision is a use-after-free: ASan corpus and `ZN_LEAK_CHECK` gate it). **Hardware**: all.

### PERF-15: per-target CPU flags and number profiles

- **Where**: `src/main.cpp:1250`, `src/tc/tc.cpp:321,362`, `src/tc/plugin_build.cpp:87`: armhf is always `-mcpu=arm1176jzf_s`; aarch64 has no `-mcpu`; `src/frontend/profile.cpp:8-15` has no psp, vita, 3ds, chip, iphone profile.
- **Cost now**: a Pi 2/3 running a 32-bit OS gets ARMv6 code: no NEON (so no vector fill of PERF-02), VFPv2 scheduling, no ARMv7 instructions. On PSP `number` (f64) would be software double: the Allegrex FPU is single precision.
- **Fix**: two armhf variants (armv6+vfp2 for Pi 0/1; `-mcpu=cortex-a7`/`cortex-a53 -mfpu=neon-vfpv4` for Pi 2/3/4 32-bit), `-mcpu=cortex-a53` for aarch64 Pi 3, `cortex-a8+neon` for CHIP; picked by `zinc deploy`/`export` from the board;
  profiles `psp` (`number` = f32), `vita`, `3ds`, `chip` with their heaps and screens. Measure each under QEMU user and on the Pi rig.
- **Gain**: estimated 10-30% on Pi 2/3 32-bit (more with PERF-02's NEON rows); on PSP the difference between hardware and soft float. **Effort** M. **Risk** low (`-ffp-contract=off` stays: same digits).
- **Hardware**: Pi 2/3 32-bit, CHIP, PSP.

### PERF-16: `zinc run` / `zinc dev` startup

- **Where**: the compile pipeline, `src/ir/rc.cpp` (liveness as dense `std::vector<std::vector<char>>` of blocks x values per function), `src/ir/lower.cpp`, `src/zbc`.
- **Cost now**: `zinc run examples/hero -v`: parse 85, check 227, lower 436, optimise 100, reference counting 353, emit ZBC 269 ms; the program itself 36 ms; 1.7 s wall before the first frame on the M1 (a Pi 3 is roughly 10x slower).
  AOT hero starts in 50-60 ms warm (no compile).
- **Fix**: sparse liveness (bitsets per block over the tracked values only), profile `lower` and `emit` for quadratic spots; a ZBC cache keyed by the hash of the sources, the profile and the engine version, so an unchanged project starts at once
  and `zinc dev` restarts recompile only what changed.
- **Gain**: restart 1.7 s -> <= 0.1 s warm, <= 0.8 s cold. **Effort** M. **Risk** low. **Hardware**: the dev loop; any device that runs from source.
- **Result (ZN-415, 2026-10-10, Intel Mac i7-8850H, the development machine now)**: phases of hero before -> after, ms: parse 133 (+150 of plugin loading), check 315 -> 155, lower 357 -> 66, optimise 138 -> 137,
  reference counting 650 -> 68, emit ZBC 274 -> 92. Three quadratic spots: the reference-counting liveness (dense byte vectors of blocks x values, 1,109 x 6,522 in one function: now bit sets over the tracked values),
  the register allocator's liveness in the emitter (the same, now bit sets), `simplifyParams` in the lowering (one rewrite of the whole function per removed block parameter: now rounds that remove them all at once,
  292 -> 2 ms), and the checker's forward-declaration scan (each top-level declaration walked every statement above it: now one running set). The ZBC is byte-identical before and after on 46 programs (5 examples and
  the conformance corpus). An interpreted run (`zinc dev`, `--interp`, a headless or `--profile` run) now starts from a cached ZBC when nothing it was compiled from changed (`~/.zinc/cache/zbc`, keyed by entry and profile,
  invalidated by any source, `zinc.json`, `lib/std`, plugin, engine binary or compiler variable; `tests/t1/zbc_cache.sh`). hero, interpreted, to its first frame and exit: cold 2.06 -> 1.05 s, warm 2.06 -> 0.31 s;
  breakout warm 0.02 s. ZN-614 then found that 139 ms of hero's warm 0.31 s was the video plugin's cache check spawning 16 processes (command -v and pkg-config --exists/--cflags/--libs for each of its 4
  libraries), not the dlopen of FFmpeg (22 ms): one pkg-config query per plugin brings hero to warm 0.20 s, cold 0.95 s. Loading a plugin at its first call would save the remaining ~25 ms (ZN-615). The native cache of a compiled run (ZN-605) also lists `lib/std` now: an edit there no longer starts a stale executable.

### PERF-17: pipeline the script with the raster

- **Where**: `runtime/gfx.cpp:767` (`end_frame` presents synchronously), `hal_sdl.cpp:432` (`hal_present` waits for the bands, uploads, presents).
- **Cost now**: window, 200k: the main thread waits for the bands 63% of the frame while the script and diff of the next frame could run.
- **Fix**: a third command buffer; `end_frame` hands frame N to the band workers and returns; frame N+1's script and diff run; the upload of N happens when its bands are done (before N+1 is handed over). One frame of extra latency, opt-out for
  input-latency-sensitive programs; `ZINC_SHOT` and deterministic runs keep the synchronous path.
- **Gain**: frame time = max(script + diff, raster) instead of the sum (today ~30 ms -> ~21 ms at 200k, before the raster fixes). **Effort** M. **Risk** medium (plugins reading the frame buffer, live resize). **Hardware**: multi-core only.

### PERF-18: borrowed (+0) parameters

- **Where**: `src/ir/rc.cpp:24` (`consumes`: a call consumes its arguments), the native ABI.
- **Cost now**: every call that passes an object it keeps (a method's `this`, a node handle) retains it and the callee releases it; `callComparator` does 3 retains and 3 releases per comparison; `zinc mem` on hero's start: 153k retains for 2.4k allocations.
- **Fix**: parameters are borrowed by default; the callee retains only what it stores or returns; the RC pass and the native ABI change together.
- **Gain**: estimated 10-30% on method-heavy code (zinc:ui, kit). **Effort** L. **Risk** high (a convention used by every back end and native module). **Hardware**: all.

- **Result (ZN-417 with ZN-606, 2026-10-10, D51)**: parameters inferred borrowed when no use consumes them (per function and per vtable slot; closures' `call` and `__errorString` stay owned), and calls of functions that cannot store a reference keep loads lent. hero start 70,130 -> 56,398 retains (-20%), 60 frames -26%; maps/navigation AOT paint 7.18 -> 7.05 ms (-2%); no ABI change. The rest is stores of shared sentinels into each UiNode's fields (ZN-616).

### PERF-19: packed numeric arrays and narrow fields

- **Where**: `src/rt/rt.h` (`ArrObj::v` is `ObjVec<Slot>`; every field is a `Slot`).
- **Cost now**: a `u8[]` uses 8 bytes per element, an `i32[]`/`f32[]` 8; a `Ball` is 64 bytes. Memory and bandwidth 2-8x on numeric arrays.
- **Fix**: element storage at the element's size for numeric arrays (typed views in the AOT, a size switch in the interpreter), fields at their size in the PERF-10 structs.
- **Gain**: memory and cache 2-8x on numeric data. **Effort** L. **Risk** medium (natives, JSON, sort see arrays). **Hardware**: PSP (24 MB for the program), 3DS, ESP32. With ZN-145 and ZN-158.

### PERF-20: native RGB565 raster for 16-bit panels

- **Where**: `plugins/display-fbdev/fbdev.cpp:60-75` (32 -> 16 conversion per band, already fused and parallel), `runtime/raster.cpp` (32-bit only).
- **Cost now**: every frame is rasterized at 32 bits and converted; `render-perf-options.md` measured the Pi 3 with the 7" DSI panel (RGB565).
- **Fix**: the raster templated on the pixel format (ZN-194 plans it for ESP32, ZN-195 the fixed-point template); fbdev and SPI panels render straight into 565.
- **Gain**: half the frame bandwidth, no conversion pass. **Effort** L. **Risk** medium (pixel goldens per format). **Hardware**: Pi 1/Zero panels, CHIP, PSP and 3DS 16-bit modes, MCU panels.

### PERF-21: sort with a comparator

- **Where**: `src/rt/rtcalls.cpp:276` (`mergeSort`), `src/rt/machine.cpp:334` (`callComparator`: retains the closure and both elements, goes through `Machine::exec`, the callee releases them).
- **Cost now**: navigation AOT: `mergeSort` 79, `callComparator` 59, `exec` 125 of 2285 samples (~12%).
- **Fix**: AOT calls the comparator's native function directly with borrowed arguments; the optimizer extends ZN-042's `specializeSort` to `(a, b) => a.k - b.k` on objects (extract the keys once, sort indices, stable).
- **Gain**: most of the 12%. **Effort** M. **Risk** low (the stability and NaN cases have goldens). **Hardware**: all.

- **Result (ZN-420, 2026-10-10)**: navigation's sort was an `i32[]` with `(a, b) => a - b`, which the f64-only specialisation missed; it now covers `i32[]` too (the runtime keeps the comparator's 32-bit wrap: the same merge when the values span 2^31, else a stable sort). AOT navigation paint 3.05 -> 1.82 ms per frame p50 (-40%) on the Intel Mac; no comparator call left in the profile.

### PERF-22: interpreter hot paths

- **Where**: `src/vm/vm.cpp` (`L_SetField` through `op::setField`: three dependent loads for `fieldRef` per store; `L_GetGlobal` through the `globals` vector; Rt rows through `rtCall`).
- **Cost now**: bouncing-ball script at 200k: interpreter 13.2 ms, AOT 4.2 ms per frame; navigation paint: interpreter 6.5 ms, AOT 3.5 ms.
- **Fix**: `SetFieldS` / `SetFieldR` opcodes chosen by the compiler from the field type (no run-time `fieldRef`); the globals' data pointer in a local of the loop; the hostFast entry tested before `rtCall` in `L_Rt`.
- **Gain**: ~25% on object-heavy scripts (estimate). **Effort** M. **Risk** low (ZBC opcode table change: the device core of an older release needs the version check). **Hardware**: the ESP32 bytecode core, device-sim, `zinc run`.

- **Result (ZN-421, 2026-10-10, D53)**: not done. Measured on the idle Intel Mac (200k balls interpreted 19.0 ms, AOT 8.2 ms): hostFast in `L_Rt` 0%, a SetField without the kind look-up at best -9%, and the safe version (verifier-marked stores rewritten into an internal opcode) slower, because a new handler changes the code of the whole dispatch loop. The gain is in fewer instructions per ball, not cheaper ones.

### PERF-23: allocation registry

- **Where**: `src/rt/rt.h:207` (`track`: `allocated.push_back`), `src/rt/machine.cpp:161-163` (swap-remove on free, writing into the header of the object moved).
- **Cost now**: one vector push per allocation and a write into an unrelated object per free (a likely cache miss); the registry exists to count and free leftovers at exit. Not isolated by measurement (needs a runtime rebuild).
- **Fix**: live counters for the leak count; objects in a dedicated `mi_heap_t`, `mi_heap_destroy` at exit; `mi_heap_visit_blocks` when a leak listing is asked for; `traceFree` keeps its serials.
- **Gain**: estimated 5-15% on allocation-heavy code (binarytrees, strings, building a UI tree). **Effort** M. **Risk** low-medium (leak reports and destruction-order tests must stay identical). **Hardware**: all; small caches most.

- **Result (ZN-422, 2026-10-10)**: AOT programs count their live objects instead of registering each one (the leak count is live - immortals everywhere); the interpreter keeps the registry (the device core frees leftovers between programs, zinc mem lists them) and measured no gain without it. AOT binarytrees -2 to -6%, strings -4 to -6% (Intel Mac).

### PERF-24: LTO across runtime, host and program

- **Where**: `src/main.cpp:1349` (the program at -O2 links `libzn_rt.a`, `libzn_host_gfx.a` built separately); host rows are function pointers (`zn::host::hostFast`), so `gfx::rect` and `push` are never inlined into the loop.
- **Cost now**: not measured (needs LTO builds of the libraries). `push` + `rect` + `width`/`height` entries are ~0.9 ms of the 2.1 ms typed script at 200k.
- **Fix**: ThinLTO objects for the runtime and the host; direct calls instead of `hostFast` pointers when the host is linked statically (keep the table for the interpreter and plugins).
- **Gain**: estimated 3-10% of script time in host-call-heavy loops. **Effort** M (link time grows; see PERF-28). **Risk** low. **Hardware**: all.

### PERF-25: PGO

- **Where**: the CMake build of `zn_rt`, `zn_host_gfx`, `zinc` (interpreter loop).
- **Cost now**: not measured.
- **Fix**: a profile from the M4 kernels, the render corpus and three demos; `-fprofile-use` for the release build; optional `zinc build --pgo` for programs.
- **Gain**: estimated 5-15% for the interpreter and the raster. **Effort** M. **Risk** low (profile data must be versioned). **Hardware**: all.

- **Result (ZN-424, 2026-10-10, D54)**: not adopted. `tools/pgo` (instrumented build, training on the M4 kernels, a hero compile and headless frames, profile-guided build): M4 interpreted about -1% overall (-6% to +7%), hero compile -2%, bouncing-ball 200k +2% on the Intel Mac with Apple clang 17. Below the 5% the task asked.

### PERF-26: render scale for pixel-art gfx programs on HiDPI windows

- **Where**: `targets/macos/hal_sdl.cpp:54` (`k = zoom * density`): a 320x240 program opens at zoom 2 and renders at 1280x960 on Retina.
- **Cost now**: 16x the logical pixels (the 200k scene: 144.8 M pixel writes instead of 9 M at 1x).
- **Fix**: zinc.json `targets.<id>.pixelScale: "density" | "logical"` (default unchanged): render at the density only and let the GPU magnify the zoom (nearest), or at 1x for pixel art.
- **Gain**: 4x fewer pixels at zoom 2. **Effort** S. **Risk** low (opt-in). **Hardware**: desktop only (the target devices are 1x).

- **Result (ZN-425, 2026-10-10)**: `zinc.json` `targets.<id>.pixelScale: "logical"` (or `ZINC_PIXEL_SCALE`) draws at 1x and the window magnifies with nearest filtering (GL present pass and SDL_Renderer); a 320x240 program at zoom 2 on Retina draws 76,800 pixels per frame instead of 1.2 M. The default stays "density".

### PERF-27: Metal-native texture format

- **Where**: `targets/macos/hal_sdl.cpp:42` (`SDL_PIXELFORMAT_XRGB8888`). SDL3's Metal renderer supports ARGB8888 and ABGR8888 only (`third_party/SDL3/src/render/metal/SDL_render_metal.m:2410`), so it creates a native ARGB texture and
  converts every `SDL_UpdateTexture` (`Blit8888to8888PixelSwizzleNEON`).
- **Cost now**: `SDL_UpdateTexture` 64 of 4026 main-thread samples (1.6%, ~0.5 ms per 1280x960 frame).
- **Fix**: ARGB8888 with `SDL_BLENDMODE_NONE` (the alpha byte is ignored), as the transparent-window path already does.
- **Gain**: ~0.5 ms per full frame on macOS. **Effort** S. **Risk** low. **Hardware**: macOS (iOS if it uses Metal; the i4S uses GLES2, where XRGB is native).

- **Result (ZN-426, 2026-10-10)**: ARGB8888 with blending off for opaque windows; no pixel conversion left in `SDL_UpdateTexture` (was 49 of 67 samples of it at 200k with `ZINC_RENDERER=cpu` on the Intel Mac), window captures identical. Only the SDL_Renderer path benefits: the default macOS window renders with the GL replay.

### PERF-28: parallel AOT compile

- **Where**: `src/main.cpp:1349` (one C++ file per program at -O2).
- **Cost now**: `zinc build examples/maps/navigation`: 81 s wall (68 s user); bouncing-ball 5.6 s; nbody 1.3 s.
- **Fix**: split the generated functions into N translation units compiled with the machine's job limit (`WGC_JOBS`, 16 GB machines: 3), cache objects by the hash of their functions.
- **Gain**: <= 30 s for navigation; incremental rebuilds in seconds. **Effort** M. **Risk** low. **Hardware**: the dev loop.

- **Result (ZN-427, 2026-10-10)**: units of 48 functions after a first unit of tables, resources and main; objects cached by unit hash, a precompiled header for clang, `ZINC_JOBS` compiles at once (half the cores). Navigation on the Intel Mac: cold 12.2 s, unchanged 1.3 s, one function changed 4.3 s; frame time unchanged.
- **Tool (ZN-598, 2026-10-10)**: `zinc profile <file> --engine quickjs` in a `-DZN_QJS_PROFILE=ON` build: the hottest JS functions with file:line and the opcode mix. three.js (500 meshes, 200 frames): `multiplyMatrices` 22.8% of samples, `get_loc_check` 20.8% / `swap` 12.5% / `mul` 7.2% of 362 M bytecodes. Default build: same instructions as the release. Details and the other workloads: `zinc-next-profiling.md`.
- **Spike (ZN-599, 2026-10-10)**: QuickJS bytecode to C by copying the interpreter's opcode bodies (`tools/qjs2c`): three.js 7.31 -> 5.71 ms/frame (1.28x), sprite 10.19 -> 7.28 (1.40x), objects 1.22 -> 1.13 (1.08x), matter-js 9.42 -> 7.32 ms/step (1.29x); code 53-61x the bytecode. Below the gate (2x, 15x): no-go, D55, `zinc-next-qjs2c.md`.
- **Measured, not adopted (ZN-600, 2026-10-10)**: inline caches in the QuickJS interpreter, 89-99.9% hits: three.js 0.98-1.00x, sprite 0.97-0.98x, objects 1.01-1.06x, matter-js 0.98-1.02x (gate 15%). D56, `zinc-next-qjs-ic.md`; arm64 remeasure ZN-600.01.
- **Result (ZN-615, 2026-10-10)**: a native plugin's library loads at its first call (exports cached beside the build): hero's cached interpreted start 326 -> 300 ms (10 starts x 3, FFmpeg no longer loaded); the cache check left (zinc:video 34 ms) is ZN-617.
- **Tool (ZN-375, 2026-10-10)**: ZINC_PERF_HUD, a live performance panel (FPS, work p50/p99, phases, 120-frame graph) over any program; its own cost 0.14-0.19 ms per frame on the CPU renderer at Retina density, 0.01 ms on the GPU renderer (`docs/dev-mode.md`).
- **Result (ZN-399, 2026-10-10)**: AOT code reads width() / height() inline (no host call): bouncing-ball 200k update loop 2.50-2.71 -> 1.33-1.41 ms per frame on the Intel Mac, prototype native 2.21-2.30 ms; draw loop at parity (3.0 vs 2.9 ms).
- **Measured (ZN-562.03, 2026-10-10)**: WebGL per call, `bench/gl_calls.ts` / `.js` (Intel Mac, 200k calls, 3 runs, ns): zinc:gl AOT getError 17, uniform4f 63-66, uniformMatrix4fv 94-104, drawElements 330; zinc:gl interpreted 26-29, 73-86, 112-124, 300-360; QuickJS binding 73-79, 135-167, 1805-1923 (the typed-array exception path, ZN-567), 376-468. Direct entries (zn_webgl_fast, like zinc:gfx's) for the scalar rows took AOT getError from 40 to 17 ns and uniform4f from 93 to 65; uniformMatrix4fv keeps the decoded path (its array is engine-internal).
- **Result (ZN-563, 2026-10-10)**: zinc:3d on the GPU (render3d.gl.cpp), Intel Mac, AOT, 800x500, CPU time per frame (animation + render + read), 240 frames after 60: 1000 cubes (`bench/three_many.ts`) software 3.18 ms, GPU 2.43 ms headless and 2.9 ms at 60 fps in a window; the same scene in real three.js r186 on QuickJS (`bench/qjs/three_many.mjs`) 73.3 ms (70.6 render + 2.6 read). `examples/three/cubes` 0.51 ms software, 0.36 ms GPU per render. The read decides: synchronous GL_BGRA read 2.5 ms (the driver converts on the CPU), RGBA bytes into a pixel buffer mapped one frame later 0.07 + 0.1 ms (the shaders write blue first).
- **Result (ZN-588, 2026-10-10)**: zinc:gfx records its commands in physical pixels; the `to_physical` pass only converts C++ plugins' commands (`gfx::emit`). `bench/scale_push.ts` (200k rectangles, all moved, scale 4, AOT, Intel Mac with other agents building: load 90-120, so main-thread CPU time, not wall time): end_frame before present 0.81-0.93 ms (p50 0.92-1.05) -> 2-3 us; the whole frame's main-thread CPU p50 20.3-21.2 -> 18.5-20.4 ms (the multiplies at record time do not show). Frames identical at scales 2 and 4 on 12 programs (6 frames each) and tests/data/scale_push.
- **Result (ZN-589, 2026-10-10)**: shadows reuse mirrored columns (2cx whole) and mirrored rows with their spans (2cy whole); Intel Mac, unloaded (load 5-6), 1 thread, 2000 shadows of b2-rounded (shadows only, 1000x640, median of 40): 18.5-18.9 -> 16.9-17.2 ms, 9.2-9.4 -> 8.4-8.5 us per shadow; instructions 68.3k -> 65.8k per shadow. Left on this machine: blending the ~2400 partly covered pixels (blend_alphas ~40% of the cycles, the rows' cache lines) and the alpha rows (~30%); a 16-bit-lane SSE2 blend_alphas was within noise (-4%) and dropped. The 4 us target was set on the M1 (4.38 us there): remeasure on arm64 in ZN-589.01.
- **Result (ZN-590.01, 2026-10-10)**: strokes as STROKE commands drawn by the GL replay (capsule distance). examples/maps/navigation in the macOS GL window (the default renderer), Intel Mac, 200 frames, ZINC_GPU_STROKES=0 vs 1, twice: present p50 232-247 -> 12.8 ms (vsync), CPU to submit the frame 252-294 -> 1.5 ms, LINE/POLY tiles rasterized on the CPU 836 -> 0.1 per frame, strokes tessellated 1158 -> 0. The paint phase reads 2.2 -> 3.5 ms in the window (the CPU no longer runs at full clock between frames); headless at the same load it goes 14.65 -> 14.28 ms. GL frames against the software ones (tools/glcompare): navigation 0.42% of pixels over 24, mae 0.35; shapes 0.99% / 0.77; hero 0.18% / 0.16.
- **Result (ZN-590.02, 2026-10-10)**: LINE/POLY filled on the GPU (stencil then cover, distance fringes) instead of the CPU coverage tiles; macOS GL window, Intel Mac, 200 frames, ZINC_GL_POLY=0 vs 1, CPU to submit a frame: hero 4.0 -> 0.5 ms, lottie-gallery 11.4 -> 2.8 ms (83 tiles -> 0; present p99 33 -> 18.5 ms), svg-gallery 3.6 -> 1.4 ms, canvas/sketch 9.7 -> 3.9 ms (its gradient paints keep 16.7 tiles, ZN-590.04), navigation at rest 1.0 -> 1.4 ms (its static tiles were cached; 0 tiles now, nothing to rasterize when the map moves). Paint unchanged. GL vs software (tools/glcompare): hero 0.18% / 0.16, navigation 0.42% / 0.37, lottie 1.28% / 0.84 (1.17% with the tiles), svg 3.85% / 2.08 (3.87% with the tiles), shapes 0.99% / 0.76, sketch 0.80% / 0.55.
- **Result (ZN-590.04, 2026-10-10)**: canvas gradient paints (grad 4) computed by the GL replay's shader (paint_at's t, stop interval and 1/256 weight; up to 8 stops in uniforms) and consecutive POLYs whose boxes are apart drawn as one batch (7 draw calls for up to 64 shapes). display-gl (ZINC_DISPLAY=gl ZINC_RENDERER=gl), Intel Mac, ZINC_DETERMINISTIC, 300 frames, before -> after, back to back (load 5-8): canvas/sketch 28.1 -> 0 CPU tiles per frame, CPU to submit 8.87 -> 1.18 ms (draw calls 97 -> 208: a gradient POLY is a batch of its own); lottie-gallery 610.5 -> 448.5 draw calls, 2.52 -> 2.25 ms; svg-gallery 228.8 -> 172.5 draw calls, 0.96 -> 0.88 ms. GL vs software (tools/glcompare): sketch 0.85% / 0.60 -> 0.87% / 0.63, lottie and svg unchanged (1.40% / 0.94, 3.86% / 2.09).
- **Result (ZN-592, 2026-10-10)**: zinc's launch on the Intel Mac: time to main 29 ms (empty program with the same frameworks 9.3 ms, plain 3.5 ms); in main before the command 0.4 ms. Sampled (a suspended launch under `sample`): dyld's fixups ~11 ms (1800 binds) and the replaced global operator new (dyld patches libc++'s uses in the shared cache) ~8 ms; zinc's 29 static initializers under 0.1 ms each. zinc no longer links alloc_new.cpp (the runtime's containers count through ObjAlloc): time to main 21-24 ms, `zinc --version` 21.1 ms and `zinc run` of console.log(1) 23.0 ms best of 20 (zinc's own 14.3 / 16.1 ms over an empty program, budget 20 in tests/t1/launch_time.sh); `zinc check examples/hero` 0.42-0.44 -> 0.44-0.47 s (system malloc for the compiler). -fvisibility-inlines-hidden: 1793 -> 1705 binds, no gain, not kept. jsonout in tools/bench-m4: interpreter 33.6 ms vs QuickJS 14.0 (launch-bound): ZN-592.01 (window host on demand).
- **Result (ZN-592.01, 2026-10-10)**: zinc's launch on the Intel Mac (machine loaded 5-9 by other builds; instructions from `/usr/bin/time -l`, best of 8-10; wall clock best of 40, interleaved): `zinc --version` 115.5M -> 31.5M instructions (66M -> 21M cycles), 21.2 -> 8.3-10 ms (empty program linked with libc++ only: 4.6 ms, 8.0M instructions). Steps: the window host as a module beside zinc 115.5M -> 107.2M; libc++ weak definitions no longer exported (no shared-cache patching) -> 85.8M; no exported weak definition at all (629 -> 6 coalescing binds) -> 37.4M; CoreFoundation opened instead of linked (400 -> 31 initializers) -> 31.5M. `zinc run` of a cached console.log(1): +1 ms over --version (stamps of ~80 inputs now one stat each: 36.7M -> 34.6M). tests/t1/launch_time.sh: zinc's own 3.6-4.5 ms (budget 5), run 5.1-5.9 (budget 6). jsonout interpreted (`zinc run jsonout.zbc`) 24.4 -> 10.6 ms vs qjs 6.9 ms (qjs on an empty file: 5.3 ms); tools/bench-m4 medians under load: interp 18.4, AOT 16.2, QuickJS 14.6. Tried, no gain: `-no_fixup_chains` (30.9M instructions, same wall time).
- **Result (ZN-592.03, 2026-10-10)**: where zinc's last ~3 ms of launch go (Intel Mac, time from process start (proc_pidinfo) to the first and last static initializer, probes linked first and last; interleaved, 40 runs): an empty program reaches main at 4.8 ms (median 5.6 under load), zinc its first initializer at 8.2 (median 9.0) and its last 0.5 ms later. Synthetic programs with zinc's imports only: its 354 libSystem symbols 6.6 ms (+1.8 to +2.0: dyld searches libSystem's 38 re-exported libraries in order for each), its 199 libc++ symbols +0.2-0.3, 12 MB of constant data +0.4. Hiding the last exported weak definition (hal_heap_region_more: no MH_WEAK_DEFINES, so no check of zinc's exports against the shared cache) -0.5 ms (median 9.04 -> 8.50). Tried, not kept: -no_fixup_chains (no change), -dead_strip with an ABI export list (11.9 -> 10.8 MB, libSystem binds 389 -> 333, risky for the plugin ABI). launch_time.sh: --version 3.8-4.4 ms over the empty program, run 5.0-5.3. Next lever: the toolchain as a module (ZN-592.05).
- **Result (ZN-592.06, 2026-10-10)**: compiled programs that do not draw (Intel Mac, best of 40 interleaved, empty program 4.9 ms): a console program with a setTimeout linked 25 libraries (SDL3, AppKit, CoreFoundation's ~400 initializers) and started in 16.6 ms; without the window host 10.0 ms; with -dead_strip and -no_exported_symbols (2.1 -> 1.6 MB, libSystem binds 306 -> 240, no weak definition) 8.1 ms; with mimalloc's exit purge skipped, no baked fonts and a calloc'ed call stack 7.0 ms (1.4 MB). `console.log(1)` compiled: 6.6 -> 5.1 ms (231 KB). `zinc run` of a cached console.log(1): 4.1 ms over the empty program (was 5.0-5.3). Left: the host's row dispatch pulls ~240 libSystem imports into any program that calls the host (~1.2 ms): ZN-592.07.
- **Result (ZN-654, 2026-10-10)**: jsonout's work in the interpreter (cycles of the run minus cycles of an empty run, Intel Mac at load 6-9): integer toString through std::to_chars instead of snprintf (4% of a profile of 3000 iterations), and the generated JSON serialiser of an object without optional fields is one concatenation instead of an array, four pushes and a join. 200 iterations of jsonout's body: 662M -> 631M -> 538M cycles (QuickJS 701-743M). One run, best of 30: interpreter work 4.79M -> 3.51M cycles vs QuickJS 4.00M; tools/bench-m4 (fastest of 22 alternated runs): 1.00x, 1.16x, 1.12x (was 0.77x by medians).
- **Result (ZN-657, 2026-10-10)**: zinc:3d on the GPU with 4x multisampling and mipmapped textures (Intel Mac, headless GPU, examples at 640x480, frame time = (wall of 1100 frames - wall of 100) / 1000, best of 3, load 6): 3d/cubes 0.385 -> 0.445 ms per frame (0.379 with ZINC_3D_MSAA=0), 3d/model 0.332 -> 0.394 ms; at pixel scale 2 (a Retina window's density, 1280x960 with 4 samples) 1.21 and 1.20 ms. Edge pixels of a turned cube that are stair steps: 100% -> 60.4% (tests/t1/zinc3d_aa.sh).
- **Result (ZN-602, 2026-10-10)**: mapset (tests/bench/kernels), Intel Mac, AOT against the prototype's native release build on the same machine: 2.00x -> 1.15x in CPU cycles (alternated, 41 runs each: native 79.1 M, AOT 91.7 M; wall 40.0 vs 45.3 ms, 1.13x). Integer-keyed Table::find inline in rt.h (key compared before the dead flag, the dead flags not read while nothing was erased), Map.set / Set.add insert an absent key without a second search (putNew), compiled code calls Map.get/has/set and Set.add/has directly (op::mapGet...: no rtCall dispatch, no frame window), plain stores for number globals. Interpreter mapset 567.0 -> 535-539 M instructions. Tried and dropped: buckets holding the key or hash beside the entry (16-byte buckets, 2-3 MB index: 52 ms vs 42), a one-entry cache of the last key found (+5% cycles: the repeated probes were already in L1).
- **Result (ZN-617, 2026-10-10)**: a start takes a plugin's stamp (the last build's results, valid while its input files and libraries keep their stat) instead of pkg-config, the thunk generation and the hashing: hero's interpreted start (cached bytecode, headless, one frame, 10 starts, Intel Mac at load 8-10) 214-226 -> 173-201 ms median; per plugin video 41-106 ms -> 0.28 ms, lottie 10-27 -> 0.3 ms (pkg-config alone 80+ ms under load).

### ZN-638: console output written at each event-loop turn

Not a speed-up: a correctness change with a measured cost. `console.log` of the interpreter and of AOT programs stayed in `Machine::out` until exit (QuickJS went through stdio, block buffered into a file or a pipe), so `zinc run app > log &` showed nothing while the app ran. The output is now written at each turn of the event loop (`host.evReady`, and before `host.loopWait` sleeps; `fflush` at each turn of the QuickJS loops), not per line: a loop that never yields still writes once.

Before -> after, output to a file, alternating runs, median of 11 (21 for the first two rows), Intel Mac, load average 4.4 to 7.1 (other builds running: read the ratios, not the absolute values):

| Case | Before | After | Ratio |
|---|---|---|---|
| 1,000,000-line loop, interpreter | 98.1 ms | 100.0 ms | 1.02 |
| 1,000,000-line loop, AOT | 62.4 ms | 62.2 ms | 1.00 |
| 1,000,000-line loop, QuickJS | 2084.7 ms | 2068.7 ms | 0.99 |
| jsonout kernel, interpreter (compile included) | 26.3 ms | 26.1 ms | 0.99 |
| 100,000 timer turns, one line each, interpreter | 1781.4 ms | 2506.8 ms | 1.41 |
| 100,000 timer turns, one line each, AOT | 1650.4 ms | 2359.8 ms | 1.43 |
| 20,000 headless frames, one line each, interpreter | 422.0 ms | 572.0 ms | 1.36 |
| 20,000 headless frames, one line each, AOT | 338.6 ms | 444.7 ms | 1.31 |
| 20,000 headless frames, one line each, QuickJS | 103.2 ms | 204.7 ms | 1.98 |

The cost is one `write` per turn that printed: 5 to 8 us, about 0.05% of a 16.6 ms frame; a turn that prints nothing pays a test. Side effects: a long-running program no longer keeps all it printed in memory until exit, and `zinc run app | head -1` ends at its next turn (SIGPIPE) instead of running to the end. Not re-measured after the rebase, nor on an idle machine.

### ZN-432: drawImageRect and imageFromBytes, cost on the existing drawImage path

A feature, measured so that the plain `drawImage` path is not slower. Baseline: main at c1375124 (with setTransform); 8 alternating rounds, Intel Mac, load average 5.5 to 6.3 with other trees building: read it as "not slower", the 7% in favour of the new binary is within what the load moves.

| Measure | Before | After | Ratio |
|---|---|---|---|
| 600 whole-image `drawImage` of baked images, 1000x640, `zinc capture --scene --bench 60 1`, median of medians | 75783 us | 70212 us | 0.926 |
| same, minima | 70424 us | 63372 us | 0.900 |
| same, user CPU | 4.638 s | 4.296 s | 0.926 |
| 600 `drawImage` of a runtime image per frame, 61 frames rendered, user CPU | 3.536 s | 3.536 s | 1.000 |

Pixel hashes identical before and after. Keeping the boxed draw out of `draw_image` (a function of its own) matters: inlined, the ratios were 1.018 and 1.032. Size: `codec.cpp.o` text 36.5 -> 87.2 KB (+50.7 KB in a built program that draws: the second static stb_image for PNG and JPEG at run time). GL replay of the test frame: 28 quads in 10 draw calls (a filter change flushes the batch). To remeasure alone on an idle machine.

### ZN-583.02 and ZN-649.02: zinc:physics3d (Jolt) and the 3D pinball

Measured on the Intel Mac with other trees building (load average 5.1 to 6.3, CPU held back by heat): indicative, to remeasure alone.

| Measure | Result | Target |
|---|---|---|
| 1,000 awake piled bodies, 60 Hz, one step, compiled (AOT) | 4.13 and 4.45 ms | 3 ms (ZN-583), not met |
| same, interpreter | 4.5 to 4.6 ms | |
| same, QuickJS through the native bridge | 5.16 ms | |
| of which Jolt's own step, one thread | 4.3 ms | |
| pinball3d in a window, 1280x800, compiled, GPU: physics and rules per frame (16 steps of 960 Hz) | 0.29 to 0.36 ms | |
| same: scene and score panel per frame | 0.56 to 0.77 ms | |
| same: frames per second | 59 to 60 (60 Hz display) | 120 fps not shown |
| size of a program importing zinc:physics3d | +1.92 MB (2,143,904 against 227,152 bytes) | |
| cold build of the plugin (pinned zig) / after a wrapper edit / cache hit | 48.2 s / 6.7 s / 0.03 s | |

After the look of ZN-649.08 (textures, models, the deck; window 1280x800, 2560x1600 physical, GPU, 60 Hz, load 4.4 to 5.2): physics and rules 0.35 to 0.42 ms, scene and panel 1.3 to 1.8 ms compiled; 0.53 to 0.65 and 1.9 to 2.3 ms on the interpreter; 295 to 300 frames per 5 s in both.

The engine side of the bridge costs little (compiled 4.13 against Jolt's 4.3 within noise; QuickJS +0.9 ms for 1,000 bodies read in bulk). Reaching 3 ms needs Jolt's job system on several threads (ZN-690). Reproduce: `build/zinc build bench/physics3d_pile.ts -o /tmp/pile && /tmp/pile`; `ZINC_FRAMES=900 build/zinc run examples/pinball3d -- --stats --demo`.

### ZN-669: fonts at run time (2026-10-10, Intel Mac, load 4 to 8 from other trees)

- **First use of a size** (`tests/data/fonts_runtime/cost.ts`, sans, 54 characters, 37 distinct glyphs): `loadFont` 1 us (53 to 64 us
  for the first, which parses the file), first `textWidth` (rasterizes the glyphs) 450 to 500 us at 14 px, 610 to 740 us at 24 px,
  1.15 to 1.41 ms at 48 px, 3.06 to 3.15 ms at 96 px; the second 1 to 2 us. Interpreted and compiled within noise.
- **A program that does not ask** (baseline: a build of c5b2a283): resources of bouncing-ball, breakout, nuxt-ui, museum-table,
  text and zinc3d_aa byte-identical; bouncing-ball AOT 3,344,728 -> 3,344,752 bytes, b3-text AOT 3,024,896 -> 3,029,016 (the
  new rasterizer); b3-text (250 drawText per frame) work p50 0.11 ms before and 0.11 to 0.12 ms after, over 5 alternated runs.
- **Programs with a text field** keep every character of their fonts: examples/ui/forms resources 256,099 -> 643,323 bytes,
  hero 1,467,402 -> 1,833,702.

### ZN-679: GL replay fill rate, 30 photo cards at 3104 x 1746 (2026-10-10, Radeon Pro 555X, 4K screen at 60 Hz, load 3 to 4)

`ZINC_SIZE=1552x873 zinc run examples/museum-table -- --stress 30` (3104 x 1746 physical pixels), `ZINC_GL_STATS=1` now reports the GPU time
of the replay (a timer query read four frames later). Attributing it by skipping one command kind at a time (a throwaway switch): of 13.9 ms
of GPU per frame, the polygons were 9.1 ms (the paper of each card is a five-point polygon with a folded corner, plus the fold's triangle),
images 2.2 ms, shadows 1.8 ms, text 0.2 ms. A polygon went through the stencil path, which draws its box four to six times; a convex one
of up to eight points is now one pass over its box, each pixel covering 0.5 plus its smallest signed distance to the edges.

| | before | after |
| --- | --- | --- |
| frames per second, vsync on (120-frame windows after the first) | 57.3 to 59.1 | 60.0 |
| frames per second, `ZINC_VSYNC=0` | 56.6 to 58.0 | 90.2 to 94.0 |
| GPU per frame | 13.9 ms | 7.2 ms (polygons 2.7 ms) |
| draw calls per frame | 548 | 190 |

The CPU time ZINC_GL_STATS calls "to submit" includes waits for the GPU (5.6 to 8.6 ms here): the replay's own work is about 0.8 ms
(polygons 0.34 ms, transformed text 0.39 ms, transformed images 0.08 ms, measured per kind). The 40 frames per second of ZN-650.03 were
measured at load 6 from other builds, before ZN-432 changed the image path of the replay. GL replay against the software frame for convex
and concave polygons: 0.06% of the pixels more than 24 apart, mean error 0.07 (tests/t1/gl_convex.sh).

### ZN-441: models (2026-10-11, Intel Mac, interpreter, load 4.4 to 5.5 with other sessions building)

CesiumMilkTruck: source GLB 369,980 B (151,001 geometry and JSON, a 218,979 B JPEG of 2048²); packed GLB 30,560 B (20,396 in a zstd
release pack); its texture 22,369,636 B in dev (rgba8, mipmaps), 2,796,232 B in release (bc1, 293,945 after zstd); the whole truck in a
macos release pack 314,341 B, GPU memory 2,796,216 B instead of 22,369,620. `.zmesh` 131,676 B (49,007 zstd); LOD at 0.5 79,704 B, 1,946
of 3,624 triangles. `loadModel` of the .zmesh: 244 to 263 ms the first time (the 22 MB dev texture), 8.6 to 8.8 ms once the texture is made,
of which `readBytes` 5.6 to 5.9 ms (one host call per byte); `loadGltf` of the original GLB 102 to 110 ms first, 62 to 64 ms again (the
JPEG decoded each time). Import 0.6 s in dev, 6.7 s in release (basisu BC1); gltfpack builds once in 46 s.

### ZN-439: textures (2026-10-11, Intel Mac, load 6 to 8 from other trees: indicative)

A 2048 px texture (`TEXTURE_SIZE=2048 tests/t1/texture.sh`), pack and GPU bytes per profile (mipmapped; rgba8 would be 22,369,620 GPU bytes):

| Target (profile) | Texture | Format | Pack bytes | GPU bytes |
|---|---|---|---:|---:|
| macos | alpha | bc7 | 1,258,382 | 5,592,432 |
| macos | opaque | bc1 | 586,403 | 2,796,216 |
| rpi1 | alpha | rgba4444 | 1,445,085 | 11,184,810 |
| rpi1 | opaque | etc1 | 1,211,201 | 2,796,216 |
| wasm | alpha | ktx2:uastc | 1,861,396 | 5,592,432 |
| wasm | opaque | ktx2:uastc | 1,592,918 | 5,592,432 |
| pi4 test profile | alpha | etc2 | 983,643 | 5,592,432 |
| apple test profile | alpha | astc | 1,245,185 | 5,592,432 |
| iphone4s test profile | alpha | pvrtca | 1,173,394 | 2,796,288 |

Import of one 2048 texture: 12 to 19 s per block format (every profile encodes again); basisu UASTC on one 2048 level 37 s on 1 thread,
11 s on 4, same bytes; building basisu 353 s. display-gl against the RGBA path: macos packs 0.000% of the pixels over 24, mae 0.583
(BC1 uploaded as blocks, BC7 decoded: GL 4.1 here lists only S3TC); rpi1 packs 0.043%, mae 1.813 (ETC1 decoded, no ETC in this driver).

### ZN-583: zinc:physics3d on Jolt's thread pool (2026-10-11, Intel Mac, CPU held at 37 to 60% of its speed by heat: indicative)

`bench/physics3d_pile.ts`, 1,000 piled bodies, compiled, runs alternated (medians):

| Load | CPU speed | One thread | One per core (6) |
|---|---|---|---|
| 7.3 to 8.4 | 44 to 46% | 8.19 ms (of 5) | 3.64 ms (3.37 to 3.94) |
| 5.5 to 6.7 | 46 to 60% | 5.97 to 7.86 ms | 3.14 ms (2.73 to 3.95) |

The cores divide a step by 2.1 to 2.3; 12 threads 4.76 ms against 3.84 ms for 6. At one per core, load 8.2 to 10, CPU 37 to 42%:
compiled 3.82 ms, interpreter 4.73 ms, QuickJS 5.09 ms (medians of 3). One thread, profile: velocity solver 43%, contact cache 14%,
broad phase 9%, walk of ended contacts 4%. The 2D bench went from 1.786 ms at full speed to 4.07 ms at 44%; by that ratio the 3D pile
would be near 1.6 ms at full speed, an estimate to replace by a measure alone:
`build/zinc build bench/physics3d_pile.ts -o /tmp/pile && /tmp/pile 1000 1; /tmp/pile 1000 0` (three times, ZN-583 #2 and ZN-690).

### ZN-443: tile maps (2026-10-11, Intel Mac, load 7 to 8 from other trees: indicative)

Import: the test Tiled map 2.0 ms, the LDtk project (4 levels) 2.3 ms, a generated 256x256 map of 3 layers (196,608 cells) 33 ms (351 ms
before caching cells by tile id). `load()`: both test maps 2 to 3 ms (native and interpreter), the 256x256x3 map 56 to 72 ms (median 58).
Drawing a 1280x720 view (6,196 tiles queued) 2 to 4 ms. Parsing 65,536 cells: `split` + `parseInt` 10 to 12 ms against 20 ms for a
char-code loop (kept `split`). QuickJS not measured (its `Date.now` stayed frozen in the headless run).

### ZN-450: asset hot reload (2026-10-11, Intel Mac, load 2.6 to 3.3 with other agents building)

game-2d under `zinc dev`, one sprite changed (`tests/t1/asset_reload.sh`): save to "sent" 37 to 53 ms (40 ms poll, 30 ms wait for the
editor's write, import and pack), save to "swapped in" as the program sees it 114 to 166 ms; the criterion asks under 1 s.

### ZN-446: exec to splash (2026-10-11, Intel Mac, 640x400 window at 2x, load 4.4 with other agents building)

`tools/splash-time --runs 11`: `zinc run` (interpreted) median 406.8 ms (389.9 to 439.7), built executable 425.2 ms (405.2 to 456.3). Of that,
opening the window 277 to 314 ms (SDL video init about 200 ms, GL window and context about 110 ms), presenting 55 ms (first present into the
hidden window 34.6 ms, show 4.7 ms, second present one vsync 16.1 ms); zinc reaches the splash call 13 to 20 ms after it starts. The first
launch of a newly built binary adds about 800 ms before `main` (the system's check). `zinc run` of `console.log(1)`: 10.4 ms against 10.2.

### ZN-438: sprite atlases, the game-2d template (2026-10-11, Intel Mac, Radeon Pro 555X, load 2.7 to 3.0 with another agent building)

Play scene in the GL window, 120 frames, `ZINC_GL_STATS`: draw calls per frame 4.0 before, 3.0 after (17 quads both times; the atlas
alone still gave 4.0 until `gl_replay.cpp` kept the texture's filter on one-texel-per-pixel copies, so the coins and the player share a
batch). CPU to submit 502 then 496 us, GPU 116 us both (noise). `zinc assets build` of game-2d with the atlas rule: 5 ms first, 1 ms
second. Frames at scales 1 and 2 hash the same as the loose images.

### ZN-581: GPU sprites, the zinc:gfx bunnymark (2026-10-11, Intel Mac, Radeon Pro 555X, load 2.8 to 3.3 with other agents building)

20,000 sprites of 26x37 at 800x600 Retina, AOT, the GL window (`tests/data/sprites/bunny`); frame work = the profile's work p50 + the
GL replay's CPU time to submit: before 0.64 + 3.38 = 4.02 ms, after 0.95 + 2.80 = 3.75 ms (target 4; another run 2.70 ms, the program's
own update varying 0.22 to 0.39 ms with the clock); GPU about 10 ms before and after. Over 4 ms on this Mac: 20,000 tinted Add sprites
4.63 ms, 15,000 turned sprites 4.78 ms. Recording a turned sprite costs about 110 ns in AOT. To remeasure on a quiet machine (the M1 Pro).

### ZN-434: asset builds (2026-10-11, Intel Mac, load 2.5 to 3.3 with another agent building)

`zinc assets build` of the game-2d template: first build 13.5 ms, second (nothing changed) 9.5 ms for the whole command, median of 21
(1 ms inside the build; the criterion asks under 50 ms), first release build (zstd 19) 20.5 ms. With 100 MB of data added: first build
1.45 s, second 117 ms (every source is read and hashed). `zinc bake` of game-2d, compile included: 50.5 ms from the cache, 76.3 ms baked.

### ZN-433: ZPK packs (2026-10-11, Intel Mac, load 3.2 to 4.2 with other agents building: indicative)

10,000 JSON-like entries of 200 to 3,200 B (17.3 MB raw), `zpk_test`: packed sizes none 18.2 MB, lz4 3.7 MB, zstd 2.8 MB, zstd with a
dictionary 2.2 MB; first read (SHA-256 then decode) 102 / 20.7 / 38.6 / 19.5 ms, later reads (decode only) 2.0 / 2.8 / 24.8 / 9.8 ms.
Opening a pack 0.32 ms, 10,000 lookups by name 1.9 ms; writing 6.5 s at zstd 19, 0.5 s with lz4hc 12. The first read of the
uncompressed pack is bound by `third_party/sha256` (169 MB/s). Sizes: D40.

### ZN-583.01: zinc:physics2d, 2,000 piled bodies (2026-10-11, Intel Mac, load 3.79 to 3.96 from another session, not throttled)

`bench/physics2d_pile.ts` (Box2D 3.1.1, 60 Hz with 4 sub-steps, every body awake), ms per step: compiled 1.786 (target 2),
QuickJS 2.613 (target 3), interpreter 1.835. A program that does not import the plugin is byte-identical (`console.log('hello')`
231,232 bytes before and after); one that does (`tests/data/physics2d/drop.ts`) is 1,459,368 bytes. The plugin builds cold in 7.9 s
(Box2D as one unity C file, 4 s) and in 2.4 s after an edit. To remeasure on a quiet machine (backlog/later.md).

### ZN-430: launching a .zapp with 100 MB of assets (2026-10-11, Intel Mac, load about 4)

The game-2d template plus 100 MB of random bytes in assets/data, packed (105 MB), `ZINC_HEADLESS=1 ZINC_FRAMES=1 zinc run g2d.zapp` under
`/usr/bin/time -l`: first launch (checked member by member as it streams, unpacked into the cache) 0.92 s, 5.2 MB peak resident; the next
launches 0.01 s, 4.8 to 5.4 MB (before: 2.0 to 2.3 s and 450 to 520 MB at every launch, report games/toolchain-assets-loading.md 1.2). A launch
now reads the ustar headers and the manifest only, while the file keeps its size, time and offset (a stamp in the cache directory).

### ZN-567: WebGL binding fast paths on QuickJS (2026-10-11, Intel Mac, load 3.6 to 3.9)

`zinc run bench/webgl_binding.js --engine quickjs`, ns per call, best of 5 runs, before -> after:

| call | before | after | the task's M1 Pro target |
|---|---|---|---|
| uniform4f (reference) | 148-151 | 150-151 | |
| uniform4fv(Float32Array) | 2239-2281 | 227-242 | <= 200 |
| bufferSubData(ArrayBuffer) (reference) | 164-169 | 165-169 | |
| bufferSubData(Float32Array) | 2207-2210 | 178-184 | <= 250 |
| drawArrays (3 vertices, 3 attributes) | 557-636 | 345-403 | <= 250 |
| drawElements, the same 60k-index range | 57.4-66.2 us | 11.6-11.8 us | <= 3 us |

The typed arrays cost a thrown and discarded TypeError (`JS_GetArrayBuffer` on a view); they are now told apart with `JS_IsArrayBuffer` and
`JS_GetTypedArrayType`. The draw checks read the program's attributes and uniform blocks at link, not with glGetActiveAttrib and
glGetAttribLocation at every draw, and an element buffer remembers the largest index of the last 8 ranges drawn since its data changed.
What is left is the driver: drawArrays with 0 vertices costs 124 ns (getError, the cheapest call, 83 ns), so the 3-vertex draw spends
about 150-280 ns in glDrawArrays; drawElements of 60k indices with the range cached is 143 ns without its 60k indices and 11.6 us with them,
the Intel GL driver's own work. The M1 Pro numbers of the targets are to be measured there.

### ZN-371.01: the debugger's cost (2026-10-11, Intel Mac, load 4.5 to 9 from other sessions)

Instructions retired over a whole run (`/usr/bin/time -l`, two runs each), `zinc run --interp` and `zinc debug` of tests/bench/kernels:

| | fib | nbody |
|---|---|---|
| before ZN-371.01 | 479-484 M | 7.430-7.433 G |
| one interpreter loop with the debugger's call in the `Line` handler (never taken) | 508-520 M (+6-7%) | 7.894-7.896 G (+6%) |
| the same, the call at a label of its own or in a `noinline, cold` function | 508-520 M | (not run) |
| `Line` handler empty: the measure of what the call costs | 474-485 M | |
| kept: a copy of the loop for the debugger, the normal one with an empty `Line` | 473-485 M (=) | 7.414-7.432 G (=) |
| debug build, debugger idle (no breakpoint) | 1006-1007 M (2.1x) | 10.47-10.50 G (1.41x) |
| debug build, a breakpoint on a line reached only at the end | 1006 M | 10.47-10.49 G |

A call anywhere in the computed-goto loop, even one never made, changes the register allocation of all of it; the debugger's copy of the loop
costs 73 KB of binary (12.01 -> 12.08 MB). A debug build's cost is inlining and recursion unrolling switched off (fib), one `Line` dispatch per
statement and a move per assignment; an armed but idle debugger adds nothing measurable (D84).

### ZN-696: zinc:3d blending and emissive, cost on the opaque path (2026-10-10, load 5 to 6, thermally throttled)

Frame times of `bench/three_many.ts` (1000 opaque meshes) measured alternately with the old and new zinc:3d moved between 2.5 and 5.7 ms
with the machine's heat (both versions), so the comparison is in instructions retired over the whole run (`/usr/bin/time -l`, 300
frames, the program built once per version, three alternated runs): GPU renderer 5.648 to 5.651 G before, 5.672 G after (+0.4%,
about 73 instructions per draw); software renderer 7.839 to 7.840 G before, 7.882 to 7.884 G after (+0.55%). A first version that sent the
emissive and opacity uniforms on every draw cost +1.0% on the GPU: they live in shader variants of their own now, so an opaque draw uses
the programs it had. The opaque frames are unchanged (zinc3d_aa, three_gpu, templates_kickstart, zinc3d_gltf).

### ZN-566, ZN-568, ZN-565: JavaScript libraries on the QuickJS engine with the web environment

Intel Mac, release, headless 320x240, real clock; load average given per row. The machine is shared and held back by heat: the same baseline gave 331 to 351 ms at one moment and 413 to 451 ms twenty minutes later, so only paired runs are comparisons.

| Measure | Result | Load |
|---|---|---|
| Context creation to the first program line, environment off / on (median of 31, twice) | 10.2, 10.5 ms / 16.7, 17.1 ms (+6.5 ms, nearly all parsing the 67 KB of `webenv.js`) | 5.2 |
| Size added to zinc by the environment | 14.5 KB (the JavaScript is read at run time) | |
| First URL made (the WHATWG parser loads) | 12.8 ms once | |
| p5.js 1.11.13: import, first frame after the context, frame | 136 to 158 ms, 320 to 362 ms, 0.28 to 0.60 ms | 4.4 |
| three.js r186: the same | 66 to 77 ms, 350 to 369 ms, 0.28 to 0.60 ms (first WebGL 2 context 136 ms, first render 110 ms) | 4.4 |
| PixiJS 7.4.3: the same | 60 to 81 ms, 379 to 419 ms, 0.78 ms | 5.5 |
| PixiJS 8.22.0, after ZN-565: the same | 120 to 121 ms, 351 to 361 ms, 0.72 ms | 5.1 to 5.5 |
| Stack: RangeError instead of a crash at depth | 6,837 frames in 4.7 ms on the default stack | |

Cost of the WebGL binding fixes of ZN-565 (the whole change is in libzn_webgl: the parent commit's module alternated with the new one under the same zinc, 5 pairs per library, load 5.4 to 5.6): three.js first frame 425 against 426 ms, frame 0.67 against 0.67 ms; PixiJS 7 first frame 351 against 359 ms (+2%, four pairs of five in that direction), frame 0.70 against 0.70 ms; p5.js first frame 491 against 497 ms, frame 0.63 against 0.63 ms. A guard in front of the two regular expressions run per shader identifier was tried and dropped: at most 2%.

## 4. Correction of ZN-042's diagnosis (nbody)

ZN-042 concluded that the typed backend would not help nbody and that the 2.9x to native came from NEON and fused multiply-adds, which `-ffp-contract=off` forbids. The experiments of PERF-10 contradict both parts:
the plain C++ reference compiled **with** `-ffp-contract=off` runs in 36 ms (native-class speed without any FMA), and the AOT reaches 37 ms with typed locals and a struct per class while keeping every null and bounds check.
The earlier experiment converted to `double` locals and `double*` field accesses: that variant is still 109 ms here too, because the field accesses remain array-indexed and the compiler cannot separate `bi.vx` from `bj.x`.
The cost is a store-to-load forwarding stall (`ldp` reloads spanning two 8-byte stores of the previous iteration): disabling the AArch64 load/store pairing alone takes the generated code from 107 to 56 ms.
So no fast-math profile is needed; a typed backend with per-class structs is (PERF-10).

## 5. Reproducing the measurements

Scratch harnesses of this audit (to be added under `bench/` by the first task that needs them): `ref/fill.cpp` (fill variants, bands, stripes, tiles, occlusion on a scene dump), `ref/kinds.cpp` (cost per command kind through the
engine's `zrt::raster::render`), `ref/diff.cpp` / `ref/diff2.cpp` (`diff_rects` and candidate variants on two consecutive dumps), `ref/nbody.cpp` (plain C++ reference). They link `build/libzn_host_gfx.a libzn_rt.a libzn_mimalloc.a`
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

- ZN-713, 2026-10-11, the same small app (window 900x600, 200-row list, filter field, image) against Electron 44.7.0 and Tauri 2.12 on the Intel Mac, **under load (4.5 to 7.4, CPU speed limit 40 to 66 %), to retake alone**: size installed / zipped Zinc 5484 / 2379 KB, Electron 300248 / 130838 KB, Tauri 4888 / 2069 KB; launch to first frame Zinc 463 to 585 ms, Electron 657 to 740 ms, Tauri 865 to 1050 ms (medians of two passes of 5); RSS at 10 s summed over the app's processes Zinc 83 MB (1 process), Electron 213 MB (4), Tauri 104 to 107 MB (4); Zinc physical footprint 65.3 MB. Sizes are valid; Zinc is not ahead of Tauri on size. Script: `bench/vs-electron/measure.sh`.

## Run/build visibility and museum payload (ZN-720, 2026-10-12)

Observed on the current development Mac (arm64), with warm native plugin and C++ object caches, during targeted verification; these are diagnostic timings, not a cold-build benchmark. `ZINC_HEADLESS=1 ZINC_FRAMES=3 build/zinc run --native -v examples/museum-table` succeeded: 43 files, 618 functions, Zinc compile 205 ms, resources 76 ms, C++ emission 3.64 s, 14/14 objects reused, link 377 ms, native build stage 11.2 s including emission and object-cache preparation. The resulting executable is 93,647,232 bytes. Parsing its embedded ZRS1 table gives 87,353,953 bytes of baked resources: 75,596,032 bytes of RGBA pixels across 15 images, 11,689,077 bytes of glyph tables/bitmaps, and 68,273 bytes of TrueType subsets plus format metadata. Museum source assets total 9,159,587 bytes; the dev asset report expands them to 79,048,233 bytes before pack overhead/compression. The old resource baker and the newer asset packs both hold those decoded images.

The command runner now polls completed children rather than waiting on the oldest one; its progress costs no work on a cached native exec. No cold-build speed improvement or cross-platform performance claim is made.

## JavaScript libraries: where js-p5's frame goes, and the ceilings (D110, 2026-10-12)

The development Mac (M1 Pro, macOS 15.7.4, 120 Hz display), **under a load of 4.5 to 6 (another session worked), one run each: to retake alone**. The ratios are large against that noise.

`build/zinc run examples/js-p5` (p5.js 1.11.13 in WEBGL mode, 144 lit boxes, 800 x 500 window, 1600 x 1000 canvas): `ZINC_PROFILE=1` gives work p50 16.13 ms and present p50 8.78 ms over 420 frames, 25 ms a frame (40 fps, three refreshes). `sample <pid> 4` on the main thread, 2,806 samples: the frame callback 69% (17.2 ms; the WebGL calls inside it 1.6 ms), the wait for the refresh in `SDL_GL_SwapWindow` 24% (6.0 ms), the upload of the canvas image `glr::draw_image` 4% (1.2 ms), the swap 2% (0.5 ms). Of the script's samples inside zinc (1,639), `JS_CallInternal` itself is 57%; the rest is QuickJS's runtime: `JS_DefineProperty`, `JS_CreateProperty`, `add_shape_property`, `JS_NewObjectFromShape`, `js_free_rt`, `js_arena_malloc`, `js_realloc_rt`. A copy of the sketch with every method of p5, its renderer, its shader and its matrix wrapped (the wrappers double the frame, so only counts and order count): per frame 6,480 `Shader.setUniform` (45 a box), 3,312 `RendererGL._arraysEqual`, 1,152 `Matrix.copy`, 144 `Renderer.pop`, 4,301 WebGL calls (30 a box).

The same files on five engines, ms per frame (`bench/qjs`; three is three.js r186's CPU half for 500 meshes; p5shape is a kernel shaped like p5's path for one box, 144 a frame; the outputs are identical):

| Workload | QuickJS-ng 0.17 (`zinc run`) | JavaScriptCore, no JIT | V8 jitless | JavaScriptCore | V8 (Node 24.14) |
|---|---:|---:|---:|---:|---:|
| three | 4.97 | 2.34 (2.1x) | 3.09 (1.6x) | 0.204 (24x) | 0.271 (18x) |
| sprite | 8.02 | 3.74 (2.1x) | 8.29 (1.0x) | 0.250 (32x) | 0.477 (17x) |
| objects | 0.747 | 0.598 (1.2x) | 0.463 (1.6x) | 0.118 (6.3x) | 0.100 (7.5x) |
| p5shape | 8.45 | 6.05 (1.4x) | 4.75 (1.8x) | 0.31 (27x) | 1.71 (4.9x) |

JavaScriptCore is the system's `jsc` (`/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc`, `--useJIT=false` for the second column; with `--useDFGJIT=false`, its baseline compiler alone, p5shape takes 1.77 ms). For the module workloads the import of `three` is rewritten to the path of `third_party/three/three.core.js`, and a first file gives `performance.now` from `preciseTime()`. The framework embedded in a program (`bench/qjs/jsc-host.c`) runs p5shape in 6.16 ms: its JIT is off unless the executable carries the entitlement `com.apple.security.cs.allow-jit`; signed ad hoc with it 0.41 ms, with the hardened runtime too (0.42 ms).

## ZN-722: museum resource lifecycle counters (2026-10-12)

macOS arm64 MacBookPro18,3, uncontrolled load (nearby 22.6), native GL + FFmpeg, 3840x2160 frame; allocation diagnostics, not a quiet-machine speed benchmark. Three capture-free home/model/video/home cycles with two-second dwells: home RSS initially 347.3 MiB, then 315.0 / 320.9 / 321.2 MiB; runtime live blocks recur at 2,638. Home retains one 3D target: CPU pixels 12,960,000 B, estimated GPU storage 155,520,000 B; one mesh 326,088 B GPU; one 3D texture 12,582,912 B GPU estimate. Video stopped but allocated: 8,198,400 B output buffers and two open sources. 2D replay textures grow 31,262,720 -> 47,502,080 B once, then stable. Baked images 75,596,032 B and font payload 11,611,819 B CPU, plus referenced blob 87,353,953 B. A separate four-capture visual check reached RSS 818.6 MiB: capture/encoding changes the workload; default probe disables screenshots. Decoder/driver internals excluded, GPU storage is not residency, borrowed bytes must not be added to their owner. Commands, all ten samples and coverage limits: `zinc-next-museum-memory-probe.md`; raw local `.logs/museum-probe/samples.jsonl`.

## The GL replay on GLES 2, Raspberry Pi 3B+ (ZN-725, D111, 2026-10-12)

Pi 3B+ at 1400 MHz (a supply that holds; under 55 C before each run), VideoCore IV, Mesa 25.0.7, 800x480, hero, 200 frames, present p50 in ms, measured by the task's agent with `tools/device profile` (history at 600 MHz and under a stray load: the task notes).

| screen | fbdev bands, 4 threads | display-gl `cpu` | GL replay before | GL replay after |
| --- | --- | --- | --- | --- |
| navigation, driving | 19.1 | 62.2 | 181.1 | 25.0 |
| home | 14.9 | 14.9 | 31.0 | 14.8 |
| gallery | 14.1 | 13.8 | 32.8 | 22.8 |
| first frame | | | 1081 to 1126 | 277 to 295 |

- Steps on navigation: one program per mode 65.2, edges as strips 29.7, five passes per POLY batch 25.0; 4x MSAA with plain triangles 35.5; no antialiased edge at all 19.2 (the floor).
- CPU of the whole program per frame on navigation: bands 80.2 ms (289% of a core, the bare board goes from 51 to 58.5 C in eight seconds), GL replay 21.3 ms (56%, 53 to 54.2 C). Gallery: 23.8 ms (128%) against 14.7 (46%).
- Why navigation stays at 30 frames a second on the GPU: about 22 ms of GPU work a frame (`ZINC_GL_TIME=1`: 33.6 ms with a glFinish, 11.6 of them CPU), so one vblank in two is missed. Geometry kept across frames (MESH) is the next step.
- Draw calls a frame, before to after: navigation 63.5 to 103.1, home 11.6 to 73.4, gallery 86.1 to 107.6.

## Text under a scaling matrix (ZN-726, D112, 2026-10-12)

Measured by the task's agent on the development Mac while other trees were building (load about 7): to be taken again on a quiet machine.

- Sharpness of a 16 px text enlarged x2 and x3 against the same text set at 32 and 48 px: ssim 0.926 to 0.990, mae 8.55 to 2.00, edge energy 24 to 32% before, 77 to 83% now. GL replay against software on the same scene: 1.94% of the pixels over 24, mae 1.90.
- A full screen of text under a matrix, software raster, less 12.3 ms of clear and hash: a 48 px font under a matrix that only moves 8.9 to 4.0 ms (`xf_glyph` takes the inner pixels of a glyph without the per-texel tests, same sums); a 16 px font at x3 9.5 ms blurred to 5.8 ms sharp.
- museum-table, a text card and a notice zoomed from 1 to 3 over 60 frames each at 1920x1080, CPU per frame with every frame rasterized and hashed: interpreter 26.5 to 25.9 ms, compiled 26.6 to 26.1 ms (within the noise). The GL replay's frame time was not measured.
- Glyph cache: 300 scales of two families made 24 fonts, 525 KB (the `resourceStats` counter "fonts").

## museum-table's film on a Pi 3B+ (ZN-730, D113, 2026-10-12)

Measured by the task's agent: sequence wave (854x480 H.264 at 24 pictures a second, drawn 500x281), off screen (file framebuffer 800x480x16), real time, 16 s less the first 3, four raster threads, `ondemand` governor (7 of 8 clock samples at 1400 MHz).

| build | film frame raster p50 / p90 (ms) | raster CPU p50 (ms) | conversion in the decode thread (ms) | pictures a second | frames a second |
| --- | --- | --- | --- | --- | --- |
| before | 27.2 / 28.8 | 100.4 | 85.4 | 11.6 | 51.9 |
| plain commands under the matrix | 6.0 / 8.2 | 18.7 | 85.4 | 11.6 | 59.8 |
| and a copy of the decoder's frame before swscale | 6.2 / 8.4 | 18.2 | 10.0 | 24.0 | 59.7 |

- The decoder is `h264_v4l2m2m` (0.6 ms of CPU a picture; software decode 10 to 13.5 ms). swscale straight from its buffer: 82 ms a picture; after one copy: 13.7 ms (copy 5.1, conversion 8.0). BGRX asked of the decoder itself: 12.9 ms, no gain, and the wrong colour range for this clip.
- The picture alone, direct or under a scale-only matrix: 3.83 ms wall, 13.5 ms CPU on the Pi (82 ms CPU under the matrix before, taken at 1200 MHz); on the Mac 3.88 to 1.17 ms. Turned by 2 degrees it stays on the XFORM path: 51 ms of CPU.
- Not measured: the real `/dev/fb0` (the owner's program held the screen), a fixed 1400 MHz clock.


## The device agent on the loopback interface (ZN-729, D116, D115, 2026-10-12)

- M1 Pro, `build/zinc` Release, agent and client on the same machine (`--bind 127.0.0.1`). A session with one request (`zinc device info`: connect, TLS 1.3 PSK with ECDHE, the answer): 35 ms; `zinc device shell true`: 43 ms. Pairing (EC J-PAKE): not timed apart from the 1.2 s of discovery that came before it.
- `zinc dev --device`: a saved source runs on the device 211 to 250 ms after the save (six runs by the agent that worked ZN-729.03, 220 ms once more after integration); `zinc dev` reports the start 77 to 85 ms after the save, the red box of a compile error 112 to 119 ms, a saved asset sent in 35 ms. All of it with a load average of 7 to 10 (other trees building): to take again on a quiet machine.
- The agent and its client: 227 KB of code in `zinc` before ZN-729.03 to .05 (not measured after).
- Not measured: anything over a real network, on Linux or on a Raspberry Pi; large transfers; several sessions at once (they share one lock around mbedTLS).

## Zero-copy video on a Pi 3B+ (ZN-731, D114, 2026-10-12)

Measured by the task's agent on the real screen: CPU of the whole program, every thread, from `/proc/<pid>/stat` over a window that starts 8 s after the launch; the board under 55 C before each run, `get_throttled` 0xd0000 after each. With the planes the `ondemand` governor leaves the clock at 700 MHz most of the time (the load is too small to raise it), so those numbers are upper bounds; the software runs were at 1400 MHz.

| program | build | CPU a picture (ms) | of a core | pictures a second | dropped |
| --- | --- | --- | --- | --- | --- |
| museum-table, sequence wave (854x480 at 24), 20 s | main before (ZN-730) | 38.3 | 92.6% | 24.15 | 0 |
| | software path, paced | 37.0 | 89.6% | 24.2 | 0 |
| | planes | 3.45 | 8.3% | 24.2 | 0 |
| hero, Video tab (640x360 at 24), 60 s | software path | 37.5 | 90.8% | 24.25 | 1 at the start, before the clock fix |
| | planes | 4.75 | 11.5% | 24.2 | 0 over 69 s |
| hero, Video tab, the clip at 30, 60 s | software path | 35.5 | 107.5% | 30.3 | 0 |
| | planes | 4.12 | 12.4% | 30.25 | 0 over 69 s |

- 2076 of 2076 pictures never read by the CPU in the 69 s run. With the planes museum-table's frame raster is 0.10 ms on average (p99 0.40).
- The spike outside the engine (`tools/kmsvid.cpp`): 0.58 ms of CPU a picture at 24 a second, 0.61 at 30, the decoder alone 0.20; importing a frame 0.07 ms, the atomic commit 0.15 ms; taking the planes 2 to 7 ms once per film. Planes refused (`ZINC_FBDEV_PLANES=refuse`): 38.1 ms a picture.
- display-fbdev did not pace its frames on this screen: `FBIO_WAITFORVSYNC` returns at once (60 waits in 0.1 ms), so every fbdev program ran as fast as it could (122 frames a second and 92% of a core with the film). It now sleeps to 60 a second when the wait did not wait.
- Not measured: a minute of museum-table's film in one go (the sequence plays 30 s: runs of 30, 29 and 21 s, 0 dropped), a card dragged or zoomed with its film playing, two films at once, 1080p.


## Frames flipped at the refresh on the Pi 3B+ (ZN-735, D117, 2026-10-12)

Pi 3B+, DSI screen 800x480 (16 bpp), 1400 MHz, no throttle bit active; `tools/device pi@192.168.2.107 profile hero-flip ZINC_DEMO=navdrive ZINC_FBDEV_SKIP_S=4`, 260 frames, one binary, two pairs. "Before" is `ZINC_FBDEV_FLIP=0` on the new driver, not a build of the old one.

| path | fps | present p50 | present p99 | convert p50 | vsync p50 | CPU a frame (render + convert, all threads) | frames into /dev/fb0 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /dev/fb0 (FLIP=0) | 39.9, 40.0 | 18.50, 18.47 | 19.75, 18.96 | 1.44 | 0.01 | 64.7 + 5.1 = 69.8 ms | 260 of 260 |
| flip | 38.5, 37.9 | 19.27, 19.27 | 20.07, 22.28 | 2.07 | 0.03 | 65.0 + 6.7 = 71.7 ms | 0 of 260 (260 commits) |

- Other runs at 1400 MHz: hero's tour (`ZINC_DEMO=bench`) 59.3 fps before, 59.8 flipped; pocket-hero scaled 59.7 and 60.0; hero's home screen 139% CPU before, 147% flipped (ps, 26 s).
- Not kept: a pair of 700 frames that ended at 1200 MHz (soft temperature limit). Not measured: a build of the driver before the change, other depths, a Pi 4 or 5.

## First Android device: Nexus 7 2012 (ZN-622, D120, D121, 2026-10-16)

Tegra 3 T30L, 1 GB, Android 7.1.2 (LineageOS 14.1, API 25), debug APKs for armeabi-v7a only, perf panel (`ZINC_PERF_HUD=1 ZINC_PROFILE=1` through `am start --es zinc.env`). Report and screenshots: `docs/reports/zinc-next-android.md`.

| | hello | rn-showcase | breakout |
|---|---|---|---|
| APK debug / release (unsigned) | 2.46 MB / – | 6.12 / 5.99 MB (`libmain.so` 5.8 MB stripped) | 5.10 MB / – |
| Start, warm (`am start -W`) | 600-634 ms | 460-640 ms (741 ms with the page cache dropped) | 454-582 ms |
| Software raster at rest | – | 60.0 fps; work p50 1.38 / p99 4.3 ms; present p50 15.0 / p99 17.4-19.9 ms | 59.9 fps; work p50 0.26 / p99 1.5 ms; present p50 16.2 / p99 22.7 ms |
| Software raster, scrolling by hand | – | ~25 fps (raster ~23 ms + present ~13 ms per frame) | – |
| GLES 2 replay (`ZINC_RENDERER=gl`) | – | 13.7 fps; present p50 89 / p99 158 ms (whole frame replayed) | present p50 16.3 / p99 32.8 ms |

- First interaction (owner report): worst frame of the first tap 41.8-42.4 ms against 51.4-55.8 ms for the second, warm, cold page cache, or all four cores at the performance governor: no first-time cost and no CPU wake-up effect; each tab switch costs ~11 ms of input and ~10 ms of layout. A Magisk `su` during a run made every other present ~105 ms for the whole run.
- Follow-ups: ZN-744 (scroll at 60 fps), ZN-741 (damage-aware GLES 2 replay), ZN-743 (zero-copy present).
- ZN-742.03 Fast Refresh (2026-10-16, other trees building): save -> first frame of the new code, state kept: desktop-app page 523-565 ms in the test, 603-738 ms with a real window and the inspector (a restart takes ~570 ms and loses the state); game-2d template 96 ms (189-234 ms with a real window); hot_swap fixtures 60-300 ms.

## Zero copy, scroll moves, raw images and shaders on the Nexus 7 (ZN-743, ZN-744, ZN-746, ZN-741, D124, 2026-10-16)

Nexus 7 2012, debug APKs for armeabi-v7a, `ZINC_PRESENT_STATS=1`, scripted flings (`ZINC_INPUT`, ten 400 px flings) and taps; the tablet to the measuring agent alone (runs with another app in front discarded). Desktop numbers on a loaded machine.

| Measure | Before | After |
|---|---|---|
| rn-showcase fling, present without the raster, p50 | 12.8 ms (SDL texture: `SDL_UpdateTexture` 9.4-9.8 ms) | 4.2 ms (the raster draws into the window buffer, ZN-743) |
| rn-showcase fling, frame interval p50 | 40.6 ms (24.6 fps) | 31.3 ms (31.9 fps) |
| rn-showcase at rest, breakout | 60 fps | 60 fps |
| A tap on rn-showcase's tab bar, damage | the whole 420x860 screen, twice | nothing (ZN-744, `tests/t0/damage_tap.sh`) |
| Scroll, desktop window, raster p50 / p99 | 1.05 / 12.7 ms | 0.23 / 5.2 ms (pixels moved, `tests/t0/scroll_move.sh`) |
| Scroll, Nexus 7 | interval p50 21.6-33 ms | 17.9-24.5 ms with `ZINC_PRESENT=shadow` (p99 worse: 88 ms); 60 fps not reached: Tegra 3 moves memory at ~0.5 GB/s (a full-screen memmove 5.5-6.8 ms), reading the window buffer is slower still |
| Lava face, Nexus 7 software raster | 4.0 fps (raster p50 200-203 ms: a PNG per frame, four full-screen draws) | 21.9 fps (raster p50 28-32 ms: raw pixels, one smooth draw) |
| Lava face, Nexus 7 GPU layer (SHADER, scale 4) | – | 61 fps (24 fps at full resolution) |
| Lava face, desktop software raster | raster p50 25.2 ms (36 fps) | 3.3 ms (60 fps) |
| rn-showcase, GLES 2 replay on Android (`ZINC_RENDERER=gl`) | 13.7 fps (whole frame replayed) | 60 fps at rest; tab switch p99 17.4 ms (software 18.6); first switch 147 ms (programs built then); fling p99 127 ms (software 76): not the default yet |

## The GLES 2 replay on the Nexus 7: warm programs, GPU scroll, shader under a transform (ZN-741, ZN-744, ZN-746, D126, 2026-10-16)

| Measure | Before | After |
|---|---|---|
| Worst tab-switch present, GLES 2 (programs built in idle frames, `glr::warm`) | 146.6 ms | 37.8 ms |
| rn-showcase fling, GLES 2, interval p99 (late frames of 720) | 56.8 ms (96, fewer frames drawn) | 31.6-32.5 ms (225-285); panel off 29.5 ms (221) |
| rn-showcase fling, software raster, interval p99 (late of 720) | – | 26.8-29.4 ms (222-263); panel off 31.5 ms (270) |
| Window quad / pixel move / rectangle replay (`ZINC_GL_FINISH=1`) | – / 3.9-5.2 / – | 4.2 ms / gone (rotated rows) / 10-13 ms |
| Lava face at rest, late of 290 (p99) | 76 (35.7 ms) | 67 (33.2 ms) |
| Music carousel swipe, late of 290 (p99) | 94 (172.5 ms) | 85 (205.3 ms): the GPU-layer path renders the damage twice and uploads 3.6 MB a frame at ~100 MB/s |
| Desktop GL window | – | interval p50 16.66 ms, p99 23.2 ms |
| shader_gl, a shader moved, rounded-clipped and faded | 43.9% of pixels off | 0% |

## iOS: the raster presented through Metal without an upload (ZN-627, D137, 2026-10-17)

iPhone 17 simulator, iOS 26.3, Release, `ZINC_PRESENT_STATS`; the machine was loaded by other builds (8 to 19), so CPU figures are noisy.

| rn-showcase (rest, ten flings, five tab switches; 1,200 frames) | SDL texture (before) | Metal, shared buffer (after) |
|---|---|---|
| raster p50 | 0.73-1.08 ms | 1.04-2.74 ms |
| upload p50 / p99 | 6.61-7.47 / 9.96-13.90 ms | none |
| draw + swap p50 | 0.25-0.28 ms | 0.07-0.08 + 0.01-0.04 ms |
| main thread per drawn frame | ~9.3 ms | ~3.5 ms |
| frame interval p50 / p99 | 16.63-16.72 / 18.26-20.73 ms | 16.64-16.71 / 17.22-18.66 ms |
| app CPU, 22 s session / 10 s at rest | 5.34-5.52 s / 0.61-0.74 s | 3.82-4.54 s / 0.16-0.17 s |
| hero (15 s): upload p50 / interval p99 | 5.94-7.26 / 18.27-18.80 ms | none / 17.40-18.86 ms |

## Zinc Go: save to screen (ZN-631, D140, 2026-10-17)

rn-showcase, a scripted save of `Forms.tsx` served by `zinc dev --lan`: Android emulator (API 37) 854 ms, iOS simulator (26.3) 725 ms, desktop player 61-87 ms. Of it: the compile on the Mac (`--emit=hot`, no optimiser) 570-640 ms (770 ms with the optimiser), the device 41-51 ms. Under a load average of 58 one Android refresh took 1338 ms (optimiser on).

## 2026-10-17: console hardware demos and the platformer (ZN-759, emulators, ZINC_PROFILE p50)

| Console | Scene | Work | Present |
|---|---|---|---|
| PSP (PPSSPPHeadless, 333 MHz emulated) | 40 sprites | 2.82 ms | 11.23 ms |
| 3DS (Azahar) | 30 sprites | 2.43 ms | 5.85 ms |
| PS2 (PCSX2) | 30 sprites | 3.57 ms | 22.54 ms |
| PSP | platformer | 11.8 ms | 20.8 ms (30 fps) |
| 3DS | platformer | 4.2 ms | 19.0 ms |
| Vita (Vita3K, the Mac's clock) | platformer | 0.77 ms | - |

Emulators only; no number from real hardware yet.

## 2026-10-17: Meadow Run on the owner's PS Vita, GPU path (ZN-470/471, D151)

Real hardware (ZINC_PROFILE through ux0:data/ZINC00011/zinc.log, 7 windows of 600 frames): 60 fps, no missed vblank in 4,200 frames,
frame p50 16.68 ms (max 17.9), work p50 3.2-3.7 ms (max 8.8), GXM replay CPU p50 0.3-0.44 ms, about 12.5 ms waiting for the vblank. The
software path at 960x544 costs 28 ms a frame in Vita3K on the Mac's clock (30 fps); its hardware number is pending one measuring launch.

## 2026-10-18: the zinc:script boundary on four machines (`tools/bench-bridge`, `tests/bench/script_bridge`)

What it measures: the cost of crossing between typed Zinc and QuickJS through `zinc:script` (values cross as Dyn), by traffic shape, with a typed
Zinc loop and a JavaScript loop as references. One warm-up run and 5 timed runs per case, median; artifacts in `docs/reports/bench/script-bridge-*.json`
(`tools/bench-bridge show` prints them side by side). Run with `tools/bench-bridge mac|android|webos`.
Microseconds per unit, medians. The Mac was not quiet (load average 4 to 7 from other sessions; spread under 3%); Android and webOS ran on the device alone.

| Case | Mac (Apple M1 Pro, arm64) AOT | Nexus 7 (Tegra 3, API 25, AOT) | TouchPad (webOS, AOT) |
|---|---|---|---|
| ref: typed Zinc loop | 0.014 | 0.065 | 0.210 |
| ref: JavaScript loop | 0.041 | 0.705 | 0.645 |
| host -> script, scalar | 1.07 | 94.9 | 84.1 |
| script -> host, scalar | 1.02 | 61.6 | 82.1 |
| host -> script, 64-char string | 1.24 | 92.4 | 93.2 |
| host -> script, small object | 2.38 | 191.7 | 181.8 |
| 10k-cell map, one call per cell | 0.83 | 47.6 | 69.8 |
| 10k-cell map, one Dyn snapshot | 0.126 | 3.66 | 6.00 |
| 10k-cell map, JSON | 0.164 | 8.04 | 8.50 |
| 5,000 UI ops, one call each | 1.12 | 61.3 | 100.2 |
| 5,000 UI ops, one flat array | 0.45 | 11.0 | 17.8 |

Reading: a crossing costs about 26 JavaScript iterations on the Mac and 87 to 145 on the two ARMv7 tablets: the JavaScript loop is 16 to 17 times slower there, the crossing 60 to 90 times, so
the glue is the part that scales badly (not profiled yet). The typed Zinc loop is 4.6 times slower on the Nexus 7 but 15 times on the TouchPad, whose build uses cortex_a8 softfp flags. Grouping calls
pays more on the tablets (x5.6 on both) than on the Mac (x2.5); a 10,000-value Dyn snapshot is 6.6 (Mac), 13 (Nexus 7) and 11.6 (TouchPad) times cheaper than one call per value; JSON and Dyn are within
1.3 to 2.2 times of each other. At 60 Hz, 1 ms buys about 1,000 per-call crossings on the Mac, 16 on the Nexus 7, 12 on the TouchPad; batched mutations 2,200, 91 and 56. Not measured: typed arrays and host objects (the API has none), strings through objects, memory. iPad: not reachable (offline).
Two engine gaps found and fixed on the way: `zinc:script` was not linked in cross builds (`--target armv7-webos`: undefined `zn_module_QuickJS`) nor in the exported Android project.

Addendum, same day: the boundary written directly against QuickJS (no JSON text, `tests/bench/script_bridge/floor/floor.c`, `tools/bench-bridge floor`) costs 0.040 us (Mac), 0.72 us (Nexus 7) and
1.07 us (TouchPad) per script -> host call, against 1.02, 61.6 and 82.1 us through `zinc:script`: 25, 86 and 77 times less. The "JSON and Dyn within 1.3 to 2.2 times" line above compares two
paths that are both JSON text (D22) and says nothing about the format; the floor does. Where the time goes, what others do and the changes proposed: `docs/reports/script-boundary-optimisation.md`.

### 2026-10-18, after the boundary changes (same bench, same machines; `docs/reports/bench/script-bridge-baseline-*.json` hold the before)

Changes: plain values (number, string, boolean, null) cross by hand-written text instead of JSON.stringify with a replacer and JS_ParseJSON; `zinc:script/fast` (`exposeNum`, `callNum`) crosses numbers with no text.
Microseconds per unit, medians; "floor" is `floor.c` (QuickJS C API, no JSON).

| Case | Mac before | generic | fast | floor | Nexus 7 before | generic | fast | floor | TouchPad before | generic | fast | floor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| script -> host call | 1.02 | 0.51 | 0.057 | 0.040 | 61.6 | 35.8 | 1.45 | 0.72 | 82.1 | 42.2 | 2.74 | 1.07 |
| host -> script call | 1.07 | 0.93 | 0.142 | - | 94.9 | 74.5 | 2.64 | - | 84.1 | 62.1 | 5.07 | - |
| script -> host, 20-char string | 1.06 | 0.61 | - | - | 66.3 | 43.1 | - | - | 77.8 | 46.9 | - | - |
| 10k-cell map, a call per cell | 0.83 | 0.42 | 0.057 | 0.041 | 47.6 | 26.6 | 1.45 | 0.73 | 69.8 | 38.6 | 1.74 | 0.83 |
| 5,000 UI ops, a call each | 1.12 | 0.51 | 0.057 | 0.040 | 61.3 | 37.3 | 1.34 | 0.78 | 100.2 | 37.8 | 1.97 | 0.85 |

The fast path is 8 to 51 times faster than before and within 1.4 to 2.3 times of the floor (the rest is the Zinc side's callback entry and the `Entry` bookkeeping). The generic path is about 2 times
faster for primitives. 5,000 UI mutations cost 6.7 ms on the Nexus 7 and 9.8 ms on the TouchPad through the fast path (307 and 501 ms before). Not changed: objects, arrays and
the Zinc-side JSON of the generic path (`JSON.stringify` / `JSON.parse` on Dyn values), which is what the generic host -> script call still pays.

## Window memory on macOS (ZN-764, 2026-10-20)

Physical footprint (Activity Monitor) 8 s after start, `tools/window-memory`, MacBook Pro arm64, macOS 15.7, 4K screens, load 15 to 19 from other sessions (memory, not time). OpenGL replay before -> software raster through Metal, two drawables: examples/agents 1180x760 211-216 -> 81/82/103 MB (three passes, the 103 first after a build); ui/forms 133 -> 45 MB; notify-relay (app.window config) 134 -> 59 MB; nuxt-ui 79 -> 75 MB; rn-showcase 96 -> 65-89 MB. `ZINC_RENDERER=gl` after freeing the splash buffers: agents 211 -> 170 MB, ui/forms 133 -> 116 MB. What remains for a 2360x1520 surface: the shared frame 13.9 MB and three CAMetalLayer drawables 41.2 MB (WindowServer holds one beyond maximumDrawableCount 2; four and 96 MB with 3). Speed on the Metal path: breakout and hero at 60 fps (present interval p50 16.7 ms), raster p50 0.5 ms (breakout) and 2.5 ms (hero, p99 22 ms under load).

## Node-API on QuickJS-ng (ZN-773.01, 2026-10-21)

The cost of one native call from JavaScript, `tests/bench/napi/call.cc` (the same loop around each, minimum of 9 runs of 3 million calls, the empty loop subtracted), MacBook Pro arm64, load
15 to 120 from other sessions' builds (the minimum keeps the quiet runs; take the numbers as a ratio, not as absolutes). Direct: `JS_NewCFunctionMagic` as zinc's bindings were written.

| Call | direct QuickJS | Node-API, JsRuntimeHost as vendored | + our patch | + `napi/inline.h` (the engine's own bindings) |
|---|---|---|---|---|
| empty | 12-13 ns | 21 ns | 15-16 ns | 15-16 ns |
| two numbers in, one out | 21-22 ns | 65-83 ns | 28-32 ns | 26-28 ns |
| a 11-character string in | 22 ns | 76-164 ns (and the heap grew) | 35-38 ns | 35 ns |

What cost: a heap allocation per value created (`make_unique<JSValue>`), no handle scope around a callback (every value of every call kept until a scope was closed by hand: the
growing string row), a `std::vector` per call for the arguments, `JS_ToFloat64`, `JS_DupValue` and `JS_FreeValue` called out of line for numbers. Left: the trampoline (+3 ns: the
callback record behind `JS_GetOpaque`, the exception check) and Node-API's contract for strings (a copy into the caller's buffer). Through a real binding the difference is gone:
Canvas 2D `beginPath` + `moveTo` through webenv.js (`tests/bench/napi/canvas2d.js`) 164-166 ns per pair on Node-API against 167 ns on the QuickJS API. The `__host_*` rows keep
their generated direct path per engine (the hottest calls, one table: `include/zn/runtime.h`).

## JavaScriptCore beside QuickJS-ng (ZN-773.03, 2026-10-21)

`tests/bench/napi/engines.js` (`zinc run ... --engine quickjs|jsc`, three runs each, the best), MacBook Pro arm64, macOS 15.7 system JavaScriptCore, load 12 to 20 from other
sessions. The host call is `__host_loopNow()` (about 25 ns of it is the clock read itself).

| | QuickJS-ng | JSC, no JIT entitlement | JSC, `allow-jit` |
|---|---|---|---|
| fib(30) | 76 ms | 68 ms | 5 ms |
| a million `{x, y}` pushed and summed | 239 ms | 101 ms | 27 ms |
| 200k string appends, split, map, join | 23 ms | 15 ms | 4 ms |
| one `__host_*` call | 68-85 ns | | 122 ns |

- Without `com.apple.security.cs.allow-jit` the system framework runs its interpreter only (fib(35): 0.73 s against 0.05 s, the same in a ten-line C program): zinc is signed ad hoc
  with `targets/macos/zinc.entitlements` after each link, and `tools/package` and `tools/sign-macos` sign with it.
- The host call: JsRuntimeHost as vendored took 309 ns, three API calls per call to find the function's data behind a symbol-keyed property; one callable class whose private
  data is the record brought it to 128 ns, the cached immediates and a row that builds no string or array storage to 122 ns. The floor is JavaScriptCore's C API itself: a
  callback drops and takes the VM's lock again (`JSLock::DropAllLocks`), 51 ns for an empty `JSObjectMakeFunctionWithCallback` in a bare C program. Below it only the engine's
  C++ API (Bun's way, a WebKit build of our own). A frame of 10 000 host calls pays about 0.5 ms more than on QuickJS; any JavaScript of its own is 5 to 15 times faster.

## V8 beside QuickJS-ng and JavaScriptCore (ZN-773.05, 2026-10-21)

The same bench on `--engine v8`: V8 15.6.75.19 from Homebrew's `arm64_sequoia` bottle (`tools/v8-pack`; component build, no sandbox, pointer compression), JsRuntimeHost's V8
Node-API with `0003-v8-15.patch`, load 15 to 23 from other sessions (the best of two runs; the JIT numbers swing by 2 to 3 times under that load).

| | QuickJS-ng | JSC | V8 |
|---|---|---|---|
| fib(30) | 76 ms | 5 ms | 8 ms |
| a million `{x, y}` pushed and summed | 254 ms | 29 ms | 43 ms |
| 200k string appends, split, map, join | 24 ms | 16 ms | 3 ms |
| one `__host_loopNow()` call | 70 ns | 131 ns | 50 ns |

- V8's callbacks are cheap (an empty one, 5.2 ns in a bare embedder): of the 50 ns, a third is the clock read (`mach_continuous_time`, `sample` over a hot loop), a quarter
  the driver's `hostFn`, the rest JsRuntimeHost's wrapper and the result number. The rows' parameter count, return letter and table are now worked out once by `installHost`
  (two `strchr` per call before): 56 to 50 ns on V8, the same row on JavaScriptCore.
- `examples/js-gsap` and `examples/js-anatomy` frame 30: pixel-identical to QuickJS.

### three.js on the three engines (ZN-773.03, 2026-10-21)

`examples/js-three`, headless, `ZINC_DETERMINISTIC=1 ZINC_FRAMES=2000`, `/usr/bin/time` (best of two), WebGL from libzn_webgl through each engine's Node-API (ZN-773.02);
load 28 to 34 from other sessions, so the wall times are loose and the CPU times the better guide.

| | QuickJS-ng | JSC | V8 |
|---|---|---|---|
| CPU (user + sys) | 2.86 s | 2.36 s | 1.72 s |
| wall | 5.66 s | 4.19 s | 3.45 s |

Frame 60 is pixel-identical on the three engines. The scene makes about 28 WebGL calls a frame, so most of the CPU is the raster and the GL
replay, not JavaScript: a heavier scene widens the gap. JSC's slower host call (131 ns against 70) costs it nothing visible here.


JavaScriptCore's global object (2026-10-21): it was made from a JSClass named `Window`, so that the web environment could put Window.prototype under it. A
global of a JSClass is a JSCallbackObject, and JavaScriptCore caches no lookup on it: `sample` showed `JSGlobalObject::getOwnPropertySlot` and
`operationGetByIdGaveUp` on every `__host_loopNow` (and every `Math`, `Object`...) read. With a plain global (webenv.js gives the window its EventTarget
methods as its own properties and answers `instanceof` itself) the host call went from 131 to 118 ns. What is left is mostly JavaScriptCore's callback
itself (`JSLock::DropAllLocks`, `JSObjectGetPrivate`) and the clock read.

### examples/hero on the three engines (2026-10-21)

Headless, `ZINC_DETERMINISTIC=1`, `/usr/bin/time -l` (best of two; load 20 to 37 from other sessions). Frame 30 is pixel-identical on the three. Footprint is
macOS's `peak memory footprint` (dirty memory the process owns); RSS also counts the engine library's shared pages.

| | QuickJS-ng | JSC | V8 |
|---|---|---|---|
| first frame, wall | 0.45 s | 0.41 s | 0.40 s |
| 600 frames, CPU | 1.09 s | 1.03 s | 0.58 s |
| empty program, footprint | 9 MB | 10 MB | 20 MB |
| hero, 60 / 600 / 3000 frames, footprint | 45 / 50 / 55 MB | 112 / 137 / 163 MB | 87 / 93 / 91 MB |

- The memory is a level, not a leak: it is there at 60 frames and grows slowly after, as on QuickJS.
- On JSC it is the JIT's: `JSC_useJIT=0` gives 58 MB (CPU 1.40 s), `JSC_useDFGJIT=0` 110 MB, `JSC_useFTLJIT=0` 141 MB. The DFG off makes fib(30) 5 to 15 ms.
  The defaults stay: the engine is chosen for its JavaScript speed. A low-memory switch (the DFG off through the JSC_ environment before the
  first VM) is one line in src/engine/jsc.cpp if a target needs it.
- Hero's own JavaScript is small next to its layout and raster, which run in zinc whatever the engine: JSC is no faster than QuickJS on it, V8 about
  twice as fast.
## The render suite on the four engines (ZN-773, 2026-10-21)

`tools/zbench run mac --engine quickjs|jsc|v8` (new option: `zinc run` of the suite on that engine) beside the AOT build, M1 Pro, software raster, load average 30 to 80 from other sessions (every scene flagged noisy: compare the CPU work `w`, p50 ms, not the intervals). Artifacts `docs/reports/bench/zbench-render-mac-MacBookPro18_3-2026-10-21-{aot,quickjs,jsc,v8,img-*}.json`.

| scene | AOT | QuickJS | JSC | V8 |
|---|---|---|---|---|
| fill, text, clip, poly, scroll (raster-bound) | 0.4 to 1.8 | 0.5 to 2.0 | 0.4 to 1.6 | 0.4 to 1.5 |
| gradients | 9.0 | 8.3 | 7.1 | 7.2 |
| quads_10k | 1.32 | 2.72 | 4.72 | 1.84 |
| image_fill_only (JS loop over 256 KB) | 0.75 | 11.9 | 1.33 | 0.26 |
| image_upload_only, before / after the fix below | 0.72 | 3.1 | 27.5 / 2.0 | 10.6 / 1.8 |
| image_update, before / after | 1.29 | 15.4 | 27.9 / 2.4 | 11.4 / 4.1 |
| ui_scroll_fling / ui_scroll_wheel | 0.58 / 0.61 | 3.60 / 3.65 | 1.23 / 1.25 | 0.65 / 0.69 |
| ui_anim_transform / ui_anim_layout / ui_list_update | 0.60 / 0.24 / 0.50 | 1.48 / 0.67 / 2.35 | 0.64 / 0.31 / 0.75 | 0.57 / 0.32 / 0.57 |

V8 matches the AOT build on the UI scenes; JSC is within 1.1 to 2x; QuickJS 2.5 to 6x. The fix: an array argument of a host row (`u8[]`, `f64[]`: updateImage's pixels) was read with one `napi_get_element` per element (262,144 calls a frame); the driver now has the engine copy it into a Uint8Array/Float64Array in one `napi_new_instance` and reads its bytes in place (src/engine/driver.cpp). JSC's quads_10k (4.7 against V8's 1.8) is the next thing to look at: 10,000 host calls a frame at JSC's ~118 ns each.

## Hermes and Static Hermes beside the three engines (ZN-773.07, 2026-10-21)

Hermes built from source by `tools/hermes-pack` (facebook/hermes `static_h` at `e760a68a`, Release, arm64 baseline JIT allowed, its own Node-API in
`libhermesvm`), `--engine hermes` (src/engine/hermes.cpp). M1 Pro, load average 11 to 18 from other sessions (best of 2 or 3 runs; the JIT numbers
swing). Hermes compiles the bundle lazily and unoptimised by default; `ZINC_HERMES_OPT=1` compiles it eagerly through the full optimiser,
`ZINC_HERMES_JIT=0` turns the JIT off; Static Hermes is the bundle compiled by `shermes -O` to native code (`tools/hermes-unit`) and run by the
same module in the same Runtime and Node-API environment (`ZINC_HERMES_UNIT`).

`tests/bench/napi/engines.js`:

| | QuickJS-ng | JSC | V8 | Hermes | Hermes, no JIT | Hermes `-O` | Static Hermes | Static Hermes `-typed` |
|---|---|---|---|---|---|---|---|---|
| fib(30) | 75 ms | 5 ms | 8 ms | 32 ms | 83 ms | 19 ms | 21 ms | 19 ms |
| a million `{x, y}` pushed and summed | 228 ms | 30 ms | 38 ms | 133 ms | 132 ms | 93 ms | 75 ms | 59 ms |
| 200k string appends, split, map, join | 24 ms | 5 ms | 3 ms | 33 ms | 18 ms | 19 ms | 17 ms | 34 ms |
| one `__host_loopNow()` call | 70 ns | 115 ns | 52 ns | 50 ns | 49 ns | 47 ns | 48 ns | 48 ns |

Standalone (`shermes -O -o fib fib.js`, no zinc): fib(30) 20 ms untyped, 15 ms with Flow types and `-typed`; the `hermes` CLI 50 ms
interpreted, 19 ms with `-Xjit=force`. `-typed` on untyped JavaScript changes little (it only types what is annotated).

`examples/hero`, headless, `ZINC_DETERMINISTIC=1`, `/usr/bin/time -l`; frame 30 pixel-identical on Hermes, Static Hermes and QuickJS:

| | QuickJS-ng | JSC | V8 | Hermes | Hermes `-O` | Static Hermes |
|---|---|---|---|---|---|---|
| 60 / 600 / 3000 frames, CPU | 0.47 / 1.04 / 3.47 s | 0.52 / 0.94 / 2.39 s | 0.39 / 0.53 / 0.99 s | 0.46 / 0.89 / 2.72 s | 1.61 / 1.99 / 3.48 s | 0.28 / 0.67 / 2.31 s |
| 60 / 600 / 3000 frames, footprint | 48 / 51 / 47 MB | 114 / 148 / 139 MB | 73 / 77 / 86 MB | 67 / 73 / 74 MB | 111 / 100 / 109 MB | 51 / 53 / 58 MB |
| empty program: start (wall) / footprint | 10-20 ms / 5.7 MB | 20-30 ms / 9.9 MB | 30-40 ms / 20 MB | 20-30 ms / 8.5 MB | | |

- Static Hermes is the fastest start (no parse, no compile: 0.28 s CPU for 60 frames against 0.46 for Hermes's bytecode) and QuickJS's footprint,
  with 1.5x QuickJS's speed over a long run; V8 stays 2.3x faster than it on hero. `-O` at run time costs 1.2 s of optimiser on hero's 681 KB
  bundle: worth it only ahead of time (hermesc, or shermes).
- The price of Static Hermes: `shermes` takes 34 s of CPU on hero's bundle and makes 4.9 MB of code from 681 KB of JavaScript (the module, 1.9 MB,
  and `libhermesvm`, 5.0 MB, come on top); the unit still runs on Hermes's VM (its GC, its objects, its Promise polyfill).
- Sizes: `libhermesvm` 5.0 MB (`libhermesvmlean`, without the compiler, 3.0 MB), the pack of `tools/engine-pack hermes` 1.8 MB compressed; V8's
  libraries are 74 MB.

`tools/zbench run mac --engine hermes` (artifact `docs/reports/bench/zbench-render-mac-MacBookPro18_3-2026-10-21-hermes.json`), CPU work p50 in ms, beside the
section above:

| scene | AOT | QuickJS | JSC | V8 | Hermes |
|---|---|---|---|---|---|
| fill, text, clip, poly, scroll (raster-bound) | 0.4 to 1.8 | 0.5 to 2.0 | 0.4 to 1.6 | 0.4 to 1.5 | 0.5 to 2.0 |
| gradients | 9.0 | 8.3 | 7.1 | 7.2 | 6.3 |
| quads_10k | 1.32 | 2.72 | 4.72 | 1.84 | 2.56 |
| image_fill_only | 0.75 | 11.9 | 1.33 | 0.26 | 3.33 |
| image_upload_only / image_update, before / after the copy below | 0.72 / 1.29 | 3.1 / 15.4 | 2.0 / 2.4 | 1.8 / 4.1 | 25.1 / 26.8, 3.3 / 5.4 |
| ui_scroll_fling / ui_scroll_wheel | 0.58 / 0.61 | 3.60 / 3.65 | 1.23 / 1.25 | 0.65 / 0.69 | 3.24 / 3.37 |
| ui_anim_transform / ui_anim_layout / ui_list_update | 0.60 / 0.24 / 0.50 | 1.48 / 0.67 / 2.35 | 0.64 / 0.31 / 0.75 | 0.57 / 0.32 / 0.57 | 1.56 / 0.76 / 2.22 |

Hermes's UI scenes are QuickJS's, its quads (the host call) between QuickJS and V8. The image rows were the driver's `new Uint8Array(array)`
of a 262,144-element array (one `napi_new_instance`, no per-element calls: counted with lldb), which Hermes does through the iterator protocol:
24 ms against V8's 0.24, JSC's 0.06 and QuickJS's 14. `new Uint8Array(n).set(array)` takes 1.9 ms on Hermes (0.5 on V8, 0.21 on JSC), so the
driver copies that way on Hermes only (`ZN_ENGINE_HERMES`): image_upload_only 25.1 to 3.3 ms, image_update 26.8 to 5.4 (second run of the suite,
same artifact).

## Hermes bytecode at zinc build, and the published pack (ZN-773.08, 2026-10-21)

M1 Pro, machine loaded by other builds (load 12 to 17). `examples/hero` copied as a project on `"engine": "hermes"`; `zinc build` writes
`build/hero.js` (698 KB, its map 1.6 MB) and `build/hero.hbc` (898 KB, compiled with the full optimisation pipeline, as `hermesc -O`; 1.6 s
for bundle and compile). Wall time of `ZINC_HEADLESS=1 ZINC_FRAMES=1 zinc run build/hero.js --engine hermes` (process start to the end of the
first frame and the exit), 5 runs after one warm-up, the same bundle with its `.hbc` beside it (mapped, `hermes_run_bytecode`) and without
(lazy compile of the source, the default), two rounds:

| | median | min to max |
|---|---|---|
| bytecode | 279 / 282 ms | 273 to 290 |
| source | 525 / 443 ms | 441 to 657 |

The bytecode starts hero about 160 to 240 ms (35 to 45%) sooner: no parse and no compile at start, and code of the optimiser instead of the
lazy compiler's. The frame is pixel-identical (frame 30, `ZINC_DETERMINISTIC`). Stack traces from bytecode name the user's files and lines as from
source (the frames carry the bundle's file name, the driver maps them through its source map).

Hermes is now built with its debugger (`HERMES_ENABLE_DEBUGGER`, for `--inspect`): hero's 600 frames took 0.94 to 1.02 s of CPU on that loaded
machine against 0.89 s measured without it (ZN-773.07); not separated from the load, to measure again on a quiet machine. The pack
(`tools/engine-pack hermes`: the module, libhermesvm, eight licence files) is 2.0 MB (1.8 MB before the debugger).

## QuickJS bytecode at zinc build (ZN-773.09, 2026-10-21)

M1 Pro, machine loaded by other builds (load 7 to 10). `examples/hero` copied as a project on `"engine": "quickjs"`; `zinc build` writes
`build/hero.js` (657 KB, its map 570 KB) and `build/hero.qbc` (605 KB, `JS_WriteObject` of the bundle's module, sources stripped, lines kept).
Wall time of `ZINC_HEADLESS=1 ZINC_FRAMES=1 zinc run build/hero.js` (process start to the end of the first frame and the exit), 5 runs after one
warm-up, the same bundle with its `.qbc` beside it (`JS_ReadObject`) and without (parse and compile of the source), two rounds:

| | median | min to max |
|---|---|---|
| bytecode | 360 / 368 ms | 351 to 440 |
| source | 412 / 415 ms | 389 to 430 |

The bytecode starts hero about 50 ms (12%) sooner: QuickJS's parse and compile of 657 KB, the rest of the start (plugins, fonts, the first
layout and frame) is the same on both. Less than Hermes's gain (ZN-773.08: 160 to 240 ms), whose lazy compile is slower and whose bytecode is
also optimised. The frame is identical (frame 30, `ZINC_DETERMINISTIC`).

## The ESP32 under mquickjs and the light mode (2026-10-22)

ESP32-2432S022C (classic ESP32, 240 MHz, no PSRAM), ESP-IDF 5.5.5, measured on the board unless said. The Mac was building other trees.

| what | number |
|---|---|
| ZBC module size, esp32 profile (light mode: sparse vtables, dead selectors dropped): hello / breakout / the widgets demo | 125 → 121 B / 37,550 → 24,562 B / 2,415,900 → 686,695 B |
| AOT core in QEMU, breakout loaded: free heap, decoded module | 157,852 → 210,420 B, 116,780 → 64,136 B |
| `zinc zbc --check` of the widgets demo on the host, peak footprint | 8.9 → 4.8 MB |
| mquickjs firmware, minimal image (screen, pins, storage): app / merged image | 300 KB / 431 KB |
| mquickjs firmware, network image (Wi-Fi, ESP-NOW, BLE, updates): app / merged image | 1,038 KB / 1,169 KB |
| free heap before the 96 KiB JS heap: minimal / network image | 241 to 246 KB / 155 KB |
| free heap with the JS heap allocated: gpio demo (minimal) / setup portal open / ESP-NOW / BLE advertising | 143 KB / 44 KB / 62 KB / 38 KB (22 KB before the NimBLE cuts of sdkconfig.net) |
| firmware update over Wi-Fi (POST /ota, 1 MB app, from a tablet on the setup network) | 5.8 s |
| a native plugin built into the firmware (zinc:qrcode, Nayuki's C): image growth / first ESP-IDF build (ccache warm for the IDF) | +10.7 KB / 98 s |
| zinc:qrcode on the board: a 43-byte URL, 33 × 33 modules, `MEDIUM` | 32 ms to encode; 59 fps while shown, render+send 107 µs |
| Arduino's core as a component (examples/esp32-arduino: Preferences, ESP, millis, setup/loop): app / the core's archive / static DRAM | 324 KB (minimal 300 KB) / 2.1 KB / 33.1 KB |
| examples/esp32-arduino on the board: free heap with the JS heap allocated, frame rate | 145 KB, 59.7 fps (js 388 µs) |
| firmware with Arduino's core: first build (33 registry packages, ccache warm for the IDF) / a change of the sketch, rebuilt in place | 211.6 s / 26 s (make; idf.py's reconfigure alone was another 27 s) |
| zinc:lvgl in the emulator's firmware (LVGL 9.6, plugins' C at -O2): app / merged image | 581 KB (minimal image 300 KB) / 709 KB |
| examples/esp32-widgets under mquickjs (zinc:lvgl): bytecode, against the zinc:gfx tour's 690 KB | 60 KB |
| examples/esp32-widgets in esp32sim, Home page (emulated time; the emulator does not time the panel's transfers): fps, LVGL a frame (slowest), JS a frame, free heap | 60 fps, 0.5 ms (8.5 ms), 0.7 to 1.0 ms, 65 KB |
| esp32sim, Input page scrolled by lv.scrollTo (about 57,500 px redrawn a frame): LVGL a frame, plugins' C at -Os → -O2 | 11.8 → 9.0 ms (slowest 13 → 11.1 ms) |
| the same full-page redraw sent on the board's i80 bus at 10 MHz (computed, 2 bytes a pixel; not measured, the board was away) | about 12 ms a frame |
| zinc:lvgl with ThorVG (Lottie, LVGL's vector graphics): the emulator's firmware app, against 595,648 B without | 1,061,728 B (0x180000 partition: 32% free) |
| esp32-widgets, one page built at a time, in esp32sim (portrait, 28 KB main stack): free heap after load, then on Input / Music / Lottie (lowest) / Home | 133.5 KB, then 71.8 / 82.5 / 35.3 (34.4) / 79.9 KB; six pages built at once: 0 KB, "LVGL's memory pool is full" |
| esp32sim: the main task's stack with zinc:lvgl, deepest (ThorVG) / never used of 28 KB | 21.1 KB / 7.4 KB (the default 8 KB overflowed and corrupted the heap) |
| esp32sim, Lottie page (64 x 64 ARGB8888, 16 KB buffer): fps, LVGL a frame | 60 fps, 5 ms |
| esp32sim, Bench page (16 rounded squares, 76,800 px a frame): fps, LVGL a frame | 42 to 44.5 fps, 17.7 ms |
| the computer's LVGL pool (96 KB, standing for the board's 138 KB), in use on Home / Music / Input / Bench / Lottie | 32.4 / 28.5 / 44 / 68 / 71.1 KB (most 71.9) |
| the widgets tour's bytecode with the six pages and Lottie's JSON | 85,920 B |
| esp32-widgets Bench in esp32sim, 24 objects, "Run" (Rects / Alpha / Text / Mix): before / no stepping of what is not shown (the spectrum off the Music page, hidden objects) / + 128 changed areas (LV_INV_BUF_SIZE, 32 by default) | 41/36/37/37 → 47/41/43/43 → 60/58/58/58 fps; 76,800 → 15,000 to 17,000 px a frame, LVGL 18 to 20 → 11 to 14 ms |
| the same, + near areas joined (JOIN_SLACK 4,096 px) and integer positions: 24 objects / 64 objects | 60/60/60/60 fps, LVGL 8.7 ms, 22,000 to 25,000 px / 33/27/29/29 fps (25/22/22/23 without the join), LVGL 23.5 ms (33.7 without) |
| the Bench's program outside LVGL's render, 64 objects (its loop and `pos`) | about 10 ms a frame |
| the same 64 objects moved by LVGL (`lv.animate` on X and Y, forever) instead of `lv.pos` every frame (Rects / Alpha / Text / Mix), and the free heap | 34/27/29/30 fps against 33/26/29/29; LVGL 28.5 to 32.9 ms (the moves' style refresh is now inside it); 37.9 KB free against 51.8 KB (128 animations, about 110 B each) |
| Home / Music with the join | 60 fps, LVGL 1.8 to 2.8 ms (5,300 to 6,100 px) / 60 fps, 2.1 ms (9,000 px) |
| esp32-widgets on the board (i80 bus at 10 MHz), Bench, 24 objects: fps, LVGL a frame (slowest), px a frame | 23 to 25 fps, 31.5 to 35 ms (37.6 to 51.8 ms), 24,000 to 26,500 px (esp32sim: 60 fps, 7.3 ms) |
| the same, each area sent in transfers of one DMA descriptor (1,023 px, 0x2C then 0x3C), against whole areas on descriptors of 4,092 bytes | 20 to 22 fps, LVGL 37 to 39.6 ms / 24 to 25 fps, 31.5 to 32.9 ms |
| the board's pages, one tour: Lottie (64 x 64) / Music / Input / Info | 58 to 60 fps, LVGL 13 to 15 ms / 58 fps, 8.2 ms / 60 fps, 0.5 ms / 59 fps, 6.5 ms |
| free heap on the board at start / after the program loads / on Bench (lowest of the tour), HEAD 93af7fe3 against one LVGL buffer and one band where the i80 driver copies | 196.5 / 98.2 / 17.9 KB against 208.3 / 109.9 / 43.8 KB (24.3 KB, Lottie after Bench) |
| where the Bench's time goes on the board (CPU0 sampled at each 1 kHz tick, 4,000 samples): the i80 driver's colour copy / LVGL's events / LVGL's style lookups (get_prop_core, get_selector_style_prop) / mquickjs's calls (JS_Call) / pixel blending | 12.4 / 6.7 / 8.2 / 3.7 / about 5%: the flash cache, not the pixels (the board runs 4.5 times slower than esp32sim) |
| the Bench on the board, zinc:lvgl's 13 hottest files in the internal RAM (plugin.json "iram": styles, events, areas, arrays, draw, rect, blend, fill, refresh, label, scroll; 37 KB of the 128 KB) / and the i80 driver at -O2 | 33.6 to 36 fps, LVGL 20.2 to 22.2 ms / 38.5 to 40 fps, LVGL 17.9 to 19 ms (from 23 to 25 fps, 31.5 to 35 ms); free heap unchanged (44.7 KB on Bench) |
| internal RAM for code (IRAM) of the firmware: no LVGL / with zinc:lvgl's list / the network image | 58.1 / 95.2 / 58.3 KB of 128 KB |
| the Bench on the board with zinc:lvgl's list in IRAM, CPU0's samples by source file: LVGL / the i80 driver / mquickjs / the ROM (memcpy, memset, division) / the rest of ESP-IDF / the firmware and zinc:lvgl's glue | 65.9 / 10.1 / 10.0 / 7.0 / 4.2 / 2.4%: without mquickjs (no ESP32 firmware runs zinc:lvgl without it yet) this page would gain about a tenth at most |
| the cost of telling why a program stopped (ESP-IDF's core dump to flash, 0.9 KB, and 1.1 KB more of FreeRTOS's data; the stop is kept on the stack and in the NVS): free heap at start / lowest of the widgets' tour (Lottie after Bench still runs) / Bench | 208.3 → 205.8 KB / 24.3 → 19.1 KB / 41 fps |

## PERF-16 follow-up: zinc dev and the first start of a zinc:ui program (ZN-774.16, 2026-10-22)

M1 Pro, headless, 120 frames, `/usr/bin/time -l`, best of three, **load 6 to 7 from other sessions: indicative**. "First" is a fresh `ZINC_HOME`. `ZINC_DETERMINISTIC=1` turns the cache off by design (tests/run sets it), so it is not set here.

| Run | First | Second |
|---|---|---|
| docs/learn/samples/01 (zinc:gfx) | 0.04 s, 16 MB, 458 M instr | 0.00 s, 6.5 MB, 49 M instr |
| docs/learn/samples/12 (zinc:ui) | 0.35 s, 62 MB, 3.86 G instr | 0.01 s, 9.2 MB, 155 M instr |
| `zinc dev` child of sample 12 with the inspector | 0.58 s, 92 MB, 6.16 G instr (every start, before) | 0.02 s, 13 MB, 221 M instr (cached, after) |
| sample 12 built native (`--native`, cached build) | | 0.02 s, 4.2 MB, 94 M instr |

What remains: the first run of any zinc:ui program and every Fast Refresh compile lib/std again, about 330 ms here (a 7-line zinc:ui program: 337 ms; a drawing-only one: 13 functions, 70 KB). The class parser is 16% and the text-field editor 13% of the code a primitives-only program compiles (docs/reports/ui-primitives-like-react-native.md).

## Kanban idle smoke (ZN-775, 2026-10-22)

Development Mac, existing `build/zinc`, interpreter, headless deterministic 1560x940, nine-task offline fixture. `KANBAN_SNAPSHOT=$PWD/tests/data/kanban/snapshot.json ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=1560x940 ZINC_FRAMES=300 ZINC_PROFILE=1 build/zinc run examples/kanban`: paint p50/p99 **0.00/0.00 ms**, maximum 0.30 ms, layout maximum 4.77 ms. This proves idle painting stops after setup; it is not a comparative benchmark or a physical-device measurement. The T1 test checks the idle paint percentiles. The three engines' short first-board smoke produces the same frame hash `e9f2d59eb4057bfa`. The live read of all 975 local tasks was also captured; no frame-time claim is made for that run.

## Kanban scroll and editor regression (ZN-775 follow-up, 2026-10-22)

The compact UI uses 144 px rows. The geometry regression builds 200 tasks, scrolls to row 40, then the last row, then back, checks the requested card intersects the viewport and fewer than 20 row hosts remain mounted, and checks the ghost retains its exact original pointer grip. Without the row host correction it fails on row 40. Headless deterministic 1560x940, nine-task fixture, 300 idle frames: paint p50/p99 **0.00/0.00 ms**, maximum 0.77 ms; layout maximum 3.65 ms. This is an idle regression check, not a comparative benchmark. Interpreter, AOT and QuickJS first-board smoke hash: `763dad18a1e3cfed`. No physical-device or cross-target performance claim.

## The class parser only where classes are used (ZN-774.18 step 6, 2026-10-22)

`bench/ui-primitives/measure.sh` (ZBC listing instructions, `func @` count, `--emit=zbc-bin` and `--emit=cpp` bytes, `ZINC_DETERMINISTIC=1`), develop
02bb67ca against the step-6 commit. styleonly gives every look as a style object, prims-rn is the React Native model, lesson 12 uses classes.
Executables from `zinc build <dir> -o <exe>`, same runtime libraries.

| Program | Instructions | Functions | ZBC bytes | AOT C++ bytes | Executable bytes |
|---|---|---|---|---|---|
| styleonly | 60,194 → 53,445 (−11.2 %) | 282 → 244 | 354,823 → 307,736 (−13.3 %) | 3,161,082 → 2,697,608 (−14.7 %) | 4,675,296 → 4,526,608 (−145 KB) |
| prims-rn | 66,320 → 59,519 (−10.3 %) | 373 → 336 | 407,710 → 360,524 (−11.6 %) | 3,545,455 → 3,081,742 (−13.1 %) | 5,353,568 → 5,204,880 (−145 KB) |
| lesson 12 (classes) | 62,354 → 62,387 (+33, the hook) | 298 | 365,079 → 365,709 | 3,236,953 → 3,238,850 | |
| lesson 1 (zinc:gfx) | 1,227, unchanged | 13 | 10,710 | 70,258 | |

The 38 functions gone from styleonly are `applyToken`, the token helpers, the colour and gradient parsers and the palette map. Not measured:
the interpreter start and `zinc build` seconds (load 15 to 26 all evening); `TIMES=1 bench/ui-primitives/measure.sh` on a quiet machine, with
02bb67ca's binary for the before. The field editor (step 7 of the report) is about 5,700 instructions, 10.6 % of what styleonly keeps, but every
program with a field needs it; deferred to backlog/later.md.

## The Vita through vitaGL (D165, 2026-10-25)

The owner's PS Vita, `examples/ui/gl-check` with `ZINC_SCENE=cycle` (seven scenes, two seconds each), core built with `--vitagl`, from `ux0:data/ZINC00020/zinc.log`:

| Run | fps (600 frames) | missed vblanks | frame max | programs built | CPU to submit a replayed frame |
|---|---|---|---|---|---|
| first launch (Cg compile) | 32.4 | 16 | 1001 ms | 17 in 10304 ms | 88 ms (the compiles) |
| second launch (shader cache) | 60.5 | 0 | 16.7 ms | 17 in 86 ms | 1.7 ms at start, 0.4 ms after |
| steady state | 60.4 | 0 | 16.7 ms | | 2.4 ms (first run), 0.43 ms (cached) |

0 LINE/POLY skipped and 0 CPU tiles: every command on the GPU (stencil 8). The same program on GXM: 60.3 fps, its rounded and gradient scenes rasterized in software.

Meadow Run (`examples/platformer`) on the same console, one 600-frame window each: GXM (ZINC00011, 2026-10-17) 60.2-65.3 fps, 0 missed vblanks, replay CPU p50 0.32 / p99 0.39 ms, frame p99 17.6 ms; vitaGL (ZINC00012, second launch, shader cache) 60.9 fps, 29 missed vblanks, replay CPU p50 1.10 / p99 16.1 ms, frame p99 34.2 ms, 209 quads and 2 draw calls a frame. GXM stays the 2D default (D165).


## zinc:3d on the console GPUs (2026-10-25, emulators)

3D time per frame (`effects` of ZINC_PROFILE, p50), software renderer against the console's GPU renderer. Emulators only: PPSSPP headless,
Azahar, Vita3K on the Intel Mac; the hardware numbers are still to take.

| Program | PSP software | PSP GE | 3DS software | 3DS PICA200 | Vita software | Vita GXM |
|---|---|---|---|---|---|---|
| examples/3d/cubes (679 tris) | 29.88 ms | 6.57 ms | 25.31 ms | 2.05 ms | 6.02 ms (work) | 0.74 ms (work) |
| examples/3d/orbit (2,300 tris) | 36.95 ms | 15.07 ms | 26.35 ms | 4.54 ms | 8.99 ms (work) | 2.21 ms (work), 61.5 fps |

The PSP's 15 ms on orbit is not split yet between the interpreted scene walk (matrices composed in Zinc) and the GE.

On the owner's hardware (2026-10-25), examples/3d/orbit:

| Device | 3D (`effects` p50) | Work p50 | Frame rate |
|---|---|---|---|
| PSP via Adrenaline on a PS Vita, GE | 25.4 ms | 25.7 ms | 30 fps |
| PS Vita, GXM with the vertex program from SceShaccCg | — | 5.3 ms | 60 fps (52.7 over the first 600 frames: spikes up to 117 ms at the start) |

- PPSSPP said 15 ms for the PSP; the console takes 25. Split the time between the interpreted scene walk and the GE before optimizing.
- The Pocket3D directions are listed in docs/reports/hardware/pocketjs-pocket3d.md §2.7: the list built while the GE draws the previous one, i16 vertices.

## Programs compiled into the console cores (ZN-480, 2026-10-25)

`tools/build-console-core <console> --aot <project>`. Emulators: PPSSPP 1.20.4 software, Azahar, Vita3K (Vita3K runs on the Mac's JIT: its times are not the device's).

| examples/3d/orbit on PPSSPP | Interpreted | Compiled |
|---|---|---|
| "psp 3d" render | 5.91 ms | 4.41 ms |
| of which the program | 5.72 ms | 4.22 ms |
| frame work p50 | 7.06 ms | 5.34 ms |

| bouncing-ball, frame work p50 | Interpreted | Compiled |
|---|---|---|
| PSP, 1000 balls | 15.46 ms | 8.64 ms |
| PSP, 3000 balls | 46.81 ms | 25.93 ms |
| 3DS, 1000 balls | 11.93 ms | 6.96 ms |
| Vita, 6000 balls | 5.74 ms | 2.86 ms |

Balls at 16.7 ms (linear fit): PSP about 1080 interpreted, 1890 compiled; 3DS about 1400 and 2400. The compiled cores are smaller (no interpreter): PSP orbit EBOOT 2,614,510 to 2,552,918 bytes, 3DS fib 1,265,956 to 852,928.

## 2026-10-25: shared Box2D pinball, M1 Pro headless sample

Owner asked for proven physics and more consistent pinballs. Box2D replaces the live handwritten 2D collision solver; Jolt remains the 3D solver. Short interpreter run at 960×600, fixed delta 0.016667, 2702 frames (869 measured frames per phase after warm-up), no other session build/test running:

| Per-frame work | Previous solver | Shared Box2D + cabinet refresh |
|---|---:|---:|
| Rules + physics, one ball | 0.074 ms | 0.189 ms |
| Rules + physics, three balls | 0.142 ms | 0.235 ms |
| Rules + physics, attract | 0.069 ms | 0.170 ms |
| Total frame, one ball | 0.25 ms | 0.39 ms |
| Total frame, three balls | 0.35 ms | 0.46 ms |

One Box2D-run multiball frame reached 16 ms; other measured maxima were 2 ms or less. This is a small absolute increase and a large relative increase, not a performance win. Physics and artwork change the trajectories/workloads; this single sample is not an identical-workload regression gate. It proves neither windowed 120 Hz presentation nor performance on a console/Pi. Previous sources were read from git into `/tmp/zinc-pinball-before`; neither tree nor engine was rebuilt for this comparison.

Reproduce after builds/tests finish: `ZINC_STEPS=0 ZINC_HEADLESS=1 ZINC_FRAMES=2702 ZINC_FIXED_DT=0.016667 ZINC_DEMO=bench build/zinc run examples/pinball --interp`. Calibration probes and test coverage: `zinc-next-pinball-physics.md`.

### 2026-10-25: Nova Patrol DS, compiled program after physical lag report

Matched 360-frame Azahar guest sessions (`tests/data/n3ds-demos/pinball.input`, `ZINC_PROFILE=1`), serialized with `/tmp/zinc-azahar.lock`, no concurrent build from this session. Previous embedded/interpreted 3DS build: program p50/p99 12/21 ms, refresh gap 17/34 ms. Optimized compiled (`--aot`) 0.2 build: 4/7 ms and 17/18 ms. Startup/baking remains 575–647 ms. This is emulator/guest profiling, not a real-device timing claim; other work on the host prevents treating it as a formal host CPU benchmark.

Accuracy is unchanged: 960 Hz plus adaptive travel steps, Box2D retained. Changes remove redundant bridge writes, resting flipper geometry and repeated collider scans; 3DS effect pool is 12 sparks. Core invariants and desktop frame comparison pass. The DS view now actually draws cap and spark image assets. Commands and artifact provenance: `zinc-next-pinball-physics.md`, section Physical 3DS feedback.


### 2026-10-25: 3DS stereo clock and three-ball regression

Compiled real-app multiball probe passes bounds, speed and elapsed-clock assertions under Azahar: 1200 flat callbacks (~20 s), 3600 stereo callbacks (~30 s). Corrected 1/60-per-eye HAL timing: stereo game time now advances ~5 s per 5 s report rather than ~10 s. Guest program p50 4–5 ms, stereo reporting-window p99 up to22 ms, occasional34 ms refresh gaps; initial board bake ~575 ms. Emulator correctness/profiling only, not a physical 60 FPS claim. Supported New3DS CPU/cache mode enabled; physical benefit unmeasured. See pinball physics report and 0.2.1 artifact metadata.


### 2026-10-25: workflow demo package footprints, timing not measured

Measured the actual uncompressed local bundles by summing regular file lengths (system frameworks excluded), artifact `docs/reports/bench/workflow-footprint-2026-10-25.json`. Swift Observatory: **5,869,720 B / 5.60 MiB**, macOS arm64 native app plus Zinc. Godot Warehouse: **362,450,283 B / 345.66 MiB**, using the official full universal x86_64+arm64 Godot executable plus the Zinc extension. Official reference Godot.app: **357,753,867 B / 341.18 MiB**; package-content differences mean subtracting the whole bundles is not a precise runtime-overhead calculation. Zinc Pocket Rally: **49,240,979 B / 46.96 MiB**, arm64, with a minimal real 2D LibGodot runtime. They are different feature/build profiles, not a like-for-like engine comparison.

No FPS, frame-time, CPU or RAM benchmark was performed for these demos. Concurrent other-session PSP/Vita compilation was active; no timing was taken or presented as valid under that load. Earlier native/GPU regression passes establish correctness, not speed. Warehouse packaging is a working demo using a full editor-capable runtime, not a lean distribution template.

The Zinc Warehouse extension itself is **6,955,136 B / 6.63 MiB**; this is the native AOT UI/runtime module inside the Godot host, not the full application bundle.


### 2026-10-25: DS below-30-FPS feedback, CPU and replay checks

Owner still measures/perceives below30 FPS on physical 3DS. GPU-active SD log is insufficient to rule out fallback; added profile counters report zero software surfaces for compiled real-app stereo multiball probes. Removed generic8 ms per-eye cap from3DS builds (existing citro3d/vblank synchronization remains). DS now uses240 Hz base game steps with unchanged travel subdivision and Box2D CCD; desktop defaults960 Hz. Matched1200-callback stereo probes: program median5 ms at960 Hz vs3 ms at240 Hz; reporting-window p99 16/7 vs11/7 ms; both median17 ms refresh gaps, occasional34 ms. Trajectories differ, so this is indicative guest profiling only. Physical FPS and CPU split remain unmeasured; the new bottom-screen FPS display enables the next physical check. Full commands/details in pinball physics report.


## 2026-10-25 — Swift / Godot / Blender real-window macOS baselines (ZN-836..838)

M1 Pro 10 cores, 16 GiB, AC; three finite passages of 330 callbacks per case, 30 warmup excluded. Sequential runs with no observed build process; contaminated runs rejected. Median of per-run statistics. Physical footprint is one separate live kernel snapshot, not peak RSS. CPU includes launch-to-reap lifetime with ~100 ms polling precision. Different instrumentation/workloads are not directly comparable; callbacks are not displayed FPS.

| Case | Instrumented work p50 / p99 (ms) | Callback interval p50 (ms) | Process CPU (% of one core) | Peak RSS (MiB) | Physical snapshot (MiB) |
|---|---:|---:|---:|---:|---:|
| swift-idle | 0.030 / 0.065 | 16.668 | 2.7 | 130.3 | 66.6 |
| swift-active | 2.858 / 4.012 | 18.705 | 68.5 | 199.4 | 113.1 |
| libgodot-idle | 0.018 / 0.046 | 0.570 | 44.6 | 111.9 | 87.3 |
| libgodot-active | 0.026 / 0.077 | 0.666 | 39.5 | 112.4 | 86.6 |
| warehouse-idle | 0.035 / 0.068 | 8.275 | 21.5 | 188.9 | 117.5 |
| warehouse-active | 0.909 / 1.049 | 9.559 | 30.4 | 195.7 | 115.2 |
| animation-lab | 0.821 / 1.897 | 8.936 | 29.4 | 121.1 | 183.9 |
| lantern-post | 0.921 / 1.693 | 8.926 | 32.5 | 124.3 | 187.7 |
| blender-world | 0.746 / 1.330 | 8.953 | 27.8 | 120.4 | 183.6 |
| blender-library | 0.003 / 0.008 | 9.026 | 6.3 | 101.4 | 159.3 |
| godot-to-zinc | 0.001 / 0.002 | 10.021 | 5.4 | 99.3 | 157.7 |

Full boundaries, startup/variability, exact commands, hashes, rejected/failed experiments and limits: [report](workflow-macos-performance-2026-10-25.md), [raw evidence](bench/workflow-macos-2026-10-25.json). Standalone runs use the fixed checkout recorded in the artifact. LibGodot loop cadence is unstable; pure GPU time, displayed FPS and sustained production-scale stress are unmeasured. All 44 accepted final processes exited 0; optional Godot editor-import cleanup crash remains open.


### 2026-10-25: complete 3DS refresh capture and submission coherency

Previous callback-only timings omitted bottom replay/synchronization. New buffered refresh capture includes both eyes and the bottom window, actual vblank deltas and runtime allocations. Flat3480 measured refreshes:59.83 Hz, CPU p50/p99/max 2.765/5.624/7.946 ms; stereo 1680:59.83 Hz, 4.387/7.367/8.554 ms. Zero missed refreshes/vblanks and zero software surfaces in either Azahar run, after 120 warm-up refreshes. GPU submission changed from full-linear-heap cache flush to explicit resources plus command-list flush; physical gain is unmeasured and not modeled by these timings. Packed Box2D bridge 1200-step equivalence test: identical states/events, runtime allocations 7240→6016. No solver/calibration reduction. Source/provenance, raw CSV/JSON paths and reproduction commands in pinball physics report and docs/targets/n3ds-performance.md. Physical60 FPS requires the next SD capture; emulator gate success is not a physical claim.
