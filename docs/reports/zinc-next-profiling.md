# Zinc Next: profiling tools

Four tools, all running on the interpreter or on any process, with output in formats other tools already read.

## CPU: `zinc profile`

```
zinc profile prog.ts [--hz 1000] [--speedscope out.json] [--folded out.folded]
```

Runs the program in the interpreter and samples the call stack on a CPU-time timer (`SIGPROF`). The signal handler only copies function
indices into memory reserved before the run, so the program is not slowed down by more than the timer. The report on stdout lists the
functions by self time (self and total, in percent and milliseconds); the program's own output goes to stderr.

- `--speedscope`: a sampled profile of the speedscope file format. Open it at <https://www.speedscope.app> (time order, left heavy, sandwich).
  Default `zinc.speedscope.json`.
- `--folded`: collapsed stacks (`main;f;g 42`), for `flamegraph.pl`, `inferno` or `pprof` converters.

The optimiser inlines small functions (`ZN_NO_OPT=1` keeps the structure of the source). Native (AOT) programs are measured with the
system's tools (`sample`, `perf`, Instruments); `tools/resmon` covers their CPU and memory over a run.

## QuickJS: `zinc profile --engine quickjs` (ZN-598)

```
cmake -B build-prof -DZN_QJS_PROFILE=ON && cmake --build build-prof --target zinc
build-prof/zinc profile prog.js --engine quickjs [--hz 1000]
```

A system profiler puts 85-97% of a QuickJS program's time in `JS_CallInternal` (the interpreter loop), which says nothing about the
JavaScript. The profiling build of the engine (`third_party/quickjs-ng/patches/0001-profile-hooks.patch`, `src/qjs/qjs_prof.cpp`) counts
every opcode executed, the calls and backward jumps (loop iterations) of each bytecode function, and samples the running JS function on a
CPU-time timer (`SIGPROF`); time spent in a C function counts for its JS caller. At exit it prints to stderr the 30 functions with the
most samples (samples, share, calls, backward jumps, name, `file:line`) and the 30 most executed opcodes. A default build has none of it:
the patch's code is under `#ifdef ZN_QJS_PROFILE` and the interpreter compiles to the same instructions as the release, so the counting
build is a separate build directory, and a default `zinc profile --engine quickjs` says how to make one.

The workloads of [quickjs-aot-jit-and-ffi.md](quickjs-aot-jit-and-ffi.md) section 2.1, in `bench/qjs/`:

- `three.mjs`: three.js r186 (`three.core.js`, no GL), 500 meshes in 50 groups, the CPU half of a render (matrices, culling, render list).
- `sprite.mjs`: 10,000 sprites moved, bounced and written as 4 rotated corners into a vertex Array.
- `objects.mjs`: 2,000 entities with polymorphic components, `Map` lookups, an event emitter with closures, `filter`/`map`.
- `physics.mjs`: matter-js 0.20 (300 bodies piled in a box, `Engine.update` at 60 Hz); matter-js is not vendored:
  `bench/qjs/fetch-matter` downloads and checks it into `bench/qjs/matter.mjs` (ignored by git).

Each prints its time per frame. `ZN_QJS_DUMP=<file>` (or a directory ending in `/`, one file per process) also writes every called
function with its counts and bytecode, for `tools/qjs2c` ([zinc-next-qjs2c.md](zinc-next-qjs2c.md)).

Measured on the development Mac (Intel, 2026-10-10, 1000 Hz):

| Workload | Samples | Bytecodes | Hottest functions (share of samples) | Top opcodes |
|---|---:|---:|---|---|
| three (200 frames) | 1,915 | 362 M | `multiplyMatrices` 22.8%, module loop 11.0%, `compose` 6.9%, culling callback 5.1%, `applyMatrix4` 5.1%, `setFromEuler` 4.9%, `invert` 4.9% | `get_loc_check` 20.8%, `swap` 12.5%, `mul` 7.2%, `set_loc_uninitialized` 4.6%, `add` 4.5% |
| sprite (60 frames) | 779 | 182 M | `corners` 66.5%, `step` 19.3%, module loop 13.1% | `swap` 15.8%, `get_loc_check` 12.2%, `get_arg0` 7.3%, `get_field` 6.3% |
| objects (300 ticks) | 433 | 29 M | module loop 78.5%, the `map` and `filter` arrows 10.4% and 8.3% | `get_field` 15.4%, `get_loc_check` 12.5%, `push_atom_value` 6.7%, `strict_eq` 6.7% |

The three.js mix matches the report's (`get_loc_check` 19.8%, `swap` 11.9%, `mul` 6.4%), and `multiplyMatrices` leading by far
confirms the first accelerator the report measured (19x native, -24% of the frame).

The report picks the functions for the native accelerators and for an AOT of QuickJS bytecode (ZN-599). Limits: the table holds 16k
functions and counts the samples of the rest as "functions past the table"; a function first seen by the sampler (a generator resumed,
never entered through a call) has no name if it is a method or an arrow; the sample rate is what the kernel's CPU timer delivers.

## Memory: `zinc mem`

```
zinc mem prog.ts [--json] [--check-leaks]
```

Counts objects and reference-counting traffic: allocations and frees, peak live objects, bytes of objects (header, fields, string bytes),
the capacity of array and Map storage when they die (survivors counted at exit), retains and releases, the process peak RSS, and a table
per class with what is still alive at exit. `--check-leaks` exits with 4 when objects are left, and is what `tests/t1/rc.sh` uses.
The counters are off unless this command asks for them.

## Frames of a UI app

The runtime's own profiler is wired into `zinc:gfx` (`profiling()`, `profMark()`, the end of the run). Headless:

```
ZINC_DETERMINISTIC=1 ZINC_FRAMES=300 ZINC_PROFILE=1 ZINC_TRACE=frames.json zinc run app.tsx
```

`ZINC_PROFILE=1` prints, on stderr, p50, p99 and max of the frame work and of each phase (app, input, anim, layout, paint, effects, diff,
raster, present). `ZINC_TRACE=file.json` writes a Chrome trace event file that Perfetto (<https://ui.perfetto.dev>) and
`chrome://tracing` open: one row per phase and per raster band. The virtual clock does not change what is measured: times are real.

## Process: `tools/resmon`

```
tools/resmon [--interval 0.05] [--energy] [--no-samples] -- command args...
```

Prints a JSON object: wall, user and system time and the peak RSS (from the kernel's accounting of the child), plus RSS and CPU
percent over time (`ps`, any POSIX host). With `--energy`: Intel RAPL on Linux, `sudo -n powermetrics` on macOS; when the host does
not offer one, `energy_mj` is null and `energy_note` says why. On the Pi rig a power meter reading would be added next to this.

`tools/bench-m4` records user time, system time and peak RSS of one extra run per kernel and engine in `bench/m4.json`, and compares
every median time and peak RSS with the numbers committed at `HEAD` (or `--baseline file`): more than 15 percent worse (`--tolerance`)
is listed under "Regressions" in the report, and `--check-regressions` makes the exit code 3.

## Map pan and zoom (ZN-108)

`examples/maps/explorer` (Paris, offline vector tiles), headless and deterministic (`ZINC_PROFILE=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1`), 960x600, M-series macOS, work time per frame:

| run | frames | work p50 | p99 | max |
|---|---|---|---|---|
| prototype (`node compiler/bin/zinc.mjs run`, same `map.host.cpp`) | 90, no input | 0.17 ms | 1.59 ms | 132.4 ms (first frame: tile decode and style) |
| this engine | 90, no input | 0.14 ms | 1.72 ms | 125.6 ms |
| this engine, scripted drag then wheel zoom (`ZINC_INPUT`) | 90 | 0.12 ms | 93 ms | 128 ms |

The idle numbers equal the prototype's (the native code is the same file). While panning or zooming, every frame that needs a tile it does not have decodes it and
restyles it in `paint` (about 90 ms each, 1 to 3 frames per gesture); the prototype's headless HAL has no scripted input, so no pan figure exists for it, and the
decoder and the style evaluator are the prototype's. The cost is a decoding cost, not an engine one: a tile cache with a prefetch ring (or decoding off the render thread,
R3.6 of the rendering roadmap) is the lever, not a different raster path.

## Not covered yet

Exact instruction counts per function (a counting interpreter), per-allocation sites, GPU and I/O, and energy on the Pi rig and the
ESP32 (needs the power meter).

## GL renderer against the software raster (ZN-116)

`display-gl` with `ZINC_RENDERER=gl` replays the runtime's command lists on the GPU (the prototype's `gl_renderer.cpp`, GL 3.2 core on macOS through SDL, GLES2 on KMS); `cpu` is the software raster uploaded as a texture and stays the reference and the fallback (`auto` falls back to it when the context cannot be set up). Under this engine the driver needed one fix: the frame loop did not call the driver's `poll`, so `ZINC_FRAMES` and `ZINC_SHOT` of the driver never fired.

Frames (`tests/t1/gl_renderer.sh`, GL frame box-averaged to the software size): `clock` 0.35 % of pixels over 24 (mae 0.24), `overlays` 1.0 % (1.6), `ui` 3.3 % (1.7), `shapes` 9.1 % (11.8: the GL renderer skips LINE and POLY until ZN-181). The differences are anti-aliasing edges: the GL frame is drawn at 6x resolution (3x window scale, retina).

Frame time on `hero`, 300 deterministic frames, Apple GPU (this machine): software raster 4770 us of CPU per frame plus a 6.0 ms present pass; GL renderer 1078 us of CPU to submit a frame (1764 quads, 4 draw calls), 1955 us of GPU replay and 554 us present. The GL path takes 4.4x less CPU and finishes sooner; the swap (vsync) dominates both. 12158 LINE/POLY commands of the 300 frames are not drawn yet (ZN-181), so GL does slightly less work than the raster.

Not done: Mesa llvmpipe under EGL surfaceless (Linux only; Docker runs are skipped by decision). The macOS GPU stands in for it; the same script runs on Linux where `display-gl` builds with EGL.
