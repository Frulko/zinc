# Zinc Next: resume

Overwritten at the end of every session. Run `next/tools/status` (or `/zn-resume`) for the live state.

## State

- Date: 2026-10-05. Phase: M0 in progress.
- Design: `docs/reports/zinc-next-design.md`. Rules: `next/ARCHITECTURE.md`. Tests: `next/TESTING.md`.
- Done: M0 (ZN-001..003), ZN-004 lexer, ZN-005 parser, ZN-006 diagnostics registry (`include/zn/diagnostics.h`, `zinc explain`).
- Ready: none; next by ordinal is ZN-007 (Binder and checker). Nothing in progress.

## Next

`/zn-start` (picks ZN-007 via `next/tools/next-task`).

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

## Lexer notes (ZN-004)

- `>` is always a single token: merge adjacent `>`/`=` for `>>`, `>=`, `>>=`, `>>>`.
- JSX: `</` and `/>` are single Punct tokens; whitespace-only children text is a JsxText token.
- Known limits: `<T,>() =>` in .tsx lexes as JSX; regex vs divide decided by the previous token.

## Parser notes (ZN-005)

- Syntax codes Z0001-Z0005 live in `include/zn/diagnostics.h` (Z0005 = unsupported). New codes: add one X(...) entry, one fixture in `tests/golden/*/errors`, regenerate `next/docs/diagnostics.md` with `zinc explain --markdown`.
- Unsupported yet (Z0005): arrows, object literals, modules, generics, modifiers, switch/try/throw, interfaces. Later tasks (ZN-012..) lift them one by one.
