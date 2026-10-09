# mquickjs as a fourth Zinc engine: assessment and design

Date: 2026-09-30. Host: Apple M1 Pro, macOS 24.6, Apple clang. mquickjs checkout: `bellard/mquickjs` HEAD `6d4d7eb` (2026-09-26; 477 commits), cloned to `scratchpad/mquickjs`. Zinc tree was dirty and was not modified.

Legend: **[V]** verified by running or reading code here, **[W]** from web sources, **[I]** inferred.

## 0. Verdict

Feasible, but it is not "QuickJS with a smaller footprint". It is a different language (ES5 plus a few extensions, stricter mode). Zinc's current JS path (`emit-js.ts` output as ES2022 modules, run through `sim/zinc.mjs`) cannot run on it. The work is a downlevel + bundle pipeline, an ES5 rewrite of the sim shim, a Promise/timer polyfill, and a new C adapter that respects a moving GC. Estimated 12-15 days for an MVP that runs the scalar/native fixtures, and 35-50 days for four-mode parity including UI demos. The payoff is real for ESP32-class targets. For Pi 3B+, rM Paper Pro and iOS, QuickJS is the better engine (Section 6).

## 1. mquickjs facts

### 1.1 Language subset

Sources: [README.md](../scratchpad/mquickjs/README.md) lines 67-190, and my probes with `./mqjs` [V].

The README describes ES5 in a mandatory "stricter mode": strict-only, no holes in arrays (`a[10]=x` past the end is a TypeError [V "invalid array subscript"]), only global eval, no value boxing, `for-in` covers own properties only, and Date is only `Date.now()`. Extensions: `for-of` over **arrays only**, typed arrays, `**`, some Math functions, regexp `s`/`y`/`u` flags, `codePointAt`, `replaceAll`, `trimStart`/`trimEnd`, `globalThis`.

Probe results (each one-liner run in `mqjs`). "no" means `SyntaxError` or `ReferenceError`:

| Feature | Result | Evidence |
|---|---|---|
| `let` / `const` | no | SyntaxError [V] |
| Arrow functions | no | SyntaxError [V] |
| `class` (all forms) | no | SyntaxError [V] |
| Template literals | no | SyntaxError [V] |
| Spread / rest / default params | no | SyntaxError [V] |
| Destructuring | no | SyntaxError [V] |
| `?.` and `??` | no | SyntaxError [V] |
| Shorthand and computed object keys | no | SyntaxError [V] |
| Generators, `async`/`await` | no | SyntaxError [V] |
| Promise, Map, Set, Symbol, WeakMap, Reflect | absent | ReferenceError or undefined [V] |
| Proxy | absent | `typeof Proxy` = undefined [V] |
| BigInt literal | no | SyntaxError [V] |
| Module syntax (`import`/`export`) | no [I], not probed | README: no modules; `JS_Eval` takes a global script only |
| Getters/setters in object literals, `Object.defineProperty` accessors | yes | [V] |
| `var`, function closures, `arguments`, labels, `try`/`catch`, `instanceof` | yes | [V] |
| JSON, RegExp, typed arrays (incl. Float32Array), `**`, `toFixed`, `toString(16)` | yes | [V] |
| `setTimeout`, `clearTimeout`, `performance.now`, `print`, `gc`, `load` | yes, in the example stdlib | `mqjs_stdlib.c:320-389` [V] |
| `Date` constructor | yes (`new Date()` works) but `Date.now()` returns a number, and `new Date().getTime` is missing | [V] `not a function` |

Missing standard-library members the emitted code commonly needs (all [V] via `typeof` loop over the example stdlib):
- Array: `includes`, `find`, `findIndex`, `flat`, `flatMap`, `fill`, `at`, `Array.from`, `Array.of`.
- String: `padStart`, `includes`, `startsWith`, `at`, `localeCompare`.
- Object: `entries`, `values`, `assign`, `freeze`, `fromEntries`, `getOwnPropertyNames`.
- Number and Math: `Number.isInteger`, `Math.hypot`.
- Globals: `encodeURIComponent`, `structuredClone`, `TextEncoder`, `queueMicrotask`, `DataView`.
- Present: `slice`, `splice`, `indexOf`, `sort`, `reduce`, `map`, `filter`, `some`, `every`, `push`/`pop`/`shift`/`unshift`, `concat`, `reverse`, `Object.keys/create/defineProperty/getPrototypeOf`, `Math.fround/imul/trunc/sign/log2`.

The stdlib is a compile-time C table (Section 1.3), so Zinc can add native members, or polyfill in JS at the cost of RAM.

Error subclassing is broken for ES5 patterns. Both `Error.call(this,m)` with `E.prototype=Object.create(Error.prototype)`, and just `this.message=m` on such an object, threw `TypeError: not a function` [V]. Zinc's `class ScriptError extends Error` pattern (`plugins/script/index.ts:37`) needs a custom Error construction path [I].

Other behaviors [V]: strings are WTF-8 (`"héllo€".length`=6, `"😀".length`=2, so UTF-16 semantics are preserved). Deep recursion of 20000 frames works. Runaway recursion throws `InternalError` (catchable), not a crash.

### 1.2 Memory model

- No `malloc`. `JS_NewContext(mem_buf, size, &js_stdlib)` (`mquickjs.h:263`) allocates everything inside the given buffer. `JS_FreeContext` only runs finalizers.
- Tracing, compacting GC. **Any allocation can move objects.** C code must not hold `JSValue` across API calls except through `JSGCRef` (`JS_PushGCRef`/`JS_PopGCRef`, LIFO stack, `mquickjs.h:143-152`) or `JS_AddGCRef`/`JS_DeleteGCRef` (context roots, non-LIFO). No `JS_FreeValue`. `DEBUG_GC` forces a move on every allocation (good for testing the adapter).
- Value = one CPU word (32-bit on 32-bit CPUs; on 64-bit, "short floats" with small exponent are inline, others boxed) (`mquickjs.h:44-51`, README 296-330). 31-bit ints. Objects >= 3 words.
- Retaining JS values from native objects: known gap in issue #80. The fix, commit `6d4d7eb`, added `JS_NewObjectClassUser(ctx, class_id, n_values)` plus `JS_SetUserValue`/`JS_GetUserValue`, which are GC-traced slots inside the object [V, `mquickjs.h:216,289`]. This is how a resource wrapper can hold a callback closure without a root cycle.
- Finalizers (`JSCFinalizer(ctx, opaque)`) cannot call into JS (`mquickjs.h:220`).
- `JS_StackCheck`/`JS_PushArg`/`JS_Call(ctx, argc|flags)` is the call sequence (`example.c:250-253`, `mqjs.c:215-221`). Errors longjmp only inside the parser (`mquickjs.c:7655,11762`); C callbacks report failure by returning `JS_EXCEPTION`. C++ exceptions must never unwind through the engine, the same rule Zinc's `quickjs.cpp:200-202` already follows.

Numbers [V, `mqjs --memory-limit`]: hello world runs in a 10 KB buffer; `tests/mandelbrot.js` runs in 64 KB. My alloc-heavy `objs.js` (string growth) used 775 KB of a 1 MB heap at exit.

### 1.3 C API and stdlib generation

- `mquickjs_build.c` is a host tool that compiles a C description (`mqjs_stdlib.c`) into `mqjs_stdlib.h`: `JSSTDLibraryDef` with ROM-able property tables, a C function table, a finalizer table, and the class count. Function identity is a table index (`JS_CFUNCTION_*`), fixed at build time.
- Consequence for Zinc: per-export `JS_NewCFunctionData` (used by `quickjs.cpp:212`) does not exist. The equivalent is `JS_NewCFunctionParams(ctx, JS_CFUNCTION_zn_call, JS_NewInt32(id))` (`example.c:241`), one fixed stdlib entry with the export id as a param, created at runtime [V that the API exists, I for the design]. Therefore the stdlib table is generated once per Zinc runner, not per app.
- Bytecode: `mqjs -o out.bin src.js`, `mqjs -b out.bin`, `-m32` for 32-bit output on a 64-bit host, `--no-column`. `JS_RelocateBytecode`, `JS_LoadBytecode`, `JS_Run` (`mquickjs.h:342-372`). Bytecode is unverified; trusted sources only (README 273-275). Version is checked (`JS_BYTECODE_MAGIC` and a version field), but there is no compatibility promise. Measured [V]: `fib.js` gives 736 B (64-bit) and 452 B (`-m32`).
- Interrupt: `JS_SetInterruptHandler(ctx, fn(ctx, opaque))`, polled every 10000 ops (`mquickjs.c:187,5096`); non-zero raises `InternalError: interrupted`. Regexps are also interruptible [W].
- Memory limit is simply the size of the buffer.
- License: MIT (Fabrice Bellard, Charlie Gordon). Compatible with the vendored QuickJS licensing [V].
- Build: plain `make` (gcc/clang, C99-ish; `-D_GNU_SOURCE`); CMake wrapping is trivial: `mquickjs.c`, `cutils.c`, `dtoa.c`, `libm.c` plus a generated stdlib header. I built it on macOS arm64 without changes [V]; `mqjs` is 271 KB (`-Os -g`, includes readline). Options for ARM32 (`-mthumb`), softfloat, X86_32 and Win32 in the Makefile [V].
- Portability: built for both 32- and 64-bit words (`JSW` 4 or 8). Own libm and soft-float; ROM about 100 KB Thumb-2 per Bellard [W/README].

### 1.4 Performance

Bellard's claim: "speed comparable to QuickJS" (README:9-10); ships `make microbench` and an Octane target with a strict-mode-patched Octane in a tarball (I did not download it). Nobody I found published reliable Octane numbers; one blog post has only placeholders (X/Y/Z) and I discount it [W].

My own micro-measurements, ES5 code so both engines run identical source. Zinc's vendored QuickJS-ng 0.17 built at `-O2` through a 20-line runner; mqjs at `-Os` (default) and `-O2`. Single machine, 2 runs each, wall clock in ms, no statistics: treat as ordering only [V].

| Kernel | QuickJS-ng -O2 | mqjs -Os | mqjs -O2 |
|---|---|---|---|
| fib(32), recursive calls | 282 / 279 | 216 / 217 | 195 / 221 |
| mandelbrot 300x300x100, doubles | 377 / 386 | 426 / 424 | 443 |
| object alloc + string concat + property churn | 50 / 48 | 65 / 63 | 53 |

Reading: mqjs is faster on call-heavy code (~20-25%), slower on float-heavy code (~10-15%, boxed doubles) and allocation-heavy code. This matches "comparable".

Zinc's own baselines (`docs/engines.md:226-243`): QuickJS fib 322-341 ms, mandelbrot 715-745 ms (different, larger kernels, spawn-to-exit). So mquickjs would sit close to the QuickJS column and far from the VM/JIT column.

### 1.5 Ecosystem [W unless noted]

- ESP32: `conoro/mquickjs` (ESP32 fork), `makgordon/esp-mquickjs` (ESP-IDF component, [registry](https://components.espressif.com/components/makgordon/esp-mquickjs/versions/0.1.0-beta/readme?language=en)), `99percentpeople/esp32qjs` (ESP-IDF framework for trusted JS on mquickjs), an [Adafruit write-up](https://blog.adafruit.com/2026/01/05/vibe-coding-an-esp32-version-of-micro-quickjs/) (page returned 403, title only).
- Bindings: [mitchellh/zig-mquickjs](https://github.com/mitchellh/zig-mquickjs) (Zig; pinned to one Zig release; stdlib ROM compile step needed), [mquickjs-kmp](https://github.com/HarlonWang/mquickjs-kmp) (Kotlin), Simon Willison's [Python/Node/Deno/Pyodide/WASM bindings](https://simonwillison.net/2025/Dec/23/microquickjs/) (WASM was harder because of setjmp/longjmp; 303 KB wasm).
- Users: [mattneel/three-native](https://github.com/mattneel/three-native) README states mquickjs as the JS engine ("10KB RAM, 100KB ROM ... JS is not the hot path; GPU calls are. Can swap to V8/JSC later"). A search-engine summary claimed it was on QuickJS-NG; I trust the README fetch, but this is a mild conflict [W].
- Repo state: 6.2k stars, 245 forks, 4 open issues, 15 PRs (fetch of GitHub Issues page). Open issues: no version tags (#18, #69), PIC bytecode (#53), `catch` variable already exists SyntaxError (#40); #80 (retained values) was addressed by `6d4d7eb`. There are no releases or tags, so pin by commit [W].
- Lobsters discussion: the fixed static buffer is seen as a weakness for multi-VM designs; no-hole arrays praised. No independent benchmark data.

## 2. Zinc's current QuickJS integration

Files read: `runtime/vm/quickjs.cpp` (333 lines), `runtime/vm/abi.h`, `runtime/include/zinc_abi.h` (94), `compiler/src/{emit-js,engines,abi}.ts`, `docs/engines.md`, `docs/engine-progress.md`, `tests/engines/run.mjs`, `plugins/script/**`.

### 2.1 Pipeline today

1. `buildEngine` (`engines.ts:14`) calls `emitAbi` (`engines.ts:19`, `abi.ts:25`) to produce `zinc_abi_generated.h` (per-export C adapters over `zinc_abi.h`) plus `core.abi.json`.
2. For `quickjs`: `emitJs(..., abi.imports)` (`engines.ts:33`; `emit-js.ts:13`) uses `program.emit` with a TS transformer (`emit-js.ts:22-363`), then `bundleJs` (`engines.ts:130`) copies the module graph as `.mjs` files with rewritten relative specifiers; no concatenation, the QuickJS module loader (`quickjs.cpp:217-230`) reads them from disk.
3. `run.mjs` for the engine (`emit-js.ts:388-389`) uses **top-level `await runMain(() => import(entry))`** and imports `sim/zinc.mjs` (766 lines across `sim/*.mjs`).
4. CMake is generated in `engines.ts:44-64`; the QuickJS target adds `plugins/script/vendor/quickjs/quickjs-amalgam.c` as a static library (`engines.ts:54-56`). The runner is `runtime/vm/quickjs.cpp` for quickjs, `main.cpp` for the VM (`engines.ts:47`).
5. CLI: `--engine` validated at `cli.ts:62`, help text `cli.ts:991`, engine name in build directory `cli.ts:234`, dispatch at `cli.ts:470-479`, hardcoded host-only rule `engines.ts:16` and `cli.ts:127-128`. Type `Engine` is `engines.ts:12`. Exports: `exportEngine` (`engines.ts:163`), which special-cases `quickjs` at `:171-177`.
6. Tests: `tests/engines/run.mjs:10` builds the engine list (`native`, `zinc-vm`, `zinc-vm-jit` on arm64, `quickjs`); `flags()` at `:11`; ~62 fixture programs are compared byte-for-byte across modes (`:29`), plus graphics capture, dynamic-library loading, invalid resource/unknown-module/timeout checks (`:206-224`).

### 2.2 What the emitted JS uses that mquickjs lacks

The TS program is created with `ts.ScriptTarget.ES2022` (`frontend.ts:60, 86`), so emit-js output is modern JS. Everything in the left column is emitted as-is:

| Emitted construct | mquickjs | Needs |
|---|---|---|
| ES module `import`/`export`, `import()` (`emit-js.ts:144-163`, bundler `engines.ts:143-145`) | no | Bundle to one script; CommonJS-style registry or scope-hoisting |
| top-level `await` in `run.mjs` (`emit-js.ts:388-389`) | no | Emit a different entry: `runMain(function(){ return require(...) })` |
| classes, `extends`, `super`, static fields, accessors | no | Downlevel; **`super.getter` breaks in TS's ES5 output** [V, I got `NaN`], `extends Error` broken |
| arrow, `let`/`const`, template, spread, destructuring, `?.`, `??`, default params | no | Downlevel (TS handles all) |
| generators, `async`/`await`, `for await` | no | TS `__generator`/`__awaiter` helpers plus a Promise polyfill; the `__values` helper needs `Symbol.iterator` [V: "Symbol.iterator is not defined"] |
| `Map`, `Set` (emit-js treats them specially: `Array.from(x.keys())`, `emit-js.ts:187-190`) | no | Polyfill with insertion-ordered arrays plus hashing for arbitrary keys |
| `Promise`, `queueMicrotask` (`quickjs.cpp:291`, `engines.md:38`) | no | Pure-JS Promise polyfill; drain from the C event loop |
| `Symbol` (`sim/zinc.mjs:81,262`: `Symbol.iterator`, `Symbol.dispose`) | no | Shim removal; downlevel iteration helpers replaced with array-only fast paths |
| BigInt in `sim/zinc.mjs:139-169` (fixed-point profiles `fx12/fx16`) | no | Rewrite fx math with double arithmetic or 2x32-bit splits; only matters for fx profiles |
| `Object.assign`, `.includes`, `.padStart`, `Array.from`, `.at`, `.startsWith`, `.flat`, ... | no | Small JS polyfill file, or add to the C stdlib table |
| `new Proxy` (in `tests/engines/run.mjs:96` used only as invalid-resource probe) | n/a | Test needs adjusting |
| Sparse arrays / out-of-range writes | TypeError | Zinc typed arrays already wrap `$z.set`; plain JS inputs may differ; matches native's bounds errors anyway |
| `Math.random`/`Date.now` overrides (`emit-js.ts:179-181`) | `Date.now` only | Provided by runner bootstrap |
| `console.*` (`$z.c_*`) | `print` only | Bootstrap maps console to `print` |

The 32-bit `|0`, `>>>0`, `Math.imul`, `Math.fround` narrowing that `emit-js.ts:32-45` produces is all ES5-safe (`Math.fround` and `imul` are present) [V].

### 2.3 Downlevel options

TypeScript is used as `@typescript/typescript6` 6.0.x by the frontend (`frontend.ts:3`, `package.json:8`); `typescript` 7.0.2 is only a devDependency.

- **Verified:** `ts.transpileModule(src, {target: ES5, module: CommonJS, downlevelIteration: true, ignoreDeprecations: '6.0'})` works in TS 6.0.3 here (scratchpad `bench/es5.cjs`, `bench/s1.js`). TS 6 deprecates `target: ES5` (needs `ignoreDeprecations`), and it is removed in TS 7 [I from the 6.0 deprecation message, not verified against release notes]. That makes ES5 emit a dependency on staying on `@typescript/typescript6`.
- **Recommended:** emit-js stays untouched (still ES2022 output, still the single semantic transformer). A new pass takes each emitted `.js` file and does `ts.transpileModule` to ES5 CommonJS, then wraps each in a module function and concatenates into one `bundle.js`, with a ~30-line `__zn_require` registry and the `zinc:*` builtin modules pre-registered. This adds the pass in `engines.ts` (a `bundleEs5` next to `bundleJs`), about 150 lines.
- **Alternative:** a hand lowering in emit-js. Higher risk. Rejected.
- Verified pitfall (scratchpad `bench/s1.js`): `class B extends A` with `super.y` on a getter gave `NaN` in TS's ES5 output. It needs either a Zinc-specific rewrite or a lint error. `extends Error` needs a helper.
- `sim/zinc.mjs` (~90 lines of helpers such as `idiv/imod/dto/get/set/c_log/dynfn`) must be re-authored as ES5 `sim/zinc.es5.js`, without `Symbol`, `BigInt`, `class` fields, `async` timers, `node:*`. About 1 day for the integer/float profile; more for fx.

## 3. ABI mapping onto the mquickjs C API

`ZincValue`/`ZincExport`/`ZincHost` (`zinc_abi.h`) are engine-neutral. The generated adapters (`abi.ts`) only touch `ZincValue`. So the adapter work is confined to a new runner `runtime/vm/mquickjs.cpp` (about the same 330 lines as `quickjs.cpp`, plus changes); `abi.ts` needs no change [I].

| Concern | QuickJS (`quickjs.cpp`) | mquickjs equivalent |
|---|---|---|
| Per-export function | `JS_NewCFunctionData(nativeCall, id)` `:212` | `JS_NewCFunctionParams(ctx, JS_CFUNCTION_zn_call, JS_NewInt32(id))`; `JSCFunction(ctx, JSValue* this, argc, JSValue* argv)` signature. `argv` is a pointer into the VM stack, which can move, so re-read via `argv[i]` after any allocating call [I] |
| Scalars in/out | `JS_ToInt32/Uint32/Float64`, `JS_NewInt32/Float64` | `JS_ToInt32/Uint32/ToNumber`, `JS_NewInt32/Float64`; **integers are 31-bit inline; larger ints become doubles or heap floats**, which is fine but `JS_NewUint32` may allocate |
| Strings | `JS_ToCStringLen` + `JS_FreeCString` `:164-165` | `JS_ToCStringLen(ctx, &n, val, &buf)` with a stack `JSCStringBuf`; no free; copy immediately into a `std::string` because the pointer dies on the next allocation [I] |
| `NUMBERS` / `BYTES` args | `JS_IsArray`, `JS_GetPropertyUint32` loops `:136-158` | Same loop; `JS_GetPropertyUint32`. Typed arrays exist, so `u8[]` could be zero-copy through a typed array API. I did not find a public accessor for the typed-array data pointer in `mquickjs.h` [I: needs check] |
| `RECORD` / `BYTES` results | `JS_NewObject`, `JS_DefinePropertyValueStr` `:174-190` | `JS_NewObject` + `JS_SetPropertyStr` (no `DefineProperty`; all properties are writable/enumerable/configurable); every allocation can move `obj`, so keep it in a `JSGCRef` [I] |
| Resources (opaque handle) | class + `JS_SetOpaque` + finalizer + weak cache map `resourceObjects` `:32,46-65` | `JS_NewObjectClassUser(ctx, JS_CLASS_ZN_RESOURCE, 0)` + `JS_SetOpaque` + entry in the finalizer table. **No identity cache**: a C++ `map<handle, JSValue>` would hold stale pointers after compaction and a strong `JS_AddGCRef` would leak. Options: JS-side `WeakMap` (absent) or accept that `identity true` in `tests/engines/resources.ts` (`run.mjs:92`) fails until a weak table is built (e.g. keep handle-to-object in a JS array with lazy sweeping) |
| Callbacks retained by native (`ZINC_CALLBACK`) | `JS_DupValue` in `GuestCallback` `:66-69,118` | The closure must live in GC-visible storage. Use a fixed-size JS array in a global (`__zn_cb[id]`) with a C++ free list of ids, or `JS_AddGCRef` with a non-LIFO list (`JS_DeleteGCRef` on release). **Do not use `JS_PushGCRef` (LIFO)**. Reentrancy: callback invoke = `JS_StackCheck`, `JS_PushArg` x N, `JS_Call` (`mqjs.c:215-221`) [V pattern] |
| Callback arg/result conversion | `values.args` vector of `JSValue` `:72-86` | Same but each `JS_New*` can trigger GC; for strings, create last or push each arg immediately with `JS_PushArg` |
| Exceptions | `JS_Throw`, `JS_GetException`, `JS_GetPropertyStr(e,"message")` | `JS_Throw`, `JS_GetException`; helpers `JS_ThrowTypeError`, etc. exist. Stack text: `e.stack` exists in mqjs output [V] |
| Timeout | `JS_SetInterruptHandler(rt, fn, opaque)` `:267` | `JS_SetInterruptHandler(ctx, fn)`, uses `JS_SetContextOpaque` for the deadline. Coarser (10000-op counter), fine [V] |
| Memory limit | `JS_SetMemoryLimit(rt, 512 MiB)` `:266` | Size of the buffer passed to `JS_NewContext` (new flag `ZINC_MQJS_HEAP`, mirror of `ZINC_VM_HEAP_BYTES`) |
| Stack limit | `JS_SetMaxStackSize` | None needed; the VM does not use the C stack [README:19]. Depth limited by heap |
| Promise jobs | `JS_ExecutePendingJob` `:106,300` | Not applicable: no native Promise. The polyfill's microtask queue is a JS array drained by a C call to `__zn_run_jobs()` at the same points (`quickjs.cpp:104-109,300`) |
| Module loader | `JS_SetModuleLoaderFunc` + `JS_NewCModule` `:204-230` | None. Bundle registers `zinc:*` and `zinc:native/*` as pre-populated modules in the JS registry (built at startup from the ABI table via `JS_NewCFunctionParams`) |
| Process env and timers | `service()` magic-indexed C fns `:231-249`, JS bootstrap `:282-293` | Timers as stdlib C functions (`setTimeout` is already there), or host timers reimplemented as in `quickjs.cpp`; bootstrap in ES5 |
| Sandbox (`zinc:script` plugin) | separate integration `plugins/script/native/quickjs.host.cpp` (667 lines) | Unchanged; a future `engine: 'mquickjs'` for `new Script()` is a separate, smaller project, and the natural first use for mquickjs (Section 6) |

Not verified: I did not compile the adapter.

## 4. Design: `--engine mquickjs`

### 4.1 CLI and build

- `compiler/src/cli.ts:62` add `'mquickjs'` to the accepted list; `:991` and `:1061` help; `:113` `--native-library` accepts it; `:470` unchanged (already `!== 'native'`).
- `engines.ts:12`: `type Engine = 'native'|'zinc-vm'|'quickjs'|'mquickjs'`. Build directory falls out of `cli.ts:234` as `mquickjs-<name>-<target>`.
- Vendor mquickjs at `plugins/script/vendor/mquickjs/` (or `runtime/vendor/mquickjs/`): `mquickjs.c`, `mquickjs.h`, `mquickjs_priv.h`, `mquickjs_opcode.h`, `cutils.[ch]`, `dtoa.[ch]`, `libm.[ch]`, `list.h`, `softfp_template*.h`, `mquickjs_build.[ch]`, LICENSE; pin commit `6d4d7eb`. About 600 KB of source.
- Generated stdlib: CMake builds the host tool `mquickjs_build` from `zinc_stdlib.c` (a trimmed copy of `mqjs_stdlib.c` with Zinc additions: `__zn_call` param function, `print`, host timers, performance/Date shims, extra Array/String/Object natives) and emits `zinc_stdlib.h`. Two-stage CMake (`add_executable` host tool, `add_custom_command`). About 1 day of CMake in `engines.ts:44-64`, which currently hardcodes text templates.
- Runner: `runtime/vm/mquickjs.cpp` selected at `engines.ts:47` (`engine === 'mquickjs' ? 'mquickjs.cpp'`); flags `-O2 -fno-strict-aliasing`? (not checked).
- Native link: `add_library(mqjs STATIC ...)` mirroring `engines.ts:54-56`.

### 4.2 Program pipeline

```
sema -> emitJs (unchanged, ES2022 modules, nativeImports map)
     -> bundleEs5: per-module ts.transpileModule(ES5, CommonJS, downlevelIteration, ignoreDeprecations)
                   + registry runtime + sim/zinc.es5.js + polyfills.js (Promise, Map, Set, Array/String/Object gaps)
                   + entry: runMain(function(){ __zn_require(entry) })
     -> bundle.js (one strict ES5 script)
     -> (optional) mqjs-compile: JS_Parse + JS_PrepareBytecode -> app.mqbc  (`-m32` when target word size is 32)
```
Reuse of `emit-js`'s `nativeImports` mapping is intact: the bundler resolves `zinc:native/X` to registry names the runner pre-populates.

Entry differs from `emit-js.ts:388-389` (top-level await); add an `emit-js` option or write the entry in the bundler.

### 4.3 Precompiled bytecode

`mquickjs.cpp` accepts `program.js` or `program.mqbc` (`JS_IsBytecode`, `JS_RelocateBytecode`, `JS_LoadBytecode`, `JS_Run`). The compile step is done with the same runner (`--compile out.mqbc`) so the version matches; store the mquickjs commit and word size in `engine.json` (as `engines.ts:77` does for the core). Bytecode is not verified, so treat it like the VM's `--core` scripts: trusted only, hash-checked; document this next to `docs/engines.md:57-59`.

### 4.4 Flags and limits

- `ZINC_MQJS_HEAP_BYTES` (default 8 MiB desktop; the runner mallocs the buffer once); `--mq-heap=<n>[k|m]` CLI option maps to it.
- `ZINC_EXECUTION_TIMEOUT_MS` reused via `zinc::deadline()` and `JS_SetInterruptHandler`.
- `ZINC_MQJS_STATS=1` prints `JS_DumpMemory` JSON-ish, parallel to `ZINC_VM_STATS`.
- A `--gc-stress` debug flag builds with `-DDEBUG_GC` (README:251), which runs the whole fixture set under move-every-allocation.

### 4.5 Test matrix changes (`tests/engines/run.mjs`)

- `:10` add `mquickjs` to the list; `:11` flags; `command()` `:20-27` already generic via `engine.json` entry.
- Introduce a per-fixture `skip[engine]` allowlist with reasons, so parity gaps are explicit rather than silent.
- `:206-224` (QuickJS-only import probes) need an mquickjs variant; module syntax tests would use ES5 `require`-style snippets or be skipped.
- Add `--gc-stress` runs of the bytes/records/callbacks/resources fixtures.

### 4.6 Parity gaps versus the current four-mode matrix

Predicted, not run.

1. `resources.ts` object identity (`"identity true"`): no WeakMap. Needs a design decision (Section 3).
2. Promise/async ordering fixtures (`async`, `async-control`, `promise-order`, `suspend-order`, `promise-timers`, `promise-chains`, `promise-all`): depends on a polyfill matching native microtask order exactly; tractable, but 7+ fixtures.
3. Generators family (`generator-*`, 7 fixtures): TS `__generator` works without Symbols if `__values` is patched; `for-of` over user iterators is not possible natively, so the ES5 output must use array paths.
4. `classes`, `accessors`, `bind`, `instanceof`, `static-fields`, `generic-inheritance`: `super` accessors and custom Errors need work (Section 2.3).
5. `collections`, `map-undefined`: Map/Set polyfill semantics (ordering under mutation, `undefined` keys, NaN keys).
6. `strings`, `string-*`, `replace-all`, `stdlib-path`, `string-format`: UTF-16 semantics verified [V]; case conversion only ASCII (`toLowerCase/UpperCase`), regexp case folding ASCII only (README:161-168). Unicode fixtures will diverge. Missing `localeCompare`, `padStart`, `includes`.
7. `native-library`, dynamic-lib tests (`run.mjs:71-111`): should pass, engine-neutral.
8. `bytes`, `records`: fine after copy loops; watch for compaction bugs (use `--gc-stress`).
9. `events`, `services`, `graphics`: depend on host loop plus timers (`quickjs.cpp:298-321` logic ported).
10. `Proxy` probe (`run.mjs:96`) and `import()` probes (`:209`): irrelevant/skip.
11. Typed `number` fx profiles (`sim/zinc.mjs:139-169`) use BigInt: rewrite or skip fx profile for mquickjs.
12. Error stacks and messages: text differs (like `docs/plugins/script.md:118-120`).
13. Runtime limits: `heap-limit` style test differs (buffer exhaustion throws `InternalError: out of memory`; message text must be normalised) [I].
14. `zinc:script` inside the app (nested Script instances): not applicable; nested contexts would need a second buffer.
15. Timing kernels: fib/mandelbrot would run (ES5 code path is trivial); the `100000 native calls` and callback kernels exercise the ABI adapter heavily.

## 5. Effort (working days; one developer; assumes the spike works as tested)

| Milestone | Deliverable | Days |
|---|---|---|
| M0 spike | Vendored engine, CMake with generated stdlib, `mquickjs.cpp` runs a hand-written ES5 script with `print` and timeout | 2 |
| M1 bundler | `bundleEs5`, ES5 `sim/zinc.es5.js`, polyfills (Array/String/Object gaps), entry without TLA; scalar + math + string fixtures pass | 6-8 |
| M2 ABI adapter | scalars, strings, bytes, numbers, records, resources, callbacks, exceptions, GC-safe conversions; `native.ts`, `bytes`, `records`, `callbacks`, `resources` fixtures; `DEBUG_GC` run | 5-6 |
| M3 async and event loop | Promise, microtask drain, timers, `queueMicrotask`, rejection tracking, generators/async via TS helpers; Map/Set polyfill | 5-7 |
| M4 matrix parity | fifth mode in `run.mjs`, allowlist, fix fixtures until agreement, `zinc test`/`dev`/`capture`/`export` engine plumbing (`cli.ts:754,798,844`, `engines.ts:163`) | 6-10 |
| M5 graphics/UI demos | Frame loop, `zinc:gfx` adapters, UI library (`lib/std/ui.ts`, `react.ts`, `solid.ts`) compiled to ES5; pixel-compare with native (`engine-forms-pixels`) | 5-8 |
| M6 bytecode and export | `.mqbc` compile/run, `-m32`, engine.json fingerprints, `--mq-heap`, `ZINC_MQJS_STATS` | 3-4 |
| M7 embedded targets | Freestanding runner for ESP32 / rpi1 (needs `zrt` HAL there; I did not inspect target HALs) | 5-8 |
| **MVP (M0-M2)** | native ABI works on ES5 fixtures | **12-15** |
| **Host parity (M0-M6)** | | **32-45** |
| With targets (M7) | | **37-53** |

The largest uncertainty is M5: whether the UI framework code (`lib/std/react.ts`, `solid.ts`, `ui.ts`, `kit/*`) survives ES5 downlevel plus the 31-bit-int/boxed-double performance profile. I did not test it. The `examples/hero` tree, `docs/engines.md:274-276` reports QuickJS building only 16/58 demos even today, so mquickjs would start behind that.

## 6. Where mquickjs helps and hurts, per target

| Target | mquickjs versus QuickJS | Notes |
|---|---|---|
| **ESP32** (~320-520 KB SRAM, often 2-8 MB PSRAM) | **Better; the only viable one** | 10 KB minimum RAM, ~100 KB ROM, bytecode run from flash, no `malloc`, no C-stack recursion, soft-float capable. Full QuickJS (about 210 KB code, malloc heavy, refcount) is a poor fit. Existing ESP-IDF components [W] show it works. The Zinc VM (typed register bytecode, own heap) is the other candidate here. Caveat: ES5 and stricter-mode constraints apply to app code; the Zinc UI framework may not fit in internal RAM. |
| **Raspberry Pi 3B+** (1 GB RAM, Cortex-A53, armv7/aarch64) | Neutral to slightly worse | RAM is not the constraint. mqjs about 20% faster on call-heavy code, about 10% slower on float code in my M1 measurements [V, other arch not measured]. Loses ES modules, async, classes, all natively. Bytecode `-m32` if the userland is 32-bit. The Zinc VM JIT is aarch64-only (`engines.md:41`); QuickJS is the straightforward choice, mquickjs is an option for a low-RAM Pi Zero (`rpi1` target exists in `plugins/script/plugin.json`). |
| **reMarkable Paper Pro** (i.MX 8M Mini class, aarch64, 2 GB) | Worse | Same as Pi; nothing to gain in RAM or speed; UI redraw speed dominated by the framebuffer path. |
| **iOS** | Slightly attractive, otherwise neutral | JIT is forbidden for third-party apps (Zinc VM JIT excluded); both engines are interpreters, and both are allowed by the App Store when scripts ship in the bundle (I did not check policy). mquickjs's benefits: small binary (about 270 KB with readline; less without), deterministic memory buffer, easy relocation of precompiled bytecode. Costs: ES5 authoring for scripts; a 31-bit integer model that boxes larger numbers. |
| **Desktop (macOS/Linux)** | Slightly better startup and RAM, similar speed | Useful as a differential-testing engine: a third semantics reference that stresses GC-moving bugs (`DEBUG_GC`). |

Other observations:
- mquickjs's compacting GC and no-`malloc` model actually gives Zinc a stricter memory budget test than QuickJS: heap-limit fixtures become deterministic.
- Strict-mode restrictions are a subset of JS, which is aligned with Zinc's typed-array semantics (no holes, `pop` on empty gives `undefined` still, needs `?? default` from emit-js:167-172).
- The runtime has a single context per buffer and no threads; the `zinc:script` plugin's "many Script instances with independent limits" is achievable with one buffer each but at a fixed cost per instance.
- Maintenance risk: no releases or tags; single-author; pin by commit. TS ES5 deprecation adds a second pin.

## 7. Recommendation

1. Do M0 (2 days) as a spike, in a branch, to prove the vendoring, generated stdlib and one `JS_NewCFunctionParams`-based native call.
2. Decide the first product use case before investing beyond M2. If it is "run Zinc apps on ESP32-class hardware", M1-M2 plus M7 is the right path and mquickjs is the only candidate besides the Zinc VM. If it is "a fourth desktop engine for parity", the value is mostly differential testing, and the 35+ day parity cost is hard to justify.
3. The `zinc:script` embedding (`ScriptEngine` interface at `plugins/script/index.ts:56`) is a much smaller first integration (an `engine: 'mquickjs'` option: sandboxed ES5, fixed memory budget, interrupt). It also avoids the entire downlevel/bundle problem because scripts are ES5 authored. Estimated 6-8 days [I].
4. Do not attempt `--engine mquickjs` for Pi/rM/iOS UI apps unless memory or binary-size numbers show a need.

## Reproduction

Everything under `scratchpad/`: `mquickjs/` (built, `mqjs` binary), `mq_o2/` (-O2 build), `bench/{fib,mandel,objs}.js`, `bench/qmain.c` (QuickJS-ng runner), `bench/es5.cjs` (TS 6 ES5 transpile), `bench/s1.js` (downlevel test). Commands: `./qjs_ng fib.js` versus `../mquickjs/mqjs fib.js`; `mqjs --memory-limit 10k -e 'print(1)'`; `mqjs -o x.bin x.js; mqjs -m32 -o x32.bin x.js; mqjs -b x.bin`.

## Sources

- https://github.com/bellard/mquickjs (README, `mquickjs.h`, `mquickjs.c`, `example.c`, `mqjs.c`, `mqjs_stdlib.c`, issue #80, commit 6d4d7eb)
- https://simonwillison.net/2025/Dec/23/microquickjs/
- https://lobste.rs/s/60fjs1/mquickjs_micro_quickjs_javascript
- https://github.com/mitchellh/zig-mquickjs
- https://components.espressif.com/components/makgordon/esp-mquickjs/versions/0.1.0-beta/readme?language=en
- https://github.com/conoro/mquickjs, https://github.com/99percentpeople/esp32qjs
- https://blog.adafruit.com/2026/01/05/vibe-coding-an-esp32-version-of-micro-quickjs/ (403 on fetch, title only)
- https://github.com/mattneel/three-native
- https://github.com/HarlonWang/mquickjs-kmp
- https://www.phoronix.com/news/Micro-QuickJS
- https://tisankan.dev/embedded-javascript-engine/ (discounted: placeholder benchmark values)
