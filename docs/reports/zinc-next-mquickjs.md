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

## On the board (owner, 2026-10-21)

The owner attached an ESP32-2432S022C and asked whether mquickjs can run there with Node tooling (esbuild and the like) preparing the
JavaScript for the engine's limits, the program compiled ahead rather than parsed on the board. It can: `firmware/esp32-mquickjs`
(README there) runs a touch Breakout written in modern TypeScript at 85 to 89 fps. Board: ESP32-D0WD-V3 rev 3.1 at 240 MHz, no PSRAM,
4 MB flash; ESP-IDF 5.5.5, `-O2`; the same vendored commit 6d4d7eb (`third_party/mquickjs`).

**The pipeline.** First a Node script (esbuild with SWC per file), then, at the owner's request ("on veut l'intégration dans zinc ! et
l'aot mais avec option mquickjs"), `zinc` itself without Node (`src/cli_mqjs.cpp`, `zinc run|export|flash --target esp32 --engine
mquickjs`): `zinc bundle`'s transform and esbuild link the program as for `--engine quickjs` (zinc:gfx is its QuickJS module, tree-shaken);
the standalone SWC 1.16.18 binary, pinned in `src/tc` like esbuild, lowers the linked program to ES5 (preset-env targets IE 11, loose,
iterables assumed to be arrays because mquickjs has no `Symbol.iterator`, `**` kept since mquickjs has it, the source map chained to the
bundle's); `js/prelude.js` adds the ES2015+ library methods mquickjs lacks and an `Object.create` that takes descriptors, `js/post.js`
replaces two SWC helpers (`_construct`: no `Reflect.construct`; `_object_spread_props`: no `getOwnPropertyDescriptors`); `zinc-mqjs` (the
stock `mqjs.c`, built beside zinc) runs the program for 300 frames against the board's host calls (`js/sim.js`) inside twice the board's
heap, and errors are mapped back to the TypeScript line; last, `mqjs -m32 -o` writes 32-bit bytecode (with columns, so the board's traces
map back too). esbuild alone cannot do it (it does not lower `let`, classes or arrow functions to ES5) and TypeScript dropped its ES5
target in 7.0, so SWC is the lowering step.
Bytecode compiled by the stock `mqjs` runs against the board's own ROM standard library: atoms are resolved when the board relocates it,
and the engine's atom table does not depend on what the board adds (checked: the generated `mquickjs_atom.h` is the same).

The first figures are those of a small Breakout written against the firmware's own API (`screen.rect`, `requestAnimationFrame`), before
the firmware took `zinc:gfx`'s host calls instead:

| Breakout demo (145 lines of TypeScript, two modules) | |
|---|---:|
| ES5 bundle | 9,332 bytes |
| bytecode (`--no-column`; columns would add 1.2 KB) | 11,800 bytes, of which the prelude 3.9 KB |
| start: bytecode read from flash, relocated, loaded | **5.2 ms** |
| start: the same program as ES5 source, parsed on the board (`--source`) | 88 ms |
| frame: JavaScript (physics, ~115 draw calls through the C API) | 6.4 to 6.7 ms |
| frame: render and send, only changed 16-row bands (3.9 of 20 per frame) | 4.2 to 4.6 ms → **85 to 89 fps** |
| frame: render and send, the whole screen every frame | 23.3 ms → 33 fps |
| JavaScript heap (fixed buffer) | 96 KiB; 14 to 94 KiB in use between collections, mostly boxed float64 (12 bytes each) |

| Firmware | |
|---|---:|
| image | **319 KB** (Zinc Next core, no display: 888 KB; the prototype's AOT build of the widgets demo: 1.2 MB) |
| mquickjs + ROM standard library + font + board code (`libmain.a`) | 109 KB code, 15 KB read-only data, 17.5 KB `.bss` (the display list) |
| heap free at start, after the panel and touch drivers | 256 KB, largest block 124 KB; 145 KB left once the JS heap and the bytecode are allocated |

**`examples/breakout`, unchanged.** Since the firmware defines the `__host_gfx*` functions zinc:gfx's QuickJS module calls and calls
`__zincFrameCb` each frame, a Zinc program on `zinc:gfx` runs as it is. `examples/breakout` (411 lines, six modules, classes, template
strings) is 25,764 bytes of bytecode (with columns) and loads in 9.6 ms on the board; uncapped it ran at 250 to 420 fps on its title screen
(0.4 to 0.8 of 20 bands sent per frame), and the frame loop is now held to the panel's 60 Hz. It draws the original look: `image()` is -1
on the board, so `skinLoaded()` is false, as on a target that bakes no images. The owner saw it on the board ("le breakout marche super").

**Without the board: esp32sim** (`docs/reports/esp32sim.md`). esp32sim 0.3.0 boots the real bootloader and app of a classic ESP32 but has no
I2S LCD (i80) mode, so the firmware has a second build with the panel on SPI as esp32sim's T-Display board wires it (`-DZN_PANEL=spi`,
`prebuilt/zinc-mquickjs-sim-flash.bin`); `zinc run ... --emulator` runs it with the program in its flash and writes the panel's 240x320 RAM
as a PNG. `examples/breakout` there: 62.6 fps (the 60 Hz cap), 8 emulated seconds in 1.6 s on an M1 Pro, the frame as on the board.
Touch and a live view (2026-10-22): zinc builds esp32sim from its v0.3.0 sources with a patch (`tools/esp32sim/`) that adds the board
`esp32-2432s022-spi`, the T-Display's wiring with the 2432S022's 240x320 glass and its CST820 at 0x15 on I2C0 (SDA 21, SCL 22), so the
firmware's touch probe finds it; an `--emulator-script` line `3.0 touch 72 298 1` taps the screen. `--emulator --live` shows the panel in
the engine's window, paced to real time, the mouse as the finger (esp32sim's `--web` socket carries frames out and touches in).
`examples/esp32-widgets`: a scripted tap on Input turns the page, 6 emulated seconds in 3.5 s. Live, 11.0 emulated seconds in 11.3 s;
the window shows 26 to 35 frames a second of `examples/breakout` (esp32sim sends a frame when the panel changed, 50 a second at most) and
4 to 6 of the widgets' quiet pages (`tests/t1/esp32sim_touch.sh`).

**Lighter (2026-10-22, owner: "le build le plus light possible").** Measured on the board with `examples/breakout`, before → after:

| | before | after |
|---|---:|---:|
| app image (`idf.py size`) | 319 KB | 268 KB |
| merged flash image | 387 KB | 333 KB |
| static DRAM | 30.5 KB | 27.7 KB |
| ESP-IDF components built | 109 | 58 |
| heap free while the program runs | 121 KB | 153 KB |
| JavaScript per frame (title screen) | 2.0-2.7 ms | 1.6-2.3 ms |
| render and send per frame | 1.4-1.5 ms | 1.8-2.0 ms |
| bytecode load at boot | 10.1 ms | 4.9 ms |

What does it: the bytecode runs from the memory-mapped flash (relocated once per program and firmware into a copy in the js partition,
12 ms; a program can be 256 KB), ESP-IDF at -Os with the engine and main.c at -O2, newlib nano, no assertion texts or error names,
`MINIMAL_BUILD`. Reading bytecode through the flash cache alone made JavaScript 2.7 times slower (5.4-7.6 ms): the interpreter's own code
shared the 32 KB cache. Putting `JS_Call` (9 KB) in IRAM (`main/linker.lf`) and the flash at 80 MHz made it faster than the RAM copy.
mquickjs needed one patch for flash bytecode: `JS_MakeUniqueString` wrote `is_unique` into a string of the bytecode (a computed property
name), a LoadStoreError on flash; it now interns a RAM copy. Minifying the program (esbuild) saves 1 KB of bytecode and loses the error
positions, `--no-column` 2.2 KB: neither is used, since bytecode no longer costs RAM. The prelude costs about 5 KB of JavaScript heap
(9.3 KB measured on the 64-bit host).

What the board shows: the vendor's ST7789 tuning sequence from the prototype's driver, MADCTL 0x08, 10 MHz on the 8-bit i80 bus
(esp_lcd over the ESP32's I2S, which copies each band into its own DMA buffer, so the next band renders while one is sent). A band is
re-sent only when the hash of the commands touching it changes, so a still screen costs no transfer. The CST820 touch answers at 0x15
(the firmware found it). The owner checked the picture; the touch direction is not checked yet.

What the preparation does not cover: `Map`, `Set`, `WeakMap`, `Symbol`, `Promise`/`async`, generators' iterators, `Proxy`, `Reflect`, `Date`
objects. These fail in the check on the computer, before anything is flashed, with the TypeScript file and line (`tests/t0/mquickjs_esp32.sh`
proves it with `Map`). Of note on the board: every number outside the 31-bit integers is a 12-byte heap value on a 32-bit CPU, so float
math makes garbage at every operation (60 KB in one 5-second dump); the compacting GC keeps up at 85 fps here, pauses are not measured.

Flashing: the firmware once (`zinc flash --target esp32 --engine mquickjs`), then each program alone (12 KB in 0.7 s at 460800 baud). Reading the flash back failed through
the board's CH340 on macOS with esptool's stub at every baud rate (bytes lost); `esptool --no-stub read-flash` works (5 KB/s). The board's
previous image (the prototype's widgets demo) is kept in `~/esp32-2432s022-backup/flash-2026-10-21.bin` (sha256 dc1a533b…);
`esptool write-flash 0 <file>` restores it.

**Decision, revised.** The ZN-043 conclusion holds for Zinc programs: the typed core and the AOT stay the way Zinc runs on an ESP32, and
the AOT is the "compiled directly" path. But the revisit condition (a) is met in practice: plain JavaScript on a PSRAM-less ESP32 is
viable with mquickjs when the preparation happens on the computer, with fast starts from flash bytecode, a small firmware and a real frame
rate. The owner made it a `zinc` option on 2026-10-21: the AOT stays the default way Zinc runs on an ESP32 (`docs/reports/zinc-next-esp32-aot.md`
plans it for the widgets demo), and `--engine mquickjs` runs a `zinc:gfx` program as JavaScript on the board's MicroQuickJS firmware. The
follow-ups are lines in `backlog/later.md`.
