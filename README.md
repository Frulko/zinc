# Zinc (prototype)

Zinc compiles a strict subset of TypeScript to native C++17, with no JavaScript engine on the device.
Memory is reference counted (no tracing GC), and `sim` (plain Node.js) is the reference oracle:
a program must print exactly the same bytes on `sim` and on every native target.

This repository is the first increment of the prototype described in the specification
(*Zinc — Cahier des charges du prototype v1.0*). What works today, what does not, and why:
**[docs/reports/STATUS.md](docs/reports/STATUS.md)**.

## Requirements

- Node.js ≥ 23.6 (the compiler runs its TypeScript sources directly) and pnpm
- CMake ≥ 3.20 and a C++17 compiler (Apple Clang or GCC)
- SDL3 for graphical programs on macOS: `brew install sdl3`
- Docker (optional) for the `linux` target when building from macOS

```sh
pnpm install
node compiler/bin/zinc.mjs doctor
```


## Try it

```sh
# console programs: same output on the Node oracle and natively
node compiler/bin/zinc.mjs run examples/hello --target sim
node compiler/bin/zinc.mjs run examples/hello                  # macos (native, SDL3 not needed)
node compiler/bin/zinc.mjs run examples/lang --debug           # ASan + UBSan + leak report
node compiler/bin/zinc.mjs run examples/lang --target linux    # GCC inside Docker (zinc/sdk-linux)

# games (SDL3 window, 320x240 logical, scaled)
node compiler/bin/zinc.mjs run examples/breakout               # arrows/A-D/mouse, Space to serve, Esc quits
node compiler/bin/zinc.mjs run examples/bouncing-ball          # Up/Space: +100 balls, Down: reset, click: +1

# small-target profile emulated on the Mac (numbers in f32, target resolution)
node compiler/bin/zinc.mjs run examples/breakout --profile ps1

# look at the generated C++ / JS
node compiler/bin/zinc.mjs build examples/hello --emit=cpp
node compiler/bin/zinc.mjs build examples/hello --target sim   # writes examples/hello/build/sim/*.js

# parity check across sim / macos / linux
scripts/parity.sh
```

Headless hooks: `ZINC_FRAMES=n` stops a frame loop after `n` frames (sim, null HAL and SDL HAL),
`ZINC_SHOT=out.bmp` saves the last frame of the SDL window.

## Commands

| Command | What it does |
| --- | --- |
| `zinc check [entry] [--json]` | TypeScript typecheck (`strict`, `noLib` + `lib/zinc.d.ts`) and Zinc checks; `--json` prints LSP-style diagnostics |
| `zinc build [entry] --target macos\|linux\|sim [--profile <id>] [--debug] [--emit=cpp\|js]` | compiles to `<entry dir>/build/<target>/`, writes `report.json` |
| `zinc run [entry] [same options] [-- args]` | builds then runs |
| `zinc doctor` | checks Node, CMake, compiler, SDL3, Docker |

`entry` defaults to `src/main.ts` or `main.ts`; a directory means `<dir>/main.ts`.

## How it works

```
.ts ──► TypeScript 6 API (frontend.ts) ──► Sema (sema.ts: machine types, captures, i32 loop counters)
                                             ├─► emit-cpp.ts ─► zinc_main.cpp + CMakeLists.txt ─► runtime/zrt + targets/<hal>
                                             └─► emit-js.ts  ─► ES modules + sim/zinc.mjs shim (the oracle)
```

- `lib/zinc.d.ts` replaces the standard lib: only what the runtime implements is visible in the IDE.
- Machine types (`i32`, `u8`, `f32`…) are read from annotations; `i32` wraps like `x | 0`, integer division by zero panics.
- `runtime/` is C++17 without STL, exceptions or RTTI; generated code only talks to `hal.h`.
- `targets/` holds the HALs: SDL3 (macOS/Linux windows), null (headless, virtual clock), POSIX common bits.

## Repository layout

```
compiler/   CLI and compiler (TypeScript, run directly by Node)
lib/        zinc.d.ts and zinc:gfx declarations
runtime/    zrt runtime (C++17 freestanding subset) and hal.h
targets/    HAL implementations
sim/        Node shim for the sim target
examples/   hello, lang (language tour), bouncing-ball, breakout
docker/     SDK images (linux for now)
docs/       decisions, reports, licenses
```
