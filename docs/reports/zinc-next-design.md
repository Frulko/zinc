# Zinc Next: a clean-slate engine (proof-of-concept design)

Status: design, nothing implemented. Figures marked *(est.)* are estimates; figures marked *(measured)* come from the
reports cited. Written 2026-10-05 from the research in `docs/reports/` and the Bun type-checker announcement.

## 1. Why a clean slate

Zinc works: it compiles a strict TypeScript subset to native code, runs on ESP32, PS1, Raspberry Pi and desktop, and
every target matches the Node oracle byte for byte (`STATUS.md`). The cost of that history is structural:

| Heritage | Consequence |
|---|---|
| `emit-cpp.ts` walks the TypeScript AST (decision 0004); HIR/MIR are inspection stages only (0013) | Native C++, the Zinc VM, the JS emitter and the Node `sim` are four semantic implementations of one language |
| Reference counting is C++ RAII, not compiler-inserted (0001); arena escape is checked at run time | Destruction order cannot be guaranteed identical across engines |
| The checker is `@typescript/typescript6`, a JS package | The compiler needs Node.js; the product goal (one self-contained app) cannot be met |
| The oracle is `sim` on Node | Tests need Node on every machine |
| Engines drift: JIT recursion limit 1024, interpreter 16383 (`research-2026-09-30-all.md`, VM AOT report) | Parity is maintained by hand |

The goal is not to discard what was learned. It is to rebuild the core around the lessons, keeping the runtime, the
corpus and the research.

## 2. Evidence that the approach works

- A typed register bytecode with tail-call dispatch is 6.6–10.7× faster than QuickJS and 2–5.3× faster than Hermes
  (*measured*, `zinc-vm.md`, prototype).
- Typing removes tag checks; the accumulator is the next biggest win; a JIT is only worth it with register allocation,
  which typed bytecode makes nearly free (*measured*, same report).
- Bytecode → C++ → `clang -O2` reaches near-native scalar speed: fib(32) 31 ms and mandelbrot 21.8 ms against 10 ms and
  22 ms native (*measured*, scalar-only prototype, an upper bound for numeric code).
- `zig c++` cross-compiles `runtime/zrt.cpp` for aarch64, armhf, x86_64 Linux, Windows and macOS in about 1 s each
  (*measured*, `docker-free-studio.md`; full link and SDL3 not tested).
- Bun is taking the same path: type checker first, then ahead-of-time compilation, by porting the typescript-go checker
  and validating it against real projects: 1,102 of 1,103 configs identical (oven-sh/bun PR 44361).

## 3. Goals and non-goals

Goals of the proof of concept:

1. One binary, `zinc`, with no Node.js, Docker or system C++ compiler required for the bytecode path.
2. One semantic source: the interpreter is the reference; AOT and JIT are derived from the same IR and ops.
3. Deterministic memory: reference-count operations are explicit in the IR, so destruction order is identical on every
   backend.
4. Output parity checked against the existing corpus, not against Node.

Non-goals (for the proof of concept):

- Running arbitrary npm packages or full TypeScript. The language stays a strict subset (decision: option A).
- Replacing the C++ runtime (`zrt`, raster, ttf, HAL, plugins), UI frameworks or the examples.
- JIT, iOS packaging, WebGL, Studio, the browser tier. They are designed not to be blocked, not built.

## 4. Pipeline

```
TS subset source
   │  lexer, parser                          (C++20)
   ▼
AST ── binder ── checker (port of tsgo subset) ── diagnostics (Z-codes, registry)
   ▼
typed SSA IR  (the single source of truth)
   │  passes: closed-world layouts, devirtualisation, inlining, numeric profile lowering,
   │          RC insertion and elision, arena escape (compile time)
   ▼
ZBC (typed register bytecode)
   ├── interpreter   reference semantics, runs everywhere
   ├── AOT           ZBC → C++ → clang/zig -O2, ops delegated to the same single-sourced step<O,T>
   └── JIT           later; stencils come from the same handler source
```

Language: **C++20, built with `zig c++` or clang.** Rationale: the runtime is C++, so opcode tables, value layouts and
the native ABI live in shared headers and are included by both compiler and VM, with no duplication or FFI. The same
toolchain Zinc ships to users builds the compiler. A Rust toolchain would add disk, RAM and build-time cost on every
developer machine and an extra toolchain to ship. Later, the compiler can be rewritten in the Zinc subset (self-hosting).

## 5. Design decisions

### 5.1 Front end

- Parser for the subset only: classes, generics, unions, tuples, destructuring, closures, async/generators, JSX.
- Checker: our own bidirectional checker for the strict subset (local inference, classes, simple generics, unions,
  tuples, basic narrowing). Port from the reference implementation (typescript-go today) only the subtle parts:
  assignability of unions and generics, and control flow. Scope is bounded by the subset, so conditional and mapped
  types are out unless the corpus needs them.
- Validation: the *reference checker* is an oracle, one way only: **every program we accept, the oracle accepts**. We
  may reject more (that is the point of a strict subset). The oracle is a development-time tool behind one command
  (`next/tools/oracle`, `ZN_ORACLE` env var), never a runtime dependency, and replaceable: `tsgo` now, a C++ port of
  tsgo or any other checker later, with no change to the tests.
- Sources remain valid TypeScript, so editors and `tsserver` keep working (`zinc tsconfig`).
- Diagnostics registry from the start: code, title, why, fix, example, one fixture per code, `zinc explain Zxxxx`
  (lesson from `perryts-comparison.md`, items 3 and 4).

### 5.2 Typed SSA IR

- Types are complete after checking: no `any` in the core. `Dyn` (gradual values) is a separate tagged representation
  with inline caches, opt-in per profile, as in decision 0014; strict profiles reject it (Z1006).
- Closed world: the compiler knows every class and object shape, so property access compiles to fixed offsets and calls
  to a single implementation are devirtualised. Vtables or itables exist only for genuinely open interfaces. This is what
  Bun approximates with inline caching and educated guesses; static types allow better.
- Explicit effects and exceptional edges are part of the IR from the start (the current MIR skips try/async/generators).
- Numeric profiles (f64, f32, i32 wrap, fixed Q20.12/Q16.16) are types lowered by one pass, not emitter special cases.

### 5.3 Memory

- Reference counting with explicit `retain`/`release` ops inserted by a pass, then elided by ownership analysis.
  Destruction order is therefore a property of the IR and identical in the interpreter, AOT and JIT.
- Pools, arenas, TLSF and weak references are kept. Arena escape becomes a compile-time check where provable, a run-time
  check otherwise (the current state, made explicit).
- Cycles: a compile-time warning from shape analysis (missing today per `STATUS.md`).

### 5.4 Boundaries and type honesty

Taken from the Bun discussion: explicitly typed values that do not match throw a `TypeError`. In Zinc the check is placed
only where untyped data becomes typed: `JSON.parse`, native ABI returns, `Dyn` narrowing, network and script input.
Typed code pays nothing.

### 5.5 One-source semantics

- Every op has one definition `step<O,T>`; the interpreter calls it, the AOT emitter inlines it, the JIT stencils are
  compiled from it.
- Limits (recursion depth, stack size) are defined once in the shared header and used by every tier.
- The interpreter replaces the Node `sim` as the oracle.

### 5.6 Host ABI

One description of the native surface (an IDL or the existing `.spec.ts`), from which bindings for the interpreter, the AOT
output and the QuickJS compatibility runner are generated. The scalar/resource/callback/record ABI from `engines.md` is
the starting point.

### 5.7 Toolchain and distribution

- Default path: compile to ZBC and run it on a prebuilt VM core (host) or upload it to a preflashed firmware (ESP32,
  Arduino-like). No C++ compiler involved.
- Optional AOT path: `zig c++` hidden in the toolchain manager, with pinned sysroots, downloaded on demand and signed.
- Docker only as an optional development and CI backend. ESP-IDF stays a managed SDK; PS1/PS2 and Apple targets off-Mac
  remain the known exceptions (`docker-free-studio.md`).

### Callback parameter kinds (ZN-067)

TypeScript has one `number`; Zinc has machine kinds. A function value of type `(i32, string) => void` is accepted where
`(f64, string) => void` is expected (and the other way round) when the parameter lists have the same length and differ only in
machine number kinds, and likewise for the result. The checker wraps the value in a generated function that converts each argument
(`p0 as i32`) and the result between the kinds, so the callee sees exactly the kind it declares. Arguments are converted like an
`as` cast (truncating, never trapping). Anything else (different arity, a string against a number, a class against another) stays a
type error. Explicit type arguments (`id<i32[]>([1, 2])`) are applied before the arguments are checked, so a literal takes the
element kind of `T`. A field initialised from a module-level const takes that const's type (annotated, or from its literal).

## 6. What is kept and what is left

Kept: `runtime/` (zrt, raster, ttf, HAL, plugins, VM), `lib/std`, `examples/`, `tests/conformance`, `tests/bench`, the
golden dumps and pixel goldens, the research reports.

Left behind: the AST-walking C++ emitter, the Node `sim` oracle, the `@typescript/typescript6` dependency, `emit-js` and the
QuickJS runner as first-class engines (QuickJS may remain as a compatibility engine for `zinc:script`).

## 7. Repository layout

The existing tree has many uncommitted changes, so the proof of concept lives apart and does not touch it:

```
next/
  CMakeLists.txt           builds with clang or zig c++
  include/zn/              shared headers: opcodes, value layouts, limits, ABI (used by compiler and VM)
  src/frontend/            lexer, parser, binder, checker, diagnostics
  src/ir/                  typed SSA IR and passes
  src/zbc/                 bytecode emitter
  src/vm/                  interpreter (links the existing runtime where possible)
  src/aot/                 ZBC → C++ emitter
  tests/                   corpus runner, differential test (interpreter vs AOT vs existing native), diagnostic fixtures
```

## 8. Milestones

Estimates assume one experienced engineer and are unvalidated.

| # | Deliverable | Acceptance | Effort *(est.)* |
|---|---|---|---|
| M0 | Freeze the baseline: record outputs and pixels of the corpus from the current compiler | A checked-in expected-output set, independent of Node | 1 week |
| M1 | `fib` end to end: parser → checker → IR → ZBC → interpreter, in one binary | `zinc run fib.ts` prints the golden output with no Node | 3–4 weeks |
| M2 | Subset breadth: classes, generics, unions, closures, strings, arrays, Map/Set | The `lang` conformance program passes | 6–8 weeks |
| M3 | RC insertion and ownership, exceptions, async | Conformance 18/18 in the interpreter; destruction order identical to current native | 4–6 weeks |
| M4 | AOT: ZBC → C++ → clang/zig | Interpreter and AOT agree on the corpus; nbody, binarytrees, fib within 3× of native; `strings`, `jsonout` and a `Dyn` kernel measured against QuickJS (interpreter must not be slower than QuickJS on any kernel) | 5–7 weeks |
| M5 | One UI screen: runtime raster, a Solid or React example | Pixel golden identical to the current build | 4–6 weeks |
| M6 | Docker-free: `zig c++` toolchain, bytecode upload to a preflashed ESP32 | Hello on a device with no manual install | 4–6 weeks |

Total: roughly 6–8 months for the full proof of concept. The first meaningful decision point is M1 (a month): if the
checker port or the shared-header design proves harder than expected, the cost is visible early.

## 9. Success criteria for the proof of concept

1. A single binary compiles and runs fib, nbody, binarytrees and one UI screen with no Node.js and no Docker.
2. Interpreter and AOT outputs are byte-identical on the corpus, and one UI screen matches its pixel golden.
3. Interpreter at least 5× faster than QuickJS on the numeric benchmark kernels and never slower on `strings`, `jsonout`
   and the `Dyn` kernel (the prototype only measured numeric kernels); AOT within 3× of current native.
4. Every diagnostic has a code, an explanation and a fixture.

## 10. Risks

| Risk | Mitigation |
|---|---|
| The checker is the largest piece and the subset grows | Define the subset from the corpus, check "we accept ⊂ oracle accepts", add features on demand |
| Divergence from the existing runtime layouts | Shared headers from M1; the existing runtime is linked, not rewritten |
| AOT only proven on scalar code | M4 acceptance includes heap-heavy kernels (binarytrees, sort) |
| Scope creep toward npm compatibility | Non-goal; revisit only with explicit evidence |
| Parallel maintenance of old and new compilers | The old compiler is frozen except for fixes; the corpus gates both |
| C++ memory unsafety in the compiler | ASan and UBSan in CI, as already done for the runtime |

## 11. Open questions

1. Product name for the future desktop app: `ZincStudio` already names the macOS box editor (`docs/studio.md`).
2. How much of the QuickJS path stays: only `zinc:script`, or a full compatibility engine.
3. Whether the IR should be exposed (`--emit=ir`) as a stable format or kept internal.
4. Whether to replace `clang` with an in-process backend later; revisit only if the toolchain size proves a problem.

## Sources

`docs/reports/zinc-vm.md`, `docs/reports/research-2026-09-30-all.md` and its sub-reports, `docs/reports/PERF.md`,
`docs/reports/perryts-comparison.md`, `docs/reports/STATUS.md`, `docs/engines.md`, `docs/decisions/0001`, `0004`, `0013`,
`0014`; [oven-sh/bun PR 44361](https://github.com/oven-sh/bun/pull/44361);
[Jarred Sumner on the AOT preview](https://x.com/jarredsumner/status/2104739495895781679).
