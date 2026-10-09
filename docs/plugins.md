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

A publisher can sign an archive: `zinc update-keygen` makes a key pair, `zinc sign greet-1.2.tar.gz <seed>` writes
`greet-1.2.tar.gz.sig` (a detached Ed25519 signature) to upload beside it. `zinc add <url> --key <public key>` then
requires `<url>.sig` to verify with that key and locks the key (`"publicKey"`), so `zinc install` checks it again; a
missing or foreign signature is refused. Git sources are pinned by their commit and take no key.

A plugin can ship its native code prebuilt: `zinc plugin-build <name> [project] --prebuild` builds it for this
machine and copies `plugin.dylib` (or `.so`), `plugin.a`, `vendor.a` and a `key` into the plugin's
`prebuilt/<target>/` (`macos`, `linux`, or a cross target name). The key digests the engine's ABI headers and the
plugin's defines (its options included), so the libraries are used, with no compiler, only where they match; with
other options in `zinc.json`, another engine, or no `prebuilt/`, the plugin is built locally as before. The
libraries come with the plugin, so the lock's commit, sha256 and signature cover them too.

Native code is compiled with the pinned zig (`zinc toolchain install`, downloaded on first use) into
`~/.zinc/cache/<target>/plugins/<name>-<key>/`. The key hashes the plugin's sources by content and relative path, its
defines and flags as written, the ABI headers, the zig version and the target triple (`aarch64-linux-gnu` both for a
Linux machine and for a cross build from a Mac): never a path of this machine, so two machines building the same
plugin for the same target compute the same key. `ZINC_PLUGIN_CC=system` (or `"pluginCompiler": "system"` in
`zinc.json`) uses `$CXX` / `$CC` or the system `c++` / `cc` instead, under a key that carries its `--version` line.

## Plugin repositories

Official plugins are developed here, in `plugins/`, and published as mirror repositories `zinc-engine/plugin-<name>` (D37):
`next/tools/plugin-split <name>` runs `git subtree split`, so the plugin sits at the root of its repository with its history,
the same history always gives the same commit ids, and a commit that touches `plugins/<name>` gives exactly one new commit
in its mirror. The `plugin-mirrors` CI job pushes the plugins a push to main changed (secret `PLUGIN_MIRROR_TOKEN`; without it
the job only splits). A release attaches `plugins.lock` (`tools/plugin-split --lock`): for every plugin, its repository, its
split commit and its source tree id, so `zinc add <repository>@<commit>` gets exactly what the release shipped.

## Plugin index

`zinc plugins search [word]` lists the plugins and templates of the signed index, published on the Pages site under
`/index` by the `Site` workflow (on every change to `plugins/` or `templates/`, and daily). The index is a TUF repository
(decision D41): `root.json`, `targets.json` (one descriptor per plugin and template: name, description, targets, source),
`snapshot.json` and `timestamp.json`, all Ed25519-signed; `zinc` checks them with its TUF client (`src/tc/tuf.cpp`) into
`~/.zinc/index` and refuses an expired, rolled-back, below-threshold or tampered index. `ZINC_INDEX_URL` points it elsewhere
(a mirror, `file://`), `ZINC_INDEX_ROOT` at another trusted root.

The owner's steps, once: `next/tools/index-repo keys keys.json` (keep the file secret); `next/tools/index-repo entries . e 1`
then `next/tools/index-repo build idx keys.json e/entries.json` and commit `idx/root.json` as `next/index/root.json` (the root
zinc trusts); put the content of `keys.json` in the repository secret `ZINC_INDEX_KEYS`. Without the secret the workflow
publishes no index. The root expires after a year: publish `2.root.json` signed by the old and the new root keys before then.

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
