# Zinc Next: M4 benchmarks

Median of 11 runs (one warm-up), wall clock, ms. Machine: macOS-15.7.4-arm64-arm-64bit. Interpreter: `zinc run` of the compiled bytecode; AOT: `zinc build`; QuickJS: `qjs` on the stripped kernel; native: the old toolchain's release build. `tools/bench-m4` regenerates this file and `next/bench/m4.json`.

| kernel | interp | AOT | QuickJS | native | AOT / native | QuickJS / interp |
|---|---:|---:|---:|---:|---:|---:|
| fib | 56.8 | 31.3 | 253.1 | 14.0 | 2.23x | 4.46x |
| nbody | 527.9 | 142.5 | 2651.2 | 39.0 | 3.65x | 5.02x |
| mandelbrot | 260.5 | 26.4 | 725.6 | 29.3 | 0.90x | 2.78x |
| spectralnorm | 1378.0 | 162.3 | 5209.0 | 64.0 | 2.54x | 3.78x |
| fannkuchredux | 1490.8 | 661.1 | 7575.5 | 372.5 | 1.77x | 5.08x |
| binarytrees | 40.0 | 29.2 | 110.3 | 18.1 | 1.62x | 2.76x |
| sort | 289.7 | 251.7 | 822.0 | 92.8 | 2.71x | 2.84x |
| mapset | 44.6 | 24.9 | 127.8 | 16.0 | 1.56x | 2.87x |
| strings | 47.1 | 43.0 | 61.6 | 32.6 | 1.32x | 1.31x |
| jsonout | 8.4 | 8.6 | 9.6 | 8.0 | 1.08x | 1.14x |
| dynsum | 392.9 | 308.7 | 31.4 | n/a | n/a | 0.08x |

## Thresholds

| kernel | threshold | measured | result |
|---|---|---:|---|
| fib | AOT within 3x of native | 2.23x | pass |
| fib | interpreter at least 5x QuickJS | 4.46x | **LOSS** |
| nbody | AOT within 3x of native | 3.65x | **LOSS** |
| nbody | interpreter at least 5x QuickJS | 5.02x | pass |
| mandelbrot | interpreter at least 5x QuickJS | 2.78x | **LOSS** |
| spectralnorm | interpreter at least 5x QuickJS | 3.78x | **LOSS** |
| fannkuchredux | interpreter at least 5x QuickJS | 5.08x | pass |
| binarytrees | AOT within 3x of native | 1.62x | pass |
| sort | AOT within 3x of native | 2.71x | pass |
| strings | interpreter not slower than QuickJS | 1.31x | pass |
| jsonout | interpreter not slower than QuickJS | 1.14x | pass |
| dynsum | interpreter not slower than QuickJS | 0.08x | **LOSS** |

## Reading the losses (2026-10-06, nothing rounded)

Five of the fifteen thresholds are not met. They are the starting point of ZN-025 and ZN-026, not a pass:

- **Interpreter vs QuickJS on numeric kernels** (fib 4.46x, mandelbrot 2.78x, spectralnorm 3.78x; threshold 5x). The register interpreter
  still does a memory load and store per operand and has no superinstructions beyond the fused compare-and-jump; fib is dominated by
  call overhead (a frame push and window set-up per call). Candidates for ZN-026: inlining small functions, more fused ops,
  keeping loop variables out of the call window.
- **AOT vs native on nbody** (3.65x; threshold 3x). The generated C++ keeps the registers in the machine stack, so the compiler cannot
  keep the doubles in machine registers. Fix: copy the registers to C++ locals for functions that make no calls into the runtime
  (or promote them with `register`-style locals and write back around calls). mandelbrot is already faster than the old native build
  (0.90x), so the gap is not the object model.
- **Dyn (dynsum) vs QuickJS** (0.08x, about 12x slower). QuickJS parses JSON in C; ours is a Zinc recursive-descent parser running in the
  interpreter and allocating one object per value. ZN-025 (inline caches) does not fix this alone; the parser should become a runtime
  call that builds the tree directly, and property reads on a `DynObj` need an inline cache.

Passes worth noting: AOT is within 3x of the old native build on fib (2.23x), binarytrees (1.62x) and sort (2.71x), and the interpreter is
faster than QuickJS on every typed kernel, including strings (1.31x) and jsonout (1.14x).
