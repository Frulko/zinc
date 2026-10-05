# Zinc Next: resume

Overwritten at the end of every session. Run `next/tools/status` (or `/zn-resume`) for the live state.

## State

- Date: 2026-10-05. Phase: M0 in progress.
- Design: `docs/reports/zinc-next-design.md`. Rules: `next/ARCHITECTURE.md`. Tests: `next/TESTING.md`.
- Done: M0, ZN-004..008 (lexer, parser, diagnostics, checker, IR), ZN-009 ZBC (`include/zn/opcodes.h`, `next/src/zbc`, `zinc --emit=zbc`, binary format, typed verifier).
- Ready: none; next by ordinal is ZN-010 (Interpreter runs fib), then ZN-011 = gate M1 (the loop stops there). Nothing in progress.

## Next

`/zn-start` (picks ZN-010 via `next/tools/next-task`).

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
| M1 | ZN-009 | ~100k in / ~4M cached / ~50k out (same session, incremental; size M) |

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

## ZBC notes (ZN-009) for the interpreter

- Registers are 64-bit slots of class I (all ints, bools), S (f32 bits), D (f64). Ints are kept canonical (sign- or zero-extended); `Narrow*` ops re-canonicalise after narrow arithmetic; `Add/Sub/MulI32` etc. wrap at 32 bits, U32 variants wrap and zero-extend.
- Calls: `Call A, fn`: args are in r[A..A+n), the callee's frame starts at r[A] (callee r0 = first arg), the result is left in r[A]. Everything at or above A is clobbered. Frame size per function is `nregs`; check stack depth against `kMaxCallDepth`.
- `Ret r` copies r to the callee's r0 (= caller's r[A]). `console.log` is `LogX` per argument, `LogSep` between, `LogEnd` newline; the VM owns number formatting (JS Number to string; the golden for fib is `2178309`).
- `LoadI` D is a signed 16-bit immediate; `LoadK` reads the per-function pool. Jump operands are absolute instruction indices.
- Always run `zbc::verify` after decode and before executing (the typed VM relies on it; `zinc zbc --check`). Decode bounds-checks but does not verify.
- The emitter's value correctness is unproven until ZN-010 runs the goldens: if an output differs, suspect regalloc/parallel moves first (`next/src/zbc/emit.cpp`).
- Unsupported (per-function error): heap ops, strings, exceptions (unwind edges), fixed-point kinds.
