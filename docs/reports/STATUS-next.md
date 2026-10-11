# Zinc Next: parity status

The parity gate of the plan (ZN-155): Zinc Next does what the prototype did. Measured on 2026-10-11 by `next/tools/parity-audit`,
which re-runs the three audits of `docs/reports/parity/` as one script (85 s) and writes `docs/reports/parity/gate.md`.

## Result

| audit | PASS | PARTIAL | MISSING | other |
|---|---|---|---|---|
| 01, table A: language, standard library, web platform (each snippet on the prototype and on zinc run) | 315 | 3 | 0 | 8 snippets the prototype itself refuses |
| 01, table C: diagnostics | 44 | 3 | 0 | `// @ts-ignore`: decision D88 |
| 01, table D: the prototype's CLI | 29 | 0 | 0 | no JIT (D13), no JavaScript back end; esp32 runs and cross builds wait for the cross-platform pass |
| 01, table E: host modules and std packages | 29 | 0 | 0 | |
| 01, table F: tests/conformance against the frozen outputs | 60 | 1 | 0 | |
| 02: example entries (tests/examples.lst, all run by tests/t2/examples_all.sh) | 74 | 0 | 0 | |
| 03: plugins (listed, each module imports) | 35 | 0 | 0 | |

No prototype feature is missing and no example is blocked. The PARTIAL rows are differences in output, listed in `gate.md`:
`p.then(x => promise)` does not flatten the promise it returns (`async`/`await` does), `console.log(-0)` prints `-0` where the
prototype printed `0`, an `i64` near 2^53 rounds differently, `tests/conformance/scroll_physics.tsx` prints nothing, and three
programs the prototype refuses run here (regular expression literals, `await` in a loop condition, an unused comma operand).

## Reproduce

```sh
cd next
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && tools/build zinc
tools/parity-audit                          # the three audits; exit 1 on any MISSING; writes docs/reports/parity/gate.md
tools/parity-audit --only A,C --out /tmp/a  # some sections only
tools/examples-status --check               # the example entries one by one (T1: tests/t1/examples_all.sh)
tests/run --tier t1 --only conformance      # the frozen conformance outputs
```

The prototype side needs Node 24 (`node compiler/src/cli.ts run main.ts --target sim` is the oracle of table A).
