# Zinc Next: resume

Overwritten at the end of every session. Run `next/tools/status` (or `/zn-resume`) for the live state.

## State

- Date: 2026-10-05. Phase: M0 in progress.
- Design: `docs/reports/zinc-next-design.md`. Rules: `next/ARCHITECTURE.md`. Tests: `next/TESTING.md`.
- Done: M0 (ZN-001..003), ZN-004 lexer, ZN-005 parser (`zinc parse --check|--dump`, goldens in `tests/golden/parser`).
- Ready: none; next by ordinal is ZN-006 (Diagnostics registry). Nothing in progress.

## Next

`/zn-start` (picks ZN-006 via `next/tools/next-task`).

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

## Lexer notes (ZN-004)

- `>` is always a single token: merge adjacent `>`/`=` for `>>`, `>=`, `>>=`, `>>>`.
- JSX: `</` and `/>` are single Punct tokens; whitespace-only children text is a JsxText token.
- Known limits: `<T,>() =>` in .tsx lexes as JSX; regex vs divide decided by the previous token.

## Parser notes (ZN-005)

- Syntax codes Z0001-Z0004 and Z0006 (unsupported) live in `frontend/ast.h`; ZN-006 must move them into the registry with explanations and one fixture per code (`tests/golden/parser/errors`).
- Unsupported yet (Z0006): arrows, object literals, modules, generics, modifiers, switch/try/throw, interfaces. Later tasks (ZN-012..) lift them one by one.
