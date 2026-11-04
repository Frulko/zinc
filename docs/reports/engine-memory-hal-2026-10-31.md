# Idle memory, named heap allocations and HAL buffers — 2026-10-31

Update: adaptive presentation is now opt-in (`ZINC_PRESENT=auto`), following a reported black-flash regression. Default presentation stays on Metal; the snapshot layer retains its old content during resizing. Earlier adaptive measurements below describe the experimental mode, not the current default.

Owner requested all three follow-ups to the [first memory pass](engine-memory-cpu-2026-10-31.md): reduce presentation buffers, attribute live heap allocations, and audit every HAL. Shared optimizations and a macOS presentation policy are implemented. Verification is on the development Mac only.

## Presentation: keep a snapshot at rest, Metal during animation

macOS now starts with a layer-hosted, immutable IOSurface instead of a CPU buffer plus two Metal drawables. Published pixels are never rewritten. A partial update prepares a new surface from the old pixels; full damage renders directly without that copy. The raster bands set opaque alpha while their rows are hot in cache. Core Animation owns the lifetime of displayed images.

Always using this path would cost too much CPU during animation: a small moving rectangle measured 15.6% of one core, versus 3.3% with Metal. The default is therefore adaptive: eight nearby damaged frames activate the existing Metal renderer; thirty frames without damage retain an immutable snapshot and release the Metal view, buffer and queue. Both transitions preserve the current pixels. Explicit Core Animation transactions and scoped autorelease pools release detached views and their drawable buffers. Presentation metadata follows the actual mode.

Decision scoring under RULES.md (fit/performance/footprint/maintenance/licence/portability/effort, weights 3/3/2/2/2/1/1): always-Metal 4/5/2/5/5/4/5 = 60; always-snapshot 3/2/5/4/5/4/3 = 50; adaptive 5/5/5/3/5/4/2 = 62. The extra lifecycle code is justified by the measured idle-memory saving and steady animation CPU.

`ZINC_PRESENT=metal` keeps Metal; `surface` forces snapshots for diagnostics; `auto` is the default. `texture` still selects SDL's existing texture path. iOS continues using Metal. Snapshot presentation is paced to the screen refresh rate with a sleeping wait, not a spin.

| Probe, 1180×780 logical / Retina | Before or forced Metal | Automatic |
|---|---:|---:|
| Empty UI, before this pass → current | 60.4 MiB | 28.7 MiB |
| Image builder, same current compiled program | 62.7 MiB | 32.6 MiB |
| Small rectangle moving continuously | 3.33% CPU | 3.49% CPU |
| Same motion after view-release fix | 58.44 MiB | 58.60 MiB |
| Animation followed by rest, same process | 58.41 MiB active | 29.80 MiB at rest |

Final idle rerun: empty 28.7 MiB / 0.67% CPU, builder 32.6 MiB / 1.00% CPU. Earlier idle passages were 28.1 / 32.2 MiB; this small variation is why these are approximate figures.

CPU values use a six-second process CPU-time interval after five seconds of warm-up (0.01 s counter precision); they are indicative, not a statistical guarantee. The 0.17 percentage-point CPU difference is one counter tick. Memory is process physical footprint, not total system memory, and excludes separate WindowServer accounting. Mode transitions temporarily overlap old/new resources. Idle cost remains nonzero because the engine still polls its loop.

Raw data: `.logs/memory-pass2/final/measurements.json`, later `motion-detach-results.json` and matching footprint reports, `pause-pools-{active,rest}-footprint.txt`, final `verified/measurements.json`. Earlier forced-snapshot and missing-detach-flush measurements are superseded; they were used to reject a CPU regression and diagnose retained drawables. A real background builder window was captured as `builder-window.png` and inspected for text, colors, orientation and layout. No focus was taken.

## Named heap ownership: remove scratch from every thread

The existing `ZN_KEEP_SYMBOLS=1` build option retains names without enabling debug IR or dropping optimization. A separate `MallocStackLogging=1` run with `malloc_history -allBySize` identifies currently live allocations, including anonymous VM reservations. Its instrumented footprint is excluded from the table.

Before: seven raster workers allocate 1,020,880 bytes and the main thread 145,840 bytes for the executable's local-thread block. Named stacks end in `dyld::ThreadLocalVariables::instantiateVariable`, from the raster workers and mimalloc's main-thread initializer. The block includes a 64 KiB rounded-corner array, 12,336 bytes of spline rows and a 64 KiB HTTP read buffer, even when those features are unused.

After:

- Rounded corners use the existing growing scratch allocator, preserving outer clip pixels across growth. Allocation failure reports an error rather than changing rounded geometry.
- Spline rows share the image command's existing temporary allocation, sized to the actual source width. There is no extra allocation or retained maximum-size array.
- HTTP's read buffer is created on first use of that thread. On failure libuv gets a null/zero-length buffer and existing error handling closes the connection; a later attempt can retry.

The named allocation drops **145,840 → 2,456 bytes per thread**: **1,166,720 → 19,648 bytes** for these eight threads, saving **1,147,072 bytes (1.09 MiB)** of requested storage. The binary's zero-filled local-thread section drops 145,816 → 2,432 bytes. This is a portable shared-code change; how it translates to resident pages depends on each OS.

Other identified live owners include about 0.94 MiB of Metal/CoreFSCache cache groups, 0.25 MiB of SkyLight display-mode dictionaries and the runtime's 240,000-byte frame table (`Machine::load`, now confirmed by a named stack). These are not all reclaimable. The frame table preserves the call-depth contract and may use lazily zeroed pages; virtual stack/allocator reservations must not be counted as physical memory. This pass does not arbitrarily trim system caches or lower program limits. Raw named traces, heap summary and `thread-storage.json` are local in `.logs/memory-pass2/`.

## HAL audit and implemented portable changes

| Area | Change or ownership constraint | Proof / remaining validation |
|---|---|---|
| Common raster and HTTP | Scratch becomes lazy and proportional to use | Existing image/spline, UI style and network goldens on Mac |
| macOS window | Adaptive snapshot/Metal presentation above | Real window, exact pixel/lifetime unit test, resize tests, footprint and CPU measurements |
| SDL/KMS/webOS `display-gl` | Successful GPU initialization frees the unused CPU splash buffer and overlay texture; failed initialization keeps the software fallback | SDL GPU scroll/pixel checks passed; KMS/webOS residency remains unmeasured |
| Generic console core | Release encoded module bytes after decode/verify and before execution | Native host console test, including malformed/truncated bytecode |
| Browser/WASI interpreter entries | Release their encoded temporary vector after decode/verify | New host test checks both real entry functions at the execution boundary; actual WASM build/run deferred |
| Android | Already renders into a compatible ANativeWindow buffer; conversion uses stripe scratch | Preserved; common raster savings apply, device proof deferred |
| Windows SDL | GL already drops its software splash. CPU presentation needs retained pixels for partial texture uploads | Preserved; no Windows build |
| iOS | Existing Metal path retained; common scratch improvements apply | Source audited; physical memory/pacing check deferred |
| Linux fbdev/KMS | Retained pixels support conversion, cursor repair and resume; scanout buffers stay owned until flip completion | Preserved; no unsafe buffer removal |
| PSP/3DS/Vita | PSP already allocates software rows after GPU failure. 3DS/Vita have additional candidates, but their fallback/diagnostic paths need target proof | Recorded for cross-platform pass, not modified here |

The browser's caller-owned input buffer keeps its existing ABI contract. Removing that additional copy would require an explicit ownership-transfer API and matching glue; it is not silently freed. GPU and platform savings outside Mac are source changes or audit findings, not hardware measurements.

## Verification

`tools/build zinc` and the native host console build passed. New `surface_present` checks full/partial frames, old published pixels remaining unchanged, opacity, odd sizes, resize and two complete animation→idle→animation cycles with Metal resources released. New `wasm_buffers` checks both WASM entry ownership boundaries on the host.

Existing `window_live_resize`, `window_resize`, `image_pixels`, `ui_style`, `net`, `net_limits`, `display_gl_scroll`, `console_core` passed. No frozen golden was regenerated. New code produced no new compiler warnings; existing warnings in unrelated CLI/vendor files remain. All probes were stopped. No cross build, hardware run, push or release. Other sessions' changes were preserved; work is uncommitted.

The macOS implementation follows the immutable-surface lifetime model used by [WebKit's IOSurface wrapper](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/cocoa/IOSurface.mm) and groups layer updates using [Core Animation transactions](https://developer.apple.com/documentation/quartzcore/catransaction). This is a measured follow-up to D154's choice of software rendering with Metal presentation: keep its animation path and remove its permanent idle buffers.
