# Zinc (prototype)

Zinc compiles a strict subset of TypeScript to native C++17 — no JavaScript engine on the device — and links it
with a small runtime (`zrt`, no STL/exceptions/RTTI) and one hardware layer per target. Memory is reference counted
(plus arenas, pools, weak refs, TLSF heap). The `sim` target runs the same program on Node.js and is the oracle:
every target must print exactly the same bytes (`zinc test` checks it).

**TS → C++ → native binary.** Node.js only runs the compiler (written in TypeScript) and the sim oracle;
the executables Zinc produces do not need Node.

Status, measurements and what is missing: **[docs/reports/STATUS.md](docs/reports/STATUS.md)**.

## Requirements

- Node.js ≥ 23.6 and pnpm (`pnpm install`)
- CMake ≥ 3.20 and a C++17 compiler (Apple Clang or GCC)
- SDL3 for windowed programs on macOS (`brew install sdl3`)
- Docker for cross targets (`linux`, `rpi1`, `ps1`, `ps2`, `esp32`); emscripten for `wasm` (`brew install emscripten`)

```sh
pnpm install
alias zinc="node $PWD/compiler/bin/zinc.mjs"
zinc doctor
```

## Try it

```sh
zinc run examples/breakout                 # game (arrows/A-D/mouse, Space), SDL3 window
zinc run examples/hero                     # animated Solid UI over a canvas
zinc run examples/text/main-react.tsx      # same screen as main-solid.tsx, React model
zinc run examples/iot-panel                # GPIO simulator, live chart, telemetry, OSC (X = button)
zinc run examples/lang --target sim        # language tour on Node (the oracle)
zinc run examples/breakout --target wasm   # browser: http://localhost:8080
zinc run examples/breakout --profile ps1   # macOS window emulating the PS1 profile (Q20.12 fixed point, 320x240, 256 KiB heap)
zinc run examples/lang --target rpi1       # ARMv6 hard-float binary under QEMU (arm1176)
zinc run examples/hello --target esp32     # ESP-IDF firmware in Espressif's QEMU
zinc build examples/hello --target ps2     # PS2 EE ELF (ps2dev)
zinc test [--target rpi1|linux|ps1|esp32] [--profile ps1]   # conformance: sim oracle vs target, byte for byte

zinc init mygame --template game|cli|server|iot
zinc dev                                   # rebuild + restart on save
zinc export --target macos|linux|rpi1      # dist/<name>-<target>: single executable (assets embedded), scripts, systemd unit
ZINC_TELEMETRY=udp://127.0.0.1:9999 zinc run examples/iot-panel & zinc monitor
```

Debug builds (`--debug`) use ASan + UBSan and print a leak report. `ZINC_FRAMES=n` stops a frame loop after n frames,
`ZINC_SHOT=out.bmp` saves the last frame, `ZINC_LOG_FORMAT=json` switches console output to JSON lines.

## What the language covers

Classes (inheritance, abstract, statics, accessors, `#private`), interfaces, generics (C++ templates), closures,
enums, discriminated unions, tuples, destructuring, spread, `?.`/`??`/`??=`, `try/catch/finally` (status returns, no C++
exceptions), `using`, `async/await` and generators (stackless frames), machine types (`i32`, `u8`, `f32`, `fx12`…),
strings (UTF-8 storage, UTF-16 indices), arrays, `Map`/`Set`, JSON output, `console.*` with levels. Forbidden constructs
(`eval`, `var`, `any` in strict profile, regex, prototype mutation…) are `Z1xxx` diagnostics.

## Modules

| Import | What |
| --- | --- |
| `zinc:gfx` | immediate 2D: rect, line, text, input, frame loop |
| `zinc:ui`, `zinc:ui/solid`, `zinc:ui/react` | declarative UI with JSX (`.tsx`): flexbox, Tailwind-like classes, Solid signals or React hooks |
| `zinc:sys`, `zinc:fs`, `zinc:storage`, `zinc:assets` | process, files, key/value store, assets embedded in the executable |
| `zinc:net` | `fetch` (libcurl) and a small HTTP server (server mode) |
| `zinc:osc`, `zinc:mqtt` | OSC over UDP, MQTT 3.1.1 client |
| `zinc:telemetry` | JSON-lines telemetry (perf, logs, metrics, exposed state) to UDP/stdout/file |
| `zinc:gpio`, `zinc:events` | pins with a simulator on hosts, typed event channels |
| `native/<name>.spec.ts` | your own native module: typed spec → generated C++ interface, one implementation per target |

## Layout

```
compiler/src   frontend (TS 6 API) · sema · jsx lowering · emit-cpp · emit-js · native modules · cli · tools
lib/           zinc.d.ts, gfx.d.ts, modules.d.ts, std/ (ui, solid, react — written in Zinc)
runtime/       zrt.h/.cpp (+ zrt_ext.h), host.cpp, mod/ (native modules), hal.h
targets/       HALs: macos (SDL3), null, common POSIX, wasm, ps2, esp32
sim/           Node shim + sim implementations of the modules
docker/        SDK images: linux, rpi1, mips (ps1 ISA), ps2
tests/         conformance programs and expected outputs (.out per number representation)
examples/      hello, lang, bouncing-ball, breakout, text, hero, iot-panel, native-module
docs/          status report, decisions, licenses
```
