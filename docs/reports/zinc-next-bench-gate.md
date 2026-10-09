# Zinc Next benchmark gate

`next/tools/bench-gate --baseline-zinc /path/to/reference/next/build/zinc`
compiles the four kernels with both builds and measures them on the same machine.
The reference is fixed at `fb610f986e50a0533301cbcc16b5addefb56089f`, the source
revision of the committed `next/bench/m4.json`. The candidate fails if either
engine produces incorrect output, exits unsuccessfully, or its median time is
more than 15% slower than the reference. `--inject-slowdown 1.2` still exercises
the regression failure. The JSON artifact retains both sets of measurements.
This mode measures interpreter and AOT only, against the committed golden
outputs; it requires neither Node, an external QuickJS, nor old-toolchain native
executables. The ordinary M4 report still measures those additional engines.

The reference checkout reconstructs SDL's omitted `include/build_config`
headers from `dc4d08f4` and the omitted host command-list declaration in
`runtime/include/hal.h` from `f1b0f48f`; these are the declarations its source
already uses. It does not change the reference engine. Build only the
`zinc` target in that checkout. The old optional WebGL and native plugin test
targets have unrelated build failures.
The historical build emits pre-existing compiler warnings; this comparison does
not certify that revision as warning-free. A focused reference build and run of
`fib` succeeded on both the bytecode interpreter and AOT with the exact golden
output and zero exit status.

## Why the old CI comparison was unreliable

[Run 37911881038](https://github.com/Frulko/zinc/actions/runs/37911881038/job/113758716472)
ran on `macos-14-arm64` / macOS 14.8.9 using Homebrew QuickJS 2026-06-04.
The committed table was measured on macOS 15.7.4; it records neither the CPU
model nor the QuickJS version. Dividing by QuickJS does not establish that a
native program and an interpreter scale equally on a different CPU. The logged
ratios therefore cannot alone identify an engine regression. Measuring a fixed
reference build on the same runner removes that assumption without replacing
the committed numbers or increasing the 15% tolerance.

The old harness checked only the warm-up's output. A crash or changed output in
a timed sample could be recorded as a fast run. It also hid the failing exit
status and stderr. All timed samples now require the golden output and a zero
exit status; resource samples require successful termination.

`--check-regressions` enforces correctness and the requested regression baseline.
Ordinary `bench-m4` reports still enforce the M4 performance targets. These are
separate checks: a fresh CI checkout has no old-toolchain native executables,
so it cannot evaluate the M4 AOT/native target. Missing or unreadable requested
regression baselines remain failures.

## Focused validation

`sh next/tests/t0/bench_harness.sh` tests successful reference comparisons,
injected 20% regressions, timed-run crashes, resource-sample failures, missing
references, unreadable baselines, and the unchanged ordinary M4 target verdicts.
These deterministic tests prove the gate's contract; actual performance still
requires an idle-machine run of the reference and candidate builds.
The dedicated CI benchmark job performs the actual comparison against the
pinned historical engine. T2 includes the deterministic T0 harness test and
does not repeat the timed benchmark sweep.

The reference and candidate programs are compiled before measurement; both are
warmed before timing, then their samples are interleaved with alternating
first/second order. This avoids comparing a cold candidate to a warmed reference.
A sequential self-comparison on the development machine incorrectly reported
`nbody` AOT +17% (40 ms versus 47 ms), despite using the identical engine for
both sides. The sampling-order regression test protects this correction.

## Final paired measurement

Candidate `b092de67`, rebased on `2ec2657b`, versus reference
`fb610f986e50a0533301cbcc16b5addefb56089f`, on macOS 15.7.4 ARM64,
Apple M1 Pro, Apple clang 17.0.0 (`clang-1700.6.4.2`).
Five paired samples per engine, with one checked warm-up each:

| Kernel | Engine | Reference ms | Candidate ms | Change |
|---|---|---:|---:|---:|
| fib | interpreter | 57.753 | 60.047 | +3.97% |
| fib | AOT | 13.457 | 13.042 | -3.09% |
| nbody | interpreter | 764.542 | 761.322 | -0.42% |
| nbody | AOT | 110.573 | 40.084 | -63.75% |
| sort | interpreter | 167.999 | 170.394 | +1.43% |
| sort | AOT | 109.761 | 106.582 | -2.90% |
| strings | interpreter | 49.370 | 50.553 | +2.40% |
| strings | AOT | 37.436 | 37.202 | -0.62% |

The following command exited 0:

```sh
ZINC=/tmp/zinc-fix-macos-ci/next/build/zinc next/tools/bench-gate \
  --baseline-zinc /tmp/zinc-benchmark-reference/next/build/zinc \
  --out /tmp/zinc-ci-pinned-paired.json
```

The artifact contains no
incorrect outputs, unsuccessful required-engine runs, or regressions. The
largest measured slowdown is 3.97%, below the unchanged 15% limit. This local
run validates the corrected method and final candidate; a fresh GitHub runner
confirmation is still pending the push. The older CI fib mismatch remains
unreproduced, rather than being assigned an unsupported runtime cause.
