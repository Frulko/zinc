# Zinc Next: M4 benchmarks

Median of 11 runs (one warm-up), wall clock, ms. Machine: macOS-15.7.4-arm64-arm-64bit. Interpreter: `zinc run` of the compiled bytecode; AOT: `zinc build`; QuickJS: `qjs` on the stripped kernel; native: the old toolchain's release build. `tools/bench-m4` regenerates this file and `next/bench/m4.json`.

| kernel | interp | AOT | QuickJS | native | AOT / native | QuickJS / interp |
|---|---:|---:|---:|---:|---:|---:|
| fib | 60.8 | 40.1 | 267.3 | 14.2 | 2.82x | 4.40x |
| nbody | 499.6 | 115.6 | 2962.6 | 48.4 | 2.39x | 5.93x |
| mandelbrot | 279.8 | 50.2 | 832.2 | 27.7 | 1.82x | 2.97x |
| spectralnorm | 1027.7 | 77.6 | 4941.6 | 64.8 | 1.20x | 4.81x |
| fannkuchredux | 1311.7 | 571.2 | 7910.1 | 386.2 | 1.48x | 6.03x |
| binarytrees | 34.0 | 20.8 | 117.7 | 17.9 | 1.16x | 3.46x |
| sort | 297.3 | 285.4 | 854.4 | 95.6 | 2.99x | 2.87x |
| mapset | 54.5 | 28.0 | 163.4 | 17.7 | 1.58x | 3.00x |
| strings | 42.5 | 40.4 | 62.1 | 36.2 | 1.12x | 1.46x |
| jsonout | 12.9 | 24.4 | 15.3 | 16.6 | 1.47x | 1.19x |
| dynsum | 35.4 | 34.6 | 35.7 | n/a | n/a | 1.01x |

## Thresholds

| kernel | threshold | measured | result |
|---|---|---:|---|
| fib | AOT within 3x of native | 2.82x | pass |
| fib | interpreter at least 5x QuickJS | 4.40x | **LOSS** |
| nbody | AOT within 3x of native | 2.39x | pass |
| nbody | interpreter at least 5x QuickJS | 5.93x | pass |
| mandelbrot | interpreter at least 5x QuickJS | 2.97x | **LOSS** |
| spectralnorm | interpreter at least 5x QuickJS | 4.81x | **LOSS** |
| fannkuchredux | interpreter at least 5x QuickJS | 6.03x | pass |
| binarytrees | AOT within 3x of native | 1.16x | pass |
| sort | AOT within 3x of native | 2.99x | pass |
| strings | interpreter not slower than QuickJS | 1.46x | pass |
| jsonout | interpreter not slower than QuickJS | 1.19x | pass |
| dynsum | interpreter not slower than QuickJS | 1.01x | pass |

## Update after ZN-026 (2026-10-06)

Inlining and devirtualisation (`src/ir/opt.cpp`), float constants hoisted out of loops, loop counters updated in place, fused f64 compare-and-jump, borrowed-reference elision and register locals in AOT leaf functions. The AOT thresholds and the dynsum, jsonout and strings thresholds now hold. The interpreter is still below 5x QuickJS on fib (4.4x), mandelbrot (3.0x) and spectralnorm (4.8x). The machine was loaded (load average above 20), so ratios carry several percent of noise. What remains is per-instruction cost of f64 chains (each operand goes through memory and a GPR/FPR move), which needs superinstructions or a register-typed dispatch; it moves to ZN-041.
