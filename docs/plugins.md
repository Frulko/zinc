# Plugins

Optional features live in `plugins/<name>/`, outside the core runtime, and are compiled into a program only when it
uses them. The core stays small (`runtime/`, `lib/`); the toolbox grows in `plugins/`.

`zinc plugins [project]` lists every plugin visible from a project with the targets it supports.

## Kinds

- **module**: imported like any module (`import { play } from 'zinc:video'`). The plugin's `index.ts` is Zinc code
  compiled with the program; native code goes through the native module mechanism (`native/<name>.spec.ts`,
  `native/<name>.<target>.cpp` or `.host.cpp`, `native/<name>.sim.ts`, see ADR 0010).
- **display**: a screen/input driver chosen in `zinc.json` (`"display": "ws2812"` or
  `"display": { "driver": "ws2812", "width": 32 }`, also per target under `targets.<id>.display`). It registers a
  `HalDisplay` from a static constructor (`runtime/include/hal.h`); the runtime then sends it frames (the shared
  software rasterizer renders bands on demand) and polls it for input.

## plugin.json

```json
{
  "name": "video",
  "kind": "module",
  "module": "zinc:video",
  "entry": "index.ts",
  "description": "Hardware-accelerated video playback",
  "options": { "loop": true },
  "targets": {
    "macos": { "pkg": ["libavformat", "libavcodec"], "frameworks": ["VideoToolbox"], "sources": ["src/player.cpp"] },
    "rpi1":  { "pkg": ["libavformat", "libavcodec"], "packages": ["ffmpeg-dev"], "sources": ["src/player.cpp"] },
    "esp32": { "idf": ["esp_driver_rmt"], "idfComponents": { "espressif/led_strip": "^3.0.0" } }
  }
}
```

| field | meaning |
|---|---|
| `modules` | extra import specifiers mapped to files of the plugin (`"three/addons/controls/OrbitControls.js": "addons/OrbitControls.ts"`) |
| `targets` | availability: using the plugin on an unlisted target is error Z5003 (sim is always allowed for modules) |
| `sources` | extra C++ files compiled into the program |
| `pkg` / `frameworks` / `libs` / `linkFlags` | pkg-config modules, Apple frameworks, `-l` libraries, raw link flags |
| `defines` / `flags` | compile definitions and flags for the program sources |
| `packages` | system packages added to the target's SDK image (apk for rpi1, apt for linux); a derived image is built once per package set |
| `idf` / `idfComponents` | ESP-IDF `REQUIRES` and Component Registry dependencies |
| `options` | defaults, overridden by `zinc.json` `plugins.<name>` (or `targets.<id>.plugins.<name>`, or display options); C++ sees them as `ZP_<PLUGIN>_<KEY>` defines, plus `ZP_<PLUGIN>=1` |

## Search path

`<zinc>/plugins/*`, then `<project>/plugins/*`, then `zinc.json` `"pluginDirs"`. A project plugin shadows a bundled one
with the same name.

## Core services for plugins

- runtime images (`zrt_raster.h`: `dyn_create`, `dyn_wrap`, `dyn_update`) to show video frames, camera previews or
  cached tiles through `gfx.drawImage`; producer threads hand over finished buffers, the main thread draws;
- `gfx.stroke`, `gfx.path`, render-to-image (`gfx.beginImage` / `endImage`);
- multitouch, wheel and pinch input (`gfx.touchCount`, `gfx.wheel`, `gfx.pinch`);
- the event loop's pollers (`zrt::Poller`) to deliver results from threads or sockets.
