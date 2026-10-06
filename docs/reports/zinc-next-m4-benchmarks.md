# Zinc Next: M4 benchmarks

Median of 7 runs (one warm-up), wall clock, ms. Machine: macOS-15.7.4-arm64-arm-64bit. Interpreter: `zinc run` of the compiled bytecode; AOT: `zinc build`; QuickJS: `qjs` on the stripped kernel; native: the old toolchain's release build. `tools/bench-m4` regenerates this file and `next/bench/m4.json`.

| kernel | interp | AOT | QuickJS | native | AOT / native | QuickJS / interp |
|---|---:|---:|---:|---:|---:|---:|
| fib | 45.7 | 20.5 | 246.6 | 14.5 | 1.42x | 5.40x |
| nbody | 493.6 | 112.6 | 2652.6 | 39.1 | 2.88x | 5.37x |
| mandelbrot | 102.4 | 30.9 | 706.0 | 26.3 | 1.17x | 6.89x |
| spectralnorm | 767.6 | 66.5 | 4140.3 | 58.2 | 1.14x | 5.39x |
| fannkuchredux | 1220.2 | 539.1 | 7512.8 | 372.2 | 1.45x | 6.16x |
| binarytrees | 35.7 | 19.5 | 110.3 | 17.4 | 1.12x | 3.09x |
| sort | 137.1 | 104.2 | 814.6 | 90.6 | 1.15x | 5.94x |
| mapset | 52.8 | 24.4 | 127.1 | 14.8 | 1.65x | 2.40x |
| strings | 45.9 | 37.4 | 59.6 | 31.0 | 1.21x | 1.30x |
| jsonout | 16.3 | 10.1 | 7.1 | 7.0 | 1.44x | 0.44x |
| dynsum | 39.6 | 29.3 | 30.8 | n/a | n/a | 0.78x |

## Thresholds

| kernel | threshold | measured | result |
|---|---|---:|---|
| fib | AOT within 3x of native | 1.42x | pass |
| fib | interpreter at least 5x QuickJS | 5.40x | pass |
| nbody | AOT within 3x of native | 2.88x | pass |
| nbody | interpreter at least 5x QuickJS | 5.37x | pass |
| mandelbrot | interpreter at least 5x QuickJS | 6.89x | pass |
| spectralnorm | interpreter at least 5x QuickJS | 5.39x | pass |
| fannkuchredux | interpreter at least 5x QuickJS | 6.16x | pass |
| binarytrees | AOT within 3x of native | 1.12x | pass |
| sort | AOT within 3x of native | 1.15x | pass |
| strings | interpreter not slower than QuickJS | 1.30x | pass |
| jsonout | interpreter not slower than QuickJS | 0.44x | **LOSS** |
| dynsum | interpreter not slower than QuickJS | 0.78x | **LOSS** |

## Resources (one extra run per cell)

| kernel | interp RSS MB | AOT RSS MB | interp user s | AOT user s |
|---|---:|---:|---:|---:|
| fib | 16.52 | 9.41 | 0.04 | 0.01 |
| nbody | 16.77 | 9.61 | 0.49 | 0.10 |
| mandelbrot | 16.70 | 9.38 | 0.09 | 0.02 |
| spectralnorm | 16.97 | 9.58 | 0.76 | 0.06 |
| fannkuchredux | 16.62 | 9.48 | 1.21 | 0.53 |
| binarytrees | 17.00 | 10.02 | 0.02 | 0.01 |
| sort | 40.16 | 33.09 | 0.12 | 0.10 |
| mapset | 21.89 | 14.67 | 0.04 | 0.02 |
| strings | 38.19 | 31.12 | 0.03 | 0.03 |
| jsonout | 17.08 | 10.05 | 0.01 | 0.00 |
| dynsum | 18.83 | 11.75 | 0.03 | 0.02 |

## Regressions against the previous numbers (more than 15% worse)

- binarytrees quickjs peak RSS: 4.090 -> 5.080 (+24%)
- dynsum quickjs peak RSS: 3.890 -> 4.800 (+23%)
