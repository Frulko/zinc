# The QuickJS engine (ZN-051)

`zinc run <file> --engine quickjs [-- args]` runs plain JavaScript (`.js`, `.mjs`) and TypeScript (`.ts`) on QuickJS-ng 0.17.0 (vendored in
`third_party/quickjs-ng`, MIT). The typed engine (interpreter and AOT) stays the default; this one is for npm style code, eval-like needs and
programs that do not fit the typed subset (decision of ZN-031: QuickJS is a full second engine).

## How it works

| Piece | File | What it does |
|---|---|---|
| Type stripping | `src/qjs/strip.cpp` | parses the file with the Zinc parser and blanks the type syntax in place (annotations, generics, `as`, interfaces, aliases, modifiers, `implements`), turns enums into the usual JavaScript and parameter properties into `this.x = x;` after `super(...)`; lines and columns do not move. An exported interface or alias keeps an `export var Name;` so importing a type links |
| Host calls | `src/qjs/qjs.cpp` | one JavaScript function `__host_<name>` per `host.*` row of the runtime table (`include/zn/runtime.h`), its arguments and result decoded by the row's letters, then the same `zn::host` call the typed engines make (`hostGfx`, `hostSys`). Nothing is written twice: a new host function is one table row |
| Modules | `src/qjs/qjs.cpp` | `zinc:gfx`, `zinc:sys`, `zinc:fs`, `zinc:storage`, `zinc:assets`, `zinc:os`, `zinc:process` are the same Zinc sources the typed engines use, stripped; relative imports resolve `.ts`, `.js`, `.mjs`, `/index.ts`. `zinc:gfx` keeps its API and gets its frame loop from C++ |
| Prelude | `src/qjs/prelude.cpp` | `console` with Node's `util.inspect` rules (depth 2, 80 columns, array grouping), timers on a virtual clock (starts at 0, jumps to the next timer; a frame loop advances it by the frame time), `Date.now`, `queueMicrotask`, a small `process` |
| Frame loop | `src/qjs/qjs.cpp` | poll, clock, due timers, begin, callback, promise jobs, end: what the typed engine's `__gfxLoop` does, over the same host calls; a `zinc:gfx` program draws the same pixels (`shapes.ts` is identical to its golden) |

An uncaught exception prints `Uncaught ...` and the stack on stderr and ends with exit code 101, like the typed engine.

## Limits

- No type checking: the file only has to parse as the Zinc subset of TypeScript (the same parser). JSX (`.tsx`, so `zinc:ui` programs) is refused with a message; a
  JSX transform would be the next step, as would a stripper that does not need the Zinc parser (a program outside the subset cannot be `.ts`, write `.js`).
- Numbers are JavaScript numbers: `i32`, `u32`, `f32` annotations do not wrap or round (programs relying on that, such as `tour` and `features`, differ).
- No `<ref *1>` markers for circular values in `console.log`; `Math.seed` and the deterministic `Math.random` of the typed engine are not provided.
- Timers never sleep: the clock is virtual (a window run advances it by the real frame time).
- Not linked into firmware builds; the engine is a desktop and Pi class option. Constrained targets keep the typed AOT (ZN-042) or mquickjs (ZN-043).
- Speed: see `docs/reports/zinc-next-m4-benchmarks.md` (the typed interpreter is 3 to 6 times faster than QuickJS on the numeric kernels).

## Tests

`tests/t0/qjs.sh` (plain JavaScript, stripping, exit codes), `tests/t1/quickjs.sh` (the golden corpus without typed features, 13 conformance programs, the
`shapes.ts` pixels).
