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
| `sources` | extra C++ files compiled into the program; `.c` files (vendored C libraries) go into a separate static library built with C flags, warnings off |
| `pkg` / `frameworks` / `libs` / `linkFlags` | pkg-config modules, Apple frameworks, `-l` libraries, raw link flags |
| `defines` / `flags` | compile definitions and flags for the program sources |
| `packages` | system packages added to the target's SDK image (apk for rpi1, apt for linux); a derived image is built once per package set |
| `idf` / `idfComponents` | ESP-IDF `REQUIRES` and Component Registry dependencies |
| `nodeFlags` | under `targets.sim`: flags for the node process that runs the sim program (`zinc:script` asks for `--experimental-vm-modules`) |
| `requires` | top level: capabilities the target must offer (`["heap>=4M"]`, [capabilities](targets/capabilities.md)); an incompatible target is error Z5005 |
| `options` | defaults, overridden by `zinc.json` `plugins.<name>` (or `targets.<id>.plugins.<name>`, or display options); C++ sees them as `ZP_<PLUGIN>_<KEY>` defines, plus `ZP_<PLUGIN>=1` |

## Search path

`<zinc>/plugins/*`, then `<project>/plugins/*`, then `zinc.json` `"pluginDirs"`. A project plugin shadows a bundled one
with the same name.

## Adding a plugin from git or an archive

```sh
zinc add gh:user/zinc-greet@v1.2        # or https://.../repo.git[@ref], file:///path/repo, git@host:repo.git
zinc add https://example.com/greet-1.2.tar.gz   # .tar.gz, .tgz or .tar; file:// works too
zinc install                            # on another checkout: every locked plugin, at the same bytes
```

`zinc add` copies the plugin into `<project>/plugins/<name>` (its `plugin.json` name; an archive may hold one top
directory) and pins it in `zinc.json`:

```json
"lock": { "plugins": {
  "greet": { "source": "gh:user/zinc-greet@v1.2", "commit": "9f3c..." },
  "shout": { "source": "https://example.com/shout-1.0.tar.gz", "sha256": "4be1..." } } }
```

`zinc install` fetches each locked plugin again: git at the pinned commit, archives checked against the pinned
sha256 (a changed archive is refused and nothing is installed). Nothing of a plugin runs while it is fetched: git
hooks are off, archives are unpacked by `tar`, and links or special files are refused. A local directory belongs
in `"pluginDirs"`. Native code is built on first use as for any project plugin.

## Scripting

`zinc:script` ([docs/plugins/script.md](plugins/script.md)) embeds a JavaScript engine (QuickJS-ng) behind a
`ScriptEngine` interface: sandboxed contexts, typed host functions, limits, ES modules, promises. It is how an app
takes user scripts or mods.

## Core services for plugins

- runtime images (`zrt_raster.h`: `dyn_create`, `dyn_wrap`, `dyn_update`) to show video frames, camera previews or
  cached tiles through `gfx.drawImage`; producer threads hand over finished buffers, the main thread draws;
- `gfx.stroke`, `gfx.path`, render-to-image (`gfx.beginImage` / `endImage`);
- multitouch, wheel and pinch input (`gfx.touchCount`, `gfx.wheel`, `gfx.pinch`);
- the event loop's pollers (`zrt::Poller`) to deliver results from threads or sockets.
