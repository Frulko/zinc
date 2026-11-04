# Shared-engine memory and CPU pass — 2026-10-31

Owner request: reduce engine RAM and CPU across platforms, then inspect generated AOT C++. This pass changes shared C++ only. Verification ran on the development Mac; no cross build or device-performance claim. No TLS/WebSocket changes.

## Implemented

- `runtime/raster.cpp`: grow the shadow alpha cache by distinct rows actually computed, preserving those rows when growing. Previously every thread reserved the full shadow bounding-box area. Allocation failure while growing falls back to the existing uncached row renderer; pixels and the 8 MiB cache eligibility limit stay the same.
- `src/rt/program.cpp`: move the unpacked module into the runner instead of copying it, then release its encoded bytes after decode and verification, before machine loading/execution. Decoder tables own their data. Errors still fail before execution.
- `src/aot/aot.cpp`: copy the actual native signature's argument window, including promise resolve/reject callbacks, instead of every remaining register. Ordinary Zinc calls retain their existing semantics.
- `src/rt/rtcalls.cpp`: use empty vectors for temporary packed-array/string-view owners. Moving their inner vectors preserves the published data addresses; numeric calls need no scratch container allocation. The cost of an empty deque depends on the platform's standard library, so no universal four-allocation-per-call claim is made.

## Measurements

Existing local Release build; M1 Pro/macOS; no artificial load. Raw probes and JSON are in `.logs/engine-memory/` (local, ignored).

| Probe | Before | After |
|---|---:|---:|
| Large rounded shadow, retained scratch | 4,251,648 B | 188,416 B |
| Same shadow, peak live scratch | 4,251,648 B | 253,952 B |
| 30 shadow draws, median of 7 process passages | 18.66 ms | 17.91 ms |
| 500,000 scalar native calls, median process CPU of 7 alternating passages | 47.24 ms | 45.23 ms |
| Builder native-call register assignments, 13 emitted sites | 166 | 42 |

Shadow pixels match exactly (`2c31811e068040a3` after 30 draws). Retained shadow scratch falls 95.6%; the seven short timing passages suggest roughly 4% lower CPU in these microprobes, not an application speed guarantee. The scalar-call baseline already includes the AOT argument-copy improvement: it isolates the temporary-container change.

The empty UI's module unpacks to 38,145 bytes, the builder's to 198,015 bytes. Removing two retained encoded copies saves at least 76,290 / 396,030 requested heap bytes respectively, plus allocator/capacity overhead. This is not a physical-footprint prediction.

A separate actual background-window comparison (1180×780, 8 s warm-up, 10 s CPU interval) gave 62,458,624 → 62,557,184 B footprint and 0.6994 → 0.6991% of one core: effectively unchanged. RSS 54.6 → 53.8 MiB is also too noisy for a gain claim. Its compiled pair predates only the last native scratch-container change, which the empty app does not exercise. Process footprint excludes separately accounted WindowServer memory. No reduction in the roughly 60 MiB graphical floor is established.

## AOT analysis

The initial empty UI emits 2,945,439 bytes of C++, including the common UI library; the builder emits 7,966,419 bytes after the change. Source size is neither executable size nor resident RAM. Empty UI contains 252 emitted function bodies and 2 scalar typed bodies; Fibonacci emits 4,589 bytes, including direct typed recursion.

Already implemented: scalar typed functions/local registers, direct known-class fields, direct width/height, Map/Set and graphics fast paths, bytecode bodies removed from embedded AOT tables. Rewriting these would duplicate working optimizations.

Further candidates, **not implemented**:

1. Audit runtime/HostFast copyback contracts before returning only the result register: empty UI has 9,222 window-to-local assignments and 8,676 in the other direction. Reentrant callbacks and exceptional exits need proof; ordinary Zinc calls must keep their argument-window behavior.
2. Measure which emitted UI helpers are reachable and retained by the native linker before adding reachability pruning. Megabytes of generated source alone do not prove RAM waste.
3. The console-specific `runOne` retains its encoded byte vector while executing, unlike the shared runner now fixed. The callbacks app wrapper already drops its vector when initialization returns; worker decode buffers already have a short lexical lifetime. Extend the ownership proof to console entry during a later measured pass.

## Verification

- Build `tools/build zinc`: passed.
- New `raster_scratch`: memory ceiling, cached/uncached equality, fractional/clipped shapes and allocation-failure fallback.
- New `program_buffers`: real runner with a stub decoder/machine checks transfer without a second copy, release before execution, corrupt input and verification failure.
- New `aot_native_args`: bounded emitted argument copies plus actual callback/promise execution.
- New `native_views`: multiple byte/string arrays, empty arrays, AOT/interpreter/QuickJS.
- Existing `native_call`, `shadow_mirror`, `style_shadow`, `rn_idle`, both T0/T1 `aot`: passed.
- Shadow smoke on interpreter and QuickJS matches AOT's scale-1 golden `767c6ffef9a744d0`.
- `raster_scratch` under AddressSanitizer/UndefinedBehaviorSanitizer: passed.

No push or release. Other sessions' changes remain untouched; this pass is uncommitted.

## Detailed idle-window footprint follow-up

Same compiled empty UI, 1180×780 logical, default Retina scale 2, no instrumentation for the baseline. `footprint -f bytes -w`, `vmmap -summary`, full `vmmap -w`, and `heap -s` agree on an approximately 59.8 MiB process footprint. Raw outputs: `.logs/memory-breakdown/`.

| Footprint category | MiB | Share |
|---|---:|---:|
| IOSurface | 28.188 | 47.1% |
| IOAccelerator graphics + other IOAccelerator | 14.609 | 24.4% |
| Malloc pages and allocator metadata | 10.250 | 17.1% |
| Writable binary/library data and authenticated data | 3.446 | 5.8% |
| Thread stacks | 0.359 | 0.6% |
| Page tables | 0.769 | 1.3% |
| Other, including CoreUI/ColorSync/CoreAnimation | 2.211 | 3.7% |
| Total | 59.832 | 100% |

The two large IOSurfaces total 29,556,736 B; the large IOAccelerator graphics region is the raster's roughly 14 MiB shared Metal buffer. This matches `hal_metal.mm`: one full-sized shared MTLBuffer, blitted into a CAMetalLayer with two drawables. Category attribution and the size experiment strongly support this interpretation; no GPU allocation backtrace is claimed.

Control: same binary and environment, only `ZINC_SIZE=640x480` changed. Total footprint 32,803,776 B (31.284 MiB), versus 62,737,408 B (59.832 MiB) for 1180×780. IOSurface 9,830,400 B and IOAccelerator graphics 5,111,808 B at the smaller size. Total reduction 28.548 MiB; three tightly packed RGBA buffers predict 28.070 MiB, with alignment/driver/framework variation explaining the small remainder. This is a diagnostic size change, not a shipped quality reduction.

The malloc-zone table has about 6,711 KiB allocated and 3,449 KiB unused dirty/swapped capacity (34% of zone occupancy). This includes AppKit/SDL/Metal/Objective-C, not just Zinc. `heap` finds 36,951 live allocations, 6,872,032 bytes; 4,558,368 bytes are untyped non-objects, and the rest include Objective-C method caches, dictionaries, strings and Metal resource lists. Allocation capacity is not automatically reclaimable memory.

Virtual sizes must not be counted as footprint: vmmap reports about 5.7 MiB of anonymous executable data with only about 512 KiB dirty+swapped; reserved allocator/stack/GPU address ranges are mostly untouched. Clean mapped/shared libraries are reported separately and must not be added wholesale to the footprint.

Separate MallocStackLogging lite/full diagnostic runs raised footprint to about 64.8/72.4 MiB. Their numbers are excluded from the table. The full allocation history is captured, but application frames are largely unsymbolicated (`???`) and anonymous VM reservations must be distinguished from resident bytes (`-allBySize` reports currently live allocations). No complete per-function live-byte attribution is established. All probe processes stopped.

Next optimization priorities: reduce full-sized presentation buffers or reuse renderable display memory through each platform's HAL (the dominant item here); investigate the 6.6 MiB live malloc payload with a symbolicated allocation trace; then measure reclaimable allocator slack. Keep Retina quality and synchronization correctness. One fewer full-sized buffer could save about 14 MiB at this window size, but that saving remains a hypothesis until a correct implementation is measured. The portable engine's cost must be separated from each platform's graphics/window host.

The three follow-up axes are implemented and measured in [engine-memory-hal-2026-10-31.md](engine-memory-hal-2026-10-31.md), including adaptive presentation, named allocation ownership and the per-HAL audit.
