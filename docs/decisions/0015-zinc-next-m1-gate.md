# 0015 — Zinc Next: M1 gate (continue to M2)

**Context.** Milestone M1 of the clean-slate engine (`docs/reports/zinc-next-design.md`, `next/`) is built: lexer,
parser, diagnostics registry, checker, typed SSA IR, typed bytecode (ZBC) with a verifier, and an interpreter.
`zinc run fib.ts` prints the golden output with no Node.js. The gate (ZN-011, thresholds in `next/TESTING.md`) asks
for a written decision on whether to continue, simplify or stop.

**Evidence.**

| Threshold | Result |
|---|---|
| `fib` output equals golden, no Node | Met. `mandelbrot` too; 13 more numeric programs match Node exactly. |
| Checker: everything we accept is accepted by the oracle (tsc 7 + `lib/zinc.d.ts`), 30-file set | Met: 43 files and 28 adversarial snippets, 0 violations. The checker is stricter than TypeScript by design (machine numeric kinds, boolean conditions). |
| Interpreter `fib` at least 5x faster than QuickJS | **Not met: 4.45x** (56.6 ms vs 252 ms, median of 21; first version was 2.15x). `mandelbrot` 2.7x. Node's JIT: 51-57 ms. |
| M1 within 1.5x its budget | M1 tasks were budgeted at S,M,S,L,M,M,M (+gate), about 15-19 sessions. M0+M1 ran as one long autonomous session: about 0.6M tokens in, 36.6M cached, 0.33M out, 179 turns before the speed work (estimate from `next/tools/usage`, not the exact `/usage`). Within budget by any reading of "session". |

Artifacts: `next/bench/m1-fib.json`, `next/bench/m1-mandelbrot.json`, method in `next/tools/bench-m1`.

**Choice.** Continue to M2. The maintainer asked for one round of interpreter optimisation before continuing, which
took `fib` from 2.15x to 4.45x (immediate-operand and fused compare-and-jump instructions, call arguments computed
into the call window). The remaining 10 percent is not worth blocking on: the speed claim of the design sits on the
AOT path (M4), and the interpreter's job is reference semantics. The 5x interpreter threshold stays in `TESTING.md`
as a target; M4 re-measures it on the numeric kernels.

**Known gaps carried forward.**

- Float-heavy loops stay at 2.7x: constants are reloaded every iteration and `&&` chains are not fused. Loop-invariant
  code motion and float fused jumps belong to the IR passes (ZN-026).
- Direct threading was tried and was slower (70 ms); `-O3` made no difference.
- libm differs from V8's fdlibm in the last digit for `tan` (sin, cos, atan2, exp, log, atan matched). Bundle fdlibm
  before any transcendental golden.
- Heap values (objects, arrays, strings), closures, default parameters, exceptions and fixed-point kinds still have no
  bytecode (M2 and M3 tasks).

**Consequences.** M2 starts with ZN-012 (classes and closed-world layouts). Re-check the 1.5x budget rule at every
milestone gate using the per-task usage notes.
