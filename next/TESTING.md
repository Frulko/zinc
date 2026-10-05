# Zinc Next: testing, demos and thresholds

Goal: verify the engine at every step without paying for noisy output. The largest hidden cost in a session is raw
tool output staying in the context, so every runner prints a summary and writes details to a log file.

## Test tiers

| Tier | When | Scope | Output that reaches the session |
|---|---|---|---|
| T0 | After each change (seconds) | Golden or unit test of the stage touched only | One line per failure |
| T1 | End of a task | The milestone demo (below) | A summary of a few lines |
| T2 | End of a milestone, once | Whole corpus, interpreter vs AOT vs current native, benchmarks | Summary only; full log in `next/.logs/` |

Runner rules (built in ZN-002):

- One line per program: `PASS name` or `FAIL name`. Details (diff, stack, sanitizer report) go to `next/.logs/<run>.log`;
  print the path and the first 20 lines of a failure only.
- Exit code is non-zero if anything fails; no other output on success except the totals.
- `--only <name>` runs one program; `--tier t0|t1|t2` selects the scope.
- Cross-target runs (Docker, QEMU, PCSX-Redux) are T2 and M6 only, never part of T0 or T1.

## Demos (one per milestone)

| Milestone | Demo | Proves |
|---|---|---|
| M0 | `next/tests/run --tier t1` on the frozen corpus with the stub binary | Goldens are readable without Node; runner is quiet |
| M1 | `zinc run fib.ts` | Parser → checker → IR → ZBC → interpreter, no Node |
| M2 | `examples/lang` | Subset breadth |
| M3 | `errors` and `async` conformance, live objects 0 at exit | Memory and control flow |
| M4 | Benchmark table: fib, nbody, binarytrees, sort, strings, jsonout, Dyn kernel | Speed claims, including losses |
| M5 | One UI screen, headless, pixel golden | Runtime reuse |
| M6 | Hello on ESP32 (QEMU first, then device) with no manual install | Single-app goal |

## Thresholds

Go/no-go values come from `docs/reports/zinc-next-design.md` (§9) and the research it cites. Anything not met is
reported with the measurement, not rounded.

| Gate | Threshold |
|---|---|
| M1 / ZN-011 | `fib` output equals golden with no Node; checker accepts exactly the programs `tsgo` accepts on a 30-file set (0 disagreements on accepted programs); interpreter `fib` at least 5× faster than QuickJS; M1 used at most 1.5× its budget |
| M3 | 18/18 conformance in the interpreter; live objects 0 at exit; destruction order equals current native on the order fixtures |
| M4 | Interpreter and AOT byte-identical on the corpus; fib, nbody, binarytrees, sort within 3× of current native on AOT; interpreter at least 5× faster than QuickJS on numeric kernels and not slower on strings, jsonout and the Dyn kernel |
| M5 | Pixel golden identical |
| M6 | Hello runs on a device with no manual toolchain step |

Benchmark method: median of 11 runs, idle machine, clean tree, versioned JSON artifact, losses published (lesson from
`docs/reports/perryts-comparison.md`).

## Budget rule

Task sizes: S ≈ 1 session, M ≈ 2–3, L ≈ 4+. If a task uses more than 1.5× its budget, stop and decide with the
maintainer: simplify, split, or change approach. Record `/usage` in the task notes at the end of each session so the
cost per milestone is measured, not guessed.
