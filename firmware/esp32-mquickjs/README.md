# mquickjs on the ESP32-2432S022

[MicroQuickJS](https://github.com/bellard/mquickjs) (`third_party/mquickjs`) as a JavaScript engine of the JCZN ESP32-2432S022C, the
2.2" "cheap yellow display" (ESP32-WROOM-32 without PSRAM, ST7789 240x320 on an 8-bit i80 bus, CST820 touch; `boards/esp32-2432s022.json`),
behind `zinc:gfx`: a program written for Zinc's 2D API runs here unchanged, as `examples/breakout` does (owner, 2026-10-21). Findings:
`docs/reports/zinc-next-mquickjs.md`.

```
zinc (on the computer, src/cli_mqjs.cpp)                                                      the board
  main.ts ── zinc bundle ── SWC (ES5) ── + js/prelude.js ── zinc-mqjs: 300 frames ── -m32 ── app.img ─┐
             (the transform,                                 against js/sim.js     (bytecode)        │
              zinc:gfx, esbuild)                                                                     ▼
                                     firmware (flashed once): mquickjs + panel + touch ◀── js partition (0x110000)
```

## Use

```sh
zinc flash --target esp32 --engine mquickjs                           # once: the firmware (prebuilt/zinc-mquickjs-flash.bin)
zinc run examples/breakout --target esp32 --engine mquickjs            # each change: prepare, write the program (a few KB), show the UART
zinc run examples/breakout --target esp32 --engine mquickjs --emulator # the same in esp32sim, no board: 10 s emulated, the last frame as a PNG
zinc export examples/breakout --target esp32 --engine mquickjs         # dist/breakout-esp32: firmware.bin, app.img, flash.sh
```

`--port` names the serial port, `--run-ms` stops after that long (on the emulator: emulated time), `--frames` sets the length of the check on
the computer. The firmware's figures (fps, milliseconds of JavaScript and of drawing, bands sent, free heap) arrive on the UART every 5 s. An
uncaught exception stops the program and is shown on the screen and on the UART; zinc maps its positions back to your files.

## What the board has of `zinc:gfx`

`width`, `height` (240x320), `pixelScale`, `clear`, `rect`, `rrect` (radius and alpha), `text` (the 8x8 font of SDL3's debug text, public
domain, printable ASCII), `keep`, `onFrame` (60 Hz at most, the panel's rate), `pointerX`, `pointerY`, `pointerDown`, `touchCount`,
`touchX`, `touchY` (the finger), `isDown` and `wasPressed` (false: no buttons), `image` (-1: no images, so a program falls back as on a target
that bakes none). `js/sim.js` lists them for the check and `main/zn_stdlib.c` defines them; they must agree (`tests/t0/mquickjs_esp32.sh`).
Another `zinc:gfx` call throws when it is called, naming itself, and the check on the computer catches it before anything is sent.
`print`, `console.log`, `performance.now()` and `Date.now()` (milliseconds since boot; no clock, so `new Date()` throws) are there too.

## What the preparation covers

- **Syntax**: SWC lowers the linked program to ES5: `let`/`const`, arrow functions, classes (fields, getters, `extends`, `super`), template
  strings, destructuring, spread and rest, default parameters, `?.`, `??`, `for of`. Iterables are assumed to be arrays (mquickjs has no
  `Symbol.iterator`); `**` stays (mquickjs has it). `js/swcrc.json` is the configuration.
- **Helpers**: SWC writes them inline; `js/post.js` writes again those mquickjs cannot run (`_construct`, `_object_spread_props`).
- **Library**: `js/prelude.js` adds what is missing where it is missing (`Array.prototype.find/findIndex/includes/fill`, `Array.from/of`,
  `String.prototype.startsWith/endsWith/includes/padStart/padEnd`, `Object.assign/entries/values/freeze`, `Number.isInteger/isFinite`,
  `Math.hypot`, `Object.create` with descriptors).
- **Not covered**: `Map`, `Set`, `WeakMap`, `Symbol`, `Promise` and `async`, timers, generators' iterators, `Proxy`, `Reflect`, `Date`
  objects. A program that uses them fails in the check, with its file and line.
- **The check**: `zinc-mqjs` (the host mquickjs, built beside zinc) runs the program for `--frames` frames against `js/sim.js` inside twice
  the board's heap (the computer's values are 8 bytes, the board's 4).

## The firmware

`tools/build-esp32-core mquickjs` builds it with ESP-IDF 5.5 and writes both images of `prebuilt/`: the board's, and the emulator's
(`-DZN_PANEL=spi`: the panel on SPI, as esp32sim's T-Display board wires it, `docs/reports/esp32sim.md`). Commit them after changing
`main/` or `third_party/mquickjs`.

- JavaScript heap: 96 KiB (`JS_HEAP` in `main/main.c`, `kHeap` in `src/cli_mqjs.cpp`). The bytecode runs from the memory-mapped flash, not
  RAM: the first boot of a program (or of a new firmware) relocates it once into a copy after it in the js partition (12 ms for breakout),
  so a program can be up to half the partition (256 KB) and costs no RAM. One patch to mquickjs makes that safe (`third_party/README.md`).
- Built for size: ESP-IDF at `-Os`, the engine and `main.c` at `-O2`, the interpreter's loop (`JS_Call`) in IRAM (`main/linker.lf`) so the
  flash cache holds the bytecode, flash at 80 MHz, newlib nano, no assertion texts or error names, and only the components `main` needs
  (`MINIMAL_BUILD`: 58 instead of 109). Measured on the board with breakout (2026-10-22): app 268 KB instead of 319 KB, 153 KB of heap free
  while it runs instead of 121 KB, JavaScript 1.6 to 2.3 ms a frame instead of 2.0 to 2.7 ms, render and send 1.8 ms instead of 1.4 ms.
- Drawing is a display list rendered 16 rows at a time into one of two band buffers while the other is sent; a band whose commands did not
  change since the last frame is not sent. 768 commands and 4 KB of text per frame; more are dropped and counted in the figures.
- The panel bus runs at 10 MHz (8 bits): a full frame is 15 ms of transfer.
