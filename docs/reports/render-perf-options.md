# Render performance on the Pi: measurements and options

Date 2026-09-29. Device: Raspberry Pi 3B+ (4 x Cortex-A53, 1.4 GHz), official 7" DSI screen, 800x480, `linux` target
(arm64, glibc), display `fbdev` (RGB565), hero's Navigation tab (`ZINC_DEMO=navigation`).

## What was measured

| run | result |
| --- | --- |
| Weak power supply | `vcgencmd get_throttled` = `0x50005` (under-voltage + throttled), CPU **600 MHz**, ~10 fps |
| Good power supply | `get_throttled` = `0x0`, CPU 1400 MHz, ~12 fps, one core at 100 %, three idle |

`ZINC_PROFILE=1`, 300 frames, good supply (ms):

| phase | p50 | p99 | max |
| --- | --- | --- | --- |
| `work` (all phases but present) | 12.2 | 15.7 | 18.8 |
| `paint` (the program's `onDraw`: projects the city and emits draw commands, logic thread) | 11.2 | 14.3 | 15.8 |
| `diff` (frame diff into damage) | 0.8 | 0.9 | 1.1 |
| `present` (fbdev: raster + 32 to 16 bpp conversion + `FBIO_WAITFORVSYNC`) | 15.7 | **85.6** | 95.3 |

Reading: the heavy frames spend ~70-85 ms in `present`. On fbdev everything in `present` runs serially on the logic
thread: `f->render()` rasterizes the whole damage on one core, then the conversion loop (`put_row`: per-pixel branches
and variable shifts), then a blocking vsync wait. A 60 Hz vsync quantises the rate (5 vsyncs = 83 ms = 12 fps).
Second cost: `paint` at 11 ms, also single-threaded, on the logic thread.

The macOS SDL HAL already rasterizes in parallel bands (`targets/macos/hal_sdl.cpp`, `ZINC_RENDER_THREADS`); the
fbdev HAL never got it.

## How others do it

- **Blend2D** ([multithreaded rendering](https://blend2d.com/doc/multithreaded-rendering.html)): render calls are
  serialized into a command queue; each worker *acquires* a band of scanlines and runs every command of the queue
  clipped to that band. Workers never share pixels, so they need no synchronisation between them; a
  `flush(SYNC)` is the only barrier. Bands stay in the CPU cache for all commands. This is what our SDL HAL does,
  with a static split instead of dynamic acquisition.
- **Chromium** ([how cc works](https://chromium.googlesource.com/chromium/src/+/master/docs/how_cc_works.md),
  [multithreaded rasterization](https://www.chromium.org/developers/design-documents/impl-side-painting/)): the page is
  recorded into a display list, cut into independent tiles, rasterized on worker threads, and only shown once the
  needed tiles are ready. Software raster stays off the compositor thread. It is the same idea with 2D tiles and a
  commit / activation step (a pipeline: recording of frame N+1 overlaps raster of frame N).
- **Raylib**: the stock software renderer `rlsw` is single-threaded
  ([rlsw](https://gamefromscratch.com/raylib-new-software-renderer/)); parallel variants exist as forks
  ([rlsw-cc](https://github.com/sreekotay/rayrender)), and use horizontal stripes. Its normal path is the GPU (OpenGL).
- **Skia**: CPU raster of a recorded picture per tile, or the GPU backends; no automatic multi-core CPU raster of a
  single canvas either.

**Desync risk.** Bands cannot drift apart if (1) they all render the same frozen command list, (2) they write disjoint
rows, and (3) the frame is presented only after a barrier that waits for every band. That is exactly the design above.
The only real race sources are shared mutable state inside the rasterizer (glyph cache, profiler counters); the
rasterizer keeps its scratch buffers thread-local and `gfx.cpp` pre-rasterizes missing glyphs on the logic thread.

## Options

| | option | expected effect | effort | risk |
| --- | --- | --- | --- | --- |
| A | **Parallel bands in fbdev** (dynamic acquisition, barrier before present, conversion done per band) | raster ~x2 to x3 on 4 cores (memory bandwidth of the Pi 3 may cap it), all apps | small: port of existing code | low: same pixels as 1 thread, checksum-checkable |
| B | **Pipeline** logic and raster: paint frame N+1 while bands render frame N (Chromium style) | frame time from `paint + raster` to `max(paint, raster)`; hides the 11 ms of `paint` | medium: double-buffer the retained command list in `gfx.cpp` (it is also the "previous frame" of the damage diff) | medium: core change, input latency +1 frame |
| C | **Do less work**: cull off-screen and sub-pixel geometry, level of detail by zoom, half-resolution map layer, cheaper polygon fill (`ZRT_RASTER_PROFILE` gives the cost per command kind) | proportional to what is cut; can be visible | medium, app + rasterizer | quality trade-offs |
| D | **Faster present**: specialised RGB565 conversion (NEON), overlap the vsync wait, or drop it when the frame is late | a few ms, removes the 60 Hz quantisation steps | small | low |
| E | **GPU map layer** through `display-gl` layers: static city geometry in GPU buffers, camera as a matrix | takes the map raster off the CPU almost completely | large: `display-gl` is `rpi1`/musl only and unrun on hardware (needs a linux KMS/EGL backend), polygon triangulation to write | high, but the only option that scales |
| F | Compiler flags for the linux arm64 build (`-mcpu=cortex-a53`, `-O3`) | small, unmeasured | trivial | low |

Recommended order: A and D first (small, measurable, reversible), then look at what remains: if `paint` on the logic
thread dominates, B; if the map is still too heavy, C, and E as the long-term path. A "full core" mode is A with
`ZINC_RENDER_THREADS` (1 = the old single-core path), so the same program can be timed with 1..4 cores.

## The "Zinc VM" comparison

The VM is a design study, not something that runs: `docs/reports/zinc-vm.md` describes it, and its prototype lives in
`research/vm-proto/`, outside the build. The Navigation program cannot be executed on it. What can be said from the
measurements above: `paint` (the only phase that is program code) is 11 ms native; the study reports the best
interpreter at about 6x slower than native (geometric mean, M1 Pro, four kernels), so an interpreted `paint` would be
of the order of 60-70 ms per frame, before any raster. That is an extrapolation, not a measurement. A real
same-code comparison available today is `--target sim` (Node/V8) against native, which times the `paint` phase only.

## Result of option A (and the conversion part of D), measured 2026-09-29

`runtime/include/render_bands.h` (bands of 16 rows pulled through an atomic counter, frame barrier before present) is
used by `plugins/display-fbdev`: rasterization, then the RGB565 / XRGB8888 conversion of each band.
`ZINC_RENDER_THREADS=1` is the old path with no thread. Driving phase (`ZINC_DEMO=navdrive`, at least 740 frames per
run, Pi 3B+ at 1.4 GHz, 800x480), effective fps by thread count 1 / 2 / 3 / 4:

| point of the route | fps | raster p50 (ms) |
| --- | --- | --- |
| Place de la Concorde | 13.2 / 22.4 / 27.4 / 30.4 | 74.7 / 40.9 / 28.9 / 25.8 |
| Champs-Elysees | 12.3 / 19.6 / 24.1 / 28.0 | 67.1 / 39.5 / 29.8 / 23.9 |
| Arc de Triomphe | 11.9 / 18.6 / 23.5 / 28.6 | 74.2 / 43.8 / 32.5 / 24.9 |

About x2.4 in fps and x2.9 on the raster phase; the gain flattens after 3 threads (total CPU time +30 %). The frame
checksum is identical for 1, 2, 3 and 4 threads over 200 deterministic frames. The gallery screen goes from 11.8 to
5.2 ms of raster, so the gain is not specific to the map. The runs at 3-4 threads ended with `throttled=0x80008`
(soft temperature limit, no heatsink): those numbers are, if anything, pessimistic. Preview-phase numbers taken earlier
(~41 fps at 2 threads) are not representative and must not be quoted.

What limits now (~34 ms per frame at 4 threads): ~25 ms raster, 6-9 ms `paint` on the logic thread, 1.4 ms conversion.
Next candidates: B (overlap `paint` of frame N+1 with raster of frame N), then C / E.

## Not measured yet

- Raster split by command kind on the Pi (`-DZRT_RASTER_PROFILE`).
- `FBIO_WAITFORVSYNC` returns in 0.01 ms on the KMS fbdev emulation: nothing paces to 60 Hz and tearing is possible.
- The SDL HAL still has its own static band code and could adopt the shared header.
- `rpi1`, 24/32-bit framebuffers, and the scaled (`xmap`) path with several threads.
- Effect of options B, C, E, F.
