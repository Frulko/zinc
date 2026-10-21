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
| `sources` | extra C++ files compiled into the program; `.c` files (vendored C libraries) go into a separate static library built with C flags and the manifest's `flags` but a `-std=` (Box2D's `-I` and `-ffp-contract=off`), warnings off, and so do C++ files under `vendor/` (a vendored C++ library such as Jolt), built with the plugin's C++ flags and defines: that library is compiled once and an edit of the plugin does not rebuild it |
| `pkg` / `frameworks` / `libs` / `linkFlags` | pkg-config modules, Apple frameworks, `-l` libraries, raw link flags |
| `cargo` | a Rust crate of the plugin (its directory, with `Cargo.toml` and a committed `Cargo.lock`): `cargo build --release --locked` builds it for this machine's Rust triple into `~/.zinc/cache/<target>/cargo/` and its static library is linked like `sources`; needs cargo (rustup.rs), not cross builds yet (`plugins/loro`) |
| `defines` / `flags` | compile definitions and flags for the program sources |
| `vendorFlags` | flags for the vendored sources only (`.c` files and C++ under `vendor/`): a library that needs RTTI or exceptions (`-frtti`, `-fexceptions`, libdatachannel in `zinc:webrtc`) gets them without the plugin's own code, which is built against the engine's runtime without RTTI |
| `packages` | system packages added to the target's SDK image (apk for rpi1, apt for linux); a derived image is built once per package set |
| `idf` / `idfComponents` | ESP-IDF `REQUIRES` and Component Registry dependencies |
| `nodeFlags` | under `targets.sim`: flags for the node process that runs the sim program (`zinc:script` asks for `--experimental-vm-modules`) |
| `requires` | top level: capabilities the target must offer (`["heap>=4M"]`, [capabilities](targets/capabilities.md)); an incompatible target is error Z5005 |
| `options` | defaults, overridden by `zinc.json` `plugins.<name>` (or `targets.<id>.plugins.<name>`, or display options); C++ sees them as `ZP_<PLUGIN>_<KEY>` defines, plus `ZP_<PLUGIN>=1` |

## Phones

An app has no `dlopen` (D120): `zinc export --target android|ios` compiles each plugin the program calls into the generated project from the
sources its `targets.android` or `targets.ios` entry lists, and merges what the entry adds into the project, the way Expo's config plugins do
(the project is regenerated at each export; nothing is edited by hand). A plugin without an entry for the target is refused at export, with
the reason; one that has an entry is listed by `zinc lint` for that target. A player (zinc.json `"player": true`, Zinc Go) links every plugin
with native code that has an entry for the platform, the engine's and the project's: a project it runs from `zinc dev --lan` finds them, and
one that calls a plugin the player lacks gets that plugin's name on the home screen ([Zinc Go](reports/zinc-next-zinc-go.md)). Plugins of
Zinc code only travel in the program and need no entry for that. The entry of `tests/data/mobile-plugin/plugins/beep` uses every key:

```json
"android": {
  "class": "org.example.beep.BeepModule",
  "lifecycle": "org.example.beep.BeepLife",
  "sources": ["native/android/BeepHelper.java", "native/android/BeepModule.kt"],
  "libs": ["log"],
  "gradle": ["androidx.core:core:1.13.1"],
  "minSdk": 26,
  "manifest": {
    "permissions": ["VIBRATE", "com.example.permission.BEEP"],
    "manifest": "<queries><intent><action android:name=\"android.intent.action.VIEW\" /></intent></queries>",
    "application": "<meta-data android:name=\"org.example.beep\" android:value=\"1\" />"
  }
},
"ios": {
  "class": "BeepModule",
  "lifecycle": "BeepLife",
  "sources": ["native/ios/BeepModule.swift"],
  "frameworks": ["AudioToolbox"],
  "plist": { "NSBluetoothAlwaysUsageDescription": "Beeps over Bluetooth.", "UIBackgroundModes": ["audio"] },
  "entitlements": { "com.apple.developer.associated-domains": ["applinks:example.org"] }
}
```

| key | target | meaning |
|---|---|---|
| `sources` | both | C++ as on the desktop; `.java` and `.kt` go to Gradle, into the directory of their `package` (Kotlin adds its Gradle plugin, pinned in `cli_core.cpp`); `.m`, `.mm` and `.swift` to the Xcode project (Swift in a library of its own) |
| `defines`, `flags`, `libs`, `frameworks` | both | as on the desktop; `libs` are the NDK's or the SDK's (`camera2ndk`, `mediandk`, `sqlite3`) |
| `gradle` | android | dependencies of `app/build.gradle` |
| `manifest` | android | `permissions` (a bare name is `android.permission.<name>`), `manifest` (an XML fragment inside `<manifest>`), `application` (inside `<application>`). The manifest lists exactly the declared permissions: those of `zinc.json` `permissions`, those of the plugins, and SDL's `VIBRATE` (`navigator.vibrate`, `zinc:haptics`; a permission granted at install) |
| `minSdk` | android | the lowest API level the plugin needs; the project takes the highest of all (24 at least) |
| `plist`, `entitlements` | ios | JSON objects written as property lists: keys of `Info.plist` (Zinc's own keys, such as the bundle id, are kept) and `<name>.entitlements`, which a device build is signed with |
| `privacy` | ios | the required-reason APIs the plugin's native code calls, with Apple's reason codes (`{ "NSPrivacyAccessedAPICategoryUserDefaults": ["CA92.1"] }`), merged into the app's `PrivacyInfo.xcprivacy` with the engine's own (file timestamps C617.1, system boot time 35F9.1, disk space E174.1) |
| `class` | both | the Java/Kotlin or Objective-C/Swift class behind the plugin's spec, in place of a C++ implementation: the export writes the glue below and compiles the class in as `ZN_NATIVE_CLASS` |
| `lifecycle` | both | a class that hears the app's life: Android `dev.zinc.app.ZincLifecycle` (`onCreate`, `onNewIntent`, `onPause`, `onResume`, `onLowMemory`, `onActivityResult`, `onRequestPermissionsResult`; all with defaults), listed for `ZincActivity` in the generated `ZincPlugins.java`; iOS any of `zincPause`, `zincResume`, `zincLowMemory`, `zincOpenURL:` (`src/app/ios/ZincLifecycle.h`; a Swift class marks them `@objc` and is named with `@objc(Name)`) |

`zinc native-gen --android <x.spec.ts> [dir]` writes `<Name>Spec.java` (the interface the class implements, package
`dev.zinc.plugins.<name>`) and the JNI bridge; `--ios` writes `Zinc<Name>Spec.h` and `Zinc<Name>Spec.swift` (the protocol, for Objective-C
and for Swift: `func greet(_ name: String, loud: Bool) -> String` is the selector `greet:loud:`) and the Objective-C++ bridge. The export
regenerates them from the spec at each run. The glue carries `i32`, `u32`, `f64`/`number`, `boolean` and `string` arguments and results,
and callbacks returning `void` with such arguments (`ZincCallback.call(Object...)` in Java, a block in Objective-C, an `@escaping` closure in
Swift); a spec with other types is refused with the member's name. The class's methods run on the program's thread (Android: SDL's thread,
so UI work goes through `runOnUiThread`; iOS: the main thread). A callback may be called from any thread: the call is queued and made on the
program's thread. Promises, arrays and records are not carried yet: use a callback, or JSON text in a string (as `zinc:system` does).

## The web

`zinc export --target web` runs the app as JavaScript in a browser, so a plugin's native code is not there. A plugin brings its browser version with a `"web"` entry in `plugin.json`:
`{ "entry": "web/index.ts" }` (a module written for the page, used instead of `entry`), `{ "native": "Audio", "impl": "web/audio.js" }` (JavaScript that answers the calls of the native spec
with browser APIs; `index.ts` runs unchanged), or a `"wasm"` block (C or C++ sources, flags and exports, built to WebAssembly by the pinned zig). `"needs"` lists the browser features it cannot run
without (names of `targets/web/browsers.json`), which the export checks against the browsers of the project. A plugin with a native spec and no `web` entry loads, and each call of its native side
throws `ZnUnsupported` (warning W0602). The guide is [targets/web.md](targets/web.md), "Plugins".

## Native views

A plugin that shows a real OS view (a web view, a map, an ad) lets zinc:ui place it: its TypeScript object implements
`place(x, y, w, h, cx, cy, cw, ch, shown)` (`ui.NativeViewHost`) and the program writes `<NativeView view={obj} className="..." />`
(docs/ui.md "Native views"). zinc:ui calls `place` after a painted frame when the node's box (x, y, w, h), its clip (cx, cy, cw, ch: the scroll
areas around it) or its visibility changed, in logical pixels of the surface; the plugin forwards them to its native side. The native side lays
the view over the surface inside a clipping container at the clip, the view at the box within it:

- macOS and iOS: a subview of SDL's view (the window's content view; the view controller's view on iOS), mapped by the surface's zoom and
  letterbox (`hal_surface_size` against the view's bounds); `plugins/webview/src/webview.mm` is the example for both.
- Android: `dev.zinc.app.ZincNativeView` (in the shell) wraps a plugin's `View`: `attach()`, `place(...)`, `setShown(on)`, `detach()`, callable
  from the program's thread; it adds a FrameLayout to SDL's layout above the SurfaceView and moves it with translations
  (`plugins/webview/native/android/WebviewModule.java`).

Touches inside the clip go to the native view. Zinc does not draw over it: while a zinc:ui layer (menu, dialog, toast) overlaps it, `shown` is
false and the view is hidden.

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
directory), records what was asked in `zinc.json` (`"dependencies": { "greet": "gh:user/zinc-greet@v1.2" }`) and pins
it in `zinc.lock` beside it:

```json
{ "format": 1, "plugins": {
  "greet": { "source": "gh:user/zinc-greet@v1.2", "commit": "9f3c...", "version": "1.2", "permissions": ["net"],
             "requested": "gh:user/zinc-greet@v1.2" },
  "shout": { "source": "https://example.com/shout-1.0.tar.gz", "sha256": "4be1...", "permissions": [],
             "requested": "https://example.com/shout-1.0.tar.gz" } } }
```

`zinc install` fetches each locked plugin again: git at the pinned commit, archives checked against the pinned
sha256 (a changed archive is refused and nothing is installed); a dependency not locked yet is added. `zinc install
--frozen` (CI) refuses to run when `zinc.json` and `zinc.lock` disagree, and says how. Nothing of a plugin runs while
it is fetched: git hooks are off, archives are unpacked by `tar`, and links or special files are refused. A local
directory belongs in `"pluginDirs"`. Native code is built on first use as for any project plugin.

**Capabilities.** A plugin lists the permissions it needs (the names of the app permissions, `fs`, `net`, `process`,
`camera`...) in `plugin.json` `"permissions"`. `zinc add` shows them and pins them in the lock; an update that asks for
one the lock does not hold is refused and names it, until `zinc add --accept` grants it.

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
The interpreter loads a plugin's library at the first call of one of its functions, not when the program starts: a program that
imports a plugin it does not call yet starts without it (the cache entry keeps the module's exports for the checker).
A start does not recompute the key either: the last build left a stamp in `~/.zinc/cache/<target>/plugin-stamps/` with what it found
(the libraries, the link arguments) and the files it read (the spec, the sources and their directories, `plugin.json`, the `.pc` files
pkg-config used and those they require, the ABI headers, zinc itself). While none of them changed (inode, size, mtime) and the libraries
are untouched (inode, size, ctime), the start runs no pkg-config and hashes nothing; otherwise the plugin is checked and rebuilt as above.
`ZINC_PLUGIN_NO_STAMP=1` ignores the stamps.

## Plugin starter

`zinc new plugin <dir>` (or `zinc new gh:zinc-engine/plugin-starter <dir>`) makes a plugin repository that builds, tests and
publishes alone, outside this repository (`templates/plugin/`, its README walks from there to a signed release):

- `plugin.json` (name and module `zinc:<id>`, `version`, `"deterministic": true`, `permissions`), `index.ts` (the API), `native/<id>.spec.ts`,
  `native/<id>.host.cpp` and `native/<id>.sim.ts` (the native part, its native module named `{{ident}}`, the id with `_` for `-`), `tests/`,
  `example/main.ts`, and a `zinc.json` whose `"pluginDirs": [".."]` makes the repository its own test project: `zinc run` and `zinc test`
  there use the plugin as a project that adds it does.
- `.github/workflows/ci.yml` calls this repository's reusable workflow `.github/workflows/plugin.yml` (`workflow_call`): for macos-arm64,
  linux-x86_64, linux-aarch64 and linux-armhf (cross-built with the pinned zig), zinc built at the input `zinc-ref`, `zinc test`, then
  `tools/plugin-pack`, which writes what the index expects: `binaries/<target>/<name>-<key>.tar` (`zinc plugin-build --pack` in a project
  that sets none of the plugin's options, named by the cache key such a project computes) and the descriptor `plugins/<name>/<version>.json`
  (source: the repository and commit). On a `v<version>` tag the release job signs every file and the source archive `<name>-<version>.tar.gz`
  with the secret `ZINC_PUBLISHER_SEED` (`zinc update-keygen`) and makes a GitHub release; without the secret, or with a tag that is not
  plugin.json's version, it stops before publishing and says why. Users add the archive by URL as a community plugin (below).
- `zinc plugin-build <name> [project] --target <aarch64-linux | armhf-linux | armv7-linux | x86_64-linux>` cross-builds a plugin's native part
  (with `--pack` or `--prebuild`), as `zinc build --target` does for a program's plugins.

## Plugin repositories

Official plugins are developed here, in `plugins/`, and published as mirror repositories `zinc-engine/plugin-<name>` (D37):
`tools/plugin-split <name>` runs `git subtree split`, so the plugin sits at the root of its repository with its history,
the same history always gives the same commit ids, and a commit that touches `plugins/<name>` gives exactly one new commit
in its mirror. The `plugin-mirrors` CI job pushes the plugins a push to main changed (secret `PLUGIN_MIRROR_TOKEN`; without it
the job only splits). A release attaches `plugins.lock` (`tools/plugin-split --lock`): for every plugin, its repository, its
split commit and its source tree id, so `zinc add <repository>@<commit>` gets exactly what the release shipped.

## Plugin index

`zinc plugins search [word]` lists the plugins and templates of the signed index, published on the Pages site under
`/index` by the `Pages` workflow (`.github/workflows/pages.yml`: with each release, or run by hand). The index is a TUF repository
(decision D41): `root.json`, `targets.json` (one descriptor per plugin and template: name, description, targets, source),
`snapshot.json` and `timestamp.json`, all Ed25519-signed; `zinc` checks them with its TUF client (`src/tc/tuf.cpp`) into
`~/.zinc/index` and refuses an expired, rolled-back, below-threshold or tampered index. `ZINC_INDEX_URL` points it elsewhere
(a mirror, `file://`), `ZINC_INDEX_ROOT` at another trusted root.

The owner's steps, once: `tools/index-repo keys keys.json` (keep the file secret); `tools/index-repo entries . e 1`
then `tools/index-repo build idx keys.json e/entries.json` and commit `idx/root.json` as `index/root.json` (the root
zinc trusts); put the content of `keys.json` in the repository secret `ZINC_INDEX_KEYS`. Without the secret the workflow
publishes no index. The engine packs come from the release: zinc-next's build job makes them (`tools/v8-pack`, `tools/engine-pack`),
the release carries them as `engines-<host>.tar`, and the `Pages` workflow signs those of the latest release into the index. The root expires after a year: publish `2.root.json` signed by the old and the new root keys before then.

**Engine packs** (ZN-773.04, `src/tc/engines.h`) are targets of the same index: `engines/<name>/<version>/<host>.tar.xz` (the module
`libzn_engine_<name>.dylib`, its libraries and data in `lib/`, `licenses/`), signed by the top-level role only, with `custom`
`{kind, library, zn_engine_abi, napi, upstream}`. `zinc run --engine v8` installs the newest one whose `zn_engine_abi` is this zinc's into
`~/.zinc/engines/<name>/<version>/`; `zinc engine list|install|update|remove` manage them. To add V8 to the index: `tools/v8-pack` (the SDK,
into `~/.zinc/sdk/v8`), `tools/build zinc`, then `tools/engine-pack v8 --entries e/entries.json` after `tools/index-repo entries . e 1` and
before `tools/index-repo build idx keys.json e/entries.json`.

Before compiling a plugin, zinc asks the index for `binaries/<target>/<name>-<key>.tar` (`<key>` is the cache key above, so a
plugin whose sources changed never matches an old binary). A hit is checked by the TUF client (signatures, length, SHA-256),
unpacked into the cache, and nothing is compiled; a refused archive is reported and the plugin is built here, as on a miss.
`ZINC_PREBUILT=0` turns the lookup off. Publishers make the archive with `zinc plugin-build <name> --pack <file.tar>`.

**Tiers.** `zinc add <name>` looks the name up in the index and prints its tier and publisher before installing:
`official` when the top-level role signs `plugins/<name>.json` (built by the Zinc CI), `verified` when a role the index
delegates to a publisher signs `<publisher>/plugins/<name>.json` (the delegation's paths are `<publisher>/*/*` and
`<publisher>/*/*/*`: a `*` stays within one path segment, as in python-tuf). The descriptor's source is then fetched like a
URL, and the lock records the tier and the publisher. A verified publisher's binary (`<publisher>/binaries/...`) is used only
when `rebuilds/<sha256>.json`, signed by the top-level role, counts at least `ZINC_REBUILDS_MIN` (default 2) matching
rebuilds; otherwise the plugin is built here.

A plugin added by URL is `community`: its `plugin.json` may name its publisher, `"publisher": { "name": "Alice", "publicKey":
"<hex>" }`; the archive's `<url>.sig` must then verify with that key, `zinc add` prints the tier and the publisher before
installing, and the key is pinned in the lock on first use. A later archive signed with another key is refused until
`zinc trust <name>` forgets the pinned key (the next `zinc add` pins the new one). Community plugins are built from source.

**Transparency log** (decision D42). Every artifact of the index (its path and SHA-256) is appended to a Merkle log published
beside it under `index/log/` (RFC 6962 / 9162 hashing, `checkpoint.json` signed with the log key, an inclusion proof per
artifact, a consistency proof from every earlier size; `tools/tlog publish`). When a log key is pinned (`ZINC_TLOG_KEY`,
or `next/index/log.pub` in the engine), a published binary is installed only with an inclusion proof against a checkpoint
that extends the last one this machine saw: a signed release left out of the log is refused, and a log that rewrote its
history is caught. The owner's steps: `tools/tlog keys log-key.json`, commit its public key as `next/index/log.pub`,
and put the file's content in the secret `ZINC_LOG_KEY`.

**Revocations.** The index can revoke a plugin version (by name and version, or by its source's SHA-256 or commit, with a
reason and a replacement) or a publisher key, in `revocations.json` signed by the top-level role. `zinc add` and `zinc
install` refuse a revoked version and say why and what replaces it; `zinc run` of a project whose `zinc.lock` holds one
prints the same as a warning (from the copy kept at the last index refresh, so it needs no network). A revoked key signs
nothing any more: a role or an archive that only that key signed is refused.

**Trust policy.** One policy decides what may be installed: `tiers` (the accepted tiers), `prebuilt` (published binaries
allowed, or `false`: source only), `rebuilds` (matching rebuilds a verified publisher's binary needs), `transparency`
(`"required"`: binaries need the transparency log) and `mirrors` (the only mirrors that may serve downloads). It is read
from the system (`/etc/zinc/policy.json`, or `$ZINC_SYSTEM_POLICY`), the user (`~/.zinc/policy.json`, and `ZINC_PREBUILT=0`,
`ZINC_REBUILDS_MIN`), then the project (`zinc.json` `"policy"`); each layer can only tighten the one before, so a cloned
project never loosens a company's or a CI's policy. `zinc doctor` prints the effective policy and where each value comes from.

**Commands.**

```sh
zinc plugins search hello        # kind, name and version, targets, description: one line per entry
zinc add greet@^1.2              # the highest 1.x >= 1.2 in the index (also ~1.2, >=1.2, 1.2, or no range)
zinc install --frozen            # exactly zinc.lock, on a clean machine or in CI
zinc plugins update [greet]      # each dependency added by name moves within its range; one line per plugin that moved
zinc remove greet                # plugins/greet, its dependency and its lock entry
zinc trust greet                 # forget a community plugin's pinned key
```

The index holds `plugins/<name>/<version>.json` per version (or one `plugins/<name>.json`). An error names the plugin, its
version and the reason: `zinc add: greet 1.3: plugin greet now asks for capabilities the lock does not grant: camera`.

## Native ABI v1 (frozen)

A plugin's native side talks to the engine only through `include/zn/native.h` (the generated thunk and the plugin's own code).
Its version is `major.minor` (`ZN_ABI_MAJOR`, `ZN_ABI_MINOR`; v1.1 today: 1.0 plus `ZnHostApi.cb_error`). The rules:

- Within a major version every change is additive: an engine function appended at the end of `ZnHostApi`, a field appended at
  the end of `ZnModule` (both carry their size, so an older module and a newer engine agree), a new signature letter, a new
  flag. Nothing is removed, reordered or retyped, and no constant changes value.
- The engine loads a module built for its major version and an older or equal minor; it refuses another major ("rebuild the
  plugin for this zinc") or a newer minor ("update zinc"), naming both versions.
- `tools/abi-check include/zn/native.h tests/data/native-abi-v1.txt` compares the header with the recorded v1 snapshot;
  `tests/t0/native_abi_freeze.sh` fails on an incompatible change. A new snapshot is written only for a new major version.

Ready to leave the monorepo (their native code uses only `native.h`, or they have none): device, devtools, ffi, process,
script, socket, sqlite, wasm, and gestures, ink, pixelfont. The others also include engine headers the v1 ABI does not
cover (`hal.h` for the display drivers and system, `zrt_raster.h` for the drawing plugins, `hw.h`, `zgl.h`, SDL3) and stay
here until those interfaces are frozen too (ZN-396).

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

## Research

[GPU WebGL and audio plugins for games and interactive creation](reports/creative-runtime-webgl-audio-2026-09-29.md)
records requirements, candidate backends and validation milestones. It describes proposed work, not available APIs.
