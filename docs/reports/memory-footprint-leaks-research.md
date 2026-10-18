# Memory footprint, leaks and resource lifetime in Zinc Next

Audit and research, 2026-10-18. No code changed, no benchmark run. One small existing test was run: `tests/run --only resource_stats` (PASS).
Labels: **exists** (in the tree and tested), **partial**, **missing**, **proposed**. Paths are relative to `/Users/mowmow/Lab/zinc`. Web sources were read as search results only (not fetched in full); where a claim rests on general knowledge it is marked *(unfetched)*.

## 1. How memory is owned today

| Layer | Ownership | Source |
|---|---|---|
| Interpreter and AOT objects (instances, strings, arrays, Map/Set) | **Reference counting**, 32-bit count in `Obj::rc`, `kImmortal` for constants; freed deterministically at count 0; **no cycle collector** | `next/src/rt/rt.h:256-259` (retain/release), `rt.h:122-128` (Obj header), `docs/guide/02-language.md:58-63`, `docs/decisions/0001-raii-reference-counting.md` |
| Allocator | mimalloc for objects and `ObjVec` containers; global `new/delete` stay the system's unless a heap budget is linked in (`alloc_new.cpp`); sanitizer builds (`ZN_NO_MIMALLOC`) use malloc so ASan sees every block | `next/src/rt/alloc.cpp:1-4`, `rt.h:33-42`, `next/src/rt/alloc_new.cpp:1-12` |
| Every value | 8-byte `Slot`; `u8[]` costs 8x its size | `docs/reports/zinc-next-perf.md` PERF-19 row |
| Native plugin handles | Generational table, kind finalizer on last `res_release`, all left finalized at exit | `next/include/zn/native.h:86-89`, `next/src/rt/native.cpp:125-135,299` |
| QuickJS engine | QuickJS-ng: refcount plus its own cycle collector; main engine `JS_SetMemoryLimit(rt, 0)` = **unlimited**; `zinc:script` contexts take a limit from the caller | `next/src/qjs/qjs.cpp:654`, `next/src/qjs/script_native.cpp:440` |
| UI nodes | Node table with handle free-list; `release(h)` clears callbacks and focus refs, destroys the surface image | `lib/std/ui.ts:505-570` (`nodes[h] = DEAD; free.push(h)` at ~567) |
| UI reactivity | Solid-style ownership: computations own children, `onCleanup`, `dispose`, per-item roots in `For`/`Show` | `lib/std/solid.ts:18-69,91-99,145,206-241` |
| Runtime images (`zinc:gfx`) | Fixed table in chunks of 64, up to `ZRT_DYN_IMAGES` (4096 desktop/web, 64 ESP32/PS2, 4 PS1); explicit `destroyImage`; past the cap returns -1 plus one warning | `runtime/raster.cpp:577-677`, `next/backlog/tasks/zn-670*.md` |
| GL replay textures | Fixed pool, oldest replaced (`glDeleteTextures(oldest)`) | `runtime/gl_replay.cpp:1313` |
| Assets (`zinc:assets` v2) | Packs mapped in place; groups loaded whole or not at all; counted handles with explicit `release()`; unload of a group with live handles marks them `orphan`, freed at the last release | `next/src/host/assets_host.cpp:55-64,427-434,469-489`, D92 in `docs/reports/zinc-next-decisions.md:162`, `docs/zpk.md` |

The prototype's VM (`compiler/`, `docs/engines.md:140-155`) is a different design (traced non-moving heap, mark/sweep, 64 MiB default, `ZINC_VM_HEAP_BYTES`). It is the specification for behaviour, not for memory; do not read its GC claims as Next's.

## 2. Exists / partial / missing

**Exists**
- Heap budget per profile, enforced on every allocation: stops with `out of memory (heap budget N bytes, asked A, in use U)`, exit 101. Profile heaps: esp32 160 KB, ps1 256 KB, ps2 16 MiB, rpi1 64 MiB, wasm 64 MiB (`next/src/rt/alloc.cpp:19-35`, `next/src/rt/program.cpp:26`, D26 `zinc-next-decisions.md:96`, `docs/decisions/0002-malloc-before-tlsf.md`). Android: 128 MiB, capped at a quarter of system RAM (D121, `zinc-next-decisions.md:192`).
- Leak count at exit: `live - immortals`, in interpreter and AOT; `ZN_LEAK_CHECK=1` exits 4 with `leaked N object(s)` (`program.cpp:33,49`). `zinc mem [--check-leaks]` lists live objects, retains/releases, per-class peak (`rt.h:182-186`). T1 `rc` runs the whole corpus with `--check-leaks` (`next/tests/t1/rc.sh:2-16`). ZN-422 notes the counters replaced the per-object registry for AOT.
- Asset RAM budget enforced everywhere: `ZINC_ASSET_RAM` or zinc.json; `loadGroup` refuses a group crossing it (`assets_host.cpp:94,409-411`, D92). Per-profile asset budgets (ram/gpu/boot) in `targets/capabilities.json` (e.g. esp32 ram 96KB, rpi1 150MB/40MB gpu, android 256MB/128MB, macos 1GB/512MB; texture format and maxSize per profile); `zinc assets check` applies them at build time.
- Resource counters: `zinc:__diagnostics.resourceStats()` (images CPU/borrowed/GPU estimate, meshes, 3D targets, video), CDP transport `Zinc.getResourceStats`, `tools/resource-probe` + `tools/museum-probe` driving `home -> model -> video -> home` and recording RSS (ZN-722; `next/tests/t0/resource_stats.sh`, `resource_probe.sh`; `docs/reports/zinc-next-museum-memory-probe.md`). Test run today: PASS.
- Fuzz gate with ASan/UBSan/leak (`next/tests/t2/fuzz.sh:2`, `next/tools/fuzz`); `zinc run --debug` = ASan/UBSan (`docs/guide/06-testing.md:201-208`).
- Lazy native modules: library loads at first call (`next/src/rt/native_lazy.h`, ZN-615); optional WebGL module (D40).
- Zero-copy packs: mapped in place, per-entry decode, lz4 decoder allocates nothing, zstd contexts pooled (`docs/zpk.md`).

**Partial**
- **Cycles.** Docs promise `@weak` ("MEM-13", `docs/guide/02-language.md:63-70`), but the parser accepts and ignores it (`next/src/frontend/parser.cpp:1256`; `rc.sh:3`: "its `@weak` parent link is accepted and ignored, so the pair leaks"). The doc states a feature Next does not implement. Workarounds in the library are hand-written: `solid.ts:57-69` breaks owner/child cycles at exit; the desugarer nulls loop lambdas (`next/src/frontend/desugar.cpp:125`).
- **Scoped lifetime in UI.** Solid owners dispose effects and `For` items; node release frees the surface image. But React-style `useEffect` "has no cleanup here" on Fast Refresh (`lib/std/react.ts:123`; unmount does run cleanups, `react.ts:67-71`), and navigation keeps screens mounted (`lib/std/navigation.tsx:222`). `createRoot` is a pass-through (`solid.ts:125`). There is no scope that also owns images, native handles, timers and listeners.
- **Event sources.** `Signal.connect` returns a `Connection` with `using` support (`lib/std/signals.ts:22-32`) and `removeSignalListener/removeBackHandler/removeStepper` exist (`ui.ts:1911-1914,3451-3456`), but nothing ties them to a component's lifetime automatically; a leaked slot keeps its closure (and everything captured) alive.
- **Heap budget off by default on desktop** and absent where mimalloc is absent (WASI, ESP-IDF, console cores: `alloc.cpp:8`). The interpreter gets a flat 1 MiB headroom (`alloc.cpp:33`) that does not scale.
- **Asset budget vs reality.** Budget covers resident pack bytes only. Decoded runtime images, GPU textures, decoder buffers and 3D targets are not counted (`docs/reports/zinc-next-resource-lifecycle.md:19`).
- **QuickJS limits.** Main engine unlimited; the 512 MiB cap in `docs/engines.md:143` is the prototype. No `JS_ComputeMemoryUsage` use outside `zinc:script` (`script_native.cpp:636`).
- **Hardware images.** 64-slot cap on devices and no eviction: a program must call `destroyImage` itself.

**Missing**
- Cycle collection or working `@weak` in Next.
- A scope object (screen/route/component) that owns assets, runtime images, native handles, timers and listeners and releases them on leave.
- An asset cache with refcount + byte-budget LRU for *inactive* entries (today: whole-group load/unload, explicit `release()`).
- A unified memory budget (heap + asset + GPU + decoder) checked together per profile, and a response to OS memory pressure: grep for `onTrimMemory`, `didReceiveMemoryWarning`, `memoryPressure` in `next/src`, `plugins`, `lib`, `docs` finds nothing.
- A leak test of the form "navigate away and back N times, memory returns to baseline" in CI. The museum probe does it manually and reports counters, it is not an assertion (`zinc-next-museum-memory-probe.md`; its measured result: one 3D target and one stopped video player stay alive after returning home).
- An owner-aware live-object census ("who keeps this alive?"); `zinc mem` is per class only.
- Timers: `setTimeout/setInterval` have no owner scope (`lib/std/web.ts:1731-1931` start interval timers that are never cleared, by design for process-wide watchers).
- Footprint knobs for tiny heaps: no compacting/moving heap, no ROM-resident object/ZBC image proof for ESP32 (unverified whether ZBC is read in place from flash on the ESP32 core).

## 3. Footprint numbers in the repo

| Measurement | Value | Source |
|---|---|---|
| Hello-class desktop UI app, Zinc / Electron 44.7 / Tauri 2.12, RSS at 10 s | 83 MB / 213 MB / 105 MB (taken under load, to retake) | ZN-713 notes, `next/backlog/tasks/zn-713*.md`; `docs/reports/zinc-next-perf.md:668` |
| Same: installed size | 5.5 MB / 300 MB / 4.9 MB | same |
| Zinc vs Flutter RSS (hello/list/anim/input) | 92/95/92/93 MB vs 91/93/93/110 MB | `docs/reports/perf-comparison-2026-10.md:29` |
| Kernels, peak RSS interpreter / AOT | 16.6-40.3 MB / 9.4-33.1 MB (floor ~9.4 MB AOT, ~16.6 MB interpreter) | `docs/reports/zinc-next-m4-benchmarks.md:36-50` |
| Prototype native kernels (no VM) | 1.3-29 MB (QuickJS 1.9-62 MB, Node 64-160 MB) | `docs/reports/PERF.md:33-45` |
| Museum demo home screen | RSS 347 MiB first, then 315/321/321 MiB after each cycle; 75.6 MB baked images + 11.6 MB fonts copied into heap at start, plus an 87.35 MB resource blob in the binary; stays alive after leaving: one 3D target (12.96 MB CPU, ~155.5 MB GPU est.), stopped video (8.2 MB, two decoder contexts); 2D replay textures 31.3 -> 47.5 MB once, then flat | `docs/reports/zinc-next-assets-outside-binary.md:92-107`, `zinc-next-perf.md:695` |
| Per image slot | 2.5 KB per 64 slots (64-bit), 1.8 KB ESP32, 112 B PS1 | ZN-670 notes |
| Engine code sizes (macOS arm64) | zinc 11.7 MB file; rt 0.11 MB, vm 0.07 MB, mimalloc 0.10 MB, QuickJS 0.77 MB, zpk reader+decoders 127 KB dead-stripped | D40, `zinc-next-decisions.md:110`; `docs/zpk.md` |
| ESP32 | heap profile 160 KB; asset ram budget 96 KB; prebuilt core app 730,944 B | `targets/capabilities.json`; `docs/reports/hardware-simulator-and-arduino-interop.md:223` |
| Nexus 7 | 128 MiB program heap (1 GB RAM, 32-bit) | D121 |
| Missing | No RSS/heap number for a Zinc UI app on ESP32, Pi 1/3, Nexus 7, or QuickJS engine per scene; no steady-state number after N navigations except the museum probe | grep of `docs/reports` |

Note: the tool list names `mimalloc stats` but no code calls `mi_stats_print` or `mi_heap_visit_blocks`; ZN-422's idea of a dedicated `mi_heap_t` + visit_blocks listing was not done (AC#1 unchecked).

## 4. Current state per engine and target

- **Interpreter / AOT (same runtime):** RC, deterministic destruction order (golden-tested), cycles leak, heap budget by profile, leak count at exit. AOT drops the object registry, so no live listing there.
- **QuickJS engine (`--engine quickjs`):** QuickJS's own RC + cycle GC reclaims cycles; no memory limit; JS objects hold Zinc native handles through finalizers (`native.cpp`). `JS_FreeRuntime` aborts in builds with assertions if objects survive (documented upstream behaviour: failing `list_empty(&rt->gc_obj_list)`, e.g. CVE-2025-69654 and the njs fix, https://hg.nginx.org/njs/rev/ecf2499ed755, https://security-tracker.debian.org/tracker/CVE-2025-69654), which is a free leak detector for plugins that leak a JSValue.
- **ESP32 (160 KB heap):** budget enforced only where mimalloc exists; the ESP-IDF build uses the plain allocator with no budget (`alloc.cpp:8`). QuickJS not linked (`docs/reports/quickjs-aot-jit-and-ffi.md:332`). Yoga disabled for lack of RAM (`capabilities.json`). Not verified here (cross pass).
- **Nexus 7 / phones:** 128 MiB heap, `android` budgets 256 MB RAM / 128 MB GPU, no trim-memory handling.
- **Desktop:** no heap limit; RSS dominated by baked images, GL textures, decoders, not by the object heap.
- **Web/WASM:** browser limit; 64 MiB heap profile.

## 5. The eight biggest risks

1. **Reference cycles leak and `@weak` is ignored** (parser.cpp:1256). Closures capturing `this` that is stored in a long-lived field form cycles easily; the only guard is the corpus leak test, which excludes the file that tests it on purpose (`rc.sh:3`).
2. **No scope owns assets/textures/decoders:** the museum keeps a 155 MB GPU 3D target and a video decoder after leaving the view (measured, `zinc-next-assets-outside-binary.md:95`).
3. **Budgets cover only parts:** heap budget (objects), asset budget (resident pack bytes), nothing for decoded images, GL textures, decoders, plugin natives; the sum can exceed the device with every budget "green".
4. **Duplicate resident copies of assets:** baked images copied into heap (75.6 MB) while the blob stays referenced (87.35 MB) (`zinc-next-assets-outside-binary.md:103`).
5. **Handles with manual release:** asset handles, `destroyImage`, 3D `dispose`, video `close` are explicit; any early return or exception leaks them, and Zinc has no finalizers for plain objects (D92). 64 image slots on devices turn a leak into a hard failure.
6. **Listeners/timers/signal slots with no owner**, so a navigated-away screen stays reachable from a global list (`ui.ts` callback arrays, `Signal` slots).
7. **No memory-pressure reaction** on phones (Android kills by LRU unless the app trims, iOS jetsam), and a desktop app has no soft limit.
8. **Allocator fragmentation / unproven small targets:** RC with mimalloc has no compaction; ESP32 behaviour over hours is a stated risk (`docs/reports/microts-vs-zinc.md:146`) and untested here; 8-byte Slots make arrays of bytes 8x.

## 6. Research (external references)

- **QuickJS:** refcounting plus a cycle-removal pass over `gc_obj_list`; `JS_SetMemoryLimit`, `JS_ComputeMemoryUsage`, `JS_RunGC` are the embedding knobs (https://bellard.org/quickjs/ *(unfetched)*; behaviour at `JS_FreeRuntime` in the njs/CVE links above).
- **Hermes:** bytecode mapped read-only and file-backed so Android can evict pages under pressure; memory use is a primary metric (https://engineering.fb.com/2019/07/12/android/hermes/). Generational Hades details not confirmed by this search.
- **Moddable XS:** the linker runs module bodies at build time so objects live in ROM; modifying one clones it to RAM ("aliasing"), frozen objects avoid the alias index; a GC runs after preload (https://moddable.com/documentation/xs/preload). Lesson for Zinc: constants and the library's static tables belong in the read-only image.
- **Duktape:** refcount + mark-and-sweep; for 128 kB RAM use pool allocators; ROM strings/objects bring startup RAM to ~2-3 kB; remove unused builtins (https://github.com/svaarala/duktape/blob/footprint-equals-helper/doc/low-memory.rst, branch doc, check current).
- **MicroPython:** mark-sweep, collects when an allocation fails, `gc.threshold` earlier trigger to limit fragmentation, preallocate long-lived buffers (https://docs.micropython.org/en/latest/library/gc.html; https://docs.openmv.io/openmvcam/tutorial/python/micropython/memory-and-gc.html). Fragmentation is an allocator property, not a GC one.
- **V8 Lite:** most savings from laziness (no optimizing compiler, lazy feedback vectors, bytecode flushing), about -22% typical heap (https://v8.dev/blog/optimizing-v8-memory ; summary https://hub.packtpub.com/memory-usage-optimizations-implemented-in-v8-lite-can-benefit-v8/amp/).
- **Asset lifetimes:** Godot (refcounted resources, cache drops on last ref), Unity Addressables (balance acquire/release), libGDX AssetManager, three.js disposal: see the table in `docs/reports/zinc-next-resource-lifecycle.md:21-37` (already cited with URLs). Texture streaming with mip budgets (Unity/Unreal) *(unfetched)*; Zinc already has per-profile texture formats and maxSize.
- **Mobile pressure:** Android `onTrimMemory` levels are not linear; UI-hidden is the cue to free UI-only bitmaps/video; not trimming makes the process more likely to be killed (https://developer.android.com/reference/android/content/ComponentCallbacks2). iOS: memory-warning notification is best effort, jetsam can kill without warning, do not walk the whole object graph on a warning (it faults compressed pages back in) (https://developer.apple.com/documentation/xcode/responding-to-low-memory-warnings). webOS: not researched.
- **Tooling:** LSan runs standalone or under ASan, reports direct vs indirect leaks, test-only (https://github.com/google/sanitizers/wiki/AddressSanitizerLeakSanitizerDesignDocument; LLVM LeakSanitizer doc). mimalloc: `mi_heap_visit_blocks`, stats options (https://microsoft.github.io/mimalloc/mimalloc-doc_8h_source.html; env names unconfirmed by search). Instruments Allocations/VM and heaptrack/HWASan: not verified by search *(unfetched)*.
- **Footprint techniques** (general knowledge, *unfetched*): bytecode mmap from flash, string interning, NaN-boxing/small ints, struct-of-arrays and packed numeric arrays (PERF-19), lazy plugin init (exists), `-Os`/LTO/`-fno-exceptions -fno-rtti` (ESP32 already builds without exceptions, `rt.h:49-54`), decode-on-demand compressed assets (exists in ZPK).

## 7. Recommended design

**One budget table per profile** (extend `targets/capabilities.json` `budgets`: `heap`, `ram`, `gpu`, `boot`, add `decoders`). A single `mem::Budget` in the runtime accounts four pools: object heap (exists), resident assets (exists), decoded images/GPU textures/render targets, and plugin natives (each native reports bytes through `res_new` kind metadata). Over budget: evict inactive cache first, then fail the request with a named error (`assets` already does this for groups), never abort silently. Desktop gets a generous soft cap (a fraction of `SDL_GetSystemRAM`) so the same code path runs everywhere.

**Scoped lifetimes.** A `Scope` (screen/route/component root, reusing Solid's owner list in `solid.ts`) with `scope.image(...)`, `scope.asset(group)`, `scope.native(handle)`, `scope.timer(...)`, `scope.listen(signal, f)`. `onCleanup` is the only primitive; leaving the screen (after the last transition frame, per the lifecycle report) disposes in reverse order, idempotently. Late completions check the owner and release their result.

**Asset cache.** Handles keep counted entries (exists). Entries with refcount 0 move to an LRU list bounded in bytes (CPU + GPU estimate); eviction only from that list; entries cheap to reload (packed, mapped) first. Decoded runtime images become asset-backed so the cache sees them.

**Cycles.** Make `@weak` real in the IR (non-retaining field plus null-on-free, or a weak-handle table) and add a compile-time lint for the common cycle shapes (closure capturing `this` stored in a field of `this`). A backup trial-deletion cycle collector (Bacon-Rajan style) is the fallback, run only at scene exit and in debug builds.

**Debug census and leak test.** `zinc mem --census` (and `resourceStats()`) extended with owner scope, kind, generation, CPU/GPU bytes, age; `mi_heap_visit_blocks` listing in debug builds (ZN-422 idea). CI test `leak_navigate`: run an app via the existing resource-probe, navigate away and back N=20 times headless with `ZINC_DETERMINISTIC=1`, then assert census counts (objects by class, handles, images, textures, timers, listeners) equal the post-warm-up baseline (exact for counts; RSS only as a soft bound). ASan+LSan lane on the same scenario for plugins.

**Pressure.** Hook `onTrimMemory` (Android shell), memory-warning notification and dispatch memory-pressure source (iOS), and a desktop low-RAM probe to one engine event `memoryPressure(level)`: apps and the asset cache drop re-creatable data (LRU first, decoders, GL replay textures); do not scan the object graph (Apple guidance above).

## 8. Ordered work items

| # | Item | Size | Why / proof |
|---|---|---|---|
| 1 | Fix the doc/implementation gap: either implement `@weak` or mark it unsupported in `docs/guide/02-language.md` and make the checker warn on obvious cycles | S | Risk 1; the parser ignores it today |
| 2 | Leak test `leak_navigate` over an example with several screens, asserting `resourceStats()` + `zinc mem` counts return to baseline after N round trips; add to T1 | M | Turns the museum probe into a regression test |
| 3 | Fix the measured retentions: dispose 3D targets and idle video decoders on leaving a view; destroy GL replay textures of destroyed images | M | 155 MB GPU + 8 MB decoder in the museum |
| 4 | `Scope` API in `lib/std/solid.ts`/`react.ts` (images, assets, handles, timers, listeners) with idempotent reverse disposal and owner check on late completions | M | Risks 2, 5, 6 |
| 5 | Unified byte accounting: decoded images, GL textures, render targets, decoders counted against the profile's `ram`/`gpu` budgets; extend `capabilities.json` | M | Risk 3 |
| 6 | Asset cache: refcount-0 LRU bounded by bytes, decoded images asset-backed; remove the baked-image double copy (pack the museum images) | L | Risk 4; zinc-next-assets-outside-binary.md |
| 7 | `memoryPressure` event: Android `onTrimMemory`, iOS warning, desktop probe; wire to cache trim | M | Risk 7; mobile pass |
| 8 | Owner-aware census: `zinc mem --census`, inspector view "who keeps this alive", `mi_heap_visit_blocks` listing in debug | M | ZN-422 AC#1, lifecycle report "Tools" section |
| 9 | Backup cycle collector (trial deletion) run at scene exit and in debug, only if item 1 shows real cycles in `lib/std` | L | Defer unless measured |
| 10 | Small-target footprint: measure ESP32/Pi 1 RSS and heap after N screens on the rig, ZBC read in place from flash, packed `u8[]`/`i16[]` arrays (PERF-19) | L | Risk 8; cross-platform pass, no proof today |

Also noted for `next/backlog/later.md` style follow-up (no task created): the Android shell prints a mimalloc "unable to allocate aligned OS memory" warning at every start (D121); the ESP-IDF build has no heap budget at all (`alloc.cpp:8`).
