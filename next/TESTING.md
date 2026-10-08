# Zinc Next: testing, demos and thresholds

Goal: verify the engine at every step without paying for noisy output. The largest hidden cost in a session is raw
tool output staying in the context, so every runner prints a summary and writes details to a log file.

## What to run (read this first)

A task ends with the tests that cover **what it touched**, not with the corpus. Time spent on tests nobody needed is the most common waste of a session.

- `tests/run --changed` runs the T0/T1 tests mapped to the files changed since HEAD (`tests/affected.json`; add a mapping when you add a module or a test). It prints `pixel canary` when the change is visible: then `tools/proto-capture compare` (4 entries, 4 seconds).
- Add the one test of the new feature or the regression test of the bug (`--only <name>`). That is the whole end-of-task check.
- **Never at the end of a task:** `tools/proto-capture compare --all` (42 entries), `examples_all`, `tests/run --tier t2`, the benchmarks (`tools/bench-m4`), a fuzz run, a full `zinc test --profile`. These are T2: once per milestone, or when the shared core changed (raster, layout, text engine, IR, runtime) and then **in the background** (`run_in_background`) while the next task starts.
- A run that lasts more than a minute is a T2 job: do not wait for it; read its result later.
- Do not rebuild everything (`cmake --build build`) for a change of one library: build the target you need (`--target zinc`).

## Test tiers

| Tier | When | Scope | Output that reaches the session |
|---|---|---|---|
| T0 | After each change (seconds) | Golden or unit test of the stage touched only | One line per failure |
| T1 | End of a task | The milestone demo (below) | A summary of a few lines |
| T2 | End of a milestone, once | Whole corpus, interpreter vs AOT vs the frozen output of the current native toolchain (`tools/diff-matrix`, one line per program), benchmarks | Summary only; full log in `next/.logs/` |

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

## Pixel goldens (ZN-113)

`tests/golden/examples/proto/` holds the prototype's frames (`tools/proto-capture capture`, one command, `ZINC_SCALE=1`, deterministic; `ZINC_SCALE=1..4` is the pixel scale of a headless run) and `manifest.json` (entry, frame numbers, env, tolerance, `skip` reason). `tools/proto-capture compare` (T2: `tests/t2/examples_pixels.sh`) renders the same entries with this engine and runs the `tools/pngdiff` rules; a failure prints the differing pixel count and writes a diff image.

Tolerance policy: exact (`tol` 0, `max_diff` 0) by default, which holds for text-free UI and for text too while the engine uses the prototype's font renderer. A tolerance is allowed only where a library replaces the prototype's renderer (ThorVG, HarfBuzz, a codec) and is set per entry with the reason in the task that introduced the library. A difference not yet explained is a `known` row: it records the pixel count, may not grow, and is listed in ZN-223 until fixed. Entries the prototype renders no frame for (console, LED-matrix, device programs) are `skip` rows. Input scripts are not replayed yet (the manifest has no `input` field): frames are the first 30 of an idle run.

## Thresholds

Go/no-go values come from `docs/reports/zinc-next-design.md` (§9) and the research it cites. Anything not met is
reported with the measurement, not rounded.

| Gate | Threshold |
|---|---|
| M1 / ZN-011 | `fib` output equals golden with no Node; every program the checker accepts on a 30-file set is accepted by the oracle (0 violations); interpreter `fib` at least 5× faster than QuickJS; M1 used at most 1.5× its budget |
| M3 | 18/18 conformance in the interpreter (the 18 programs are listed in `next/corpus/M3-set.txt`: the pure-language ones, no `zinc:` imports or UI, which belong to M5); live objects 0 at exit; destruction order equals current native on the order fixtures |
| M4 | Interpreter and AOT byte-identical on the corpus; fib, nbody, binarytrees, sort within 3× of current native on AOT; interpreter at least 5× faster than QuickJS on numeric kernels and not slower on strings, jsonout and the Dyn kernel |
| M5 | Pixel golden identical |
| M6 | Hello runs on a device with no manual toolchain step |

Oracle and machine types: the oracle is the repo's tsc 7 with `lib/zinc.d.ts`, where `i32`, `f32`, `u8` and the other machine
types are aliases of `number` (`next/tools/oracle`). Our checker is therefore stricter than the oracle by design (it tracks
numeric kinds); the check is one-way: everything we accept the oracle accepts, and our extra rejections have our own
fixtures with Z-codes.

Benchmark method: median of 11 runs, idle machine, clean tree, versioned JSON artifact, losses published (lesson from
`docs/reports/perryts-comparison.md`).

## Budget rule

Task sizes: S ≈ 1 session, M ≈ 2–3, L ≈ 4+. If a task uses more than 1.5× its budget, split it and carry on (`RULES.md` §2); do not stop. Record `/usage` in the task notes at the end of each session so the
cost per milestone is measured, not guessed.

## Hardware and simulators

No test depends on a board. ESP32: Espressif QEMU and `zinc device-sim`; Pi and other ARM: QEMU user/system or the pinned zig cross build run in a container; PS1: PCSX-Redux; panels, LEDs, e-ink and IMU: the in-process emulators of the display
and sensor plugins; camera: the fake camera. Tests that need a tool the machine lacks exit 77 (`SKIP`).
