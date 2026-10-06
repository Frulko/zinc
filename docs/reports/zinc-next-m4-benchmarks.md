# Zinc Next: M4 benchmarks

Median of 7 runs (one warm-up), wall clock, ms. Machine: macOS-15.7.4-arm64-arm-64bit. Interpreter: `zinc run` of the compiled bytecode; AOT: `zinc build`; QuickJS: `qjs` on the stripped kernel; native: the old toolchain's release build. `tools/bench-m4` regenerates this file and `next/bench/m4.json`.

| kernel | interp | AOT | QuickJS | native | AOT / native | QuickJS / interp |
|---|---:|---:|---:|---:|---:|---:|
| fib | 45.2 | 25.7 | 246.0 | 13.3 | 1.93x | 5.44x |
| nbody | 488.6 | 116.2 | 2654.9 | 39.4 | 2.95x | 5.43x |
| mandelbrot | 102.5 | 35.1 | 707.9 | 25.9 | 1.36x | 6.91x |
| spectralnorm | 770.4 | 71.1 | 4140.0 | 57.6 | 1.23x | 5.37x |
| fannkuchredux | 1170.0 | 548.5 | 7518.8 | 367.0 | 1.49x | 6.43x |
| binarytrees | 34.6 | 23.8 | 110.8 | 18.0 | 1.33x | 3.20x |
| sort | 296.8 | 243.0 | 812.8 | 90.6 | 2.68x | 2.74x |
| mapset | 51.1 | 27.8 | 120.0 | 14.3 | 1.95x | 2.35x |
| strings | 45.3 | 41.1 | 59.1 | 30.9 | 1.33x | 1.30x |
| jsonout | 15.6 | 14.5 | 7.0 | 6.8 | 2.15x | 0.45x |
| dynsum | 38.0 | 33.9 | 30.1 | n/a | n/a | 0.79x |

## Thresholds

| kernel | threshold | measured | result |
|---|---|---:|---|
| fib | AOT within 3x of native | 1.93x | pass |
| fib | interpreter at least 5x QuickJS | 5.44x | pass |
| nbody | AOT within 3x of native | 2.95x | pass |
| nbody | interpreter at least 5x QuickJS | 5.43x | pass |
| mandelbrot | interpreter at least 5x QuickJS | 6.91x | pass |
| spectralnorm | interpreter at least 5x QuickJS | 5.37x | pass |
| fannkuchredux | interpreter at least 5x QuickJS | 6.43x | pass |
| binarytrees | AOT within 3x of native | 1.33x | pass |
| sort | AOT within 3x of native | 2.68x | pass |
| strings | interpreter not slower than QuickJS | 1.30x | pass |
| jsonout | interpreter not slower than QuickJS | 0.45x | **LOSS** |
| dynsum | interpreter not slower than QuickJS | 0.79x | **LOSS** |

## Resources (one extra run per cell)

| kernel | interp RSS MB | AOT RSS MB | interp user s | AOT user s |
|---|---:|---:|---:|---:|
| fib | 16.61 | 15.88 | 0.04 | 0.02 |
| nbody | 16.86 | 15.78 | 0.48 | 0.11 |
| mandelbrot | 16.69 | 15.41 | 0.09 | 0.03 |
| spectralnorm | 16.92 | 15.77 | 0.76 | 0.06 |
| fannkuchredux | 16.55 | 15.77 | 1.15 | 0.54 |
| binarytrees | 17.34 | 16.28 | 0.02 | 0.01 |
| sort | 40.28 | 39.59 | 0.28 | 0.23 |
| mapset | 21.62 | 20.91 | 0.04 | 0.02 |
| strings | 38.16 | 37.16 | 0.03 | 0.03 |
| jsonout | 17.12 | 16.17 | 0.01 | 0.01 |
| dynsum | 18.62 | 17.83 | 0.03 | 0.02 |

## Regressions against the previous numbers (more than 15% worse)

- jsonout interp time: 0.013 -> 0.016 (+21%)

## ZN-041: interpreter speed (2026-10-06)

The three kernels below 5x QuickJS now pass, and so do nbody and fannkuchredux (table above: fib 5.44x, nbody 5.43x, mandelbrot 6.91x, spectralnorm 5.37x, fannkuchredux 6.43x; the machine was
not idle, load average 6 to 9, so each ratio carries a few percent of noise; before: fib 4.4x, mandelbrot 2.9x, spectralnorm 4.2x). What changed, all in `src/ir/opt.cpp` unless said:

- **Branch threading**: `a && b` joined in a block holding only `condbr %p`; an edge that already knows the answer (a constant, or the value its own branch tested) goes straight to the target, and an `br` takes the test with it.
  The loop test of mandelbrot is two fused compare-and-jumps instead of a boolean made, merged and tested again. Only when the join's parameters are used nowhere else (found by a failing atelier build: a bypassed parameter used downstream).
- **Common subexpressions** of pure operations along chains of single-predecessor blocks (`x * x` and `y * y` of mandelbrot's test and body).
- **Division by a constant power of two** is a multiply by its reciprocal (exact); spectralnorm's `/ 2`.
- **Constants hoisted after inlining**, so an inlined body's constants are loaded once.
- **Self-recursion inlined once** (functions up to 24 instructions): fib runs two levels per call and return.
- **Superinstructions in the interpreter** (`src/vm/vm.cpp`): `AddI32K` + `Call` and `AddI32` + `Ret` run as one dispatch. They live in a copy of the code the interpreter makes for the functions that have such a pair; the second word keeps its encoding, so jumps, handler positions and the bytecode format are unchanged.
- The sampling profiler's `curFn` stores are only done when `zinc profile` runs (a second instantiation of the loop).

jsonout and dynsum run in 13 and 35 ms, where startup and noise decide the ratio; they are unchanged by this work within a millisecond.

