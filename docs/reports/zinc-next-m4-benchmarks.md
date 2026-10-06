# Zinc Next: M4 benchmarks

Median of 11 runs (one warm-up), wall clock, ms. Machine: macOS-15.7.4-arm64-arm-64bit. Interpreter: `zinc run` of the compiled bytecode; AOT: `zinc build`; QuickJS: `qjs` on the stripped kernel; native: the old toolchain's release build. `tools/bench-m4` regenerates this file and `next/bench/m4.json`.

| kernel | interp | AOT | QuickJS | native | AOT / native | QuickJS / interp |
|---|---:|---:|---:|---:|---:|---:|
| fib | 82.7 | 61.0 | 419.1 | 31.8 | 1.92x | 5.07x |
| nbody | 985.8 | 213.3 | 3971.8 | 64.2 | 3.32x | 4.03x |
| mandelbrot | 297.6 | 43.5 | 957.8 | 35.5 | 1.23x | 3.22x |
| spectralnorm | 1335.0 | 138.2 | 7621.3 | 67.0 | 2.06x | 5.71x |
| fannkuchredux | 1667.0 | 796.8 | 8848.8 | 394.6 | 2.02x | 5.31x |
| binarytrees | 44.4 | 26.7 | 134.5 | 28.6 | 0.93x | 3.03x |
| sort | 303.2 | 255.8 | 861.5 | 94.2 | 2.71x | 2.84x |
| mapset | 56.9 | 26.8 | 140.7 | 16.3 | 1.65x | 2.47x |
| strings | 43.2 | 39.6 | 63.1 | 35.3 | 1.12x | 1.46x |
| jsonout | 11.6 | 11.3 | 7.8 | 10.8 | 1.04x | 0.67x |
| dynsum | 35.3 | 32.8 | 32.7 | n/a | n/a | 0.93x |

## Thresholds

| kernel | threshold | measured | result |
|---|---|---:|---|
| fib | AOT within 3x of native | 1.92x | pass |
| fib | interpreter at least 5x QuickJS | 5.07x | pass |
| nbody | AOT within 3x of native | 3.32x | **LOSS** |
| nbody | interpreter at least 5x QuickJS | 4.03x | **LOSS** |
| mandelbrot | interpreter at least 5x QuickJS | 3.22x | **LOSS** |
| spectralnorm | interpreter at least 5x QuickJS | 5.71x | pass |
| fannkuchredux | interpreter at least 5x QuickJS | 5.31x | pass |
| binarytrees | AOT within 3x of native | 0.93x | pass |
| sort | AOT within 3x of native | 2.71x | pass |
| strings | interpreter not slower than QuickJS | 1.46x | pass |
| jsonout | interpreter not slower than QuickJS | 0.67x | **LOSS** |
| dynsum | interpreter not slower than QuickJS | 0.93x | **LOSS** |

## Update after ZN-025 (2026-10-06)

Changes that moved the numbers: `JSON.parse` is a runtime call that builds the Dyn tree natively (keys, short strings, small integers and
booleans shared), Dyn property reads and number additions have native fast paths, the number-to-string conversion uses the standard
library's shortest round-trip (`std::to_chars`) instead of a snprintf loop (a template-literal loop went from 245 to 74 ms), and mimalloc
(`third_party/`) serves every allocation.

**Caveat on this table:** the machine was far from idle while it ran (load average above 20 from unrelated processes), so absolute times
are inflated by up to 1.5x against the first table and the ratios carry noise of several percent. The method requires an idle machine; rerun
`tools/bench-m4` on one before quoting a threshold as met or lost.

Where dynsum stands: parsing alone is faster than QuickJS (27.7 ms against 30.4 ms for the 20 parses, measured before the load rose), the text
building is about 3.5 ms slower, and the walk is about 5 ms slower (the Dyn helpers cost a call each; inlining, ZN-026, removes it). In total the
kernel is about 7 to 10 percent slower than QuickJS, so that threshold is still open and moves to ZN-026.
