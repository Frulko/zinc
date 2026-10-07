# Hardware simulator (Wokwi-class) and Arduino/ESP32 interop for Zinc Next

Status: research and proposal, 2026-10-07. Binding context: `next/RULES.md` (simulators instead of boards, proven libraries, weighted decisions), `next/ARCHITECTURE.md`, `docs/reports/parity/03-plugins-targets.md` section 5 (two simulation levels), `docs/reports/zinc-next-esp32.md`.
Scores follow RULES section 4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1 (maximum 70).
Task ids written `SIM-nn` are proposals; existing ids are real (ZN-081, ZN-124, ZN-125, ZN-126, ZN-127, ZN-128, ZN-129, ZN-131, ZN-136, ZN-141, ZN-143, ZN-164).

## 1. Summary of the decisions

| | Decision |
|---|---|
| A. Board format | `board.json` is a **superset of Wokwi `diagram.json`**: a Wokwi file loads unchanged (parts `wokwi-*` are aliases of our `zn-*` parts), our extras live in extra keys Wokwi ignores. |
| A. Primary backend | **Host-native simulation**: the drivers and the program run natively, the bus shim `hw.h` (ZN-126) has a `sim` backend that feeds chip models and a virtual-time scheduler. It is the one used by T0/T1, CI and Atelier. Deterministic by construction. |
| A. Second backend | **Espressif QEMU** (already pinned) for the real ESP32 binary; peripherals come through a **remote `hw.h` backend** (RPC over a second UART/TCP chardev to the same host chip models), so QEMU needs no peripheral patches. Renode and a custom CPU core are rejected for now. |
| A. Runner | `zinc sim` / `zinc test` scenario runner (YAML, same step names as Wokwi CI plus `advance`, `expect-frame`, `expect-bus`), virtual clock, recorded trace for replay. |
| B. Interop | Ship **one source tree, three manifests** (Arduino `library.properties`, PlatformIO `library.json`, ESP-IDF `idf_component.yml`) with two modes: **AOT**: `zinc build --emit=cpp --arduino` writes `zinc_app.cpp/.h` that a sketch includes (smallest, fastest); **interpreter**: `Zinc.h` embeds the ZBC VM and loads a `.zbc` from flash, serial or WiFi (hot load). The **Arduino core stays the owner of the pins and buses**: Zinc gets an `arduino` backend of `hw.h` that calls `pinMode/digitalWrite/Wire/SPI`, so no double ownership. The sketch owns `setup()/loop()`; Zinc runs in its own FreeRTOS task on ESP32 and from `Zinc.poll()` elsewhere. |

## 2. What exists today

Zinc (measured and read in the tree):

- **ESP32 under QEMU**: `zinc run x.ts --target esp32 --qemu`, Espressif QEMU `esp_develop_9.2.2_20260417` pinned in `~/.zinc/toolchains`; core firmware `next/firmware/esp32` (ESP-IDF 5.5.5 in `~/.zinc/esp-idf`), upload protocol `include/zn/devproto.h`, same core runs as `zinc device-sim` (`src/dev/core.cpp`, 52 KB library). Tested in `tests/t0/device.sh` and `tests/t2/esp32_qemu.sh`.
- **HAL** `runtime/include/hal.h`: display (`HalDisplay`, damaged bands), input (`HalInput`), `hal_time_us`, `hal_fixed_dt` (virtual clock of headless HALs), `hal_env`. Display plugins `plugins/display-{ssd1306,ws2812,st7789,scrollphat,fbdev,gl,remote,rmpp}` with SDL emulator windows; `ZINC_SHOT`, `ZINC_SHOT_FRAMES`, `ZINC_INPUT`, `ZINC_GPIO_SCRIPT` (ZN-081, done) already script inputs and capture frames.
- **Gap found in parity audit 03 section 5.1**: the macOS emulators replace the bus (`dev_write` returns true, painting from the driver's own `shown[]`), so a wrong command byte or page order passes silently. Only framebuffer content is validated, not what the chip would receive. Fixed by Level 2 (ZN-126 `hw.h`, ZN-127/128 chip models), which is the base of everything below.
- Boards: `examples/boards/{esp32-2432s022,s3-matrix,scrollphat}`, `targets/capabilities.json`, profiles (esp32: f32, strict, heap 160 KB). No wiring description exists: pins live in each driver and `zinc.json`.
- Atelier (`app/atelier`, ZN-050 done, ZN-143 planned): editor, check, run, ESP32 QEMU, profile, trace tabs; no board view.

What Wokwi, Renode and QEMU offer (public docs and repos, fetched 2026-10-07):

| Capability | Wokwi | Renode | Espressif QEMU | Zinc today | Zinc proposed |
|---|---|---|---|---|---|
| Visual parts and wiring | web editor, `diagram.json`, `wokwi-elements` web components (MIT) | none (text `.repl` platform files, optional GUI plots) | none | none | Atelier board view (SIM-09) |
| CPUs | AVR (avr8js, MIT), RP2040 (rp2040js, MIT), ESP32 family (Wokwi's QEMU fork), STM32, Pi Pico | many ARM/RISC-V, Xtensa ESP32 support partial, C# peripherals (MIT) | Xtensa ESP32/S3, RISC-V C3 | ESP32 QEMU; host native | same + remote `hw.h` over QEMU |
| Peripheral models | 100+ parts: LED, buttons, SSD1306, ILI9341, ST7789, WS2812, servo, DHT22, MPU6050, SD, buzzer, logic analyzer | hundreds of C# models per SoC | GPIO, UART, timers, I2C, SPI flash, LEDC/RMT and an RGB LCD on S3 to be listed by ZN-136 | five drivers, bus not modelled | chip models in `src/sim/chips` (ZN-127/128), more in SIM-06 |
| Custom chips | C or any WASM language, API for pins, I2C, SPI, UART, timers, framebuffer, attributes, `chip.json` | write C# peripheral | write QOM device in C | none | WASM chips with the same API shape (SIM-12) |
| Debug | GDB (Xtensa, AVR, RP2040), serial monitor, logic analyzer, VS Code extension | GDB, logging, tracing | GDB stub | none for firmware; interpreter profiler | GDB through QEMU, serial monitor and logic analyzer in Atelier |
| CI | `wokwi-cli` with `wokwi.toml` and scenario YAML (`wait-serial`, `write-serial`, `set-control`, `expect-pin`, `delay`, `take-screenshot` with `compare-with`, `touch*`), **simulation server in the cloud, paid minutes, binary closed, API alpha** | Robot Framework keywords, runs locally, GitHub Action | scripted by hand | `zinc test` planned (ZN-124) | local, offline scenario runner (SIM-04) |
| Determinism | simulated time, but cloud | virtual time, deterministic | icount mode possible | `hal_fixed_dt` only | virtual clock and trace replay (SIM-02, SIM-05) |

Other projects: **Velxio** (AGPL-3.0, self-hosted browser simulator, 19 boards, 48+ parts, reuses avr8js, rp2040js and Wokwi's QEMU fork) shows the same stack assembled by a third party; AGPL means we only look at it, we do not vendor. Licences that matter: avr8js, rp2040js, wokwi-elements are MIT (vendorable; JS, so only useful as reference or in a WASM/QuickJS side path); Renode is MIT but needs a .NET/Mono runtime (hundreds of MB, against the single-app vision); QEMU is GPL-2.0, used as a separate downloaded process (already the case); `wokwi-cli` and the Wokwi server are proprietary and online (never a dependency).

## 3. Part A: the simulator design

### 3.1 Layers

```
 scenario.yaml / Atelier UI / zinc sim            <- drives and observes (virtual time)
        |
 sim core (src/sim): Scheduler (virtual ns clock, event queue) + Netlist (parts, pins, nets) + Trace (recorder)
        |                         \
 chip models (src/sim/chips: C++ or WASM)         parts (led, button, pot, buzzer, servo, ws2812 strip, ssd1306, st7789, dht22, mpu6050, sd ...)
        |
 hw.h `sim` backend  <- Zinc drivers/modules (zinc:gpio, display-*, imu)    [host-native execution, primary]
 hw.h `remote` backend <- ESP32 core firmware inside QEMU (UART2/TCP chardev) [binary execution, secondary]
 hw.h `arduino` / `esp32` / `linux` backends                                  [real hardware, no sim]
```

Rule: the sim core does not know the program; the program does not know it runs in a sim. Everything crosses `hw.h` (ZN-126) and `hal.h`, so the engine stays agnostic (RULES section 7: no target names in `src/rt`). Level L2 of audit 03 section 5.4 (command sequences, addressing, orientation) is the contract; analog and timing below 1 us stay out of scope.

### 3.2 Board and diagram format

Decision D-A1 (score 1-5 per criterion in order fit, perf, size, maint, licence, portability, effort):

| Option | Scores | Total |
|---|---|---|
| O1 `board.json` superset of Wokwi `diagram.json`, Wokwi files load as is | 5,5,5,4,4,5,4 | **65** |
| O2 own incompatible format | 4,5,5,3,5,5,3 | 61 |
| O3 Renode `.repl` plus own UI | 2,4,3,3,5,3,2 | 45 |

O1 wins: the format is a small JSON (version, author, editor, parts with `id/type/left/top/rotate/attrs`, connections as `["a:PIN","b:PIN","color",[routing]]`), widely documented by examples, and importing community projects is a real benefit. Licence risk (4, not 5): the format has no licence text and `wokwi-elements` is MIT; we implement our own parts and only read the file format and the part names, we copy no Wokwi artwork or server code. Risk of drift is handled by a version key and a converter test corpus (SIM-03).

Extensions (ignored by Wokwi): top-level `zinc` object: `mcu`, `profile`, `firmware` (entry or zbc), `buses` (explicit bus-to-pin map when the part pins imply it), `clock` (virtual or real), and per-part `attrs` named like our chip options (`i2cAddress`, `rotate`, `colorOrder`, `axisFlip`: today hidden in board presets of `examples/boards`).

```json
{
  "version": 1, "author": "zinc", "editor": "zinc-atelier",
  "zinc": { "mcu": "esp32s3", "profile": "esp32", "firmware": "src/main.ts", "clock": "virtual" },
  "parts": [
    { "id": "mcu",  "type": "zn-esp32s3-devkit", "left": 0,   "top": 0 },
    { "id": "oled", "type": "wokwi-ssd1306",     "left": 180, "top": 20, "attrs": { "i2cAddress": "0x3c", "rotate": 180 } },
    { "id": "led1", "type": "wokwi-led",         "left": 40,  "top": 160, "attrs": { "color": "red" } },
    { "id": "r1",   "type": "wokwi-resistor",    "attrs": { "value": "220" } },
    { "id": "btn",  "type": "wokwi-pushbutton",  "left": 120, "top": 160 },
    { "id": "pot",  "type": "wokwi-potentiometer" },
    { "id": "imu",  "type": "zn-qmi8658" }
  ],
  "connections": [
    ["mcu:GPIO2", "r1:1", "green", []], ["r1:2", "led1:A", "green", []], ["led1:C", "mcu:GND", "black", []],
    ["mcu:GPIO0", "btn:1.l", "blue", []], ["btn:2.l", "mcu:GND", "black", []],
    ["mcu:GPIO34", "pot:SIG", "orange", []],
    ["oled:SDA", "mcu:GPIO21", "yellow", []], ["oled:SCL", "mcu:GPIO22", "white", []],
    ["imu:SDA", "mcu:GPIO21", "yellow", []], ["imu:SCL", "mcu:GPIO22", "white", []]
  ]
}
```

The netlist is solved digitally (union-find over pins, then resistor/LED/pull-up rules for logic levels and a coarse analog voltage for pots and ADC). No SPICE; a part with analog behaviour exposes a voltage function. Library for graph work: none needed (a union-find is 30 lines); JSON by the vendored yyjson.

### 3.3 Parts library (TypeScript API of a part, C++ underneath)

Parts are chip models behind one C++ interface, registered in a table (no target names in the core):

```cpp
// include/zn/sim.h (C ABI so a WASM or plugin chip can implement it too)
struct ZnSimPin;  // opaque: level (0,1,Z), analog mV, drive strength
struct ZnSimPart {
  const char* type;                                  // "zn-ssd1306"; aliases "wokwi-ssd1306"
  void (*init)(void* self, const ZnSimHost* h, const char* attrsJson);
  void (*pin_changed)(void* self, int pin, int level, uint64_t t_ns);          // GPIO edge
  int  (*i2c_write)(void* self, const uint8_t* p, int n, uint64_t t_ns);       // returns ack
  int  (*i2c_read)(void* self, uint8_t* p, int n, uint64_t t_ns);
  void (*spi_xfer)(void* self, const uint8_t* tx, uint8_t* rx, int n, uint64_t t_ns);
  void (*tick)(void* self, uint64_t t_ns);                                     // scheduled wake-ups
  void (*control)(void* self, const char* name, double value);                 // set-control: temperature, pressed, rotation
  int  (*render)(void* self, uint32_t* rgba, int w, int h);                    // display/LED visual state for Atelier and screenshots
};
```

TypeScript view used by tests and Atelier (a thin module `zinc:sim`, implemented on the same table):

```ts
import { Board } from "zinc:sim";
const b = await Board.load("board.json");
b.part("btn").press();                    // control
b.pin("mcu:GPIO2").level;                 // 0 | 1 | "z"
b.part("oled").frame();                   // Frame { w, h, rgba, hash }
await b.advance("250ms");                 // virtual time
```

Wave plan: wave 1 = LED, RGB LED, pushbutton, switch, potentiometer, buzzer, ws2812 strip/matrix (ZN-127), ssd1306 (ZN-127), QMI8658 (ZN-127); wave 2 = ST7789/ILI9341, CST820 touch, IS31FL3730 (ZN-128); wave 3 = DHT22, MPU6050, servo, SD over SPI, 7-segment, HC-SR04, rotary encoder (SIM-06). Chips already have drivers in `plugins/display-*`; the models decode the real byte stream, so tests catch the wrong-init-byte class of bug (ZN-127 AC).

### 3.4 Execution backends (decision D-A2)

| Option | Scores (fit, perf, size, maint, licence, portability, effort) | Total |
|---|---|---|
| B1 host-native + `hw.h` sim backend + chip models | 5,5,5,4,5,5,4 | **67** |
| B2 Espressif QEMU + remote `hw.h` backend | 4,3,3,3,3,4,4 | 47 (kept as second backend: it is the only one that runs the real xtensa binary) |
| B3 Renode (MIT, .NET) | 3,3,1,3,5,3,2 | 41 |
| B4 own ARM/Xtensa/RISC-V core | 2,3,3,1,4,4,1 | 36 |

- **B1** runs the Zinc program on the host (interpreter, AOT, QuickJS) and also Arduino sketches compiled against a host Arduino core shim (see section 4.6): fast, deterministic, debuggable with lldb, works in T0/T1 and in Atelier on every OS without downloads.
- **B2** keeps what ZN-136 asks for (QEMU peripheral table, board images). Wokwi's way (peripheral models inside their QEMU fork) is not reproducible without carrying a QEMU patch set; the remote backend avoids it: the firmware's `hw.h` backend `remote` sends `i2c/spi/gpio/ledc/rmt` calls as length-prefixed frames on UART2 (QEMU `-serial tcp:`/`chardev`), the host replies and also pushes input events. Cost: timing is the call order, not cycles; fine for L2.
- **B3/B4** are not done: Renode breaks the single-app rule (runtime install) and a custom CPU core duplicates QEMU for no gain. Revisit if a target QEMU cannot run (AVR: avr8js is JS; could run in the QuickJS engine, spike only on demand).

### 3.5 Deterministic time and replay

- One virtual clock in nanoseconds owned by the sim `Scheduler`. `hal_time_us`, `hal_sleep_us`, `ZnHostApi::now_ms` (already "virtual in a deterministic run", `native.h`) and `zinc:loop` timers read it when `clock: "virtual"` (extends `hal_fixed_dt`). Time advances only through `advance(duration)` or `run-until(condition)`; sleeping fast-forwards to the next event, so a 10 s blink test costs milliseconds.
- Inputs (button, pot, serial bytes, touch, tilt) enter as timestamped events. Everything the program sees (pin edges, bus transactions, serial bytes, frame hashes) is appended to a **trace** (binary, versioned, `.zsim`). Replaying a trace re-injects only the inputs and must reproduce the same outputs byte for byte; mismatch = nondeterminism bug. Traces double as recorded demos and as bug reports from Atelier.
- Sources of nondeterminism to remove: wall-clock reads in the runtime (`hal_time_us` goes through the sim), `Math.random` (seeded by the scenario, `seed:` key), thread scheduling (the sim backend runs single threaded; the engine's native threads are joined at `advance` boundaries), uninitialised memory (the existing ASan/UBSan builds).
- QEMU runs use `-icount shift=auto,sleep=off` where supported so guest time follows instructions; the remote backend stamps frames with the guest-reported time. Determinism is then best-effort, and the golden of record is the host-native run.

### 3.6 Headless scenario runner for CI

Same step vocabulary as Wokwi CI (so Wokwi scenarios mostly run), extended with virtual time, frames, bus and pixels. Runs offline, in T0/T1 (`tests/t0` for models, `tests/t1` for scenarios with goldens), and through `zinc test` runners (ZN-124 `Runner` interface gets `SimRunner`).

```yaml
# scenarios/blink-and-button.yaml
name: blink and button
version: 1
board: ../board.json
seed: 1
steps:
  - wait-serial: "ready"
  - expect-pin: { part-id: mcu, pin: GPIO2, expected: 0 }
  - advance: 500ms
  - expect-pin: { part-id: mcu, pin: GPIO2, expected: 1 }
  - set-control: { part-id: btn, control: pressed, value: 1 }
  - wait-serial: { text: "button down", timeout: 200ms }
  - expect-bus: { part-id: oled, protocol: i2c, address: 0x3c, contains: [0x00, 0xAF] }   # display on command
  - expect-frame: { part-id: oled, hash: "5c1f09aa" }
  - take-screenshot: { part-id: oled, compare-with: shots/oled-1.png, tolerance: 0.5% }
  - expect-pixel: { part-id: oled, x: 10, y: 4, rgb: "#ffffff" }
  - write-serial: "led on\n"
  - expect-logic: { pins: [mcu:GPIO2], window: 1s, edges: 4 }
```

Exit codes and output format follow the prototype (`docs/guide/06-testing.md`); a failing step prints the virtual time, the trace file and the last frame as a PNG. A `--update-goldens` mode regenerates images and hashes (the frame hash contract is ZN-125). Parsing: vendored `yaml-cpp` or `libyaml` (MIT) per RULES section 3 (SIM-04 picks, one session).

### 3.7 Atelier UI (ZN-143 plus new views)

Atelier is a Zinc `zinc:ui` app. New tabs, each testable with pixel goldens (T1):

- **Board**: renders `board.json` (parts as vector SVG via `plugins/svg`, wires, LEDs lit by pin state, displays from `render()`), click on buttons, drag potentiometers, drop parts from a palette, wire by drag; writes `board.json` back (stable key order so diffs are readable). Editing the diagram is the largest piece (SIM-09, SIM-10).
- **Serial monitor** and **bus monitor** (I2C/SPI transactions decoded per chip: `0x3c W 00 AF` with the name "display on").
- **Logic analyzer**: waveform of selected pins from the trace, zoom, edge counts, simple I2C/SPI/UART decoders (SIM-11).
- **Time controls**: run, pause, step 1 ms/frame, speed x0.1 to x100, "advance to next edge", record/replay a `.zsim`.
- Run on: host interpreter, AOT, QEMU ESP32 (remote backend), same board file.

### 3.8 What this does not prove

Analog behaviour, signal integrity, real flash timing, WiFi/BLE radio, DMA contention, power. Real-board runs stay `needs-board` tasks (ZN-055, parked) per RULES section 2.

## 4. Part B: classic Arduino/ESP32 program plus Zinc

### 4.1 Options and decision D-B1

| Option | Scores (fit, perf, size, maint, licence, portability, effort) | Total |
|---|---|---|
| P1 AOT C++ emitted by `zinc build --emit=cpp`, included by the sketch, tiny runtime | 3,5,4,4,5,4,4 | 58 |
| P2 `Zinc.h` interpreter library (ZBC VM, native modules), program loaded as `.zbc` | 4,3,3,4,5,5,3 | 53 |
| **P3 one package, both modes** (P1 for production, P2 for dev and hot load) | 5,4,4,3,5,5,3 | **59** |
| P4 Zinc owns `main`, Arduino core only as an ESP-IDF component | 3,4,3,3,5,2,3 | 46 |
| P5 PlatformIO `platform` (custom toolchain package) | 2,4,3,2,4,2,1 | 38 |

P3 wins narrowly over P1; build P1 first (cheaper, nothing to load), P2 second, one repository. P4 forces users out of their sketch; P5 is the heaviest to maintain.

### 4.2 Measured sizes

Compiled with `zig c++ -Os -fno-exceptions -fno-rtti -DZN_NO_MIMALLOC` from `next/src` (the same file list as `firmware/esp32/CMakeLists.txt`; text includes read-only data, no libc/libc++ linked, no mimalloc), `llvm-size`, 2026-10-07:

| Component (bytes of text) | armv7 thumb2 (cortex-m4) | rv32imac | aarch64 | x86-64 | xtensa esp32 (`xtensa-esp32-elf-size`, IDF build, -O2 flag, sdkconfig -Os) |
|---|---|---|---|---|---|
| rt: machine | 14 576 | 21 426 | 22 830 | 24 750 | 25 306 |
| rt: rtcalls (strings, arrays, objects, JSON-ish helpers) | 51 877 | 68 767 | 75 177 | 81 500 | 60 013 |
| rt: program (module loader) | 2 359 | 3 737 | 4 103 | 4 143 | 2 945 |
| rt: native (ZnModule registry, ABI) | 18 501 | 26 905 | 28 821 | 30 231 | 26 619 |
| rt: unicode glue | 4 557 | 6 831 | 7 279 | 7 822 | 5 071 |
| libunicode (QuickJS-ng case/normalisation) | 52 529 | 54 249 | 58 741 | 59 373 | 55 796 |
| vm (interpreter) | 61 386 | 66 028 | 55 346 | 59 954 | 64 416 |
| zbc (decoder and verifier, not the emitter) | 52 603 | 64 758 | 76 494 | 82 521 | 68 441 |
| dev core (upload protocol) | 5 336 | 7 984 | 8 564 | 8 927 | 11 428 |
| **Interpreter + upload core total** | **263 724** | **320 685** | **337 355** | **359 221** | **320 520** (+1.4 KB bss) |

Other facts: the whole prebuilt ESP32 core app `firmware/esp32/build/zinc-core.bin` is 730 944 bytes (flash image `prebuilt/esp32-core-flash.bin` 796 480 bytes with bootloader and table); the ELF has 502 KB text, 228 KB data (flash-mapped rodata counted separately: `.flash.text` 452 KB, `.flash.rodata` 219 KB, `.iram0.text` 49 KB, `.dram0.data` 10 KB, `.dram0.bss` 8 KB) of which the Zinc component is the 320 KB above and the rest is IDF (FreeRTOS, drivers, newlib, bootloader-adjacent code).

AOT: a 4-line program (loop, function, string concat) emits 3.4 KB of C++ that compiles to about 1.8 KB of text; an AOT program links `rt` (machine, rtcalls, program, native, unicode) without the VM: about 92 KB on thumb2 without libunicode, 144 KB with it (estimate from the table, to confirm by SIM-02 with a real link and `--gc-sections`). The interpreter library is therefore about 2x the AOT runtime. Savings available: libunicode behind a build flag (about 52-56 KB), zbc decoder without verifier for trusted images, `-Os` for rtcalls (60 KB on xtensa). Heap: profile `esp32` budgets 160 KB for Zinc; the core firmware has about 280 KB of 320 KB free at start (`zinc-next-esp32.md`), the Arduino-ESP32 core itself uses about 40-60 KB of internal RAM at boot with WiFi off (not measured here: spike SIM-S1). Registers of the interpreter: 3000 slots = 24 KB, 128 frames; modules up to 48 KB.

Arduino AVR (2 KB RAM) and Uno-class boards are out of reach for both modes. Targets: ESP32 family, RP2040/RP2350 (264 KB RAM, thumb2 numbers above), STM32 (Cortex-M4+ with 64 KB+ RAM), nRF52, SAMD51.

### 4.3 Architecture: one package, Arduino as owner of the hardware

```
 sketch.ino  (setup/loop, Arduino libs)           zinc_app.cpp/.h   (AOT, mode A)        app.zbc (mode B)
      |   #include <Zinc.h>                              |                                  |
      +-----------------> Zinc  (class)  <---------------+----------------------------------+
                           | run/poll/call/onEvent/loadFromSerial|WiFi|LittleFS
                           v
          zinc runtime: rt (machine, rtcalls, native ABI)  [+ vm in mode B]
                           |  native modules  zinc:gpio zinc:i2c zinc:spi zinc:net zinc:time ...
                           v
          include/zn/hw.h  backend `arduino`:  pinMode/digitalWrite/analogRead, Wire, SPI, Serial, millis, WiFiClient
```

Why this removes double ownership: Zinc modules never touch registers or IDF drivers when built as a library; they call `hw.h`, and the `arduino` backend forwards to the Arduino core, which the sketch (and its libraries) also uses. Conflicts are the same as between two Arduino libraries and are made visible: `hw.h` keeps a claim table (`zn_hw_claim(pin, owner)`), `Zinc.reservePin(n)` lets the sketch withhold pins, and loading a program that requests a reserved or claimed pin fails with a diagnostic naming the pin. I2C/SPI: Zinc takes the `Wire`/`SPIClass` object by pointer (`Zinc.useWire(&Wire1)`) and always uses `beginTransaction/endTransaction`, so Arduino libraries sharing the bus keep working. WiFi: Zinc `zinc:net` uses `WiFiClient`/`WiFiClientSecure` of the sketch (or lwIP sockets on ESP-IDF); it never calls `WiFi.begin` unless `Zinc.manageWiFi(ssid, pass)` is set.

Scheduling:
- ESP32 (Arduino-ESP32 runs `loopTask` on FreeRTOS): `Zinc.begin()` creates one task (default stack 8 KB, priority 1, pinned to core 1, configurable), runs the loop of `zinc:loop` (timers, promises, `ZnModule.poll`). Calls between sketch and Zinc cross a queue; Zinc code never runs in an ISR. The VM is single threaded: native modules posting from other tasks use `cb_post` (already thread-safe in `native.h`).
- Single-core MCUs without RTOS (RP2040 Arduino-Pico has FreeRTOS optional, SAMD no): `Zinc.poll()` from `loop()` runs one turn (`zrt::poll_pollers` equivalent) and returns within a configurable budget (default 2 ms) so the sketch keeps its timing.
- ESP-IDF component: same sources, `idf_component.yml`, `REQUIRES driver`; the `esp32` backend of `hw.h` replaces the `arduino` one (ZN-126), also used by the existing core firmware.

### 4.4 API sketches

C++ side (header `Zinc.h`, thin wrapper over `include/zn/native.h`):

```cpp
#include <Zinc.h>
#include "zinc_app.h"            // mode A: generated by `zinc build --emit=cpp --arduino app.ts`

// Arduino function exposed to Zinc as a native module "Board" (ABI of include/zn/native.h)
static int32_t readTemp(void*, ZnCtx*, const ZnVal*, ZnVal* ret) { ret->d = analogRead(34) * 0.1; return ZN_OK; }
static const ZnExport board_exports[] = { {"readTemp", ">d", readTemp, ZN_PURE_SCALAR} };

void setup() {
  Serial.begin(115200);
  Zinc.addModule("Board", board_exports, 1);   // before load; checked against requireNative<Spec> in the program
  Zinc.reservePin(4);                          // the sketch's own pin
  Zinc.begin();                                // mode A: runs the AOT main; mode B: Zinc.loadFile("/app.zbc")
}

void loop() {
  Zinc.poll();                                 // only without RTOS; the task does it on ESP32
  double v = Zinc.call<double>("onSample", 12.5);   // call an exported Zinc function by name, typed signature "d>d"
  Zinc.on("alert", [](const char* msg) { Serial.println(msg); });   // Zinc calls emit("alert", ...)
}
```

Zinc side (`app.ts`, the program stays ordinary Zinc; `requireNative` is the existing mechanism, ZN-096):

```ts
import { requireNative } from "zinc:native";
const Board = requireNative<{ readTemp(): number }>("Board");
import { pinMode, digitalWrite } from "zinc:gpio";     // goes through hw.h -> Arduino core
export function onSample(x: number): number { return x + Board.readTemp(); }
setInterval(() => digitalWrite(2, 1 - state), 500);
```

Exports from Zinc to C++ use a generated table (the AOT build writes `zinc_app.h` with `extern "C" double zinc_onSample(double);`; mode B resolves by name at runtime and checks the signature, returning a status instead of crashing).

### 4.5 Hot load, packaging, debugging

- **Hot load (mode B)**: reuse the device protocol `include/zn/devproto.h` (`ZN load <len> <crc32>`, module verified before it runs) on the sketch's `Serial`, or on a TCP port / HTTP POST `/zinc` / ArduinoOTA-like mDNS service `_zinc._tcp` for WiFi. `Zinc.enableUpload(Serial)` multiplexes with the sketch's own output through the `0x1E` marker already designed for bootloader chatter. `zinc dev` (ZN-141) gets `--device wifi://host` and `serial://port`; reload keeps `.zbc` in LittleFS so it survives reboot. Only the Zinc module is swapped, never the sketch.
- **Arduino Library Manager**: repository `zinc-arduino` with `library.properties` (`architectures=esp32,rp2040,samd,stm32`, `includes=Zinc.h`, `depends=`), flat `src/` generated by a packaging script from `next/src` (a CI check that the generated tree builds with `arduino-cli compile` for `esp32:esp32:esp32` and `rp2040:rp2040:rpipico`). Submission to the index is outward-facing: prepare, record the command, owner pushes (RULES section 2).
- **PlatformIO registry**: `library.json` (`frameworks: arduino, espidf`, `platforms: espressif32, raspberrypi, ststm32`, `build.flags`), plus a `scripts/zinc.py` extra script adding `zinc build` of `src/*.ts` as a pre-build step so the `.cpp` is generated in `src/`. Not a PlatformIO `platform` (P5 rejected).
- **ESP-IDF component registry**: `idf_component.yml`, same sources.
- **Debugging**: the same GDB as the sketch (symbols of the AOT C++ are readable: functions keep their names, `zinc build --emit=cpp --line-directives` emits `#line` so breakpoints land in the `.ts`; to add in SIM-13). Serial monitor shows Zinc `console.log` through `Serial` (hook `hal_log`). `Zinc.trace(true)` prints interpreter exceptions with stack. In the simulator both modes run unchanged (4.6).
- **Memory**: `Zinc.begin({heap: 96*1024})` takes the heap from `heap_caps_malloc` (or `malloc`) once, so the sketch cannot starve it later and Zinc cannot exceed it; `Zinc.freeHeap()`; leak count reported like the core's `done <status> <leaked> <free>` line.

### 4.6 Simulating an Arduino sketch with Zinc inside

Part A and B meet here. A sketch compiled for the host links `zinc-arduino-host`, an Arduino API shim (`Arduino.h`, `Wire`, `SPI`, `Serial`, `millis`, `delay`) whose implementation is the `hw.h` `sim` backend; `delay()` advances the virtual clock. Libraries from the Arduino registry that only use the core API (Adafruit_SSD1306, FastLED over a model, DHT) then drive the chip models of 3.3, which checks their byte streams the same way as Zinc's drivers. Alternative for binary fidelity: the same sketch built for ESP32, run in QEMU with the `remote` backend. Reference implementations to study, not vendor before the licence is checked: `pschatzmann/Arduino-Emulator`, `ArduinoFake`, Wokwi's own "Arduino core for WASM" idea. Expect gaps: ESP32-specific APIs (`ledc`, `touchRead`, FreeRTOS) are shimmed per use; unsupported ones fail loudly at link time.

## 5. Risks and spikes

| Id | Risk | Spike (one session, decides) |
|---|---|---|
| SIM-S1 | Arduino-ESP32 core plus the 320 KB interpreter plus WiFi may leave too little RAM on ESP32 (classic: about 300 KB DRAM total) | Build `Zinc.h` hello for `esp32:esp32:esp32` and ESP32-S3, report free heap with WiFi on and off; compare AOT mode. Gate: at least 100 KB free after WiFi start. |
| SIM-S2 | QEMU remote `hw.h` backend: second UART or TCP chardev reliable with the pinned Espressif QEMU; latency per I2C transaction | Round-trip 10 000 I2C writes; gate: under 100 us each so a 128x64 OLED frame stays under 50 ms virtual real-time. |
| SIM-S3 | Determinism of the replay with threads and the QuickJS engine | Record then replay `examples/hero` with scripted input 100 times, identical trace hash. |
| SIM-S4 | `diagram.json` compatibility over a corpus (Wokwi example projects are open on wokwi.com but individually licensed; use our own authored examples plus the documented format, never bulk copy) | Write 10 diagrams from the docs, load with our parser, check part and pin name resolution; list unknown part types. |
| SIM-S5 | Arduino host shim reach: how many popular libraries compile unchanged | Compile the 20 most installed Library Manager libraries (Adafruit_GFX, SSD1306, NeoPixel, DHT, ArduinoJson, PubSubClient...) against the shim. |
| R1 | Licensing of Wokwi assets (artwork, part pinout names) | Draw our own SVG parts (plugins/svg), keep names only as aliases, no code from closed parts. |
| R2 | Scope creep of the board editor | Ship read-only Board view first (SIM-09), editing second (SIM-10). |
| R3 | Maintaining two runtimes in one package (A and B) | They share `rt`; B only adds `vm` and `zbc` decoder; CI builds both for three boards. |
| R4 | Arduino Library Manager size/`src` rules, name clash `Zinc` | Package id `ZincRuntime`, header `Zinc.h`; check the index for conflicts in SIM-14. |

## 6. Proposed backlog tasks

Sizes: S under half a day, M about a day, L several days. Milestones: `m-11` simulators, `m-10` app (as ZN-126..143).

| Id | Title | Size | Depends on | Acceptance criteria |
|---|---|---|---|---|
| SIM-01 | `include/zn/sim.h` and sim core: virtual clock, scheduler, netlist, trace (`src/sim`) | M | ZN-126 | 1) T0: events scheduled out of order run in time order and `advance(1h)` with a 1 ms timer finishes in under 1 s wall. 2) a netlist built from code resolves a net of 3 pins and reports levels. 3) no target or plugin names in `src/sim` core (grep check). |
| SIM-02 | Virtual clock in the engine: `hal_time_us`, `hal_sleep_us`, `now_ms`, `zinc:loop` timers under `ZINC_CLOCK=virtual` | S | SIM-01 | 1) a program sleeping 10 s in a loop prints the same output in under 200 ms wall. 2) the same program under `--clock real` is unchanged. 3) interpreter, AOT and QuickJS give the same virtual timestamps (T1). |
| SIM-03 | `board.json` parser and writer (diagram.json superset), part registry with `wokwi-*` aliases | M | SIM-01 | 1) 10 authored diagrams (from the public format description) load; unknown part types give a diagnostic naming the type. 2) load then save then load gives an identical document (round trip). 3) the `zinc` extension block is ignored by a strict diagram.json reader (schema test). |
| SIM-04 | Scenario runner `zinc sim` with YAML steps, `SimRunner` for `zinc test` | L | SIM-03, SIM-02, ZN-124 | 1) steps wait-serial, write-serial, delay, advance, set-control, expect-pin, expect-bus, expect-frame, take-screenshot work on `examples/boards/s3-matrix`. 2) a failing step exits non-zero and prints virtual time and writes the last frame PNG. 3) the Wokwi docs example (`wait-serial`/`set-control`/`expect-pin`) runs unchanged on an equivalent board. |
| SIM-05 | Trace recorder and replay (`.zsim`) | M | SIM-01, SIM-02 | 1) record a scripted run, replay re-injects only inputs and the output trace hash is identical over 20 runs. 2) a modified model makes replay report the first diverging event with its time. 3) trace size under 1 MB for 60 s of the s3-matrix demo. |
| SIM-06 | Parts wave 3: DHT22, MPU6050, servo, SD (SPI), rotary encoder, buzzer, 7-segment, HC-SR04 as models | L | ZN-128 | 1) each model has a T0 test with a captured transaction stream (real library byte streams, as ZN-127). 2) `set-control` changes the sensor value and a program sees it on the next read. 3) a wrong register address in a test driver is reported as a bus error. |
| SIM-07 | hw.h `remote` backend and host server (QEMU ESP32 with chip models) | L | ZN-126, ZN-136, SIM-S2 | 1) the ZN-127 chip models drive `zinc run --target esp32 --qemu --board board.json`: ssd1306 frame hash equals the host-native hash. 2) 10 000 round trips under 1 s. 3) a lost frame produces a timeout error, not a hang. |
| SIM-08 | Frame, pixel and logic assertions: `expect-frame`, `expect-pixel`, `expect-logic`, image compare with tolerance | M | SIM-04, ZN-125 | 1) `compare-with` PNG passes with a 0.5% tolerance and fails on a 1-pixel layout shift of a text. 2) `--update-goldens` rewrites hashes and images. 3) hashes equal between macOS emulator and device-sim (ZN-125 contract). |
| SIM-09 | Atelier Board view (read-only): parts as SVG, wires, live LEDs, displays, clickable buttons and pots | L | SIM-03, ZN-143 | 1) T1 pixel golden of the board of `esp32-2432s022` with LED on and off. 2) clicking the button part changes the program's output. 3) the view survives 1000 frames with no growth in memory (resmon). |
| SIM-10 | Atelier Board editor: palette, drag, wire, attrs panel, save | L | SIM-09 | 1) scripted session adds an LED and resistor, wires them, saves; the file loads in SIM-03 and passes a netlist check. 2) undo/redo of 10 operations. 3) a pin conflict (two outputs on one net) shows a warning. |
| SIM-11 | Atelier serial monitor, bus monitor, logic analyzer, time controls | L | SIM-05, SIM-09 | 1) logic analyzer shows the edges of a blinking pin at the right virtual times (golden). 2) I2C decoder labels `0x3c W 00 AF`. 3) pause, step 1 ms, speed x10 and replay of a `.zsim` work in a scripted test. |
| SIM-12 | Custom chips: C ABI over WASM (plugin `wasm`) with a Wokwi-shaped API (pins, I2C, SPI, UART, timers, framebuffer, attrs) | M | SIM-01, ZN-126 | 1) a 40-line C chip (I2C register file) compiled to WASM with zig responds to a program. 2) a chip that crashes or loops is stopped with a diagnostic. 3) the same chip works host-native and through SIM-07. |
| SIM-13 | `zinc build --emit=cpp --arduino`: `zinc_app.cpp/.h`, `hw.h` `arduino` backend, `#line` directives | M | ZN-126, ZN-164 | 1) `arduino-cli compile` of a blink sketch including `zinc_app.h` succeeds for `esp32:esp32:esp32` and `rp2040:rp2040:rpipico`. 2) text size of the AOT runtime reported per board and under 150 KB on thumb2. 3) a pin reserved by the sketch makes loading fail with the pin number. |
| SIM-14 | `Zinc.h` interpreter library (mode B): `begin/poll/call/on/addModule/reservePin/useWire`, FreeRTOS task on ESP32 | L | SIM-13 | 1) a sketch loads `/app.zbc` from LittleFS and calls `onSample` with a typed result. 2) the Zinc task and `loop()` run 60 s together without watchdog reset (QEMU or sim). 3) a native module with a signature mismatch is refused, not a crash. |
| SIM-15 | Hot load over Serial and WiFi for the Arduino library; `zinc dev --device serial://|wifi://` | M | SIM-14, ZN-141 | 1) edit, save: the new `.zbc` runs on QEMU in under 3 s and survives a reset. 2) corrupted CRC is refused and the old program keeps running. 3) the sketch's own `Serial.print` output still reaches the monitor. |
| SIM-16 | Packaging: Arduino `library.properties`, PlatformIO `library.json`, IDF `idf_component.yml`, generator script and CI compile matrix | M | SIM-13, SIM-14 | 1) `arduino-cli lib install --git-url` of the generated tree compiles the examples for 3 boards. 2) `pio run` for `esp32dev` and `pico` passes. 3) publish commands recorded in the task notes (no publish). |
| SIM-17 | Arduino host core shim over `hw.h` `sim` backend, run unmodified sketches and 20 popular libraries | L | ZN-127, SIM-02, SIM-S5 | 1) the blink + SSD1306 (Adafruit) sketch produces the golden frame in a T1 scenario. 2) a table of libraries compiled/failed is in the doc. 3) `delay(1000)` takes under 10 ms wall. |
| SIM-18 | Spike report SIM-S1..S5: RAM with Arduino-ESP32 and WiFi, QEMU remote latency, replay determinism, diagram corpus | M | SIM-01 | 1) each spike has its measured number and gate result in this doc. 2) a decision record in `zinc-next-decisions.md` for D-A1, D-A2, D-B1 with these scores. 3) tasks above re-sized if a gate fails. |
| SIM-19 | Interpreter size diet: libunicode behind a flag, rtcalls `-Os`, size gates per target in CI | S | ZN-164 | 1) interpreter+core text under 270 KB on xtensa with libunicode off. 2) a size check script fails on a 5% regression. 3) `tools/bench-m4` unchanged within 15%. |
| SIM-20 | Docs: `docs/simulator.md` and `docs/arduino.md` with the two flows and the scenario reference | S | SIM-04, SIM-16 | 1) the examples in the docs are run by a T0 test. 2) `zinc help sim` lists the steps. 3) English, no emojis. |

Suggested order: SIM-18 spikes in parallel with SIM-01, SIM-02, SIM-03, then SIM-04/05, ZN-126/127/128 (already planned) in the same wave; Atelier (SIM-09..11) after ZN-143; Arduino track (SIM-13..16) can start after ZN-126 and does not need the simulator, but SIM-17 ties both.

## 7. Decision records to add to `zinc-next-decisions.md`

- D-A1 board format: option scores in 3.2; revisit if Wokwi changes the format incompatibly or licences it restrictively.
- D-A2 backends: scores in 3.4; revisit if QEMU remote latency (SIM-S2) is above 100 us per transaction or if a target appears that QEMU cannot run.
- D-B1 interop packaging: scores in 4.1; revisit if SIM-S1 shows under 100 KB free heap on classic ESP32 with WiFi (then AOT-only for that chip and the interpreter only on S3/PSRAM boards).

## Sources

- Wokwi docs: https://docs.wokwi.com/wokwi-ci/automation-scenarios, https://docs.wokwi.com/diagram-format, https://docs.wokwi.com/chips-api/getting-started, https://docs.wokwi.com/wokwi-ci/getting-started
- Wokwi repositories (avr8js, rp2040js, wokwi-elements, MIT): https://github.com/orgs/wokwi/repositories
- Renode (MIT, `.repl`, Robot Framework): https://github.com/renode/renode, https://github.com/renode/renode/blob/master/LICENSE
- Velxio (AGPL-3.0): https://github.com/davidmonterocrespo24/velxio, https://www.cnx-software.com/2026/04/04/velxio-open-source-self-hosted-arduino-raspberry-pi-and-esp32-simulator/
- Local measurements: object files built in the session scratchpad (`sz/`), ESP32 ELF `next/firmware/esp32/build/zinc-core.elf`.
