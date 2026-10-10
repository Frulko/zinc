# 1. Getting started

## Install

Requirements: Node.js ≥ 23.6 (it runs the compiler by stripping TypeScript types; the executables Zinc produces do
**not** need Node), pnpm, CMake ≥ 3.20, a C++17 compiler (Apple Clang or GCC), and SDL3 for windowed programs on the
host (`brew install sdl3`). Docker is needed only for cross targets (`linux`, `rpi1`, `rmpp`, `esp32`, `ps1`, `ps2`),
emscripten only for `wasm` (`brew install emscripten`).

```sh
pnpm install
alias zinc="node $PWD/compiler/bin/zinc.mjs"
zinc doctor
```

`zinc doctor` reports what is present; a missing cross-toolchain only matters when you build for that target.

## Create a project

```sh
zinc init myapp --template game        # game | cli | server | iot | remarkable
cd myapp
zinc run
```

Templates give you a working starting point:

| template | entry | what it does |
| --- | --- | --- |
| `game` | `src/main.ts` | `zinc:gfx` frame loop, keyboard/mouse input, an SDL3 window |
| `cli` | `src/main.ts` | reads `zinc:sys` args/platform, prints |
| `server` | `src/main.ts` | `zinc:net` HTTP server + `zinc:telemetry`, headless |
| `iot` | `src/main.ts` | `zinc:gpio` button → LED, OSC out (simulated on the host) |
| `remarkable` | `src/main.tsx` | JSX + handwriting for the reMarkable Paper Pro e-ink emulator |

## Project layout

`zinc init` produces:

```
myapp/
  zinc.json          project manifest (see below)
  src/main.ts        entry (or main.tsx for JSX)
  assets/            images and fonts baked in at build time; the other files read at run time (zinc:assets)
  .gitignore         build/ dist/
  README.md
```

`build/` holds generated C++ and per-target build trees; `dist/` holds `zinc export` output. Both are disposable.
The entry defaults to `zinc.json` `"entry"`, then `src/main.ts` / `main.ts` (`.tsx` too). A directory argument means
its `zinc.json` / `main.ts`, so `zinc run examples/breakout` works.

## `zinc.json` reference

```json
{
  "name": "myapp",
  "entry": "src/main.tsx",
  "assets": "assets",
  "version": "0.1.0",
  "id": "com.example.myapp",
  "icon": "assets/icon.png",
  "crash": "exit",
  "display": "fbdev",
  "plugins": { "devtools": { "port": 9229 } },
  "pluginDirs": ["../shared-plugins"],
  "targets": {
    "macos": { "width": 800, "height": 600, "zoom": 1, "resize": "fill", "fullscreen": false, "kiosk": false },
    "esp32": { "heap": 163840, "display": { "driver": "ssd1306", "address": 60 }, "wifi": { "ssid": "net", "password": "…" } }
  }
}
```

| field | meaning |
| --- | --- |
| `name` | app name; the executable and `dist/<name>-<target>` are named after it |
| `entry` | source entry (`.ts` / `.tsx` / `.js`) |
| `assets` | the assets directory (default `assets`): its images and fonts are baked into the executable, its files are read at run time with `zinc:assets` (see [distribution](07-distribution.md#assets-of-a-built-program)) |
| `version` | semantic version; goes into the macOS `Info.plist`, the Linux `.desktop`, and `README.txt` on export |
| `id` | bundle/app id (macOS `CFBundleIdentifier`); defaults to `dev.zinc.<name>` |
| `icon` | PNG used to build the macOS `.icns`, the Linux icon, the rmpp AppLoad icon and the wasm favicon (see [distribution](07-distribution.md)) |
| `crash` | release crash policy: `exit` (default), `redbox` (draw the error, wait) or `restart` (see [dev mode](../dev-mode.md)) |
| `display` | display driver for screens that aren't the default window (`fbdev`, `ws2812`, `ssd1306`, `st7789`, `rmpp`, `gl`); string or `{ driver, ...options }` |
| `plugins` | per-plugin options, overriding `plugin.json` defaults |
| `pluginDirs` | extra plugin search roots (relative to the project) |
| `targets.<id>` | per-target overrides of the profile: `width`, `height`, `heap`, `zoom`, `resize`, `fullscreen`, `kiosk`, `display`, `plugins`, and target-specific keys (`esp32.wifi`) |

## Targets and profiles

A **target** is what you build for; a **profile** is the number representation, resolution and heap budget applied.
`--target` picks the backend, `--profile` lets you emulate another target's numeric/size constraints on your host —
`zinc run app --profile ps1` runs on macOS but with Q20.12 fixed point, 320×240 and a 256 KiB heap, so you can debug
fixed-point behaviour without the console.

| target | output | screen |
| --- | --- | --- |
| `macos` | native executable | SDL3 window |
| `linux` | executable (docker `zinc/sdk-linux`) | fbdev / GL plugins |
| `rpi1` | ARMv6 hard-float (docker, QEMU for tests) | fbdev, GL, SSD1306, WS2812 |
| `rmpp` | static aarch64 | reMarkable Paper Pro e-ink |
| `esp32` | ESP-IDF firmware (Espressif QEMU for tests) | WS2812, SSD1306, ST7789 |
| `wasm` | emscripten page (`zinc run` serves it) | canvas |
| `ps2` / `ps1` | EE ELF / PS-EXE + CD image | gsKit / GPU bands |
| `sim` | Node.js | headless — the oracle every target is compared against |

Defaults per profile (number kind, resolution, typing, heap): `macos`/`linux`/`sim` f64, gradual, 512 MiB; `wasm` f64,
64 MiB; `rpi1` f64, 1280×720, 64 MiB; `esp32` f32, strict, 160 KiB; `ps1` fx12 (no FPU), strict, 256 KiB. Override any
of these in `zinc.json` `targets.<id>`.

## Running

```sh
zinc run [entry] [--target <id>] [--profile <id>] [--debug] [-- args]
zinc build [entry] [--emit=hir|mir|cpp|js]     # compile only; --emit prints the IR / generated code
zinc check [entry] [--json]                    # typecheck + Zinc rules (LSP JSON with --json)
zinc dev [entry] [--target macos|linux|sim|wasm|rpi1] [--device user@host] [--no-devtools]
zinc help [commands|targets|options|env|plugins|ui|docs]
```

`zinc run` builds and runs: sim runs on Node, cross targets run under docker/QEMU or serve a page (wasm). `zinc dev`
rebuilds on every save and puts the new version on screen — hot reload on the host platform, page reload for wasm,
process restart elsewhere — with a red box on crash and a Chrome-DevTools UI inspector on `:9229` (see
[dev mode](../dev-mode.md)). Pass program arguments after `--`; read them with `sys.args()`.

Useful environment variables (full list: `zinc help env`): `ZINC_FRAMES=n` stops a frame loop after n frames,
`ZINC_SHOT=out.png` saves the last frame (`zinc capture` saves any frames), `ZINC_DETERMINISTIC=1` puts the run on
a virtual clock, `ZINC_LOG_FORMAT=json` switches console output to JSON lines,
`ZINC_TELEMETRY=udp://host:port` enables telemetry (`zinc monitor` views it).

Next: [the language](02-language.md).

## Editor setup

`zinc init` writes a `tsconfig.json` for VS Code (or any tsserver-based editor): Zinc's own library instead of the
DOM / ES lib (so `document` or a regex is flagged as the compiler would), `zinc:*` modules and plugins resolved,
typed JSX host tags (`View`, `Text`...), and a small tsserver plugin (`node_modules/zinc-ts-plugin`, linked to
`lib/editor/zinc-ts-plugin`) that drops only the diagnostics about Zinc's thunk children. For an existing project:

```sh
zinc tsconfig            # or: zinc tsconfig path/to/project
```

Then use the workspace's TypeScript as usual; `zinc check` remains the reference (Z codes, targets).

## Debugging

`zinc debug src/main.ts` runs a program under the debugger on the command line: it stops at the first statement, then `b main.ts:12`
sets a breakpoint, `c` continues, `n` / `s` / `o` step over, into and out, `bt` prints the stack and `locals` the variables (the whole list:
[dev mode, Debugger](../dev-mode.md#debugger-zinc-debug)).

In VS Code, the Zinc Debug extension (`lib/editor/vscode-zinc-debug`) runs `zinc debug --dap`, a Debug Adapter Protocol server. Link it into
VS Code's extensions once and restart VS Code:

```sh
ln -s "$ZINC_ROOT/lib/editor/vscode-zinc-debug" ~/.vscode/extensions/zinc.zinc-debug-0.1.0   # ZINC_ROOT: this repository
```

Then `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    { "type": "zinc", "request": "launch", "name": "Zinc: debug", "program": "${workspaceFolder}/src/main.ts", "cwd": "${workspaceFolder}", "stopOnEntry": false }
  ]
}
```

F5 starts it: breakpoints in `.ts` files stop the program (`.tsx` lines come with ZN-371.03), the Variables view shows the locals of each
frame of the Call Stack with objects and arrays to unfold, the debug toolbar continues, steps and pauses a running program, and a watch or a
hover on a local's name shows its value. The program's output goes to the Debug Console. The adapter uses the `zinc` of this repository when
the extension is linked from it, else `$ZINC`, else the `zinc` on the `PATH`.
