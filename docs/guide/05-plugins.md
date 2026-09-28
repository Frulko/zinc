# 5. Plugins

Optional features live in `plugins/<name>/`, outside the core runtime, and are compiled into a program **only when it
imports them** (or selects a display driver in `zinc.json`). The core stays small; the toolbox grows in `plugins/`.
`zinc plugins [project]` lists every plugin visible from a project with the targets it supports. Full reference:
[docs/plugins.md](../plugins.md).

Search path: `<zinc>/plugins/*`, then `<project>/plugins/*`, then `zinc.json` `"pluginDirs"`. A project plugin shadows
a bundled one of the same name.

## Kind 1 — pure-Zinc module plugin (the "JS plugin" case)

The simplest plugin is a directory with a `plugin.json` and a Zinc `index.ts`. The entry is compiled straight into the
program, exactly like your own source — no native code. This is the whole of
[`docs/guide/samples/greet-app/plugins/greet`](samples/greet-app/plugins/greet):

```json
// plugin.json
{
  "name": "greet",
  "kind": "module",
  "module": "zinc:greet",
  "entry": "index.ts",
  "description": "Tiny pure-Zinc greeting plugin (no native code)",
  "options": { "excited": false },
  "targets": { "macos": {}, "linux": {}, "rpi1": {}, "esp32": {}, "wasm": {}, "ps1": {}, "ps2": {}, "rmpp": {} }
}
```

```ts
// index.ts
export function greeting(name: string): string { return 'Hello, ' + name + '!'; }
export function shout(name: string): string { return greeting(name).toUpperCase(); }
```

A project imports it by the `module` specifier and builds normally:

```ts
import { greeting, shout } from 'zinc:greet';
console.log(greeting('Zinc'));   // Hello, Zinc!
console.log(shout('world'));     // HELLO, WORLD!
```

```sh
zinc plugins docs/guide/samples/greet-app     # lists zinc:greet with its targets
zinc run docs/guide/samples/greet-app         # Hello, Zinc! / HELLO, WORLD!
```

`targets` lists availability only — an empty object per target is enough for pure Zinc. Using a plugin on an unlisted
target is error `Z5003`. Look at `plugins/gestures` and `plugins/pixelfont` for real pure-Zinc plugins.

## Kind 2 — native plugin (spec + C++ per target + sim)

When a plugin needs C or hardware, it uses the native-module mechanism (ADR 0010). A typed **spec** generates the C++
interface; you implement it per target and, for the oracle, in Zinc for `sim`. This mirrors `examples/native-module`
and real plugins like `plugins/gphoto2` / `plugins/lottie`. Files (relative to the plugin, under `native/`):

| file | role |
| --- | --- |
| `<name>.spec.ts` | `export default requireNative<Spec>('Name')`; the `Spec` interface is the API |
| `<name>.host.cpp` | implementation for `macos`/`linux` (the fallback) |
| `<name>.<target>.cpp` | target-specific implementation (`.rpi1.cpp`, `.esp32.cpp`, …) |
| `<name>.sim.ts` | Zinc implementation for the sim oracle (same observable behaviour) |

```ts
// native/sensor.spec.ts
import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule {
  temperature(): f64;
  serial(): string;
  setLed(on: boolean): void;
}
export default requireNative<Spec>('Sensor');
```

```cpp
// native/sensor.host.cpp — zinc generates zinc_native_sensor.h with `struct NativeSensor`
#include "zinc_native_sensor.h"
struct HostSensor : NativeSensor {
  double t = 21.5;
  double temperature() override { t += 0.25; return t; }
  zrt::String serial() override { return zrt::String::from("HOST-0001", 9); }
  void setLed(bool on) override { (void)on; }
};
NativeSensor* zinc_create_Sensor() { static HostSensor s; s.rc = zrt::IMMORTAL; return &s; }
```

```ts
// native/sensor.sim.ts — same behaviour, so sim output matches native byte-for-byte
let t = 21.5;
export default { temperature(): number { t += 0.25; return t; }, serial(): string { return 'HOST-0001'; }, setLed(_on: boolean): void {} };
```

Calls are direct C++ virtual calls (no marshalling). Threads must never touch the Zinc heap — do blocking/native work
on a worker and hand results back through the event loop (`zrt::Poller`) or a `zinc:events` `Emitter`; `plugins/gphoto2`
is the reference pattern (one worker owns the camera, results come back on the loop). `zinc build` fails with `Z5002`
if a target has no implementation.

The plugin's native build settings go in `plugin.json` `targets.<id>` (see the reference below): `sources`, `pkg`,
`frameworks`, `libs`, `defines`, `packages` (SDK-image system packages), `idf`/`idfComponents` (ESP-IDF).

## Kind 3 — UI component plugin

A module plugin can export UI components — they are just functions returning a node handle (`i32`), so they compose in
JSX like host tags. `zinc:lottie` exports a `<Lottie/>` node and a `Player`; `zinc:map`, `zinc:svg`, `zinc:ink` do the
same. Pattern:

```tsx
// in the plugin's index.ts
import { createNode /* … lib/std/ui helpers … */ } from 'zinc:ui';
export function Badge(props: { label: string }): i32 { /* build and return a node */ }
```

```tsx
// in the app
import { Badge } from 'zinc:mybadge';
<view><Badge label="new" /></view>
```

## Kind 4 — display driver plugin

A `"kind": "display"` plugin replaces the target's screen. It registers a `HalDisplay`
([`runtime/include/hal.h`](../../runtime/include/hal.h)) from a static constructor; the runtime renders the damaged
rows with the shared software rasterizer and hands them to the driver, which converts them for the device (SPI LCD, I2C
OLED, LED matrix, framebuffer, e-ink). The program still draws with `zinc:ui`/`zinc:gfx`. Chosen per target in
`zinc.json`:

```json
{ "targets": { "esp32": { "width": 128, "height": 64, "display": { "driver": "ssd1306", "address": 60 } } } }
```

`plugins/display-fbdev`, `display-ssd1306`, `display-st7789`, `display-ws2812`, `display-gl` and `display-rmpp` are the
worked drivers; the surface size is the display size, set per target. See [docs/plugins/displays.md](../plugins/displays.md).

## `plugin.json` reference

| field | meaning |
| --- | --- |
| `name` | plugin name (directory, shadowing key) |
| `kind` | `module` (default) or `display` |
| `module` | import specifier for a module plugin (e.g. `zinc:greet`) |
| `entry` | Zinc entry, default `index.ts` |
| `targets` | availability + per-target native build settings; an unlisted target is `Z5003` (sim always allowed for modules) |
| `targets.<id>.sources` | extra C++ files compiled into the program |
| `targets.<id>.pkg` / `frameworks` / `libs` / `linkFlags` | pkg-config modules, Apple frameworks, `-l` libs, raw link flags |
| `targets.<id>.defines` / `flags` | compile definitions and flags |
| `targets.<id>.packages` | system packages added to the SDK image (apk on rpi1, apt on linux); a derived image is built once per set |
| `targets.<id>.idf` / `idfComponents` | ESP-IDF `REQUIRES` and Component Registry deps |
| `options` | defaults, overridden by `zinc.json` `plugins.<name>` (or `targets.<id>.plugins.<name>`, or display options) |

## Options

`options` in `plugin.json` are defaults. A project overrides them in `zinc.json`:

```json
{ "plugins": { "greet": { "excited": true } }, "targets": { "esp32": { "plugins": { "ws2812": { "brightness": 20 } } } } }
```

Native code reads options as `ZP_<PLUGIN>_<KEY>` compile defines (plus `ZP_<PLUGIN>=1`) — e.g. `ZP_GREET_EXCITED`.
This is a native-side mechanism; a pure-Zinc plugin exposes configuration through its own exported functions instead.

## Packages and ESP-IDF components

Cross builds run inside a pinned SDK image. A plugin that needs a system library lists it in `packages` (installed into
a derived image, built once per package set) and links it via `pkg`. On ESP32, `idf` adds `REQUIRES` and
`idfComponents` pulls Component Registry dependencies — see `plugins/lottie` and `plugins/video`.

## Testing a plugin

Because the plugin ships a `sim` implementation, `zinc test` (chapter 6) checks it against native output byte-for-byte.
Write a small program that exercises the plugin under `tests/conformance/` (or your own app's tests) and let the oracle
catch drift. Native-only paths that can't run under sim (real hardware) are verified with `debug` CRC logs in QEMU —
see how the display drivers do it in [docs/plugins/displays.md](../plugins/displays.md).

## Publishing / sharing

A plugin is just a directory. Share it by:

- committing it under your project's `plugins/` (it shadows bundled plugins of the same name), or
- pointing `zinc.json` `"pluginDirs"` at a shared checkout (`["../shared-plugins"]`), or
- contributing it to the bundled `plugins/` in this repo.

There is no registry; distribution is by directory. Next: [testing](06-testing.md).
