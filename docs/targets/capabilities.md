# Platform capabilities

Zinc runs on hosts with gigabytes of RAM, on 160 KiB microcontrollers and on a PS1 without an FPU. Rather than
discover at runtime that a program does not fit, every profile declares what it offers, and programs, plugins,
modules and tests declare what they need.

## The table

`targets/capabilities.json` lists the hardware flags of each profile. The compiler adds `heap`, `numbers`, `fpu`,
`width` and `height` from its profile table (and from `zinc.json` `targets.<id>` overrides).

| profile | heap | numbers | touch | pointer | keyboard | pen | gamepad | eink | net | fs | threads | process | dynlib |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| macos / linux | 512M | f64 | – / optional | yes | yes | optional | optional | – | yes | yes | yes | yes | yes |
| rpi1 | 64M | f64 | optional | optional | optional | – | optional | – | yes | yes | yes | yes | – |
| rmpp | 256M | f64 | yes | – | optional | yes | – | yes | yes | yes | yes | yes | – |
| esp32 | 160K | f32 | plugin | – | – | – | – | plugin | yes | yes | – | – | – |
| ps1 | 256K | fx12, no FPU | – | – | – | – | yes | – | – | – | – | – | – |
| ps2 | 16M | f32 | – | – | – | – | yes | – | – | – | – | – | – |
| wasm | 64M | f64 | optional | yes | yes | optional | optional | – | – | – | – | – | – |
| android | 128M | f64 | yes | optional | optional | optional | optional | – | yes | yes | yes | – | – |
| ios, ios-sim | 256M | f64 | yes | optional | optional | optional | optional | – | yes | yes | yes | – | – |

`plugin` and `optional` count as available: a display or input plugin (or the board) provides it.

- **`process`**: an OS with processes, signals, environment and a terminal. It covers `zinc:process`, `zinc:os`,
  `zinc:socket` and `sys.onSignal`.
- **`dynlib`**: loading shared libraries at run time with `dlopen`. It is used by `zinc:ffi`, and it is off for static
  binaries (rmpp) and for 32-bit ARM (rpi1). The sim emulates a few libc functions for it.
- **Phones and tablets** (`android`, `ios`, `ios-sim`, ZN-618): an app starts no child process and loads no library (D59, `docs/reports/zinc-next-mobile-core.md`), and has none of the desktop keys (tray, menubar, dialogs, windows, autostart...). The plugins whose `requires` say `process` for "an OS" (socket, osc, sonos, spotify) are refused there until their manifests name what they use.

The `ui` group of each profile holds build settings of `zinc:ui` rather than hardware flags: `layout` (the engine `"ui": {"layout": "auto"}` picks), `rn` (whether the Yoga engine may be built for the profile) and `why` (the reason when it may not: esp32, ps1). They are read as `ui.layout`, `ui.rn`, `ui.why` and are not `zinc:platform` constants; `UI_LAYOUT` gives the result (ZN-285).

The `assets` group is the target's default asset build profile (ZN-435): `texture` (the formats its GPU takes, in preference order), `maxSize`, `pot`, the `audio` (music) and `sfx` codecs it decodes cheaply, the `pack` codec, `split`, and `budgets` (`download`, `boot`, `gpu`, `ram`, `flash`) for `zinc assets check`. A project's `zinc.json` `assets.profiles`, `assets.budgets` and `targets.<id>.assets` override it; `zinc assets info` prints the result per target ([the asset build](../reports/zinc-next-assets.md)). The numbers are starting values from `docs/reports/games/toolchain-assets-loading.md` (sections 3 and 6.6) until measured on each device.

## Requirements

A requirement is a string, and all of them must hold:

| form | example | meaning |
|---|---|---|
| name | `touch` | the capability is available |
| alternatives | `touch|pointer` | any of them |
| negation | `!eink` | not available |
| comparison | `heap>=256K`, `width>=480` | numbers (heap in bytes, `K` / `M` suffixes) |
| equality | `numbers=f64` | string values |

Where requirements are declared:

- **An app, in `zinc.json`**: `"requires": ["heap>=4M", "pointer|touch"]`. `zinc build` refuses a target that does
  not meet them and says why (`hero needs heap>=4M (esp32 has heap 160K)`); `--force` builds anyway.
- **A plugin, in `plugin.json`**: `"requires": [...]`. Importing it on an incompatible target is an error.
- **A module, in a leading comment**: `/** @requires heap>=192K */`. Importing it on an incompatible target prints
  a warning, e.g. the kit's `Keyboard` on a 160 KiB ESP32.
- **A conformance test**: `// zinc-test: requires heap>=512K touch|pointer`. The runner skips the program on
  incompatible profiles and prints the reason. The older `// zinc-test: skip <profile>` still works.

## Checking a program before a build: zinc lint

`zinc lint --target <profile>` (or `--all-targets`, a matrix of every profile) checks a project against this table without compiling
it: `zinc.json` `requires`, the `requires` and `targets` of the plugins it imports, `@requires` comments, the UI tier (`tier`), the screen
(`width`, `height`) and the asset budgets (`assets`). The rules and their fixes: [the guide](../guide/10-lint-migrate.md).

## Platform-specific files

Next to `keyboard.tsx`, a `keyboard.<profile>.tsx` (e.g. `keyboard.esp32.tsx`, `keyboard.ps1.tsx`) replaces it when
building for that profile, else a `keyboard.<target>.tsx` for the target, like React Native's `.ios.tsx`. Imports keep writing `./keyboard`. Use it for
a leaner version on small devices rather than a slower general one.

## Capabilities in code

```ts
import { TOUCH, KEYBOARD, HEAP_BYTES, PROFILE } from 'zinc:platform';

if (TOUCH && !KEYBOARD) showOnScreenKeyboard();   // a constant: the other branch is not compiled in
const rows = HEAP_BYTES < 512 * 1024 ? 50 : 5000;
```

`zinc:platform` is generated for each build. It exports `TARGET`, `PROFILE`, `HEAP_BYTES`, `NUMBERS`, `SCREEN_W`,
`SCREEN_H`, and one boolean per capability (`TOUCH`, `POINTER`, `KEYBOARD`, `PEN`, `GAMEPAD`, `EINK`, `NET`, `FS`,
`THREADS`, `FPU`, `AUDIO`, `GPU`, `GPIO`, `DISPLAY`, `PROCESS`, `DYNLIB`).
