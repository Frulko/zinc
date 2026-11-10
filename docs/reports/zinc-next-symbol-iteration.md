# Symbols and iteration (ZN-161.02)

The typed engines use distinct reference-counted symbol carriers with primitive semantics. `typeof`, equality, descriptions, registry lookup, explicit `String`, and implicit coercion distinguish these values from ordinary objects. Symbol-keyed properties live separately from string keys in dynamic-object attributes. String reflection and JSON omit them; symbol reflection and enumerable copying retain their identity. `Symbol.iterator`, `Symbol.asyncIterator` and `Symbol.dispose` have canonical per-program identities. Their Cold → Ready initialization is lazy; each identity and the registry has one transition function. Type annotations resolve independently of a shadowed value named `Symbol`.

No Zinc opcode, Slot, object header or wire representation changes. The five runtime rows are appended after existing rows. Table owns one optional insertion-order sidecar (no registry, observer pointers, derived allocations or ownership cycles). An iterator retains its collection; the sidecar stores only integer IDs. Rehash compacts IDs with entries, delete/reinsert gets a new ID, and clear releases the ID vector while retaining the increasing counter. Exhaustion is permanent and clears the iterator's backing reference.

Array loops retain their direct indexed path. String loops advance directly by Unicode code point, using the same existing code-point operations as explicit string iterators. General acquisition caches the next method once. Ready → Body → Closed transitions distinguish next/done/value failures from failures after a successful value, so break, return, throw and same-loop continue have the correct close behavior and exception priority. Destructuring also acquires/closes empty patterns, skips elision value getters, and closes after default or assignment-target failures. Shared sort-callback unwinding preserves the thrown object through runtime re-entry on interpreter and AOT.

The QuickJS change is a native engine fix, not a Symbol polyfill or prototype patch. Patch 0007 adds an IteratorStep-only opcode for elisions and private bytecode version 29. Existing version 28 local caches fall back to source; stale bytecode without source is rejected. A scoped serialization flag rejects Symbol values and unsupported iterator carriers as DataCloneError, ignores symbol property keys, and observes enumerable string getters once. Ordinary generic QuickJS serialization keeps its previous behavior. No upstream submission was made.

Typed structured cloning retains its existing documented JSON subset: Map, Set, Date, cycles, NaN and undefined members are outside that parity contract. The new validation and encoding share one traversal. Symbols and built-in iterator carriers are rejected, including nested values; ordinary allowed records keep their contract. The worker schema also rejects these new values. User-defined plain iterator records retain the existing worker/clone data contract.

D275 remains in force: typed Map/Set `keys`, `values` and `entries` return snapshot arrays, including the QuickJS source adapter. Genuine `[Symbol.iterator]()` and `forEach` separately use live order. Full `for await`, iterator helpers, Symbol wrapper objects, general computed class members, other well-known hooks and `unique symbol` annotations remain outside the typed profile. Existing `Symbol.dispose` class syntax is retained. Existing strict-profile diagnostics (including delete) remain explicit.

## Exact proof

`tests/data/symbols/{main,dynamic,clone}.ts` are compared with Node 26.5.0 output after TypeScript syntax erasure (`tsc --noCheck --alwaysStrict --target es2022 --module esnext`), interpreter, AOT and QuickJS. `native.js` adds an independent plain-JavaScript elision/getter regression (the Node harness uses its native global structuredClone for the Zinc import). `lifetime.ts` checks backing-reference release and clear storage, and `zinc mem --check-leaks` checks destruction. Negative fixtures cover `new Symbol`, checked forged symbols and worker boundaries. The seconds-long `symbols` T0, the exact `qjs_bytecode` T0 and `tools/quickjs-patches check` pass. No tier, demo, benchmark, conformance, fuzz or CI suite was run.

## Storage and artifact sizes

On this arm64 Mac, Table is 120 bytes and MapObj 136 bytes: the lazy owner adds one 8-byte pointer. IterationOrder is 32 bytes, and 128 IDs use 1,024 usable bytes. The two-u32 cursor occupies two Slots: 16 bytes of vector payload/usable allocation, plus the 40-byte logical ArrObj header and allocator rounding. It is not an 8-byte physical allocation. Clearing the sidecar leaves zero vector capacity and preserves its sequence counter. Both sidecar and vector use the existing accounted runtime allocator, and Map memory statistics include their storage.

Paired tiny artifacts use identical output basenames and sources, the common frozen compiler SHA-256 `54114b62024f586d835630c7964bfa7e037f93c989b8d9464961b04beea46a9b`, its adjacent archives, and this task's compiler/archives. The measured feature compiler for these tiny artifacts is `ae41181414e25c27912cf1d9e73e3d99945051fda8ca07e671192b701358a723` (the later no-Symbol for-of fallback fix does not change these cases).

| Program | Native bytes | Generated C++ bytes |
| --- | ---: | ---: |
| Common ordinary array loop | 254,584 | 4,362 |
| Feature compiler, same loop | 254,584 | 4,877 |
| Unreachable Symbol function plus same loop | 254,584 | 9,368 |
| Symbol construction / typeof / String | 455,096 | 22,265 |
| Explicit array iterator | 455,096 | 23,337 |

The native addition is zero for an unused Symbol function, but generated source still retains 4,491 bytes of dynamic layout/global metadata beyond the feature compiler's ordinary loop. There is no zero-source-cost claim. The Symbol-used native addition is 200,512 bytes in this tiny case, mostly the existing dynamic/runtime-call linkage. Lazy initialization avoids allocating the registry and unrelated well-known identities in the symbol-only program. Ordinary loops have no Symbol globals.

Final compiler SHA-256 `741efb5047ccac5a1715febe3a93921b5ed7d4e02ced6bde30c789cdd3dfde3b` produced Hero native **7,978,168 bytes**, unchanged from the common baseline. Its 57 C++ units total 9,237,367 bytes; the shared header adds 302,478 and the cached PCH wrapper 60: **9,539,905 inclusive bytes** (+2,526 versus the supplied 9,537,379-byte baseline). The original Hero program was not rewritten.

The unchanged raw kit gate passes: JavaScript direct/index/ten are **236,192 / 246,407 / 283,256 bytes**, exactly the baseline. The unused difference is 10,215 bytes (25 bytes below 10,240), and the nine-component aggregate is 36,849 bytes (15 below 36,864). Native direct/index/ten are **5,193,448 / 5,259,552 / 5,778,208 bytes**: unused families add 66,104 against 163,840; the measured per-component average is 57,628 against 65,536.

Proof files remain in `.logs/symbol`: `sizes/tiny.json`, `sizes/hero-size.json`, `kit-size.log`, semantic engine outputs, `t0-symbols.log`, `t0-qjs-bytecode.log` and `patches.log`. No generated app artifact is committed. The strict existing budgets are unchanged: Hero native below 8,000,000 bytes, inclusive generated source below 10,000,000; kit unused and aggregate component limits retain their original thresholds.

## References and follow-up proposals

The implementation follows the [Symbol constructor](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-symbol-constructor), [ToPropertyKey](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-topropertykey), [GetIterator](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-getiterator) and [TypeScript symbol documentation](https://www.typescriptlang.org/docs/handbook/symbols.html). The existing [QuickJS implementation](https://github.com/quickjs-ng/quickjs/blob/master/quickjs.c) supplies native symbol storage and iteration on that engine; the patch queue records the two exposed native boundary defects.

Proposed later work: prune unread generated globals and unreachable dynamic layout metadata only after a separate reachability audit; this task records their measured source cost without changing the optimizer's global ABI roots. Cross-profile and other-machine coverage, broader structured-clone parity, and optional JSC/V8/Hermes execution remain milestone work. No new task or decision number is allocated here.
