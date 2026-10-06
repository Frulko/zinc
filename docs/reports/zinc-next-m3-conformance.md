# Zinc Next: M3 conformance report

Date: 2026-10-06. Interpreter build `next/build/zinc`, commit after ZN-039.

## Result

The 18 pure-language conformance programs of `next/corpus/M3-set.txt` print exactly the output frozen from the old toolchain
(`next/corpus/conformance/*.out`). A program that ends with an uncaught exception has a last line `[exit 101] panic: Uncaught
<Name>: <message>`: the interpreter prints the `panic: ...` line on stderr and exits with 101, `tests/t1/conformance.sh` adds the
`[exit N]` prefix. The same programs pass under the ASan build and are accepted by the oracle (tsc 7 with `lib/zinc.d.ts`).

| Program | Result | Live objects at exit |
|---|---|---|
| array_search, async, clock, conversions, dyn, dyn_literals, dyn_unknown, errors, generic_static, literal_errors, literal_member_arrays, pinball_physics, regressions, regressions2, shapes, string_number_edges, tour | match | 0 (a program that ends with an uncaught exception is not leak-checked) |
| features | match | 4: `@weak` is accepted and ignored, so the parent/children pair is a cycle |

`tests/t1/rc.sh` leak-checks every M3 program except features.ts. The loops of rewritten async functions and generators name themselves; they let go of themselves when the loop ends, and an abandoned generator (`break` out of a `for...of`) closes itself. Destruction order is checked
by `tests/golden/rc/order.ts` against the frozen trace (field order, array order, last use of a local).

## Not in the set (by decision, 2026-10-06)

The other 23 conformance programs need `zinc:` packages, namespace imports, JSX, decorators with behaviour (`@pooled`),
the web APIs and native plugins; they belong to the module system and UI milestones (M5). `hardening` and `web` were left
out of the 18: they need `zinc:gfx` and `zinc:web`.

## Known gaps behind the 18

- Weak references (`@weak`) and cycle collection: cycles leak (documented, see above).
- Optional properties and `find` on primitives are `null`, not `undefined`; `a?.b.c` does not short-circuit the chain.
- Method calls and `?.` on a Dyn, Map/Set views in a Dyn, async arrows and methods, `try/finally` around `await`.
- Time is virtual (`Date.now()` reads the event loop clock).
