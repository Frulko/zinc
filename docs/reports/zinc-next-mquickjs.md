# MicroQuickJS for constrained targets (ZN-043)

Question: should MicroQuickJS (mquickjs, Bellard, commit 6d4d7eb of 2026-09-26, MIT) be the compatibility engine for dynamic code on ESP32-class targets, a fallback where no C++ toolchain
exists, or dropped? The plan for those targets stays the typed bytecode core (ZN-030) and the AOT (ZN-042). Measured on this machine (Apple arm64) with a proxy for the flash size; no board was at hand
(ZN-055 is the hardware run), so every number below is a host or object-file number and says so.

## Method

- Built `mqjs` from the repository (`make`, `-Os`; and a `-O2` build for speed). The bench kernels of `tests/bench/kernels` were stripped of types with Node and rewritten to ES5 by hand where mquickjs needs it
  (`const`/`let` to `var`, the arrow comparator to a function; `nbody` uses a class and was not run). Outputs equal `corpus/bench/<k>.out`.
- Speed: median of 7 wall-clock runs, the Zinc interpreter with `zinc run kernel.zbc`, QuickJS (the `qjs` of Homebrew) on the same stripped file.
- RAM: the smallest `--memory-limit` (bytes of the engine's fixed heap) under which the kernel still runs (binary search).
- Flash: `zig cc -target thumb-linux-musleabihf -mcpu=cortex_a7 -Os -ffunction-sections`, the sum of the allocated sections of the object files (code and read-only data). Thumb-2, no libc, no standard library tables
  of the host program (`mqjs.c`, readline). The Zinc number is the device core: `src/rt`, `src/vm`, `src/zbc`, `src/dev/core.cpp` built with `-fno-exceptions -fno-rtti`, without libc++ (which a real build links, so it is a lower bound).

## Results

| kernel | mquickjs -O2 | QuickJS | Zinc interpreter | mquickjs / Zinc |
|---|---:|---:|---:|---:|
| fib | 190.8 ms | 242.9 | 41.6 | 4.6x slower |
| mandelbrot | 571.4 | 696.6 | 98.9 | 5.8x |
| spectralnorm | 3094.1 | 4116.5 | 762.5 | 4.1x |
| sort (comparator) | 889.8 | 811.3 | 135.4 | 6.6x |

mquickjs is about as fast as QuickJS (a little faster on the numeric kernels), as its README says, and 4 to 7 times slower than the Zinc interpreter, which is itself behind the typed AOT.

| | mquickjs | Zinc core |
|---|---:|---:|
| code and read-only data (Thumb-2, `-Os`) | **103 KB** (engine 87 KB, dtoa 7, libm 8, cutils 1) | **125 KB** (rtcalls 33, vm 26, zbc 45, machine 14, dev core 5, program 2) |
| fixed RAM to run fib or mandelbrot | **8 KB** heap | register file 24 KB (3000 slots) + 128 frames (3 KB) + the loaded module (up to 48 KB) |
| spectralnorm, three arrays of 1000 numbers | 40 KB heap | 180 KB of array storage (8 bytes per element: a Slot) |
| number in an array | 4 bytes (tagged 32-bit value) | 8 bytes |

So on an ESP32 mquickjs would use clearly less RAM (an order of magnitude for small programs, 4.5x for number arrays) at similar flash, and be several times slower than the typed core.

## What it would take

- **The language is ES5 in strict mode**, not "QuickJS made smaller": no `let`/`const`, arrow functions, classes, `Promise`, `Map`/`Set`, template strings, destructuring, modules or generators; arrays have no holes; `for of` only on arrays; Date only
  has `now()`. The ES2022 JavaScript that `--engine quickjs` (ZN-051) and the Zinc libraries use would need a downlevel and bundling step (and `async` a polyfill) before it runs; `zinc:ui` and the std library are not that.
- **Host binding**: a C function table built at compile time (`mquickjs_build`) and a moving, tracing GC (values must be registered with `JSGCRef` when held across calls). Our generated `__host_*` functions from the runtime table (`src/qjs`) would need
  a second generator for that table; `Slot` strings and arrays cross by copy.
- **Typed programs** would run as stripped ES5 on a engine without integers: `i32` wrap-around, `u8[]` and the typed numeric semantics are lost (typed arrays exist, the language rules do not).
- The research note (`research-2026-09-30/mquickjs.md`) estimated 12 to 15 days for an MVP and 35 to 50 for parity; nothing measured here contradicts it.

## Decision

**Drop for now; do not vendor.** Reasons: (1) for programs written in Zinc the typed core and the AOT are 4 to 7 times faster and already have the same flash cost, and RAM is the only axis where mquickjs wins; (2) the dynamic-code use
(`zinc:script`, npm code) is served on desktop and Pi by QuickJS-ng (ZN-051), and nothing in the plan needs on-device `eval` on an ESP32 yet; (3) the cost is an ES5 pipeline and a second binding generator for one engine.

**Revisit when** a product needs (a) user-supplied JavaScript to run on a device with under 100 KB of free RAM, or (b) Zinc programs that must run where the core does not fit (the core's 24 KB register file and 8-byte
slots are the pressure point; a smaller core configuration is the first thing to try, `Machine::stackSlots`). At that point adopt it as a **fallback engine behind `zinc:script`**, not as a second default: `third_party/mquickjs`, pinned to a commit, with the
ES5 downlevel step and the table generator described above.

Reproduce: `git clone https://github.com/bellard/mquickjs`, `make`, then `mqjs --memory-limit 10k kernel.js` on the ES5 kernels; the flash proxy is the `zig cc` line above.
