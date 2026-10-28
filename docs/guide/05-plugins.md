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
target is an error (`zinc plugins` shows which targets each plugin supports). Look at `plugins/gestures` and `plugins/pixelfont` for real pure-Zinc plugins.

## Kind 2 — native plugin (spec + C++ per target + a Zinc stand-in)

When a plugin needs C or hardware, it uses the native-module mechanism. A typed **spec** generates the C++
interface; you implement it per target and, where no native code can run, as a stand-in written in Zinc. The quickest
way to start is `zinc new plugin my-plugin` (see "Publishing" below): it ships all these files. This mirrors `examples/native-module`
and real plugins like `plugins/gphoto2` / `plugins/lottie`. Files (relative to the plugin, under `native/`):

| file | role |
| --- | --- |
| `<name>.spec.ts` | `export default requireNative<Spec>('Name')`; the `Spec` interface is the API |
| `<name>.host.cpp` | implementation for `macos`/`linux` (the fallback) |
| `<name>.<target>.cpp` | target-specific implementation (`.rpi1.cpp`, `.esp32.cpp`, …) |
| `<name>.sim.ts` | the same behaviour in Zinc: the stand-in used where the native part does not run, and in deterministic runs (`ZINC_NATIVE=real\|sim\|auto` picks) |
| `<name>.abi.c` / `.abi.cpp` | instead of `.host.cpp`: C (or C++, for an Arduino library) on the native ABI (`include/zn/native.h`, `zinc native-gen --c` writes its table), no runtime types; the same file runs on the computer and in the ESP32's mquickjs firmware ([native code on the ESP32](../plugins/native-esp32.md)) |

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
// native/sensor.sim.ts — same behaviour, so the stand-in gives the native output
let t = 21.5;
export default { temperature(): number { t += 0.25; return t; }, serial(): string { return 'HOST-0001'; }, setLed(_on: boolean): void {} };
```

Calls are direct C++ virtual calls (no marshalling). Threads must never touch the Zinc heap — do blocking/native work
on a worker and hand results back through the event loop (`zrt::Poller`) or a `zinc:events` `Emitter`; `plugins/gphoto2`
is the reference pattern (one worker owns the camera, results come back on the loop). `zinc build` fails with `Z5002`
if a target has no implementation.

The plugin's native build settings go in `plugin.json` `targets.<id>` (see the reference below): `sources`, `pkg`,
`frameworks`, `libs`, `defines`, `idf`/`idfComponents` (ESP-IDF).

### Records

A spec may declare interfaces and use them as parameters and results, in lists, as `T | null` or `x?:` fields, nested, and in a
`Promise`. Fields are `number`/`f64`, `i32`, `u32`, `boolean`, `string`, `u8[]`, arrays, optionals and other interfaces of the spec file.

```ts
// native/music.spec.ts
export interface Art { w: i32; h: i32; }
export interface Track { title: string; ms: number; art: Art | null; tags: string[]; note?: string; }
interface Spec extends NativeModule { tracks(): Promise<Track[]>; play(t: Track): void; }
export default requireNative<Spec>('Music');
```

The generated header has one plain struct per record (`std::string`, `std::vector`, `std::optional`, `double`, `int32_t`, `uint32_t`, `bool`),
and the method takes and returns the record's bytes. Encode on the worker, hand the bytes to the loop:

```cpp
std::vector<Track> list = scan();                                    // worker thread: std types only, no Zinc heap
std::vector<uint8_t> bytes = zn::rec::encode(list);
// ... on the program's thread (a zrt::Poller): pending.p->resolve(zn::rec::array(bytes));
void play(zrt::Array<uint8_t> b) override { Track t; if (zn::rec::read(b, t)) start(t.title); }
```

The wire (`include/zn/rec.h`) is little-endian with no keys: numbers at their width, strings and `u8[]` as a u32 length and the bytes, a list as
a u32 count and the items, an optional as one byte and the value, a record as a u32 length and its fields in declaration order. To evolve a
record, only append fields: an older reader skips the fields it does not know, a newer reader gives the missing ones their default (0, false,
"", [], null). The program sees typed objects on every engine; records need a gradual profile (the strict ones refuse them with Z5010).

A field whose name is a keyword of C++ (`auto`, `new`, `delete`, `default`...) is the same name with a trailing underscore in the
generated struct (`b.auto_`); the wire carries no names, so nothing else changes.

## Kind 3 — UI component plugin

A module plugin can export UI components — they are just functions returning a node handle (`i32`), so they compose in
JSX like host tags. `zinc:lottie` exports a `<Lottie/>` node and a `Player`; `zinc:map`, `zinc:svg`, `zinc:ink` do the
same. Pattern:

```tsx
// in the plugin's index.ts
import { createNode /* … lib/std/ui.ts helpers … */ } from 'zinc:ui';
export function Badge(props: { label: string, className?: string }): i32 { /* build and return a node */ }
```

```tsx
// in the app
import { Badge } from 'zinc:mybadge';
<View><Badge label="new" /></View>
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
| `targets` | availability + per-target native build settings; an unlisted target is an error |
| `targets.<id>.sources` | extra C++ files compiled into the program; `.c` files (vendored C libraries such as `plugins/script`'s QuickJS) build as their own static library with C flags |
| `targets.<id>.pkg` / `frameworks` / `libs` / `linkFlags` | pkg-config modules, Apple frameworks, `-l` libs, raw link flags |
| `targets.<id>.cargo` | a Rust crate directory of the plugin (`"rust"`): cargo builds it as a static library that is linked with the plugin; needs Rust installed (rustup.rs) |
| `targets.<id>.defines` / `flags` | compile definitions and flags |
| `targets.<id>.vendorFlags` | flags of the vendored sources only (`.c` files, C++ under `vendor/`), such as `-frtti` for a C++ library that needs it |
| `targets.<id>.idf` / `idfComponents` | ESP-IDF `REQUIRES` and Component Registry deps |
| `requires` | capabilities the target must offer, e.g. `["heap>=4M"]` ([capabilities](../targets/capabilities.md)) |
| `options` | defaults, overridden by `zinc.json` `plugins.<name>` (or `targets.<id>.plugins.<name>`, or display options) |

## Options

`options` in `plugin.json` are defaults. A project overrides them in `zinc.json`:

```json
{ "plugins": { "greet": { "excited": true } }, "targets": { "esp32": { "plugins": { "ws2812": { "brightness": 20 } } } } }
```

Native code reads options as `ZP_<PLUGIN>_<KEY>` compile defines (plus `ZP_<PLUGIN>=1`) — e.g. `ZP_GREET_EXCITED`.
This is a native-side mechanism; a pure-Zinc plugin exposes configuration through its own exported functions instead.

## System libraries and ESP-IDF components

A plugin that needs a system library links it with `pkg` (pkg-config), `libs` or `frameworks` under `targets.<id>`; cross
builds use the pinned zig, there is no SDK image to extend. On ESP32, `idf` adds `REQUIRES` and `idfComponents` pulls
Component Registry dependencies; see `plugins/lottie` and `plugins/video`.

## Testing a plugin

`zinc test` runs the `tests/*.test.ts` of the plugin on its native part; `ZINC_NATIVE=sim zinc test` runs the same tests on
the Zinc stand-in, and both must pass (the template's README shows it). Native paths that need hardware are checked on the
board or the simulated device (`zinc run --simulate <device>`); see how the display drivers do it in
[docs/plugins/displays.md](../plugins/displays.md).

## Publishing / sharing

A plugin is just a directory. Share it by:

- committing it under your project's `plugins/` (it shadows bundled plugins of the same name), or
- pointing `zinc.json` `"pluginDirs"` at a shared checkout (`["../shared-plugins"]`), or
- publishing it from its own repository: `zinc new plugin my-plugin` makes one (a Zinc API, a native part, tests, CI on four targets
  and signed releases; its README walks through it), and projects `zinc add` it from its repository or from a signed release, or
- contributing it to the bundled `plugins/` in this repo.

The signed index, tiers and `zinc add <name>`: [docs/plugins.md](../plugins.md), "Plugin index". Next: [testing](06-testing.md).
