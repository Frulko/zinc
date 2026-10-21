# JavaScript speed: QuickJS, quickjs-oxide, V8, and where the speed comes from

Status: research only. Date 2026-10-20. Builds on D13, D36, D44, D55, D56 (`docs/reports/zinc-next-decisions.md`), the JS library table of `docs/reports/zinc-next-perf.md` (D110) and [../research-2026-09-30/js-engines.md](../research-2026-09-30/js-engines.md). Tags: **[M]** measured earlier in this repository (source given), **[W]** web source, **[I]** inference.

## quickjs-oxide (PocketJS, announced 2026-10-20) [W]

A JavaScript engine modelled after QuickJS, written from scratch in Rust by AI then cleaned by hand, no `unsafe`, no dependency except for BigInt. One month to a "high" Test262 pass rate (no figure given), one month of clean-up with a stack VM and reference counting, then two days to rewrite the core as a **register VM**. Claims: faster than most non-JIT engines on V8 v7 and Octane, about 30% more memory than QuickJS.

Their video, one Mandelbrot program (3720x200, identical pixels), each engine's CLI, Ryzen 7 7840HS, `Date.now()`, median of 3:

| Engine | Time |
|---|---:|
| JavaScriptCore, JIT off (LLInt) | 1.89 s |
| quickjs-oxide 0.3.1 | 2.54 s |
| Brimstone (Rust) | 2.88 s |
| QuickJS (C) | 3.42 s |
| V8 jitless (Ignition) | 3.53 s |
| Duktape | 3.87 s |
| Boa, MuJS | cut at 11.32 s (86% and 18% drawn) |

Caveats [I]: one float-heavy loop, the best case of a register VM; library code (objects, properties, calls) may gain much less; +30% memory matters on the small targets; "high pass rate" is not 100%.

Why a register VM helps: `a = b + c` is four dispatched instructions on a stack VM (`push b`, `push c`, `add`, `pop a`) with memory traffic, one (`add a, b, c`) on registers. This is what D55/D56 measured inside QuickJS: time goes to dispatch, stack traffic and reference counts, not to property lookup (inline caches gained nothing). D55's revisit condition named "quickjs-ng gains a register VM"; oxide is a separate engine, not upstream.

## Test262 in Zinc today [M]

- `tests/compat/run.mjs` (T2 `compat`, baseline `tests/compat/baseline.json`), a deterministic sample of 2,113 tests (`docs/reports/zinc-next-compat.md`, 2026-10-18): QuickJS engine **2,024 (95.8%)**, 89 fail; typed engine (`.js` through the gradual profile and typed shims) **1,739 (82.3%)**, 102 fail, 272 unsupported by design (206 need `propertyHelper.js`, i.e. descriptors and reflection; 57 sloppy mode).
- `tools/test262` (T1 `test262_regexp`), the full regexp subset: 2,557 tests, **2,533 pass (99.06%)**, the 24 failures listed with a reason in `tests/data/test262-regexp.failing`.
- The full suite (about 50,000 tests) is not run: on the typed engine most of it is out of scope by design; on QuickJS it mostly re-proves upstream, whose CI runs it, while what can break is Zinc's patches and glue. The harness can run it in the background at a milestone (one `zinc run` per test, about 200 ms of preparation each).
- Comparing with oxide on equal terms means running it on the same 2,113 tests: one more engine in `run.mjs`.

## Where V8's speed comes from [M]

Same files on five engines, ms per frame, M1 Pro (D110, `zinc-next-perf.md`):

| Workload | QuickJS-ng | JSC no JIT | V8 jitless | JSC | V8 (Node 24.14) |
|---|---:|---:|---:|---:|---:|
| three (500 meshes) | 4.97 | 2.34 (2.1x) | 3.09 (1.6x) | 0.204 (24x) | 0.271 (18x) |
| sprite | 8.02 | 3.74 (2.1x) | 8.29 (1.0x) | 0.250 (32x) | 0.477 (17x) |
| objects | 0.747 | 0.598 (1.2x) | 0.463 (1.6x) | 0.118 (6.3x) | 0.100 (7.5x) |
| p5shape | 8.45 | 6.05 (1.4x) | 4.75 (1.8x) | 0.31 (27x) | 1.71 (4.9x) |

The best interpreters stay within about 2x of QuickJS; the JIT gives 5 to 32x. The JIT's gain is **speculative native code**: type feedback at run time, functions recompiled for the observed types (fixed offsets, unboxed doubles, direct calls), guards, deoptimisation when a guard fails. D44's hand translations show the same thing ahead of time: bytecode to C 5.9x, with inline caches 7.4x, **speculative (typed) code 85x** on the sprite loop; D55's mechanical copy of the interpreter (qjs2c) only 1.28x. The gain is in knowing the types, not in removing the dispatch.

## Two ways to get V8-class speed [I]

1. **Embed a JIT engine where the platform allows executable memory**: JavaScriptCore on macOS (in the system, 0 bytes shipped, the fastest on these workloads), V8 or JSC on Linux, Windows, Android. Impossible on iOS (no JIT for an in-process `JSContext`), the consoles and ESP32: QuickJS stays there. This is ZN-586 (D44 option f, 32 points), which needs an engine layer in the spirit of React Native's JSI. Detailed in [hybrid-engines-dom.md](hybrid-engines-dom.md).
2. **Do the JIT's work ahead of time**: type inference over the whole program, a profiling run that records the types seen at each site, speculative C++ with guards and a fallback to `Dyn`. The only way that works on every target, iOS and consoles included. D44 scored the nearby option "(g) Zinc's typed AOT for npm libraries" at 22 with a gain of 1/5, on the premise that library JavaScript does not type; profile-guided speculation changes that premise, but only a coverage measure can say by how much. Detailed in [js-aot-to-cpp.md](js-aot-to-cpp.md).

3. **Make QuickJS itself fast with a compiler: already decided, D110 route 1 (owner, 2026-10-12).** ZN-723 (Backlog) compiles the hot functions of QuickJS's bytecode ahead of time, cached as D43 does: operand stack and locals as C values, borrowed references (no count pair per local read), a cache per property site, direct calls, then number types behind guards; the interpreter stays the semantics and the fallback; the same compiler later gets a machine-code backend (a JIT) where memory may be executable. Gate: three.js and matter-js frames at least 2x, js-p5 at 60 fps. D55's no-go covers the mechanical copy of the interpreter, not this compiler: the hand translations it follows reached 5.9x (values instead of a stack) and 7.4x (with caches), the typed one 85x. This is route 2 above applied to QuickJS's bytecode instead of to the source, and it works on every target.

Two limits to keep in view:
- **Amdahl**: on js-p5 the interpreter loop is 57% of the script's samples and QuickJS's runtime 43% (property definition, object creation, malloc and free; D110). A perfect compiler of the bytecode alone gives at most about 2.3x there; the rest needs runtime fast paths (the patch queue), allocation and GC scheduling (ZN-575). js-p5 needs 1.3x for 60 fps, 2.9x for 120 fps.
- **Coverage beats code quality**: Longbridge's quickjs-jit (Cranelift, 59,000 lines of Rust, +3.7 MB) gets 32-45x on numeric kernels and 0.99-1.00x on a realistic application, because it refuses 124 of about 255 opcodes (`this`, closure variables, `typeof`, `for of`, `try`) and every call goes back through `JS_CallInternal` (its own analysis, 2026-09-27). Library code is methods on `this` and calls; a compiler that does not cover them gains nothing. ZN-724 measures it before ZN-723 writes our own.

Rejected again, as in D44: a JIT written from nothing (options c, d), and interpreter-only work (option e): a register VM or NaN-boxing gives what oxide shows, about 1.3x, the interpreters' ceiling of about 2x.

The shortest way to V8-class speed for a user's own code stays TypeScript: the typed AOT is what a perfect JIT would reach (D36), with no warm-up, on every target.
