# 1. Getting started

Your first five minutes, command for command: install, a project, a first change on screen, a first mistake and how to read it.
The project commands and the error messages of this walk are run by `next/tests/t1/first_run.sh` on every template, and the install by
`next/tests/t1/install_nocompiler.sh` on a machine set up with no compiler; both run without a window.

## Install

One command, and nothing to compile: no compiler, no CMake, no Xcode, no administrator password.

```sh
curl -fsSL https://github.com/zinc-engine/zinc/releases/latest/download/install.sh | sh
```

It downloads the `zinc` CLI made for your machine (a Mac, Apple silicon or Intel; Linux, x86_64 or aarch64; about 27 MB), checks its
SHA-256 against the release's `SHA256SUMS`, unpacks it into `~/.zinc/engine` and links `zinc` into `/usr/local/bin` when you
can write there, else into `~/.local/bin`, which it adds to your `PATH` (`~/.zprofile` or `~/.profile`). `zinc update`
updates it (see "Updating" below). Open a new terminal, then ask zinc what it sees:

```sh
zinc doctor
```

The download holds the engine, the window library, the fonts, the templates and the plugins, with the native libraries of the
plugins already compiled (`zinc:system`, `zinc:three`, `zinc:svg`, `zinc:sqlite`, `zinc:audio`, the physics engines and the
others): a program that imports them starts at once. `zinc doctor` ends with the few plugins that have none, and why:
`zinc:video` and `zinc:gphoto2`, for example, use libraries of your system (FFmpeg, libgphoto2): the download holds their
sources, and they are compiled the first time a program imports them, on a machine that has those libraries and, on a Mac,
the Xcode command line tools.

On a Mac, add `--atelier` to get Zinc Atelier too, the app that edits and runs projects with no terminal (it goes into
`/Applications`, or `~/Applications` when you cannot write there):

```sh
curl -fsSL https://github.com/zinc-engine/zinc/releases/latest/download/install.sh | sh -s -- --atelier
```

By hand instead, each release has two downloads per machine on its
[releases page](https://github.com/zinc-engine/zinc/releases):

- `zinc-<version>-macos-<arch>.tar.gz` (or `-linux-<arch>.tar.gz`): the CLI. Unpack it anywhere and link its `bin/zinc`
  into a directory of your `PATH` (`ln -s "$PWD/zinc-<version>-macos-arm64/bin/zinc" ~/.local/bin/zinc`); it finds the
  rest of its files beside it.
- `Zinc-Atelier-<version>-macos-<arch>.zip`: the app, with its own copy of the engine. Unzip it and drag "Zinc Atelier" to
  Applications. A Mac asks you to confirm an app that came through a browser and is not notarized: right-click > Open on
  "Zinc Atelier" once.

### Updating

```sh
zinc update --check      # is there a newer zinc? (exit 10 when there is)
zinc update              # install it; the previous version is kept
zinc update --rollback   # back to the previous version
```

`zinc update` downloads the new release for your machine, checks its signature and its SHA-256, and puts it in place of
`~/.zinc/engine` in one step (the old one stays in `~/.zinc/engine.prev`); if anything fails, nothing changes.
`zinc update --channel beta` follows the beta releases (`--channel stable` goes back). Once a day at most, `zinc run` and
`zinc dev` print one dim line when a newer zinc exists, and `zinc doctor` says whether yours is up to date; the check runs in
the background and never slows a command. Turn it off with `export ZINC_NO_UPDATE_CHECK=1` (it is already off in CI and
when the output is not a terminal). Zinc Atelier has Help > Check for Updates…; the app itself is updated by downloading its
new zip (or `install.sh --atelier` again). A zinc built from the sources updates with `git pull` and `tools/build zinc`.
Details: [Updating zinc](07-distribution.md#updating-zinc).

### From the sources

On Windows (no download yet), or to work on Zinc itself, you build the `zinc` program from the sources. You need git, CMake
3.20 or later and a C++20 compiler (on a Mac: `xcode-select --install`, then CMake from cmake.org or `brew install cmake`).
Nothing else: the window library (SDL3), the fonts and the other libraries are in the repository, and Node.js is not needed.

```sh
git clone https://github.com/zinc-engine/zinc.git
cd zinc/next
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
tools/build zinc                        # 6 to 8 minutes the first time on a 2019 laptop
sudo ln -s "$PWD/build/zinc" /usr/local/bin/zinc
```

The link puts `zinc` on your `PATH`; the program finds its libraries, templates and plugins from where it was built, so keep
the `zinc` directory. Each plugin is then compiled the first time a program imports it.

`zinc doctor` prints the engine and where its files are, this machine (profile, GPU), the tools it will download by itself the day you
build for a board, and the plugins. Nothing in that list has to be installed by hand. `zinc` alone, or `zinc help`, lists the
commands; `zinc help run` describes one; a misspelt command names the closest one (`zinc rnu`: "did you mean 'zinc run'?").

## Create a project and run it

```sh
zinc new game my-game
cd my-game
zinc run
```

`zinc new` answers `created my-game (game); next: cd my-game && zinc run`. `zinc run` opens a window with a yellow square that
the arrow keys move; the first run prints `zinc: compiling main.ts for this machine` and takes a few seconds, the next ones
start at once. Close the window to stop the program.

`zinc new --list` prints the templates. Each one runs as it is:

| template | what you get |
| --- | --- |
| `game` | a window, the arrow keys and a square: the smallest game loop (`zinc:gfx`) |
| `game-2d` | a 2D game to grow from: title, play and game-over scenes, keyboard, gamepad and pointer, SVG sprites, a saved best score |
| `3d` | a three.js scene: lights, a floor, a spinning ring; drag to orbit, wheel to zoom |
| `desktop-app` | a desktop app: sidebar, Home / Notes / Settings pages, an app menu, dark mode, saved settings |
| `dashboard` | stat cards, a line and a bar chart, alerts, fed by a data source you replace with yours |
| `cli` | a command-line program: its arguments and the platform |
| `server` | an HTTP server on port 3000 with a telemetry counter (stop it with Ctrl-C) |
| `service` | an HTTP JSON API with tests and a systemd unit for a Linux box or a Raspberry Pi |
| `iot` | a button on GPIO 27 lights pin 17 and sends an OSC message, simulated off the board |
| `iot-board` | an ESP32-S3 with a motion sensor and a small OLED (a bubble level), the sensor emulated on the desktop |
| `eink` | a reMarkable Paper Pro notebook: a to-do list and a sketch page, shown in an e-paper emulator |
| `remarkable` | a reMarkable Paper Pro ink canvas with undo |
| `plugin` | a plugin to publish: a Zinc API, a native part in C++, tests, an example |

`zinc new my-app` without a template name takes `game`. The directory must be new or empty.

## What is in the project

```
my-game/
  zinc.json            the project: its name, its entry, its assets (reference below)
  src/main.ts          the program (main.tsx when it uses JSX)
  assets/              images, fonts and the other files of the program
  tests/smoke.test.ts  a first test: zinc test runs every *.test.ts
  tsconfig.json        for your editor (types of the zinc: modules)
  README.md  .gitignore
```

`build/` (made by `zinc build`) and `dist/` (made by `zinc export`) can be deleted at any time. In a project directory
`zinc run`, `zinc check`, `zinc test` and `zinc build` need no argument; from elsewhere give the directory or the file:
`zinc run my-game`, `zinc run my-game/src/main.ts`.

## A first change

Start the program in dev mode: it watches the files and puts the new code into the running program each time you save.

```sh
zinc dev
```

Open `src/main.ts` in your editor. The last line of the frame draws the text:

```ts
  text(4, 4, 'arrows to move', 0xffffff, 1);
```

Replace `arrows to move` with `hello from me` and save. The terminal prints `zinc dev: v1 refreshed src/main.ts (96 ms after the
save)` and the window shows the new text without closing: the code of the save is swapped into the running program (Fast Refresh). Change `0xfeca57` (the square's colour, red green blue in hexadecimal) to `0xff6b6b`, save: a red
square. Ctrl-C stops `zinc dev`.

## A first mistake

A mistake stops nothing: `zinc run` (or `zinc check`, which only checks) prints one line per error, `file:line:column: error
code: what is wrong`, then a last line that says what to do. With `zinc dev` the same lines appear in the terminal and in a red
box in the window until the next good save. Six mistakes everyone makes, and what Zinc answers (`my-game/` stands for the full
path it prints):

**A misspelt name in an import** (`isDwon` for `isDown`):

```
my-game/src/main.ts:1:53: error Z0101: Cannot find name: 'isDwon' is not exported by 'zinc:gfx' (did you mean 'isDown'?)
my-game/src/main.ts:5:7: error Z0101: Cannot find name: 'isDown'
...
zinc: 5 errors, start with the first. Declare it before use, or fix the spelling. `zinc explain Z0101` shows an example.
```

Fix the first error first: the four others are the places that use the name the import did not bring.

**A misspelt file in an import** (`'./confg'` when the file is `src/config.ts`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: './confg' (no file my-game/src/confg.ts or .tsx; did you mean './config'?)
zinc: 1 error. Fix the path or create the file. `zinc explain Z0119` shows an example.
```

**A type error** (`let score: number = "ten";`):

```
my-game/src/main.ts:13:21: error Z0103: Type is not assignable: 'string' to 'f64'
zinc: 1 error. Convert explicitly or change the declared type. `zinc explain Z0103` shows an example.
```

`f64` is the name Zinc gives to `number` on a desktop (a 64-bit floating-point number). Here: write `10`, or declare
`let score: string`.

**A `zinc:` module that does not exist** (`'zinc:stoarge'`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:stoarge' (did you mean 'zinc:storage'?)
```

**A plugin that is not installed** (`'zinc:confetti'`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:confetti' is not a module of the engine and no plugin of this project provides it (`zinc plugins` lists the ones it has, `zinc plugins search confetti` looks in the index, `zinc add <name>` installs one)
```

`zinc plugins` prints every module you can import now, with one line of description each.

**A JSX tag left open** (in a `.tsx` project such as `zinc new remarkable`, a `<Text>` without its `</Text>`):

```
my-app/src/main.tsx:10:7: error Z0002: Expected a specific token: JSX: <Text> is not closed (line 15 closes </View> instead): add </Text>, or end the tag with />
```

The line is the one of the tag that was opened, not the place where the parser gave up.

**A file that is not there** (`zinc run src/mian.ts`):

```
src/mian.ts:1:1: error Z0119: Cannot find module: no file src/mian.ts (did you mean src/main.ts?)
```

and `zinc run` in a directory that is not a project says `zinc: no project here` with the files it looked for.

`zinc explain Z0103` prints, for any code, why the rule exists, how to fix it and a small example.

## Where to go next

- **You teach.** [The language](02-language.md) is TypeScript with the rules listed there, and each error code explains itself
  (`zinc explain`). `zinc new game-2d` is a complete small game to read and change in class; `zinc run examples/breakout` is
  another. `zinc test` runs the `*.test.ts` files of a project ([testing](06-testing.md)). The programs run the same on the
  school's old machines and on a Raspberry Pi.
- **You make things.** `zinc new iot-board` is a device with a sensor and a screen that runs on your desk with the sensor
  emulated; its `README.md` goes on to the real ESP32. `zinc new iot` is a button and an LED on a Raspberry Pi's pins.
  [Boards](../boards.md) lists the supported boards and panels, [plugins](05-plugins.md) how to talk to your own hardware.
- **You draw, animate, perform.** `zinc run examples/canvas/sketch` is a Canvas 2D sketch and `zinc new 3d` a three.js scene;
  `zinc run examples/hero` shows what the UI can do. The plugins [canvas2d](../plugins/canvas2d.md), [svg](../plugins/svg.md),
  [lottie](../plugins/lottie.md), [audio](../plugins/audio.md) and [video](../plugins/video.md) are one import away, and
  [UI apps](03-ui-apps.md) explains screens made of components.

The rest of this page is reference.

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
| `engine` | `"quickjs"` runs the project on the QuickJS engine, `"zinc"` on the typed engines; not set: QuickJS when the entry is `.js` or `.mjs` (`zinc run --engine quickjs` on the command line wins) |
| `assets` | the assets directory (default `assets`): its images and fonts are baked into the executable, its files are read at run time with `zinc:assets` (see [distribution](07-distribution.md#assets-of-a-built-program)); or an object `{ dir, rules, groups, profiles, budgets }` for the asset build (`zinc assets build`, `zinc assets info`: [the asset build](../reports/zinc-next-assets.md)) |
| `splash` | an image path, or `{ image, background, fit, minMs, fadeMs }`: shown from the first frame (also per target, `targets.<id>.splash`) |
| `loading` | `{ screen, groups, minMs, fadeMs }`: the screen (`default`, `bar` or a module) shown while the asset groups load before `main` |
| `launcher` | `{ entry, skippable, targets }`: a module run before the game on the listed targets (settings, mods) |
| `version` | semantic version; goes into the macOS `Info.plist`, the Linux `.desktop`, and `README.txt` on export |
| `id` | bundle/app id (macOS `CFBundleIdentifier`); defaults to `dev.zinc.<name>` |
| `icon` | PNG used to build the macOS `.icns`, the Linux icon, the rmpp AppLoad icon and the wasm favicon (see [distribution](07-distribution.md)) |
| `crash` | release crash policy: `exit` (default), `redbox` (draw the error, wait) or `restart` (see [dev mode](../dev-mode.md)) |
| `display` | display driver for screens that aren't the default window (`fbdev`, `ws2812`, `ssd1306`, `st7789`, `rmpp`, `gl`); string or `{ driver, ...options }` |
| `plugins` | per-plugin options, overriding `plugin.json` defaults |
| `pluginDirs` | extra plugin search roots (relative to the project) |
| `targets.<id>` | per-target overrides of the profile: `width`, `height`, `heap`, `zoom`, `resize`, `fullscreen`, `kiosk`, `display`, `plugins`, `assets` (`{ profile, ...profile keys }`), `splash`, and target-specific keys (`esp32.wifi`) |

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
zinc run [entry|dir] [--interp|--native] [--profile P] [-- args]   # compile and run
zinc check [entry|dir]                                              # the errors, without running
zinc test                                                           # every *.test.ts of the project
zinc build [entry|dir] [-o out] [--target T]                        # an executable in build/
zinc dev [entry|dir] [--no-devtools] [-- args]                      # run, watch, swap each save in (Fast Refresh)
zinc help [command]
```

`zinc run` compiles a program that draws to native code and keeps the executable (`~/.zinc/cache/run`): the first run of a
version compiles, the next ones start at once; `--interp` interprets instead and starts at once. `zinc dev` swaps every save into the
running program (or restarts it, and says why), with a red box on a compile error and, for UI programs, a Chrome DevTools inspector on port 9229
(see [dev mode](../dev-mode.md)). Pass program arguments after `--`; read them with `sys.args()`.

Useful environment variables: `ZINC_HEADLESS=1` runs without a window, `ZINC_BACKGROUND=1` (or `zinc --background run`) opens it without taking the focus, `ZINC_FRAMES=n` stops a frame loop after n frames,
`ZINC_SHOT=out.png` saves the last frame (`zinc capture` saves any frames), `ZINC_DETERMINISTIC=1` puts the run on
a virtual clock.

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

F5 starts it: breakpoints in `.ts` and `.tsx` files (inside JSX elements too) stop the program, the Variables view shows the locals of each
frame of the Call Stack with objects and arrays to unfold, the debug toolbar continues, steps and pauses a running program, and a watch or a
hover on a local's name shows its value. The program's output goes to the Debug Console. The adapter uses the `zinc` of this repository when
the extension is linked from it, else `$ZINC`, else the `zinc` on the `PATH`.
