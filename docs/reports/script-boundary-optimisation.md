# The zinc:script boundary: where the time goes and what to change (2026-10-18)

Measured on three machines with `next/tools/bench-bridge` (program: `next/tests/bench/script_bridge`; artifacts: `docs/reports/bench/`).
Tags: `[measured]` = a number from the bench on the machine named; `[code]` = read in this tree; URLs = web, read through search results only, not whole pages;
`[general]` = my knowledge, not checked here.

## 1. The finding

A call across the typed Zinc <-> QuickJS boundary costs 1.0 us on the Mac, 62 to 95 us on the Nexus 7 and 82 us on the TouchPad `[measured]`.
The same boundary written directly against QuickJS, with the values converted without JSON text (`floor.c`), costs 0.04 us, 0.72 us and 1.07 us `[measured]`:
**20 to 118 times less.** The difference is the marshalling, not the interpreter, not the kernel, not the allocator.

| Case (us per unit) | Mac now | Mac floor | x | Nexus 7 now | floor | x | TouchPad now | floor | x |
|---|---|---|---|---|---|---|---|---|---|
| script -> host call, a number | 1.02 | 0.040 | 25 | 61.6 | 0.72 | 86 | 82.1 | 1.07 | 77 |
| 10k-cell map, one call per cell | 0.83 | 0.041 | 20 | 47.6 | 0.73 | 65 | 69.8 | 0.83 | 85 |
| 10k-cell map, one array handed over | 0.126 | 0.031 | 4 | 3.66 | 0.65 | 6 | 6.00 | 0.61 | 10 |
| 5,000 UI ops, one call each | 1.12 | 0.040 | 28 | 61.3 | 0.78 | 79 | 100.2 | 0.85 | 118 |
| 5,000 UI ops, one flat array | 0.45 | 0.140 | 3 | 11.0 | 2.23 | 5 | 17.8 | 2.09 | 9 |

At 60 Hz, 1 ms buys 980 / 16 / 12 crossings today (Mac / Nexus 7 / TouchPad) and about 25,000 / 1,400 / 940 at the floor.

## 2. Where the time goes `[code]`, `[measured]`

`next/src/qjs/script_native.cpp` says it itself (line 4): "Values cross as JSON text". For one script -> host call:
1. `argsJson` builds a JS array and copies the arguments into it (line 297).
2. `toJson` creates a replacer function with `JS_NewCFunctionData` and runs `JS_JSONStringify` with it (lines 103-106); the replacer is called for every value.
3. the text is copied into a `std::string`, handed to the Zinc side, and parsed again there into typed values;
4. the result goes the other way: text, `JS_ParseJSON`, then `revive` walks the tree (line 153-158).

The Mac profile (`sample`, 8 s on `script_to_host_scalar`, `docs/reports/bench/profile-mac-script_to_host_scalar.txt`) has `strtod`, `fastParse64`, `_ffpp_strtoencf64_l`, `localeconv_l`,
`_tlv_get_addr`, `memmove` and `memset` at the top: number parsing and formatting plus allocation, which is what text costs. Application frames show as `???` (the AOT binary's symbols are not
resolved by `sample`); a symbolised build would name them.
On the Nexus 7, `strace -c` over 6 s shows 23,000 `clock_gettime` and 23,000 `madvise` calls at about 0 us each: the kernel is not the cost. `simpleperf` produced no record file on that kernel (3.1),
so there is no user-space profile from the device; the floor measurement stands in for it.
On the ARMv7 tablets the text path costs more than the interpreter does (the JavaScript loop is 16 to 17 times slower than on the Mac, the crossing 60 to 90 times), which fits float parsing and
formatting in software (softfp ABI) and a slow libc; not isolated.

**A correction to an earlier reading.** The first bench showed JSON and "Dyn" snapshots within 1.3 to 2.2 times of each other, and I concluded that the format was not the problem. Both paths are
JSON text (D22), so that comparison could not show it. The floor shows the format is the problem.

## 3. What others do (so we learn from what is robust)

Honest limits: the searches returned few hard numbers; the table says what each source supports.

| System | Technique | What it supports for us | Source |
|---|---|---|---|
| LuaJIT FFI | calls to C are declared with types and inlined by the JIT; the classic Lua C API cannot be inlined; "widely accepted" that C API calls cost much more than in-Lua or FFI calls | typed declarations at bind time remove the generic marshalling | https://luajit.org/ext_ffi.html, https://lua-users.org/lists/lua-l/2014-10/msg00363.html |
| LuaJIT, light userdata setter | about 22 ns per call on an i7-6700K, flagged idealised by its author | a native call can be tens of ns; ours is 1,000 ns | https://github.com/blep/luajit_perf_poc |
| V8 Fast API calls | the embedder registers a typed C++ function beside the generic one; the compiler checks types and calls it directly; it must not allocate on the JS heap; a slow path stays for what does not fit | a typed fast path with a generic fallback, same function | https://chromium.googlesource.com/v8/v8.git/+/main/include/v8-fast-api-calls.h |
| "Dr Wenowdis" (PLDI SOAP 2024) | typed-method metadata lets the interpreter cut call and return overhead of C extensions | the metadata we already have (the `.spec.ts` types) is enough to specialise | https://pldi24.sigplan.org/details/SOAP-2024-papers/1/Dr-Wenowdis-Specializing-dynamic-language-C-extensions-using-type-information |
| Interpreter composition (arXiv 1409.0757) | microbenchmarks of crossing costs: tiny callee, loops on both sides, callees that return lists | the same shapes as our cases; a method to compare | https://arxiv.org/pdf/1409.0757 |
| WebAssembly component model | the canonical ABI lifts values out of one side's memory and lowers them into the other's: a schema-driven copy, not text | a binary, schema-driven encoding is the standard answer | https://component-model.bytecodealliance.org/print.html |
| Wasmtime | entering Wasm cost about 80 ns, 20 ns after a lock was removed (2020, macOS) | per-call fixed costs are worth hunting at this scale | https://github.com/bytecodealliance/wasmtime/pull/2759 |
| QuickJS(-ng) C API | `JS_NewCFunction2` takes a prototype enum and a `magic` int; the enum includes `JS_CFUNC_f_f` and `f_f_f` (from my knowledge: doubles passed directly, no `argv` array); `JS_NewArrayBuffer` wraps native memory without a copy | the engine already has the hooks | https://www.mintlify.com/quickjs-ng/quickjs/api/functions/creating (check `quickjs.h` of our version) |

Not found: nanosecond figures for QuickJS C calls, rquickjs host calls or wasm3 imports; `floor.c` is our own number (40 ns on the Mac).

## 4. What to change in the core

Ordered by gain over risk; every step is measured by re-running `tools/bench-bridge <target>` and compared with `tools/bench-bridge floor <target>`.

1. **S: no replacer, no intermediate array for plain values.** When every argument is a number, string, boolean or null (the common case), skip `JS_NewCFunctionData` and the temporary
   array; format the text directly. Keeps the protocol, removes two allocations and the per-value callback. Expected: a few times on all machines (not measured).
2. **M: a binary value encoding instead of JSON text on the native C ABI** (`unknown` today). A tagged buffer: one tag byte (undefined, null, false, true, int32, f64, string, array, object, function
   handle) plus the payload, numbers as raw bytes, strings length-prefixed, keys interned per call. Both ends convert directly (JS value <-> buffer, Dyn <-> buffer): no `strtod`, no `snprintf`,
   no text parse. It also fixes what D22 lists as lost by JSON (NaN, `undefined` inside arrays; cycles still need a depth limit). Expected: most of the gap to the floor for scalars and small values.
3. **M: typed fast paths for `expose`, as V8 does.** The signature is known when the function is exposed (`(number, number) => number`): register the QuickJS function with a prototype and a magic
   number that converts `argv` straight to typed arguments and calls a typed entry of the Zinc side, with the generic path as the fallback for `unknown`. This is the 0.04 us case.
4. **M: zero-copy bulk data.** An API for bytes and typed arrays that wraps native memory (`JS_NewArrayBuffer`, `JS_GetArrayBuffer`) plus handles to native objects with finalizers
   (the Hermes/JSI `HostObject` idea). Use for maps, images, sound; not for mutation lists: the floor shows that filling a typed array from JavaScript costs more per UI op
   (2.0 to 2.4 us on the tablets) than one direct call (0.7 to 1.1 us), so once a crossing is cheap, UI mutations should go call by call and in larger grains, not through a buffer.
5. **S: remove per-call heap traffic** on the boundary (a reused buffer for the text or the binary form instead of a new `std::string`), and check mimalloc's purge (`madvise`, 3,800 a second on
   the Nexus 7 at 0 us each: not a cost now, worth a look only if memory pressure matters).
6. **A guard, not a change:** a `bench-gate` style check on `ref`-normalised ratios (`script_to_host_scalar` over `ref_js_loop`) so that a later change cannot bring the text back unseen.

Risks: semantic fidelity (what `undefined`, NaN, -0, big integers, sparse arrays and getters do), error and exception propagation through the new path, function handles and their lifetime
(the `__zn_fn` handles of lines 90-96), cycles, string encoding (UTF-8 against QuickJS's internal forms), and the AOT and interpreter engines keeping the same behaviour (the T1 `script` test
compares frozen outputs: `next/tests/t1/script.sh`). The binary encoding is a change of the native ABI: other natives that pass `unknown` need the same decision.

## 5. How to measure

```sh
tools/bench-bridge mac | android | webos          # the table, one JSON artifact per target in docs/reports/bench/
tools/bench-bridge floor mac | android | webos    # the same cases in C, no JSON: the target to approach
tools/bench-bridge profile mac|android|webos CASE [SECS]   # one case in a loop with a profiler (sample / strace)
tools/bench-bridge show A.json B.json ...         # side by side, ratios to the JavaScript loop, crossings per ms
```

Not covered yet: strings of different lengths through objects, error paths, memory, a symbolised profile, `simpleperf` on the Nexus 7 (needs a kernel with perf events or a different tool),
the iPad (iPadOS 16.7 is not supported by Xcode 26's CoreDevice: `pairingState: unsupported`).

## 6. Done on 2026-10-18 (items 1 and 3 of section 4, for numbers)

- Plain values on the generic path: no temporary array, no replacer function, no JS_ParseJSON (`scalarJson`, `scalarFromJson`, `fastArgs` in `next/src/qjs/script_native.cpp`): about 2 times faster.
- `zinc:script/fast` (`plugins/script/fast.ts`, module `QuickJSFast` in the same file): `exposeNum` and `callNum`, numbers only, no text, no Dyn, no context: 8 to 51 times faster than before,
  within 1.4 to 2.3 times of the floor. Numbers: `docs/reports/zinc-next-perf.md` (addendum "after the boundary changes").
- Test: `tests/conformance/script_fast.ts` (frozen output, interpreter and AOT through `tests/t1/script.sh`; edge cases: escapes, unicode, -0, NaN, large integers, nested values, errors in both directions).
- Not done: the binary value encoding for objects and arrays (item 2), typed callbacks for strings (the fast path takes numbers only), zero-copy buffers (item 4), the guard in `bench-gate` (item 6),
  the Zinc-side `JSON.stringify` / `JSON.parse` of the generic path (what a generic host -> script call still pays: about 0.9 us on the Mac, 62 to 75 us on the tablets).
- One finding on the way: filling a buffer from JavaScript costs more per UI operation than one fast call, so the fast path, not a command buffer, is the way to send mutations.
