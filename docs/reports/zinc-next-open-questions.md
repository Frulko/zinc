# Zinc Next: engines, QuickJS, benchmarks, conformance and UI (open questions)

Note, 2026-10-06. It records answers given during the ZN-015..033 sessions so they are not lost in a chat. Sources:
`docs/reports/zinc-next-design.md` (sections cited by topic), the backlog (`next/backlog/tasks`), and measurements in
`next/RESUME.md`. Nothing here is a decision; items marked **proposal** need one. Companion note:
`haxe-as3-prior-art.md`.

## 1. Execution modes: is it the same system as today?

| Mode | Today (`compiler/` + `zrt`) | Zinc Next |
|---|---|---|
| Native, pure | compiler emits C++ over `zrt`, built with clang/zig | the same output is the M4 AOT target (ZN-022: ZBC to C++), and stays the performance reference |
| Zinc VM | experimental ZBC4 VM with a baseline AArch64 JIT (`docs/engines.md`) | ZBC interpreter first (reference semantics); JIT later |
| QuickJS | QuickJS runner used as a compatibility engine | **not integrated in `next/`**, see section 2 |

- One semantic source: the interpreter is the reference; AOT (and later JIT) derive from the same IR and ops, and the
  differential runner (ZN-023) compares them byte for byte on the corpus.
- The old compiler stays in place. The new tree is a proof of concept in `next/`; the old and new outputs are compared
  on the frozen corpus (`next/corpus`).
- Performance: the M1 gate measured the interpreter at 4.45x QuickJS on `fib` and 2.7x on `mandelbrot` (target was 5x,
  accepted in decision 0015). The M4 acceptance is AOT within 3x of current native. This is **not proven yet**; until
  ZN-022 exists the current native path is faster.
- Cleaner than today: one IR, one verifier, one op table shared by VM and AOT (`include/zn`), tests per module. That is
  the claim to defend; speed parity is a separate claim with its own gate.

## 2. QuickJS: why is it absent?

Nothing was removed. `next/` is a clean-slate engine and has no QuickJS integration yet. The design report leaves the
question open (open question 2): QuickJS only for `zinc:script`, or a full compatibility engine.

**Proposal.** Decide before M5. Options:
- (a) QuickJS only as the `zinc:script` runner (dynamic scripts next to typed Zinc), same native ABI via generated
  bindings from the one IDL (design report, native surface section).
- (b) QuickJS as a full compatibility engine for plain JS/TS programs that Zinc's typed subset cannot compile.
- (c) Drop it from `next/`; keep it in the old tree.
Pick (a) unless a requirement for running arbitrary JS appears; (b) multiplies the surface we must keep in sync.

## 3. Benchmarks like javascript-zoo

What exists: `next/tools/bench-m1` (median of 11 or 21 runs, vs QuickJS and Node), the kernels in
`tests/bench/kernels`, frozen outputs in `next/corpus/bench`. ZN-024 plans the comparison against QuickJS and native.

**Proposal** for a zoo-style table:
- One reproducible script that, for each engine (zinc interpreter, zinc AOT, QuickJS, Node, optionally Hermes/others),
  builds and runs each kernel with fixed iterations, records median, p95 and memory, and emits JSON plus a markdown table.
- Pin engine versions and record machine info in the JSON.
- Same rules for all: output must equal the frozen golden, otherwise the row is rejected.
- Add kernels from the zoo only when their outputs are deterministic and they fit the typed subset; list excluded ones.
Cost: roughly one task of size M after ZN-022; the engine matrix is most of the work.

## 4. ECMAScript conformance and test262

- Zinc is a typed TypeScript subset. test262 targets full dynamic ECMAScript semantics, so it applies only to a mode that
  runs dynamic JS (QuickJS, or `Dyn`), not to the typed core.
- Today's conformance is the `lang` tour (ZN-017) plus the 18 conformance programs (ZN-021), compared with Node, plus
  the one-way oracle (everything our checker accepts must be accepted by tsc).
- **Proposal.**
  - Typed core: derive golden tests by hand from test262 for the parts we support (strings, arrays, Map/Set, numbers,
    switch, classes), with Node as reference; keep them in `tests/golden/run`.
  - If QuickJS stays (section 2, a or b): run the test262 subset appropriate to its feature list through the existing
    runner and publish pass rate, with a skip list that carries reasons.
  - Never claim "ECMAScript conformance" for the typed core; state the subset and the known divergences (for example
    `charCodeAt` out of range returns 0, `Map.get` only under `??`).

## 5. UI: parity with React Native and an authoring-agnostic design

**Scope today.** The rendering runtime already exists (raster, flexbox, text, input, scroll physics; `docs/ui.md`,
`qt-comparison.md`). Next has no UI yet; ZN-027 links the existing runtime, ZN-028 does JSX lowering with a Solid or
React example. They depend on modules (done), closures (done), strings/arrays/Map/Set (done), RC (ZN-018).

**React Native parity.** Define the exact list of supported properties and their semantics (flexbox, margins and
padding, borders and radii, shadows, opacity, transforms, images with resize modes, fonts and text metrics, asset
loading), then back each with a pixel golden. That list, not the framework, is what "as good as RN" means. **Proposal:**
a backlog task for the property spec plus goldens, before ZN-028.

**Agnostic of the authoring style (AS3, vanilla JS, JSX, Vue, Svelte).** Layered design:
1. Scene core in native code: node tree with typed props (ids, not strings), layout, dirty flags, render, events;
   minimal imperative API (`createNode`, `setProp`, `append`, `remove`, `on`).
2. Bindings generated from one IDL for interpreter, AOT and QuickJS.
3. Optional fine-grained reactivity (signals/effects) updating a single property of a node.
4. Frontends as thin layers: JSX with signals (no diff) first; a React-like diffing mode as a library; Vue and Svelte as
   template compilers to the same calls; vanilla JS directly; an AS3-style compatibility module mapping `DisplayObject`,
   `addChild`, events to nodes.
Performance comes from fine-grained updates, dirty flags and compile-time resolution of property ids, not from the
syntax. Pitfalls: no component lifecycle in the core, a bounded CSS subset rather than partial full CSS, one event model.
If the same primitives serve AS3 and JSX, the API is agnostic. Details and the OpenFL/Lime comparison:
`haxe-as3-prior-art.md`, section 5.

## 6. Proposed backlog items (not created)

1. Decision: QuickJS role (section 2), before M5.
2. Benchmark matrix script and table (section 3), after ZN-022.
3. Conformance plan: test262-derived goldens for the typed core, optional QuickJS test262 run (section 4).
4. UI property spec with pixel goldens (section 5), before ZN-028.
5. Scene API and event model spec with a framework-free conformance test (ZN-027 scope).
6. Prior-art reading list from `haxe-as3-prior-art.md`, section 7.
