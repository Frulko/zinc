# Execution engines (experimental)

The intended product is the **same application** running in native Zinc, Zinc VM, or QuickJS, with the same
native services, UI renderer, assets, input, headless replay and benchmark protocol. The current implementation
is an initial executable slice, **not that complete product**.

## What runs today

```sh
node compiler/bin/zinc.mjs run tests/engines/scalar.ts --engine native
node compiler/bin/zinc.mjs run tests/engines/scalar.ts --engine zinc-vm --vm-tier=0
node compiler/bin/zinc.mjs run tests/engines/scalar.ts --engine zinc-vm --vm-tier=1
node compiler/bin/zinc.mjs run tests/engines/scalar.ts --engine quickjs

# Both interpreters call the same existing C++ Sensor implementation.
node compiler/bin/zinc.mjs run tests/engines/native.ts --engine zinc-vm --jit
node compiler/bin/zinc.mjs run tests/engines/native.ts --engine quickjs

node tests/engines/run.mjs
node tests/engines/run.mjs --bench
# After correctness checks, rebuild/time only the benchmark kernels:
node tests/engines/run.mjs --bench-only
```

`native` remains the default. `--jit` means `--vm-tier=1` and requires `--engine zinc-vm`.
`--debug` instruments the native runner and libraries with ASan/UBSan. Each engine has a separate build directory;
Tier 0 and Tier 1 deliberately share a bytecode bundle and runner. Build time is not part of the execution timings.

| Surface | Native | Zinc VM | QuickJS application runner |
|---|---|---|---|
| Existing Zinc applications | Existing support | Partial typed language support | JS language features through existing Zinc JS emission |
| TS and JS input | Existing frontend | Existing frontend, including JS inference | Same frontend and numeric conversions |
| Numeric functions, recursion, loops, branches | Yes | bool/i32/u32/f32/f64, plus string literals/printing | Yes |
| User `.spec.ts` native modules | Direct C++ calls | Shared scalar/resource/callback/record ABI | Same ABI, ES modules |
| Native import resolution | At build | Once at bytecode load | ES module loader, including `import()` |
| Native UI and built-in service modules | Existing support | Native `sys`/`fs` events and scalar `gfx`; full UI pending | Same native services and renderer; full UI pending |
| Application objects, arrays, closures | Existing support | Typed fields, arrays, captured cells, closures, classes and virtual methods | JS representations; opaque native resources cross the ABI |
| Async, exceptions, generators | Existing support | Guest throw/catch/finally; async/await, promise jobs/timers, typed generators | QuickJS language support, jobs and basic timers; no native async ABI |
| `zinc:script` embedded API | Existing QuickJS plugin | Still unavailable | Existing plugin unchanged; application runner is a separate integration |
| Host targets | Existing targets | Host macOS/Linux | Host macOS/Linux |
| JIT | AOT compilation | AArch64 macOS/Linux only | QuickJS interpreter |

Zinc VM links application modules plus native specs. Declaration identities distinguish same-named globals
and functions across files; named/default imports, aliases, namespace access and re-exports resolve to those identities.
Dependencies initialize once in import order, before their consumers. Cyclic initialization and unsupported
types/operations are rejected. It does not silently execute the application as C++ or QuickJS. HIR preserves
source-order initializers; MIR supplies SSA and phi edges. Edge copies use temporary slots so swaps work correctly.
The MIR golden now includes exceptional CFG edges and typed async suspension points; HIR preserves effects in void callbacks.

The Zinc typed array contract declares `pop()` and `shift()` as returning `T`. On an empty array,
native Zinc and Zinc VM return the default value of `T`: zero, false, an empty string, or a null reference.
Zinc's JS emitter applies the same default when the element type is concrete. Dynamic arrays and raw
JavaScript executed directly by QuickJS retain JavaScript's `undefined`; unresolved generic element types
are not normalized by the JS emitter and remain a parity limitation. `shift` and `unshift` mutate the
receiver; `concat` creates a separate array while preserving the identity of its referenced elements.

The application runners are development tools, not replacements for `Script`'s sandbox contract. In particular,
QuickJS's application loader reads JS modules from the filesystem; native calls are limited to registered modules.
The native implementations themselves are trusted code.

## Shared native ABI

The actual C contract is [`runtime/include/zinc_abi.h`](../runtime/include/zinc_abi.h).
[`compiler/src/abi.ts`](../compiler/src/abi.ts) generates adapters and `core.abi.json` from the existing
`requireNative<Spec>('Name')` declarations. A native module is compiled once into each runner; there is no
QuickJS-specific reimplementation of its methods and no JSON round trip on a call.

- `ZincModule`: ABI version, descriptor size, canonical name, exports.
- `ZincExport`: name, parameter types, result type, context and C invocation function.
- `ZincValue`: type tag and unboxed number, boolean, UTF-8 pointer/length, or opaque resource handle.
- Arguments are borrowed for the call. Result/error bytes belong to the module and remain valid until its next
  invocation; adapters copy them before returning to the guest. Returning pointers to stack-local bytes is invalid.
- A native function reports status and error bytes; it must not throw across the C boundary. Generated Zinc
  adapters translate `zrt::g_err` into this status. ABI v3 supports scalar record results, byte snapshots and retained callbacks with scalar arguments/results and reentrant engine entry.
- `zinc:native/Sensor` names the registered module. QuickJS exposes both named functions and a default object.
  The emitter rewrites the existing relative `.spec` import, so application source does not change.
- The Zinc bytecode records module/export names and complete scalar/resource signatures. Loading resolves these to direct
  descriptor pointers after checking ABI version and signatures. The hot path uses a resolved index.
- Missing modules, duplicate registrations, wrong arity, wrong value types and wrong results are errors.
- Native `import()` loads a **registered** module. It does not load arbitrary `.so`/`.dylib` files. Registration
  comes from static linking or explicit, repeatable `--native-library /absolute/path` runner/CLI options.
  Libraries export `zinc_module_open(version, host, out, error)`; signatures are checked against the compiled spec.
  Resources are released before module disposal and library unload; modules dispose in reverse load order.

Built-in adapters generate only referenced exports from `zinc:sys`, `zinc:fs` and `zinc:gfx` declarations.
File access, environment, filesystem watchers, signals and stdin use the existing native implementations.
Native timers/pollers keep the runners alive; guest microtasks drain between native event callbacks.
Closing a graphics host cancels outstanding guest timers. QuickJS application clocks use the native clock,
and its emitted timers use the engine scheduler rather than the simulator scheduler. Guest timers still
use wall-clock deadlines; full parity with deterministic native virtual-time timers remains outstanding.
Optional boolean parameters are materialized by the compiler. Native error statuses become catchable guest Errors.

`ZINC_NUMBERS` transfers readonly numeric-array snapshots to graphics; mutable user specs remain rejected.
`ZINC_BYTES` transfers copied byte snapshots for file IO, UTF-8 and random bytes. User specs requiring mutable
buffer aliasing remain rejected. `ZINC_RECORD` descriptors describe scalar fields in native result snapshots,
including `fs.stat`/`lstat` and user specs; nested values and record arguments remain rejected.

Graphics links the actual `gfx.cpp`, rasterizer, font resources and HAL. `--headless` uses the null HAL;
windowed builds use SDL. Both call the same native frame loop and renderer. The graphics fixture compares
captured frames in native, VM, JIT and QuickJS byte-for-byte. This covers scalar drawing APIs and frame callbacks;
polygon/path/stroke accept copied numeric arrays. Full UI applications still need further ABI/language support.

Native callback arguments use `ZINC_CALLBACK` handles and the same retain/release operations as resources.
Generated adapters expose them as existing `zrt::Fn` values. `callback_invoke` validates arity/types in the VM,
keeps an active reference during self-cancellation, and copies return bytes before releasing it. Both runtimes
root retained guest closures until release or shutdown; native calls use independent argument storage when
callbacks reenter. Callback signatures currently accept/return scalars only; returning callbacks from native
exports, resource-valued callback arguments and async callback completion remain unsupported.

The manifest describes the shared boundary; it is not a claim that every existing module already implements it.
Native Zinc still uses direct calls generated from the same specs, preserving its existing performance.

## VM and JIT

The experimental `ZBC4` container has an ABI version, typed globals, constant pool, native import signatures and
object layouts/method tables and functions with typed registers, parameter/capture locations and 16-byte instructions.
ZBC4 adds verified named scalar exports to the reserved Error layout for native failures; older bundles must be rebuilt. It is not yet the compact 32-bit
encoding in the design report. The loader bounds file sizes/counts and verifies instruction types, operands,
constants, branches, call signatures, frame sizes and fallthrough. Guest bytes cannot supply code or object pointers.
Registers have storage initialized by the host; this verifier does not yet implement a full definite-assignment pass.

Tier 0 uses specialized musttail handlers on Clang and a bounded dispatch loop on other compilers. Typed numeric
registers carry unboxed values. Math functions reuse Zinc native helpers, including seeded random state owned
by each VM instance. It uses the existing Zinc number formatter, including short decimal output.

Tier 1 compiles the **verified bytecode** into AArch64 machine code at startup. Numeric arithmetic, comparisons,
loads/stores and control flow have machine-code implementations. Leaf functions pin up to eight integer and eight
f64 slots in callee-saved registers. Helpers handle calls, formatting, conversions and native ABI operations;
registers are synchronized around helpers. Errors return through generated frames as status codes; C++ exceptions
never unwind through JIT frames. This is a baseline JIT, not the proposed optimizing Tier 2 or an automatic tier-up system.

Executable memory uses `MAP_JIT` and per-thread write protection on macOS; Linux uses writable pages during
compilation and read/execute pages after `mprotect`. The instruction cache is flushed. The mapping is released with
the VM. Other architectures reject JIT mode explicitly. Apple's hardened-runtime entitlement requirements still
apply when packaging a JIT executable; see [Apple's JIT guide](https://developer.apple.com/documentation/apple-silicon/porting-just-in-time-compilers-to-apple-silicon).

`ZINC_EXECUTION_TIMEOUT_MS` sets an execution deadline (default 60000 ms; 0 disables it). Both interpreter and JIT
poll calls/back edges. QuickJS checks its interrupt hook and timer pump. The VM currently reserves 1M scalar
registers, caps interpreter call frames at 16383, JIT recursive calls at 1024, bytecode files at 64 MiB,
and generated code at 64 MiB. QuickJS has a 512 MiB engine allocation limit.
Objects, arrays, strings and closure environments live in a non-moving traced heap, capped at 64 MiB by default.
`ZINC_VM_HEAP_BYTES` sets a managed-heap budget from 4096 bytes to 1 GiB; it does not cap total process RSS.
Collection traces globals, constants, named-function identities, active interpreter/JIT frames and captured references.
An iterative mark/sweep pass reclaims unreachable cycles. The interpreter and JIT share these allocation and access
operations; numeric registers remain unboxed and retain their native JIT instructions. Frame registers conservatively
retain their referenced values until overwrite or function return, even after an SSA value's last use.

`ZINC_VM_STATS=1` reports managed heap bytes, peak bytes and collection count as JSON on stderr. The engine tests
exercise allocations and cycles under a 64 KiB heap, including parent frames surviving allocating callees. Native
result strings now use the collected heap rather than accumulating until VM disposal.

This is **not** the design report's shared C++ object layout or deterministic RC/finalizer contract. Scalar-field native result records cross the ABI as snapshots; nested records and record arguments remain unsupported. `zinc:native` exposes opaque `NativeResource` values: runtime-owned generational
handles preserve identity, reject stale/wrong-kind handles and release native ownership on guest collection.
`ZincHost` provides create/get/retain/release operations on the owning engine thread; arguments borrow and results
transfer one reference. Native Zinc uses its existing reference counting. Destruction timing therefore differs.
VM strings now own the existing Zinc `String` representation, including cached UTF-16 length. Length,
slice/substring, indexOf/lastIndexOf, includes/startsWith/endsWith, trimming, case conversion and charAt use
those same runtime implementations; Unicode and retained-string fixtures compare all four execution modes.

Static class fields use typed globals initialized in source order, with their references traced by the same collector.

The supported array methods currently include length, indexing/append-at-length, push/pop, deletion-only splice and for-of; other array
methods, maps/sets, accessors, bound methods, full promise APIs and the full generator protocol remain incomplete.
Async functions execute their synchronous prefix immediately. `await` saves the typed register frame in the
collected heap and resumes through a FIFO microtask queue, including already-resolved promises. AArch64 async
functions have a checked continuation dispatch table; resumed code executes in the selected tier. Ordinary
synchronous functions do not need this table. Both tiers support async closures, `Promise.resolve`, object-valued
`Promise.reject`, rejection propagation through `await`, and catch/finally across suspension. Unhandled rejections
fail the runner after draining jobs. Suspended frames, active async parents, promise results and waiting consumers
are traced; handled rejections are released during collection. Tests exercise repeated suspension and rejection
under the 64 KiB budget, plus multiple consumers in registration order.

Promise executors, the existing typed void-result `.then` profile, `Promise.all`, `queueMicrotask`, and
set/clear timeout/interval run in both tiers. Timers create fresh callback frames; suspended interval callbacks
can overlap. This is not yet the full Promise API: `.catch`/`.finally`, arbitrary promise adoption, async native
completion and returning a promise directly from an async body remain unsupported. Primitive rejection reasons
are rejected at compilation. Awaiting a scalar and finally in async functions are compared against QuickJS:
the existing native backend rejects those two constructs. The common async fixture runs in all four modes.

Typed generators start lazily, save frames at statement `yield`, and resume through `for-of` in both tiers.
Captured and yielded references are traced; completion and exceptions release saved frame slots. `yield*`,
`next(value)`, iterator `return`/`throw`, IteratorClose on break and async generators remain unsupported.

Guest Error/TypeError/etc. construction, throw/rethrow and try/catch/finally use explicit exceptional CFG edges.
The JIT propagates guest exceptions as status codes; C++ exceptions never cross generated frames. Host failures
(memory limits, timeout, invalid indexing) remain fatal, while native ABI error statuses become catchable guest Errors.
Custom Error subclasses and complete error stack/source information remain unsupported.

## Embedded runtime and tooling

[`zinc_vm.h`](../runtime/include/zinc_vm.h) exposes an in-process bytecode API: explicit native registration,
load, initialize, scalar export lookup/call/get/set, interrupt and disposal. Each context owns its heap and limits.
Named calls reset the execution deadline; ordinary guest exceptions permit another call, while limit failures
invalidate that context. This is groundwork for `ScriptEngine`, whose source evaluation and dynamic-value contract
are not implemented by this API. `node tests/engines/embedded.mjs --sanitize` checks interpreter and JIT entry,
isolation, errors, ownership, budgets and interruption.

CLI `test`, `dev`, `capture` and `export` accept engine selection. Development reload restarts the process when
local or external dependencies change. Exports include a relocatable runner, program, native libraries and assets;
`engine.json` records artifact hashes. `node tests/engines/tooling.mjs` checks relocation and invalidation.
`node tests/engines/matrix.mjs` builds all discovered demos; `--run` compares stdout and `--capture` compares images.
Unsupported demos remain failures with diagnostics. Source stacks and stage profiling remain incomplete.

## Measurements and PocketJS findings

`tests/engines/run.mjs --bench` runs the same source under all available modes, asserts byte-identical checksums,
excludes compilation, performs one warmup and seven interleaved runs, and writes raw samples plus machine metadata
to `tests/engines/build/benchmark.json`. These are **spawn-to-exit** timings, not isolated dispatch latency or UI frame
budgets. `node tests/engines/frame-bench.mjs` separately exercises actual SDL rasterization with the dummy display,
using the shared frame profiler (600 frames, first 60 discarded, three rounds). Its raw phase samples remain
a small graphics workload, not a full UI application benchmark.
[Measured frame and phase samples](reports/engine-frames-2026-09-29.json) preserve the 2026-09-29 run;
frame totals include presentation/vsync, while `effects` includes guest drawing calls and microtasks.
These phase samples do not isolate ABI cost from application work.
[The corresponding four-mode capture check](reports/engine-graphics-pixels-2026-09-29.json) verifies pixel agreement.
The kernels cover recursive calls, float loops, and 100000 calls through the native boundary. They do not
establish application-wide speedups.

Baseline measured on Apple M1 Pro / macOS arm64, Apple Clang 17 and QuickJS-ng 0.17.0, on 2026-09-29.
Only macOS arm64 has been exercised locally; Linux support remains unverified.

| Kernel (median ms) | Native | VM | VM JIT | QuickJS |
|---|---:|---:|---:|---:|
| fib | 10.09 | 130.50 | 61.56 | 341.02 |
| mandelbrot | 22.00 | 385.43 | 84.72 | 744.71 |
| bridge-bench | 2.87 | 8.54 | 3.99 | 10.93 |

[Raw samples and artifact hashes](reports/engine-baseline-2026-09-29.json) preserve this measurement;
rerun the harness to compare later changes. These measurements predate the multi-module linker.

A later run includes the resource/callback ABI and shared string representation. Same host and protocol;
[raw samples, environment and artifact hashes](reports/engine-abi-2026-09-29.json):

| Kernel (median ms) | Native | VM | VM JIT | QuickJS |
|---|---:|---:|---:|---:|
| fib | 9.57 | 128.59 | 67.48 | 322.23 |
| mandelbrot | 22.15 | 349.01 | 79.64 | 715.55 |
| 100000 scalar native calls | 3.01 | 6.38 | 5.14 | 10.84 |
| 100000 retained native-to-guest callbacks | 3.24 | 12.22 | 11.01 | 23.04 |

The callback kernel retains one closure, invokes it through the native module and checks its accumulated result.
These remain process timings, not per-call latency or application/UI performance measurements.

PocketJS was inspected at commit `25081f644a39426f3c63c90aad8cb5f3fcdecdfa`, separately from the older local checkout.
Concrete practices retained for Zinc's next stages:

1. **Generate contracts once and check drift.** PocketJS describes native operations/events/assets and their frame
   ordering in a shared spec. Keep Zinc's `.spec.ts` declarations as the source of truth and generate both engine
   adapters, not a separate handwritten API per engine.
2. **Keep frequently read state local; batch boundary traffic.** Mirror UI/input snapshots in the guest and batch
   mutations/events where that preserves Zinc's observable semantics. Do not benchmark a no-op renderer against the
   native renderer. Do not change Zinc's promise/timer semantics merely to copy PocketJS's frame-clock policy.
3. **Measure stages separately.** PocketJS's C runtime exposes evaluation, guest work, jobs and native ticks as
   distinct harness stages. Zinc's future UI comparison must split load/compile, guest execution, ABI calls, jobs,
   layout, rasterization and presentation; total wall time alone hides where time went.
4. **Keep raw samples and pin the environment.** Replays, identical assets/input, compiler/engine versions, resolution,
   backend and warmup policy belong in the result artifact. Report startup, steady-state frame p50/p99/max, memory
   and binary/bundle sizes separately. A seven-sample startup benchmark is not a valid p99 frame estimate.

Inspected sources (no PocketJS implementation code was copied):

- [Runtime contracts and boundary rules](https://github.com/pocket-nexus/pocketjs/blob/25081f644a39426f3c63c90aad8cb5f3fcdecdfa/docs/RUNTIMES.md)
- [Portable QuickJS runtime and stage hooks](https://github.com/pocket-nexus/pocketjs/blob/25081f644a39426f3c63c90aad8cb5f3fcdecdfa/engine/quickjs-c/README.md)
- [Desktop benchmark protocol](https://github.com/pocket-nexus/pocketjs/blob/25081f644a39426f3c63c90aad8cb5f3fcdecdfa/tools/bench-desktop.ts)
- [PSP raw-sample benchmark tooling](https://github.com/pocket-nexus/pocketjs/blob/25081f644a39426f3c63c90aad8cb5f3fcdecdfa/tools/bench-ppsspp.ts)

## Demo acceptance checkpoint

The [initial 232-build matrix](reports/engine-demo-baseline-2026-09-29.json) recorded native 57/58,
VM 0/58, VM JIT 0/58 and QuickJS 3/58. Its one native failure (`video/mapper`) was then fixed and rebuilt.
The [graphics integration matrix](reports/engine-demo-gfx-2026-09-29.json) records VM 2/58,
VM JIT 2/58 and QuickJS 16/58. These are build results, not proof that every successful build renders correctly.
Subsequent language changes require rerunning that dated snapshot.

Actual capture checks also pass: [forms UI, native/QuickJS](reports/engine-forms-pixels-2026-09-29.json),
[gl-check, all four modes](reports/engine-gl-check-pixels-2026-09-29.json), and
[bouncing ball, all four modes](reports/engine-bouncing-ball-four-modes-2026-09-29.json).
Each comparison uses the same source, resources, deterministic frame timing and capture frame.
The failures remain in the matrix with their diagnostics; this is not full demo parity.

## Remaining work for the requested full runtime

This remains the acceptance target, not optional scope:

| Stage | Required result |
|---|---|
| Full MIR and ownership | Initial objects/arrays/classes/cells/closures and cycle collection implemented; async/await, promise jobs/timers and typed generators implemented; remaining language operations, full promise/generator APIs and destruction timing need parity with native |
| ABI object model | Versioned type identities/layout descriptors, owned/borrowed references, generational guest handles, buffers, callback retention/disposal and async completion; no raw guest-supplied pointers |
| Native module adapters | Built-in modules plus plugins generated from signatures; capabilities checked at load; initialization, unload and callback cancellation defined |
| Shared application host | Same renderer/HAL/resources/input/event loop for native, VM and QuickJS; windowed and headless execution with identical pixel/replay checks |
| Embedded engines | Zinc VM behind `ScriptEngine`; source compilation on development hosts and verified bundles on devices; limits, errors, promises and disposal matching the existing contract |
| Tooling | Engine options through dev/capture/export/test, source locations and stacks, cache fingerprints, module reload invalidation, profiler stage counters and full demo matrix |
| Further JIT work | Register allocation across calls, more platforms, hot thresholds, OSR/deopt where needed; optimizing Tier 2 is still unimplemented |

See [the original VM design](reports/zinc-vm.md) for the complete architecture. Its prototype benchmark ratios are not
measurements of this newly integrated implementation.
