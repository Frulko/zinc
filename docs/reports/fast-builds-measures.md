# Fast builds: measures and models (2026-10-19)

Machine: Apple Silicon arm64, 10 cores. Engine: `next/build/zinc` (not rebuilt). App: `examples/music` (41 files, 1891 functions, plugins svg, webos, link native; async-storage, gsap, socket, sonos, spotify have no native build here).
Temp dir `T=/Users/mowmow/.claude/jobs/c6db9e88/tmp/build-study`. Cold = a fresh `ZINC_HOME=$T/home` whose `toolchains` is a symlink to `~/.zinc/toolchains` (`tc::home()` in `src/tc/tc.cpp:235` reads `ZINC_HOME`). Every command ran with `ZINC_BACKGROUND=1`; peak RSS is `/usr/bin/time -l` "maximum resident set size" (the largest process of the tree, not the sum).

## 1. Cold and warm builds

| Command | Wall | Peak RSS |
|---|---|---|
| `zinc build ../examples/music -o $T/music1` (cold home) | 20.9 s | 908 MB |
| same, warm (`-o $T/music2`) | 2.8 s | 255 MB |
| `zinc export macos ../examples/music -o $T/exp1` (cold home) | 28.2 s | 848 MB |
| same, warm (`-o $T/exp2`) | 8.6 s | 251 MB |

Phases of the cold build (log lines, `zinc build`): compile (read, check, lower) 7.2 s, which contains the three plugin builds (svg: host.cpp 1.1 s + thunk 176 ms + link 145 ms + ar 43 ms; webos about 0.9 s; link: 3 C++ files 1.5 s + 1.0 s + 0.6 s + thunk 211 ms + link 110 ms; the plugins are compiled one after the other, in the same phase); resources 334 ms; C++ generated 953 ms; PCH 918 ms; native units 41 of 41 compiled, 5 at once, 10.6 s; final link 323 ms. Confirmed rebuilt: "plugin: the C++ compiler on ..." lines, "precompile shared C++ headers", "cache 0 of 41 C++ units reused".

Warm `zinc build`: compile 827 ms (plugins "cached native library"), resources 15 ms, C++ generated 1.0 s, "41 of 41 C++ units reused", link 375 ms. The floor is about 2.2 s of frontend and C++ emission that is redone on every build even when nothing changed.

`zinc export macos` runs `zinc build` twice (`src/cli_core.cpp` ~1776: plain executable, then `build --bundle` for the .app). Cold: first build 25.1 s, second 2.6 s (compile 868 ms + C++ generated 963 ms + link 215 ms: the whole frontend runs again; only the objects and plugins are reused). Warm export is 5.5 s + 2.7 s, i.e. the first build of a warm export is slower than a warm `build` (2.8 s) for a reason not investigated (export also bakes release assets and writes the SBOM). The export cost over a build is therefore about 2.6 s of repeated frontend work: the `.app` could reuse the first build's C++ and objects.

Commands: `( /usr/bin/time -l build/zinc build ../examples/music -o $T/music1 ) > cold1.log`; `/usr/bin/time -l build/zinc export macos ../examples/music -o $T/exp1` with `ZINC_HOME=$T/home2`.

## 2. Cache disk usage (`~/.zinc/cache`, 8.0 GB total, `du -sh ~/.zinc/cache/*`)

Host (macOS) relevant: `aot-obj` 1.6 GB, `assets` 1.6 GB, `macos` 1.2 GB (`plugins` 1.0 GB in 887 entries, `plugin-stamps` 5.5 MB in 1141 files, `devapp` 194 MB), `run` 1.1 GB (162 apps), `qjs` 435 MB, `zbc` 323 MB (64 entries), `bundle` 125 MB. The rest is other targets (`handheld-dl` 649 MB, `zapp` 241 MB, aarch64-linux 178 MB, armv7-webos 127 MB, ...).

- Plugins per target: key `<name>-<16 hex>` under `cache/<target>/plugins`. Most entries: system 90, lottie 72, video 62, svg 58, canvas2d 36, 3d 36, display-gl 34, audio 32 (`ls ~/.zinc/cache/macos/plugins | sed 's/-[0-9a-f]*$//' | sort | uniq -c`). Biggest by size: webrtc-vendor 97 MB, system 94 MB, webrtc 75 MB, lottie 75 MB, physics3d 57 MB, link 54 MB. One entry per engine/option change, so every engine rebuild leaves a fresh copy of each plugin. **No prune of any kind exists for plugins** (grep of `prune|evict` in `src` finds only `aotcache::prune`).
- `aot-obj`: exactly 1500 `.o` (305 MB, avg 199 KB) = the cap of `aotcache::prune(1500)` (`src/main.cpp:660`, called `:897`; keeps the 1500 most recently used, mtime touched on reuse). **PCH files are not counted**: 58 `prelude-*.pch` at 23 MB = 1.41 GB (88% of the directory), never pruned. The PCH key hashes the compiler version, flags and the content and mtime of every header under include/zn, src/rt, src/zbc, mimalloc, so each engine edit makes a new 23 MB file.
- `run`: no prune found. `assets`, `zbc`, `qjs`: none found in the paths grepped.
- Cost of one app after one cold build (the temp home): `aot-obj` 38.5 MB (41 objects 14.6 MB + one 23 MB PCH), `macos` 5.3 MB (3 plugins: link 3.8 MB, svg 768 KB, webos 704 KB), `assets` 20 MB (baked fonts/images), output 17.4 MB. Total about 65 MB cache (`du -sh $T/home2`) + the program. A release (prebuilt plugins, fixed PCH key) should cost about 40 MB for the first app.

## 3. What a release ships, what is compiled on the user's machine

`next/tools/package`: `payload()` copies lib/std, fonts, templates, plugin sources (.ts and plugin.json only), `targets/capabilities.json`, runtime `.h`. `prebuild_plugins()` builds every native plugin of the target that has no `pkg` (system library) requirement with `zinc plugin-build <name> --prebuild` using the **pinned zig** into `share/zinc/plugins/<name>/prebuilt/<target>/` (dylib/so, plugin.a, vendor.a, key). Plugins with `pkg` ship as sources and compile on first use. macOS also gets a minos lowering of the dylibs.
What the release does **not** ship: `libzn_*.a` (rt, host_gfx, host_window, mimalloc, zbc, ir, frontend, ...; 30 MB in `next/build/*.a`) are not copied (package copies only `zinc`, `libzn_webgl.dylib`, `libzn_window.dylib` and the dylibs the binary needs). In `src/main.cpp:744` `haveLibs = exists(libs/libzn_rt.a)` is therefore false in a release, and:
- `zinc run` of a program that draws: `runCompiled` (`:1110`) returns -1 without `libzn_host_gfx.a` or without `c++`, so it **interprets** (no compile at all). Plugins come from `prebuilt/`; a miss falls back to a compile with the pinned zig (`ensureZig`, downloaded on first use), or an index fetch of a signed prebuilt (`plugin_build.cpp:222`).
- `zinc build` of a program that draws: refused ("needs a C++ compiler and the SDK", `:788-793`). A program that does not draw is built with the pinned zig through `crossBuild` (compiles the runtime too).
So the ready-made part today is the engine and the plugins; the missing piece for Arduino-style "precompiled core" is the runtime and host archives (+ a matching PCH) for `zinc build`.

Compilers: plugins use the pinned zig (`compilers()` in `src/tc/plugin_build.cpp:128`, `id = "zig <version>"` so keys are identical across machines) unless `ZINC_PLUGIN_CC=system` or `zinc.json "pluginCompiler": "system"` (then `$CXX/$CC` or `c++/cc`, version in the key). The AOT step (`src/main.cpp:743, 861`) uses `$CXX` else the **system `c++`** (Apple clang here); the PCH is only built when `c++ --version` says clang (`aotcache::pch`). On a dev tree no plugin has `prebuilt/`, which is why the cold build compiled svg, webos and link.

## 4. Reference models (from the public docs; not re-fetched this session)

- **Arduino CLI**: the core (`core.a`) is compiled once per board + options + core version and reused; libraries are compiled to objects only if used by the sketch (`#include` discovery) and cached by content hash; `--build-cache-path` holds core and library objects across sketches (default under the OS temp dir, cleaned after about 30 days); each sketch recompiles only its own `.ino.cpp` and links. Zinc could copy: ship a `core` archive per target+options (rt, host, mimalloc, zbc) with the key `engine-version+flags`, treated as read-only and shared by all apps, and an LRU-by-age sweep like Arduino's.
- **Go build cache**: every action (compile of a package, link) is keyed by a hash of its inputs (source, flags, dependencies' output hashes); unchanged packages are never rebuilt even across projects; `go clean -cache`; entries are trimmed after 5 days unused; export data lets dependents skip recompiling when only unexported parts change. Zinc could copy: key the C++ of each unit by the Zinc function hash (already done for units, ZN-427) and add the same input-hash key to the frontend result (check and lower: 0.8 s warm), so a no-change build exits before emitting C++.
- **Flutter**: the engine (C++/Skia/Impeller) is precompiled and downloaded per platform into `bin/cache/artifacts`; app code is Dart compiled to kernel snapshots (incremental `frontend_server` with a `.dill` per app in debug, hot reload), AOT only for release (`gen_snapshot`); the developer never compiles the engine. Zinc could copy: the interpreter/ZBC path for the dev loop (already `zinc run` interpreting), a downloadable per-target "engine artifacts" bundle holding the `.a` archives and PCH, and AOT only at `zinc build/export`.
- **sccache / ccache (Rust, C++)**: a compiler wrapper that hashes the preprocessed source + flags + compiler id and returns the stored object, locally or in a shared store (S3, GCS, Redis), so a CI or teammate warms everyone. Zinc could copy: the aot-obj and plugin caches are already content-keyed; add an optional shared/remote store (the signed TUF index already serves plugin prebuilts) and key objects by unit hash + compiler id so a prebuilt "common units" set (the generated C++ of lib/std) can be downloaded.

## 5. Parallelism (`aotcache::jobs()` = `hardware_concurrency/2` clamped 1..8, `ZINC_JOBS` overrides)

On this machine the default is 5 (10 threads / 2). Warm plugins, cold `aot-obj` (rm -rf of `$T/home/cache/aot-obj` before each run, so PCH is rebuilt too), 41 units. Command: `rm -rf $T/home/cache/aot-obj; ZINC_JOBS=N /usr/bin/time -l build/zinc build ../examples/music -o $T/musicj`. Two runs where noted.

| ZINC_JOBS | native step | total wall | user CPU |
|---|---|---|---|
| 1 | 38.2 s | 41.6 s | 37.1 s |
| 3 | 13.6 s | 17.0 s | 38.0 s |
| 5 (default) | 11.0 s / 10.1 s | 15.5 s / 13.5 s | 41.7 s / 40.3 s |
| 8 | 7.7 s / 7.6 s | 11.2 s / 11.1 s | 42.8 s |
| 10 | 7.1 s / 9.7 s | 10.6 s / 13.1 s | 43.1 s / 44.7 s |

8 jobs is about 30% faster than the default 5 (11.1 vs 13.5-15.5 s wall); 10 gives no stable further gain (one run 10.6 s, one 13.1 s: other load on the machine, noisy, not repeated more). Each unit compiles in about 0.9 s alone; the native step is 41 x 0.93 s of CPU, so the floor is about 4 s at perfect 10-way scaling. The frontend/plugin/PCH/link part (about 3.5 s) is serial.
RAM per job: with `ZINC_JOBS=1` the largest process of the build is 900 MB (`/usr/bin/time -l`), the same as the cold default build (908 MB), so one compile job (or the frontend) peaks near 0.9 GB; I could not separate the two with `time -l` alone (a warm build, no compile, is 255 MB). A conservative estimate for sizing is 0.9 GB per job: 5 jobs about 4.5 GB, 10 jobs about 9 GB worst case; on a Raspberry Pi with 1 GB the default of `cores/2` (=2 on a Pi 3) would swap. Suggest `jobs = min(cores, freeRAM / 1 GB)`.

## Findings worth acting on

1. PCH files are never pruned: 1.4 GB (88% of aot-obj) on this machine; plugin cache has no prune (887 entries, 1.0 GB). Both come from engine edits (dev machines), not from users of a release, but cheap to fix (age or count sweep).
2. A release ships plugins prebuilt but not the runtime/host `.a` archives or a PCH: `zinc build` of a drawing app is refused without a toolchain; `zinc run` interprets. Shipping the archives (30 MB) + a PCH built at package time would make the first app cost only its own 41 units (about 40 s of CPU on one core, 14.6 MB of objects).
3. Warm no-change build is 2.8 s, 2.2 s of which is frontend + C++ emission; `export` repeats it for the `.app` (+2.6 s).
4. Default parallelism (5 of 10 cores) leaves about 30% on the table on a big machine, and is probably too high for a 1 GB Pi; take RAM into account.
