# Zinc Next: M4 benchmarks

Median of 11 runs (one warm-up), wall clock, ms. Machine: macOS-15.7.4-arm64-arm-64bit. Interpreter: `zinc run` of the compiled bytecode; AOT: `zinc build`; QuickJS: `qjs` on the stripped kernel; native: the old toolchain's release build. `tools/bench-m4` regenerates this file and `next/bench/m4.json`.

| kernel | interp | AOT | QuickJS | native | AOT / native | QuickJS / interp |
|---|---:|---:|---:|---:|---:|---:|
| fib | 45.3 | 21.0 | 247.2 | 14.1 | 1.50x | 5.46x |
| nbody | 485.5 | 111.9 | 2637.7 | 39.2 | 2.85x | 5.43x |
| mandelbrot | 103.5 | 31.3 | 700.9 | 25.7 | 1.22x | 6.77x |
| spectralnorm | 764.3 | 66.6 | 4110.3 | 57.0 | 1.17x | 5.38x |
| fannkuchredux | 1161.4 | 538.4 | 7480.6 | 367.2 | 1.47x | 6.44x |
| binarytrees | 33.8 | 19.4 | 109.9 | 17.4 | 1.12x | 3.25x |
| sort | 137.6 | 105.3 | 814.6 | 89.5 | 1.18x | 5.92x |
| mapset | 52.7 | 24.4 | 115.9 | 15.0 | 1.63x | 2.20x |
| strings | 44.3 | 36.8 | 59.5 | 31.1 | 1.18x | 1.34x |
| jsonout | 15.8 | 10.2 | 7.1 | 6.4 | 1.59x | 0.45x |
| dynsum | 39.2 | 29.4 | 30.2 | n/a | n/a | 0.77x |

## Thresholds

| kernel | threshold | measured | result |
|---|---|---:|---|
| fib | AOT within 3x of native | 1.50x | pass |
| fib | interpreter at least 5x QuickJS | 5.46x | pass |
| nbody | AOT within 3x of native | 2.85x | pass |
| nbody | interpreter at least 5x QuickJS | 5.43x | pass |
| mandelbrot | interpreter at least 5x QuickJS | 6.77x | pass |
| spectralnorm | interpreter at least 5x QuickJS | 5.38x | pass |
| fannkuchredux | interpreter at least 5x QuickJS | 6.44x | pass |
| binarytrees | AOT within 3x of native | 1.12x | pass |
| sort | AOT within 3x of native | 1.18x | pass |
| strings | interpreter not slower than QuickJS | 1.34x | pass |
| jsonout | interpreter not slower than QuickJS | 0.45x | **LOSS** |
| dynsum | interpreter not slower than QuickJS | 0.77x | **LOSS** |

## Resources (one extra run per cell)

| kernel | interp RSS MB | AOT RSS MB | interp user s | AOT user s |
|---|---:|---:|---:|---:|
| fib | 16.62 | 9.45 | 0.04 | 0.01 |
| nbody | 17.08 | 9.73 | 0.47 | 0.10 |
| mandelbrot | 16.56 | 9.44 | 0.09 | 0.02 |
| spectralnorm | 16.89 | 9.78 | 0.75 | 0.06 |
| fannkuchredux | 16.75 | 9.58 | 1.15 | 0.53 |
| binarytrees | 17.52 | 10.11 | 0.02 | 0.01 |
| sort | 40.25 | 33.14 | 0.12 | 0.09 |
| mapset | 22.00 | 14.75 | 0.05 | 0.02 |
| strings | 38.34 | 31.16 | 0.03 | 0.03 |
| jsonout | 17.20 | 10.12 | 0.01 | 0.00 |
| dynsum | 18.97 | 11.83 | 0.03 | 0.02 |
