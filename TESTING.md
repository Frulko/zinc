# Zinc Next: testing, demos and thresholds

Goal: verify the engine at every step without paying for noisy output. The largest hidden cost in a session is raw
tool output staying in the context, so every runner prints a summary and writes details to a log file.

## What to run (read this first)

A task ends with the tests that cover **what it touched**, not with the corpus. Time spent on tests nobody needed is the most common waste of a session.

- `tests/run --changed` runs the T0/T1 tests mapped to the files changed since HEAD (`tests/affected.json`; add a mapping when you add a module or a test). It prints `pixel canary` when the change is visible: then `tools/proto-capture compare` (4 entries, 4 seconds).
- `tests/run --changed-from <ref>` selects tests for committed changes relative to a Git ref (CI uses the push predecessor or pull-request base). Shared compiler/runtime changes and unmapped code fall back to all T0/T1 tests; a mapped file never hides an unmapped one.
- Add the one test of the new feature or the regression test of the bug (`--only <name>`). That is the whole end-of-task check.
- **Never at the end of a task:** `tools/proto-capture compare --all` (42 entries), `examples_all`, `tests/run --tier t2`, the benchmarks (`tools/bench-m4`), a fuzz run, a full `zinc test --profile`. These are T2: once per milestone, or when the shared core changed (raster, layout, text engine, IR, runtime) and then **in the background** (`run_in_background`) while the next task starts.
- A run that lasts more than a minute is a T2 job: do not wait for it; read its result later.
- The long scripted session of a feature (inputs, frames, goldens) runs on one engine; the other engines run the same program for a few frames and one hash. One golden per feature, not per step. A T1 test that lasts more than a minute on a quiet machine is shortened before it is committed (2026-10-11: one accessibility test ran 16 minutes under load and was cut at 30).
- A test script may call `timeout SECS cmd`: on a macOS without GNU coreutils, `tests/run` puts `tools/compat/timeout` (same contract, exit 124) on the PATH.
- Do not rebuild everything (`cmake --build build`) for a change of one library: build the target you need (`tools/build zinc`, which also keeps the load of parallel builds under the core count).

## CI scope

`make preflight` incrementally builds `zinc` and the native binaries T0 needs, then runs T0 locally, stopping on the first failure. It is opt-in; `make release` does not run it automatically. `make release-dry` only previews notes.
For committed changes, `make preflight BASE=<ref>` runs affected tests instead of all T0. Neither check replaces the full release validation.

For a hosted check without packages, benchmarks, reproducibility, fuzz or cross builds, use `gh workflow run zinc-next --ref develop -f mode=changed -f base=<last-published-tag>`. The comparison ref is required so a failed release on `main` cannot silently become the baseline. Shared core or unmapped code still conservatively selects all T0/T1 tests. Manual runs default to `mode=full`; release tags always keep all checks.

Pushes to `develop` and `main` run nothing. A release (`make release`) and a manual run (`gh workflow run zinc-next --ref develop`) run the whole tier T2 on macOS in six shards, split by the durations of the last report (`tests/ci/durations.txt`, refreshed by `tools/ci-durations`) so they end together, the tests that need no Mac on a Linux runner (`tests/ci/linux.txt`: the macOS shards skip them, the release gate requires their results), the package job (which runs `install_nocompiler` and `package` on the archive it built: the shards skip them), the fuzz job (Linux, Ubuntu's clang), the benchmark gate and the reproducible build. GitHub gives 5 macOS runners at a time to the whole run: a job that needs no Mac goes to Linux. A test that needs what a hosted runner has not (a real GPU, a display, a debugger, a timing, an emulator) exits 77 under `ZINC_CI` with the reason; a test never passes on CI without proving what it says (`docs/reports/test-audit-2026-10-21/`).

Owner exception (2026-10-23): `notify_relay` exits 77 under `ZINC_CI` because its intermittent hosted stall remains unresolved. It stays runnable locally with `tests/run --only notify_relay` and `ZINC_CI` unset. The `notify_relay_unit` and `notify_capture` checks remain enabled in CI; this exception does not disable the relay app.

## Test tiers

| Tier | When | Scope | Output that reaches the session |
|---|---|---|---|
| T0 | After each change (seconds) | Golden or unit test of the stage touched only | One line per failure |
| T1 | End of a task | The milestone demo (below) | A summary of a few lines |
| demo | By hand, and `--changed` when a demo changes | What a demo app itself does (`tests/demo/`), beyond its one T1 session; not run by CI | Summary only |
| T2 | End of a milestone, once | Whole corpus, interpreter vs AOT vs the frozen output of the current native toolchain (`tools/diff-matrix`, one line per program), benchmarks | Summary only; full log in `.logs/` |

Runner rules (built in ZN-002):

- One line per program: `PASS name` or `FAIL name`. Details (diff, stack, sanitizer report) go to `.logs/<run>.log`;
  print the path and the first 20 lines of a failure only.
- Exit code is non-zero if anything fails; no other output on success except the totals.
- `--only <name>` runs one program, from any tier (a name that matches nothing is an error); `--tier t0|t1|t2` selects the scope.
- Cross-target runs (Docker, QEMU, PCSX-Redux) are T2 and M6 only, never part of T0 or T1.

## Demos (one per milestone)

| Milestone | Demo | Proves |
|---|---|---|
| M0 | `tests/run --tier t1` on the frozen corpus with the stub binary | Goldens are readable without Node; runner is quiet |
| M1 | `zinc run fib.ts` | Parser → checker → IR → ZBC → interpreter, no Node |
| M2 | `examples/lang` | Subset breadth |
| M3 | `errors` and `async` conformance, live objects 0 at exit | Memory and control flow |
| M4 | Benchmark table: fib, nbody, binarytrees, sort, strings, jsonout, Dyn kernel | Speed claims, including losses |
| M5 | One UI screen, headless, pixel golden | Runtime reuse |
| M6 | Hello on ESP32 (QEMU first, then device) with no manual install | Single-app goal |

## Pixel goldens (ZN-113)

`tests/golden/examples/proto/` holds the prototype's frames, frozen since the prototype was removed (captured at `ZINC_SCALE=1`, deterministic; `ZINC_SCALE=1..4` is the pixel scale of a headless run; a new entry gets a golden of this engine, reviewed by eye) and `manifest.json` (entry, frame numbers, env, tolerance, `skip` reason). `tools/proto-capture compare` (T2: `tests/t2/examples_pixels.sh`) renders the same entries with this engine and runs the `tools/pngdiff` rules; a failure prints the differing pixel count and writes a diff image.

Tolerance policy: exact (`tol` 0, `max_diff` 0) by default, which holds for text-free UI and for text too while the engine uses the prototype's font renderer. A tolerance is allowed only where a library replaces the prototype's renderer (ThorVG, HarfBuzz, a codec) and is set per entry with the reason in the task that introduced the library. A difference not yet explained is a `known` row: it records the pixel count, may not grow, and is listed in ZN-223 until fixed. Entries the prototype renders no frame for (console, LED-matrix, device programs) are `skip` rows. Input scripts are not replayed yet (the manifest has no `input` field): frames are the first 30 of an idle run.

## Thresholds

Go/no-go values come from `docs/reports/zinc-next-design.md` (§9) and the research it cites. Anything not met is
reported with the measurement, not rounded.

| Gate | Threshold |
|---|---|
| M1 / ZN-011 | `fib` output equals golden with no Node; every program the checker accepts on a 30-file set is accepted by the oracle (0 violations); interpreter `fib` at least 5× faster than QuickJS; M1 used at most 1.5× its budget |
| M3 | 18/18 conformance in the interpreter (the 18 programs are listed in `corpus/M3-set.txt`: the pure-language ones, no `zinc:` imports or UI, which belong to M5); live objects 0 at exit; destruction order equals current native on the order fixtures |
| M4 | Interpreter and AOT byte-identical on the corpus; fib, nbody, binarytrees, sort within 3× of current native on AOT; interpreter at least 5× faster than QuickJS on numeric kernels and not slower on strings, jsonout and the Dyn kernel (jsonout, ~1 ms of work, is judged on its work: each engine's cycles for the kernel minus its cycles for an empty program, measured in alternation by `tools/bench-m4`, ZN-648) |
| M5 | Pixel golden identical |
| M6 | Hello runs on a device with no manual toolchain step |

Oracle and machine types: the oracle is the repo's tsc 7 with `lib/zinc.d.ts`, where `i32`, `f32`, `u8` and the other machine
types are aliases of `number` (`tools/oracle`). Our checker is therefore stricter than the oracle by design (it tracks
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
