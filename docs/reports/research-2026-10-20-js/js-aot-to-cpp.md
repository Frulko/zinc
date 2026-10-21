# JavaScript to C++: compiling plain JavaScript ahead of time, with trade-offs

Status: research only, nothing implemented. Date 2026-10-20. The question (owner): compile plain JavaScript to native C++ the way TypeScript already is, accepting documented restrictions. Tags: **[M]** measured in this repository, **[W]** web source (prior art cited from memory, to verify before relying on it), **[I]** inference.

## Prior art [W]

- **Static Hermes** (Meta): JavaScript, TypeScript and Flow to native; untyped JS works, typed parts are fast.
- **Hopc** (Inria, Manuel Serrano): ahead-of-time compilation of dynamic JavaScript, with hidden classes and inline caches compiled into the generated code.
- **Porffor**: JavaScript to Wasm and C ahead of time; conformance still partial.
- **scriptc** (vercel-labs): a static tier and a dynamic tier, both native, no engine at run time ([scriptc-lessons.md](scriptc-lessons.md)).

## What Zinc already has [M]

- The gradual profile: `any` is `Dyn`, a tagged representation with inline caches, opt-in per profile (`docs/reports/zinc-next-design.md` §5.2).
- `.js` through the typed engine reaches 82.3% of the test262 sample (QuickJS 95.8%), [js-speed.md](js-speed.md).
- The AOT: ZBC to C++ to clang/zig, large programs split in several translation units (D46).
- The oracle in the binary: `--engine quickjs` for byte-for-byte comparisons.

## Three layers [I]

1. **Infer the types of the JavaScript.** Ahead of time the whole program is visible (no `eval`): literals, call sites, JSDoc, the package's `.d.ts`. What infers monomorphically takes the existing typed path, at TypeScript speed.
2. **Profile, then speculate.** One run on QuickJS or the interpreter records the types seen at each site (what V8's feedback vectors hold). The C++ is specialised for them, behind a guard; a failed guard falls back to the `Dyn` path (a deoptimisation decided at compile time).
3. **The rest is `Dyn`, natively**: object shapes, an inline cache compiled at each property site, unboxed numbers where the speculation holds; no dispatch loop. Faster than QuickJS but not by a large factor (qjs2c, D55: 1.28x for removing the dispatch; compiled caches add some).

## The `Dyn` runtime must cover JavaScript's semantics

Prototypes, getters/setters, descriptors, `Proxy`, `Symbol`, iterators. Two options:

| Option | For | Against |
|---|---|---|
| Zinc's own `Dyn`, extended (recommended) | one object model, one memory model, works on ESP32 without QuickJS | the bulk of the work; test262 drives it |
| QuickJS's runtime as the dynamic object model (as Static Hermes uses the Hermes runtime) | complete semantics at once | two heaps and two reference counts side by side; conversions at every typed/dynamic seam |

## Restrictions to accept

- No `eval` / `new Function` (refused at compile time, or handed to QuickJS on the desktop).
- No `with`, no sloppy mode: everything is a module.
- Mutating a prototype or `delete` turns the object into dictionary mode, slower.
- Key order fixed per object shape, with a diagnostic where the difference is visible (as scriptc does).
- **A cycle collector becomes necessary.** JavaScript creates closure/object cycles constantly; Zinc's reference counting has none (design §5.3). At least the `Dyn` objects need one. This is the hidden cost.
- C++ size and compile time on large libraries such as three.js (D46 already splits).
- Speed depends on inference: very polymorphic JavaScript stays near QuickJS speed.

## Steps, each with a gate

1. **Measure before building**: `zinc check` in the gradual profile on three real JavaScript libraries (matter-js, kirari's `dist/`, a small npm utility); count what types statically, what speculates, what falls to `Dyn`. This number says whether the rest is worth it (a scriptc-style coverage report).
2. **Inference for `.js`**, whole program, checked against `tsc --checkJs` with `tools/oracle`.
3. **`Dyn` semantics** guided by test262: the typed row from 82.3% towards QuickJS's 95.8%, interpreter and AOT alike; the cycle collector.
4. **Performance gate**: AOT JavaScript at least 2x QuickJS on three.js and matter-js, D55's gate.
