# Zinc Next: resume

Overwritten at the end of every session. Run `next/tools/status` (or `/zn-resume`) for the live state.

## State

- Date: 2026-10-05. Phase: M0 in progress.
- Design: `docs/reports/zinc-next-design.md`. Rules: `next/ARCHITECTURE.md`. Tests: `next/TESTING.md`.
- Done: M0, ZN-004 lexer, ZN-005 parser, ZN-006 diagnostics, ZN-007 checker, ZN-008 typed SSA IR (`next/src/ir`, `zinc --emit=ir`, verifier, goldens in `tests/golden/ir`).
- Ready: none; next by ordinal is ZN-009 (ZBC emitter with register allocation). Nothing in progress.

## Next

`/zn-start` (picks ZN-009 via `next/tools/next-task`).

## Watch out

- The working tree has many unrelated uncommitted changes (compiler, examples, plugins). Never `git add .`; add paths explicitly.
- Do not touch `compiler/` except for fixes.
- Task files record almost no dependencies; `next-task` follows the ordinal order.
- Estimates are unvalidated; ZN-011 is the first decision gate.
- Usage per task is recorded by `next/tools/usage` in the task notes (ZN-002: ~50k in / 1.6M cached / 15k out, estimate).

## Usage per milestone (estimates from `next/tools/usage`, session totals)

| Milestone | Task | Usage |
|---|---|---|
| M0 | ZN-002, ZN-001, ZN-003 | ~150k in / ~5M cached / ~45k out, one session (harness work included) |
| M1 | ZN-004 | ~100k in / ~4M cached / ~35k out (same session, incremental) |
| M1 | ZN-005 | ~80k in / ~3M cached / ~30k out (same session, incremental) |
| M1 | ZN-006 | ~50k in / ~2M cached / ~20k out (same session, incremental) |
| M1 | ZN-007 | ~120k in / ~6M cached / ~60k out (same session, incremental; size L) |
| M1 | ZN-008 | ~110k in / ~5M cached / ~55k out (same session, incremental; size M) |

## Lexer notes (ZN-004)

- `>` is always a single token: merge adjacent `>`/`=` for `>>`, `>=`, `>>=`, `>>>`.
- JSX: `</` and `/>` are single Punct tokens; whitespace-only children text is a JsxText token.
- Known limits: `<T,>() =>` in .tsx lexes as JSX; regex vs divide decided by the previous token.

## Parser notes (ZN-005)

- Syntax codes Z0001-Z0005 live in `include/zn/diagnostics.h` (Z0005 = unsupported). New codes: add one X(...) entry, one fixture in `tests/golden/*/errors`, regenerate `next/docs/diagnostics.md` with `zinc explain --markdown`.
- Unsupported yet (Z0005): arrows, object literals, modules, generics, modifiers, switch/try/throw, interfaces. Later tasks (ZN-012..) lift them one by one.

## Checker notes (ZN-007) for the IR

- `Checked` gives a type per AST node (`nodeType`), the resolved symbol per Ident (`nodeSym`), types interned in `types`, objects (classes, Math, console) in `objs`. ZN-008 lowers from the AST plus this.
- Numeric kinds are first class (`Num`); `i32 / i32` is f64 (JS semantics); `.length` is i32. Literals adapt to the target kind syntactically.
- Stricter than TS on purpose; the oracle (`next/tools/oracle`, tsc 7 + lib/zinc.d.ts) must accept everything we accept.
- New codes: add the registry entry, a fixture in `tests/golden/checker/errors`, regenerate `next/docs/diagnostics.md`.

## IR notes (ZN-008) for the ZBC emitter

- Functions: `@main` is function 0 (top-level code); methods are `Class.method` with `this` first; constructors `Class.constructor` (synthesized when only field initialisers exist).
- Control flow: block parameters carry values across edges (no phis); `br`/`condbr` edges carry arguments; a `call` may have an unwind edge (not produced yet); `throw`, `unreachable` terminate.
- Types: `ref Class`, `T[]`, `str`, `bool`, numeric kinds. Globals are accessed with `getglobal`/`setglobal`; builtins with `builtin <name>(args)` (list in `include/zn/builtins.h`, shared with the VM).
- Register allocation input: every value has one definition; block params are the only merge points. Value ids are dense per function.
- Unsupported in lowering (Z0005): closures, default parameters, null, spread, for-in.
