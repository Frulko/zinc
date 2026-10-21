# Fast and light builds, Arduino style: the plan (2026-10-19)

Owner, 2026-10-19: builds must be fast and light even on modest computers; pre-chew as much as possible, the way Arduino does.
Arduino compiles the board's core once into `core.a`, caches every library's objects, and recompiles only the sketch; its toolchain
comes with it, nothing to install. Measures: `fast-builds-measures.md` (pipeline, caches, jobs). Design study: `fast-builds-aot-study.md`
(what the AOT can share). Machine: M-series arm64, 10 cores; the numbers are `examples/music` (41 sources, 1891 functions).

## Where the time and the memory go today

| Step | Cold | Warm, nothing changed | After one edit |
|---|---|---|---|
| Frontend: read, check, lower | 0.8 s (+ ~6 s plugin C++ the first time) | 0.8 s | 0.8 s |
| C++ emitted | 0.95 s | 0.95 s | 0.95 s |
| 41 C++ units, 5 jobs | 10.6 s | 0 | 0.3 to 13 s |
| Link | 0.3 s | 0.3 s | 0.3 s |
| Total `zinc build` | 20.9 s, 908 MB peak | 2.8 s | 5.6 to 13.7 s |

- 70% of the functions are not the app's: lib/std 439, plugin Zinc code 469, the generated prelude 380, `zinc:*` 41; the app's own: 562.
  All are recompiled for every app, and every edit that adds a function or a string renumbers them all: 0 of 41 units reused.
- The main unit is the 10 MB resource blob written as a C++ literal: 903 MB of RAM to compile it (the peak of the whole build).
- Each compile job holds about 0.9 GB: the default of cores/2 jobs swaps on a 1 GB board or a 4 GB laptop.
- A release ships no `libzn_*.a` and no PCH: on a user's machine a drawing app cannot be compiled natively at all (`src/main.cpp:744`).
- `zinc export` builds twice (`src/cli_core.cpp:1776`); `~/.zinc/cache` reaches 8 GB (PCH and plugin entries are never pruned).

## The plan, in order (each line one task, cheapest gain first)

1. **Run interpreted, build native behind (D43's own revisit condition: a first build over 10 s).** `zinc run` starts the interpreter
   at once (0.1 s warm, 1.1 s after an edit, no C++ compiler) and builds the native program in a background process; the next run
   starts native. Flutter's model: a snapshot for development, AOT for the release. Needs a decision record that revises D43.
2. **Light main unit.** The ZBC and resource blobs go through the assembler (`.incbin`, cached by the blob's hash) instead of a C++
   literal: 903 MB and 0.9 s to 131 MB and 0.2 s. Without it a Pi 3 runs out of memory.
3. **Jobs by memory.** `aotcache::jobs()`: min(cores - 2, free RAM / 1 GB), at least 1. Here 8 jobs: 10.6 s to 7.6 s (-30%); on a
   small board it stops the swap.
4. **No work when nothing changed.** Cache the emitted C++ (or the unit keys) by the inputs the run cache already records, so a warm
   `zinc build` skips the frontend and the emitter (2.8 s to about 0.3 s); `zinc export` reuses the first build's executable for the
   `.app` instead of building again (saves 2.6 s cold and warm).
5. **Stable units (study, design a).** Functions named by their stable keys (the hot-reload keys) instead of program indices, one unit
   per source module, a unit declares only what it calls, table indices through per-unit relocations. One edit then recompiles that
   file's units and the main unit: 1 to 8 of about 63 instead of 37 to 41.
6. **A precompiled core (study, design b), after 5.** lib/std, `zinc:*` and the prelude compiled once per engine version and target in
   the release CI, open world (no DCE: the linker's dead strip removes what an app does not use), shipped as `libzn_core-<target>.a`;
   plugin Zinc code compiled once at `zinc add`. An app then compiles only its own 562 functions: about 43% of today's C++ time cold (17 of 40 s of CPU).
7. **Ship what the core needs.** The release carries `libzn_*.a`, the core and its PCH for each desktop target, built with the compiler
   the user's machine will link with: the pinned zig for every target (Arduino ships its toolchain), so no Xcode, no build-essential.
   This is the precondition for 6 on a user's machine; it decides the archives' C++ library (zig's libc++, not the system's).
8. **Cache hygiene.** Prune PCH (one per engine build, 23 MB each, 1.4 GB here) and plugin entries (887, 1 GB) by last use with a size
   cap; the plugin key hashes only the headers a plugin includes, so an edit of `gl_replay.cpp` no longer rebuilds `link`.

Expected result on this machine: an edit-run cycle of about 1 s (interpreter) with the native build out of the way; a cold native
build of a new app at about 5 s (its own units, core prebuilt, 8 jobs) against 20.9 s; the build's peak memory under 300 MB; the
cache under 1 GB. On a Pi or an old laptop the same ratios, and no compiler to install.

## Not done, and why

- Lowering the optimisation level: -O1 saves 7% on a unit (2.6 s to 2.4 s); not worth slower programs.
- `#embed` for the blobs: no gain measured over the literal (the study); the assembler route is what removes the cost.
- Sharing objects between different apps without a core (design a alone): only near-twins share (26 of 45 library units for
  music-tree), DCE subsets break the rest (hero shares 208 of music's 436 std functions); the core (6) is what makes sharing general.
