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
                                     firmware (written by zinc when needed): mquickjs + panel + touch + modules ◀── js partition (0x320000)
```

## Use

```sh
zinc run examples/breakout --target esp32 --engine mquickjs            # each change: prepare, write the program (a few KB), show the UART
zinc run examples/esp32-wifi --target esp32                            # zinc.json's "targets": {"esp32": {"engine": "mquickjs"}} picks the engine
zinc run examples/esp32-wifi --target esp32 --host zinc-e3d8.local     # the same over Wi-Fi, once the board is on a network
zinc flash --target esp32 --engine mquickjs [--net]                    # a firmware by hand (zinc run writes the one a program needs by itself)
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
`print`, `console.log`, `performance.now()`, `setTimeout`/`setInterval` (`js/runtime.js`) and `Date.now()` (milliseconds since boot, or the
real time once `zinc:wifi` has set the clock; `new Date()` throws) are there too.

## The board's modules

`zinc:<name>` resolves to `js/modules/<name>.js` under mquickjs, before plugins and built-ins: each module is a few lines of JavaScript on the
host calls of a `main/mod_*.c`. Events from interrupts, Wi-Fi or Bluetooth are queued and delivered between frames on the JavaScript task
(`js/runtime.js`, `zn_post` in `main/main.c`); a program that only listens keeps running.

| Module | What | C side |
|---|---|---|
| `zinc:gpio` | `setup`, `write`, `read`, `watch` (edges from an interrupt, debounced there); the board's own pins are refused | `mod_gpio.c` |
| `zinc:storage` | `get`, `set`, `remove`, `keys`, kept in NVS (keys of 15 bytes, values of 1,900) | `mod_storage.c` |
| `zinc:wifi` | `start` (the saved network, else the setup portal, WiFiManager's way), `connect`, `forget`, `scan`, `info`, `clock` (SNTP) | `mod_wifi.c` |
| `zinc:espnow` | `start`, `send` (250 bytes, to an address or `BROADCAST`, acknowledged), `address`: boards with no access point | `mod_espnow.c` |
| `zinc:ble` | the API of `plugins/ble` (the Mac's side): `advertise` the Nordic UART Service, links that send and receive text, `scan` | `mod_ble.c` |

Wi-Fi and BLE do not fit together beside the JavaScript heap: the first one a program uses keeps the radio until the board restarts, and the
other throws, saying so. Measured with the 96 KiB heap allocated (2026-10-22): 44 KB of heap free with the setup portal open, 62 KB with
ESP-NOW, 38 KB with BLE advertising.

## Two firmwares

zinc writes the one a program needs, by itself, when the board runs another (it reads the first line the firmware prints, `mqjs: firmware
<name> <sha>`): `prebuilt/zinc-mquickjs-flash.bin`, the smallest (app 300 KB, 143 KB of heap free while breakout runs), for programs that
use the screen, the pins and the storage; `prebuilt/zinc-mquickjs-net-flash.bin` (app 1 MB, `-DZN_NET=1` and `sdkconfig.net`) when the
program imports `zinc:wifi`, `zinc:espnow` or `zinc:ble`. The network firmware runs every program; esp32sim has no radio, so a program on
the radio runs on the board only.

## Updates over Wi-Fi

Once a board running the network firmware is on a network, it serves `zinc run --host` (`main/mod_update.c`): `GET /info` (its name,
firmware, slot, free heap, the program's state), and with the token it printed on its UART (`mqjs: update token ...`, which zinc keeps in
`~/.zinc/esp32/<name>` with the board's address) `POST /js` (a program), `POST /ota` (a firmware into the other slot; the bootloader goes back
to the previous one when the new one does not start) and `GET /log` (the console). zinc brings the firmware up to date first, then sends the
program and shows its console. A board that knows a network joins it at each start, whatever the program, unless the program uses BLE or
ESP-NOW on its own channel: a fixed program can always come back over Wi-Fi. Measured from a tablet on the setup portal's network: a 20 KB
program in under a second, the 1 MB firmware in 5.8 s.

Partitions (`partitions.csv`): nvs, phy_init, otadata, `ota_0` and `ota_1` (1.5 MB each), `js` (512 KB at 0x320000).

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

`tools/build-esp32-core mquickjs` builds it with ESP-IDF 5.5 and writes the three images of `prebuilt/`: the board's two, and the emulator's
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
