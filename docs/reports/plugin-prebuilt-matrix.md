# Prebuilt plugins for every target: current state and a plan (2026-10-25)

The owner wants plugins precompiled per platform, so that builds and first runs are fast everywhere. This report maps how the native
code of a plugin is produced and found today on each target, measures where the time goes on the development Mac, lists what
invalidates the binaries, compares with how other ecosystems ship native extensions, and recommends one scheme with phases, files,
Mac tests and the checks that need other machines.

Sources read: `src/tc/plugin_build.cpp` and `.h`, `src/main.cpp` (`plugin-build`, `build --target`), `src/cli_core.cpp` (export, doctor),
`src/cli_web.cpp` (wasm), `targets/console/CMakeLists.txt`, `tools/package`, `tools/plugin-pack`, `tools/index-repo`,
`.github/workflows/zinc-next.yml`, `plugin.yml`, `pages.yml`, `docs/reports/zinc-next-reproducible.md`, task ZN-823 (commit f3bffb33)
and `backlog/later.md`.

## Summary

- Today only two places carry binaries: the macOS package (every plugin but the ones that need a system library) and, since ZN-823,
  the cross-built Linux aarch64 package (35 plugins). Every other target compiles on first use or at export, and the signed index,
  which can already carry binaries (ZN-337), carries none for the plugins of this repository.
- The time is the compiler, and above all a cold compiler. On this Mac, a fresh `ZINC_HOME` with a cold zig cache spends 20.5 s on
  sqlite (13.8 s for `sqlite3.c`, 5.8 s for the first link, where zig builds its own runtime pieces); with zig's global cache warm the
  same build takes 0.8 s. A missing zig adds a download of about 24 s here (390 MB unpacked). A Pi 3B+ spent 20 to 90 s per plugin.
- Two keys decide whether a binary is reused, and both cover the engine headers byte for byte. Over the 26 release steps from v0.1.0
  to v0.8.1, the key that accepts packaged binaries changed 4 times and the cache key 6 times. v0.8.0 invalidated every plugin of every
  target for four added lines in `hal.h` (a new optional function for the 3DS), which no existing plugin uses.
- Recommendation: a plugin ABI number (on the model of Node-API, Python abi3 and Zinc's own engine packs) instead of header bytes, a
  target tuple that names the CPU and the C library, the shared libraries of the package's own tuple inside the package, everything
  else (static archives, other tuples) fetched from the signed index on demand, one content-addressed cache layout shared by the
  workstation and its devices, a release job that builds the matrix, and a local compile as the last step with clear messages.

## 1. How a plugin finds its native code today

`buildPlugin` (`src/tc/plugin_build.cpp`) tries, in this order:

1. **The stamp** (`cache/<target>/plugin-stamps/<name>-<hash>`): every input file (plugin sources, `plugin.json`, the engine headers,
   the `zinc` executable itself) compared by inode, size and mtime. A hit costs no hashing and no process: 0.03 s for a whole run here.
2. **The plugin's own `prebuilt/<target>/`** (ZN-328.03, ZN-718, ZN-823): `plugin.dylib|so|dll`, `plugin.a`, `vendor.a` and `key`.
   Taken when `key` equals `prebuiltKey()`: a hash of the defines (runtime defines, manifest defines, the project's `ZP_` options), the
   bytes of four headers (`include/zn/native.h`, `src/native/zrt_compat.h`, `runtime/zrt.h`, `runtime/include/hal.h`) and the kind.
   It names no compiler, no CPU and no C library, on purpose (ZN-823 notes), so a cross build can produce it.
3. **The cache entry** `cache/<target>/plugins/<name>-<key>/`, named by the content key: defines, flags, the compiler id
   (`zig 0.15.2` or the system compiler's `--version` line), the generated header and thunk, the plugin's own sources and the files beside
   them, the bytes of eight engine files (the four above plus `zrt_raster.h`, `gl_replay.cpp`, `gl_replay_shaders.h`, `gl_caps.h`), the
   target triple with its `-mcpu`, the Windows import library, `shared` for a cross build that links the `.so`, and the vendored archive's
   own key. A recorded SHA-256 of the libraries is checked before use.
4. **The signed index** (ZN-337, `fetchPrebuilt`): `binaries/<target>/<name>-<content key>.tar`, verified by the TUF client, the
   transparency log when a key is pinned, and the policy (official, verified publisher with N matching rebuilds).
5. **A local compile** with the pinned zig (downloaded on first need) or the system compiler, under one `flock` per `ZINC_HOME`.

A sixth cache sits outside Zinc's control: zig's global cache (`~/.cache/zig`, 610 MB on this Mac). It is what makes a Zinc-cold but
zig-warm build take under a second here, and it is cold on every new device.

## 2. What invalidates the binaries

| Event | Stamp | `prebuiltKey` (packaged binaries) | Content key (cache, index) |
|---|---|---|---|
| a new `zinc` executable (every update) | missed (zinc is an input): the slow path re-hashes, 0.09 s here | kept unless the 4 headers changed | kept unless the 8 engine files or the thunk generator's output changed |
| a comment or a new declaration in `hal.h` or `zrt.h` | missed | **every plugin, every target** | **every plugin, every target** |
| an edit of `runtime/gl_replay.cpp` (a `.cpp`, hashed for display-gl) | missed | kept | every plugin |
| a new zig pin | missed | kept | every plugin |
| a new link flag in `plugin_build.cpp` (ZN-823 added `-Wl,-S` on Linux) | missed | kept | every Linux plugin |
| a project option (`plugins.<name>` in zinc.json, a `ZP_` define) | missed | that plugin misses the package's binary | that plugin |
| the plugin's own sources | missed | **kept** (the key covers no source) | that plugin |

Release history, measured with `git diff` between consecutive `v*` tags (26 steps, v0.1.0 to v0.8.1): the four headers of `prebuiltKey`
changed at v0.2.0, v0.4.0, v0.5.0 and v0.8.0; the eight files of the content key also at v0.2.1 and v0.4.2. Nothing changed in them
from v0.8.1 to develop. So "every release rebuilds every plugin" is not true, but every release that touches those headers does, even
for an additive or comment-only change, and the v0.8.0 change was additive (`hal_win_draw`, used only by the 3DS HAL).

Two consequences found while reading:

- `prebuiltKey` covers no plugin source. A plugin directory whose `prebuilt/` was not regenerated after its C++ changed keeps loading
  the old library. Harmless for the packages (built from the same commit); a trap for a plugin author who commits `prebuilt/`.
- Inline code in `zrt.h` (877 lines, with inline functions) is compiled into each plugin. An ABI number must therefore treat a change of
  an inline body as an ABI change, not only layouts and prototypes (see §6.1).

## 3. Current state per target

| Target | How plugins are built | When | Shipped binaries | Cache key / acceptance | Notes |
|---|---|---|---|---|---|
| macOS arm64 package (CLI and Atelier) | `tools/package` → `zinc plugin-build --prebuild` with the pinned zig on the CI runner | package time | `share/zinc/plugins/<n>/prebuilt/macos/`: dylib, `plugin.a`, `vendor.a`, key, for every native plugin but gphoto2, video, webview (system libraries), script, imu-qmi8658 | `prebuiltKey`; `lower_minos` restamps the dylibs to the engine's minimum macOS | the package fails when a plugin without a system library has no binary |
| macOS x86_64 package (`package-intel`, experimental) | the same steps on an Intel runner | package time | the same layout, `prebuilt/macos/` | the key has no arch: an arm64 `prebuilt/macos` would be accepted on Intel and fail at dlopen | proved on no older Mac yet (later.md) |
| macOS from source (this tree) | zig on first use | first `zinc run` | none (`prebuilt/` is ignored in the checkout) | content key; zig's global cache makes rebuilds fast | 1233 cache entries, 1.6 GB in `~/.zinc/cache/macos/plugins`, never pruned |
| Linux aarch64 package (cross-built on a Mac or CI) | `tools/package --linux-arch aarch64`: this machine's zinc, `plugin-build --target linux-aarch64 --prebuild` | package time | 35 plugins in `prebuilt/linux/`; 9 as sources (ble, camera, display-gl, ffi, gphoto2, video, imu-qmi8658, script, loro) | `prebuiltKey` (no CPU named) | proven in an arm64 Debian container (`tests/t1/linux_cross_prebuilt.sh`); not yet on the Pi (ZN-823 criteria 2 and 3) |
| Linux armhf, armv7, x86_64, i686 packages | the same code path (`tools/build-linux --arch`) | package time | expected the same as aarch64 | the same | not proven (later.md, ZN-823); the `linux-cross` CI job is off (`ZINC_LINUX_JOBS`) |
| Linux, native packages (a Linux runner) | `package_linux` with the native zinc | package time | none on CI today: the Linux jobs are out of the matrix (owner, 2026-10-15) | | |
| Pi / Linux device, plugin with a system library (display-gl, video, ffi, gphoto2) or options | zig on the device | first use, again after every key change | sources only | content key | the 20 to 90 s per plugin of ZN-823; zig itself downloaded first |
| `zinc build --target <linux t>` / `zinc export --target rpi…` on the workstation | cross build, static archives only (`setCrossTarget(..., shared=false)`), AOT links them `--whole-archive` | export time | none used: it looks in `prebuilt/<cross name>/` (`prebuilt/aarch64-linux`), never in `prebuilt/linux/` | content key with the target and `-mcpu` | 365 MB of aarch64-linux entries here |
| `zinc dev --device` / `zinc device deploy` to a Pi | sources sent, the device's engine builds what it misses | first run on the device | whatever the device's package has | device's own keys | the workstation's cache is never offered to the device |
| Windows x86_64 package | `prebuild_plugins(... "windows")` on the Windows runner, DLLs against `libzinc.dll.a` | package time | `prebuilt/windows/` for the plugins that build; 7 do not (ble, camera, devtools, process, serial, socket, svg, per `tools/package`) | content key includes the import library's hash; `prebuiltKey` does not | experimental job |
| `zinc build --target x86_64-windows` | refused for a program with plugins (ZN-714) | | | | |
| Web (`zinc export --target web`) | a plugin's `web` entry (JavaScript, 18 plugins) needs no build; native code with a `wasm` entry (5 plugins) is built with `zig cc -target wasm32-wasi` | export time | none | `cache/web-wasm/<hash>`: the key contains the **path** of zig, so two machines never share it | one wasm binary serves every browser: the cheapest target to prebuild |
| Android (`zinc export --target android`) | `pluginSource` writes sources, thunks and CMake; Gradle and the NDK compile them per ABI (armeabi-v7a, arm64-v8a, x86_64) | app build (Gradle) | none | Gradle's and CMake's own caches | 10 plugins have an android entry |
| iOS (`zinc export --target ios`) | the same into an Xcode project, ObjC/Swift bridges generated | app build (xcodebuild) | none | Xcode's caches | 13 plugins |
| PSP, Vita, 3DS, PS2 | no plugin system: a fixed set compiled into the console core by the SDK's CMake (`targets/console/CMakeLists.txt`: lan, audio's mixer and stb_vorbis, the 3d renderer) | core build | none for apps; a prebuilt core per console is a later.md idea (ZN-457) | the SDK's build directory | no dlopen on these systems |
| ESP32 | a prebuilt core firmware (`firmware/esp32/prebuilt/esp32-core-flash.bin`, 872 KB) with its drivers; MicroQuickJS and other builds go through ESP-IDF 5.5.5 (1.5 GB, minutes, once) | package / IDF build | the core image | ESP-IDF's build directory | 10 plugins have an esp32 entry |
| webOS (TouchPad), reMarkable Paper Pro | cross builds with their own entry (`webos`, `rmpp`) | export time | none | content key (`cache/armv7-webos`, 127 MB here) | the TouchPad is glibc 2.8 softfp: a tuple of its own |
| Third-party plugin repositories | `.github/workflows/plugin.yml`: macos-arm64, linux-x86_64, linux-aarch64 native, linux-armhf cross → `tools/plugin-pack` → artifact `index-<target>` | plugin CI | artifacts only; publication into the index is "later" (ZN-338) | content key | see defect 2 below: the armhf one can never match |

Counts (`plugins/*/plugin.json`): 47 plugins have native code; 45 declare macOS, 44 Linux, 24 Windows, 25 rpi1, 13 iOS, 10 Android,
10 ESP32, 5 wasm, 8 rmpp, 2 webOS. System libraries: display-gl, ffi, gphoto2, video on Linux; gphoto2, video, webview on macOS;
video on Windows. Rust (cargo): loro on macOS and Linux, never cross-built.

## 4. Defects found while mapping (by reading the code, not proven on a device)

1. **The prebuilt directory and its key name no architecture.** `prebuilt/linux/` and `prebuilt/macos/` hold one CPU's binaries and
   `prebuiltKey` does not name the CPU, the float ABI or the C library. Each package is per arch, so the packages are safe; but a plugin
   repository that commits `prebuilt/linux/` built on x86_64 (the ZN-328.03 publisher flow) is accepted on a Pi and fails at dlopen
   with a loader message, and an arm64 `prebuilt/macos/` is accepted on an Intel Mac.
2. **Cross-built binaries never match a native device's content key.** A native Linux build hashes `aarch64-linux-gnu.2.28` without
   `-mcpu` (and compiles without it); a cross build hashes `aarch64-linux-gnu.2.28 -mcpu=cortex_a53`, plus `shared` when it links the
   `.so`, and files it under `binaries/aarch64-linux/` where the device asks for `binaries/linux/`. So the armhf binaries of `plugin.yml`
   and any binaries a release would cross-build for the index are never fetched; only `prebuiltKey` (which ignores the compiler) lets
   ZN-823's packaged binaries through.
3. **The workstation's cross builds do not reuse packaged binaries**: `zinc build --target` looks in `prebuilt/<cross name>/`, and a Mac
   package carries no Linux binaries anyway, so every first export for a Pi compiles every plugin on the Mac.
4. **The wasm key contains the zig path** (`src/cli_web.cpp`, `buildWasm`): not shareable, not publishable.
5. **The stamp does not list `prebuilt/<target>/key`** (already in later.md under ZN-823).
6. **No cache eviction**: 1.6 GB of macOS entries and 365 MB of aarch64-linux entries on this Mac; zig's own cache is outside
   `ZINC_HOME` (610 MB), unmanaged and unpruned. On a Pi with a small SD card both grow with every key change.

## 5. Measurements on this Mac (M1 Pro, 2026-10-25)

A project importing `zinc:sqlite` (vendored `sqlite3.c`) and `zinc:svg`, run with `ZINC_STEPS=1 ZINC_HEADLESS=1 build/zinc run --interp`,
`ZINC_HOME` empty except a link to the installed toolchains, unless said otherwise.

| Case | sqlite | svg | whole run (wall) |
|---|---|---|---|
| Zinc cache cold, zig cache cold (`ZIG_GLOBAL_CACHE_DIR` empty) | 20.5 s: `sqlite3.c` 13.8 s, thunk and impl 0.45 s, first link 5.8 s | 1.2 s | 22.3 s (41.6 s CPU) |
| Zinc cache cold, zig cache warm | 0.77 to 0.99 s (`sqlite3.c` 76 to 249 ms) | 0.6 s | 1.7 s |
| no zig installed (`toolchains/` empty) | + about 24 s to download and unpack zig 0.15.2 (390 MB on disk) | | 25.7 s |
| svg from `prebuilt/macos/` (made with `plugin-build --prebuild`), sqlite built | 0.99 s | no step line, a key check | 1.25 s |
| stamp hit | | | 0.03 s |
| stamp skipped (`ZINC_PLUGIN_NO_STAMP=1`), cache hit | | | 0.09 s |

What this says: the per-plugin compile is not the problem on a desktop once zig is warm; the first contact is (the zig download, zig
building its runtime pieces at the first link, a large vendored C file). A Pi 3B+ pays all three, at a fraction of the speed, for every
plugin: ZN-823 measured 20 to 90 s each. A shipped or fetched binary removes all three, including the zig download.

## 6. How others do it

| System | Unit shipped | Key / compatibility | Where binaries live | Fallback | What Zinc should take |
|---|---|---|---|---|---|
| Node: prebuildify + node-gyp-build ([prebuildify](https://github.com/prebuild/prebuildify), [node-gyp-build](https://github.com/prebuild/node-gyp-build)) | one `.node` per `platform-arch` (tags for `napi`, `libc=musl`, `armv=7`) inside the npm package | Node-API version: one binary serves every Node release of that ABI ([Node-API version matrix](https://nodejs.org/api/n-api.html#node-api-version-matrix)) | in the package | node-gyp compiles at install ([node-gyp](https://github.com/nodejs/node-gyp)) | ship the package's own tuple; key by an ABI number, not by engine version |
| Node: prebuild-install ([prebuild-install](https://github.com/prebuild/prebuild-install)) | a tarball per `runtime-abi-platform-arch` | the same | GitHub releases, downloaded at install | node-gyp | fetch on demand from a signed store, compile last |
| Python wheels ([PEP 427](https://peps.python.org/pep-0427/), [PEP 425 tags](https://peps.python.org/pep-0425/), [manylinux PEP 600](https://peps.python.org/pep-0600/), [stable ABI / abi3](https://docs.python.org/3/c-api/stable.html)) | one wheel per `python-abi-platform` tag, e.g. `cp39-abi3-manylinux_2_28_aarch64` | abi3: one binary for every later CPython; manylinux names the oldest glibc; `auditwheel` checks the symbols | PyPI, chosen by the tag the installer computes | build the sdist locally | the tuple must name the libc floor (`gnu2.28`, the TouchPad's 2.8); an additive ABI keeps old binaries valid; a checker in CI ([cibuildwheel](https://cibuildwheel.pypa.io/) builds the matrix) |
| Rust: cargo-binstall ([cargo-binstall](https://github.com/cargo-bins/cargo-binstall)) | release archives per target triple | the triple and the crate version | the crate's GitHub releases, then a community mirror | `cargo install` | the triple as the name; fall back with one clear line |
| sccache ([sccache](https://github.com/mozilla/sccache)), ccache remote storage ([ccache manual](https://ccache.dev/manual/latest.html#_remote_storage_backends)) | object files | hash of the preprocessed input and the compiler command | local disk plus S3, GCS, Redis, HTTP, GitHub Actions cache | compile | a content key that names only what the compiler sees; a shared remote is useful for CI, not for users |
| Bazel / Buck2 remote cache ([Bazel remote caching](https://bazel.build/remote/caching)) | action outputs in a content-addressed store | action key = command line plus digests of every input | an HTTP or gRPC CAS | run the action | the key covers the exact inputs (depfiles), not "the engine" |
| Nix binary caches ([Nix manual, substitutes](https://nix.dev/manual/nix/stable/command-ref/conf-file.html#conf-substituters), [RFC 62 content-addressed derivations](https://github.com/NixOS/rfcs/blob/master/rfcs/0062-content-addressed-paths.md)) | store paths with signed `.narinfo` | input-addressed hash of the derivation; content-addressed derivations add "early cutoff": a rebuild whose output is identical stops the rebuild cascade | `cache.nixos.org` and any signed substituter | build locally | signatures per binary (the TUF index already does it); early cutoff is what an ABI number gives Zinc cheaply |
| Homebrew bottles ([Bottles](https://docs.brew.sh/Bottles)) | one bottle per `arch_macOS-version` (`arm64_sequoia`), or `all` | formula version and revision; a dependency change bumps the revision | GitHub Packages | build from source | per-OS-version tags only when the loader needs them; our `lower_minos` already avoids that for macOS |
| Conan ([package_id](https://docs.conan.io/2/reference/binary_model/package_id.html)) | a package per `package_id` | hash of settings (os, arch, compiler, build type), options, and the dependencies per a chosen semver mode | Conan remotes | `--build=missing` | options in the key (Zinc's `ZP_` defines already are); dependencies by their ABI level, not their exact version |
| vcpkg binary caching ([binary caching](https://learn.microsoft.com/vcpkg/users/binarycaching)) | a zip per port | ABI hash: port files, triplet, compiler hash, dependencies' ABI hashes | files, HTTP, NuGet, GitHub Actions | build | "triplet" is the tuple; CI pushes, users read |
| Zig's global cache ([build system](https://ziglang.org/learn/build-system/)) | objects, libc, libc++ and compiler_rt per target | hash of inputs and flags | `~/.cache/zig` (`ZIG_GLOBAL_CACHE_DIR`) | | point it into `ZINC_HOME` so it is managed and pruned |
| Deno ([Node-API in Deno](https://docs.deno.com/runtime/fundamentals/node/#node-api-addons), [FFI](https://docs.deno.com/runtime/fundamentals/ffi/)) / Bun ([Node-API](https://bun.sh/docs/api/node-api)) | the npm prebuilt `.node` files, or `dlopen` of a system library | Node-API | npm | none (no node-gyp in Deno; Bun runs it) | an ABI frozen like Node-API lets an engine reuse a whole ecosystem's binaries |
| Godot GDExtension ([.gdextension file](https://docs.godotengine.org/en/stable/tutorials/scripting/gdextension/gdextension_file.html)) | one library per feature tag (`linux.release.x86_64`, `android.release.arm64`, `macos.universal`) listed in the addon | `compatibility_minimum`: the oldest engine version the binary works with | inside the addon, all platforms side by side | none: a missing binary is an error | the tuple names; "the oldest engine it works with" is our ABI minor |

The common lesson: everyone that ships binaries widely keys them by a **declared ABI level plus a platform tuple** (Node-API, abi3,
GDExtension, Zinc's own engine packs with `zn_engine_abi`), and keeps a **content key** only for caches of exact builds (sccache, Bazel,
vcpkg, Nix). Zinc uses content-key semantics (header bytes) for both.

## 7. Recommended scheme

### 7.1 Two keys, each with one job

- **The plugin ABI** (acceptance): `ZN_PLUGIN_ABI_MAJOR.MINOR`, one number for everything a plugin compiles against: `native.h`
  (already frozen as `ZN_ABI_VERSION` 1.1 and checked by `tools/abi-check`), `zrt_compat.h`, `zrt.h`, `hal.h`, and `zrt_raster.h`.
  `tools/abi-check` extends to those headers: it compares a normalised token stream (comments and whitespace removed, so a comment
  edit is not a change) with `tests/data/plugin-abi-v1.txt`. A new declaration is a minor bump (old binaries stay valid, as with Node-API
  and abi3); a changed prototype, layout, macro or inline body is a major bump. The check fails in T0 when the headers changed and the
  number did not. The engine accepts a binary built for its major and a minor not above its own, exactly as it treats native modules
  and engine packs today. v0.8.0 would have been a minor bump that invalidated nothing.
- **The content key** (identity of one build, the name in the cache and in the index): the plugin's sources and manifest, the defines
  and flags, the zig version, the tuple, and the ABI **number** it was built against instead of the bytes of eight engine files.
  `gl_replay.cpp` and the other runtime sources that one plugin includes move into that plugin's own input list (or come from the
  compiler's depfile). The key no longer contains `shared`, and a native build compiles with the same `-mcpu` baseline as a cross build,
  so a Pi and a Mac produce the same key and, with ZN-333's reproducibility, the same bytes.
- `prebuilt/<tuple>/key` holds the content key and the ABI; acceptance needs the same tuple, a compatible ABI and the same defines.
  Its sources being part of the key fixes the stale-`prebuilt/` trap of §2.

### 7.2 A tuple that names the machine

`<os>-<arch>[-<libc floor>][-<cpu baseline>]`, derived from the target table of `src/tc/tc.cpp`: `macos-arm64`, `macos-x86_64`,
`linux-aarch64-gnu2.28`, `linux-armhf-gnu2.28-armv6`, `linux-armv7-gnu2.28`, `linux-x86_64-gnu2.28`, `linux-x86-gnu2.28`,
`webos-armv7-gnu2.8-softfp`, `rmpp-aarch64`, `windows-x86_64-gnu`, `wasm32-wasi`. It names `prebuilt/<tuple>/`, `binaries/<tuple>/`
and `cache/<tuple>/plugins/`. One release reads the old `prebuilt/linux/` and `prebuilt/macos/` too, then that fallback goes.

### 7.3 Where binaries live

1. **In the package: the shared libraries of the package's own tuple only.** The static archives (`plugin.a`, `vendor.a`) serve only
   `zinc build` (AOT) and are about half of the plugin bytes (§8); they come from the index on the first `zinc build`.
2. **In the signed index**: `binaries/<tuple>/<name>-<content key>.tar` (the ustar of `plugin-build --pack`, already reproducible and
   already understood by `fetchPrebuilt`), for every tuple of the matrix, shared library and archives as separate members or files so
   a device downloads only what it loads. Published the way engine packs are: the release job attaches `plugin-binaries-<tuple>.tar`,
   `pages.yml` adds its entries to `entries.json`. With ABI-stable keys a release adds only the plugins whose own key changed.
3. **One content-addressed cache layout** on every machine, `cache/<tuple>/plugins/<name>-<key>/`, the same bytes everywhere. The
   workstation is a cache for its devices: `zinc device deploy` and `zinc dev --device` ask the agent for its tuple and the keys it
   lacks (the agent's `info` already reports the machine), then push those entries from the workstation's cache, cross-building them
   there first when the index has none (seconds on the Mac against minutes on the Pi). A project's options (`ZP_` defines) that no
   published binary has are then built once on the Mac, never on the Pi.
4. **zig's cache inside `ZINC_HOME`** (`ZIG_GLOBAL_CACHE_DIR=$ZINC_HOME/cache/zig`), and `zinc cache prune` (least recently used
   entries beyond a size, run by `zinc update`), so the SD card of a Pi does not fill.

### 7.4 Lookup order and messages

stamp → package `prebuilt/<tuple>/` (ABI-compatible) → local cache (content key) → index → (deploying from a workstation: pushed by it)
→ local compile. The last step says what and why in one line, before it starts: "building the plugin video for linux-aarch64 here,
once (it needs FFmpeg from this system, so no published binary fits); zinc first downloads zig (390 MB once unpacked)". `zinc doctor` reports, per
plugin, prebuilt / cached / fetchable / to build, and `zinc plugins prefetch [--target <t>]` fills the cache ahead of an offline session
or a classroom. `ZINC_PREBUILT=0` and the policy's source-only mode keep working as today.

### 7.5 CI that builds the matrix

One release job per host family, all building the same keys:

- macOS arm64 and x86_64 (native runners, as the packages do today).
- every Linux tuple cross-built from one Ubuntu runner with the pinned zig and the sysroots of `tools/linux-sysroot`, then each set loaded
  in an emulated container or qemu-user (the check of `tests/t1/linux_cross_prebuilt.sh`: every plugin says "prebuilt", a wrong key fails).
- Windows x86_64 (native runner, DLLs against the import library).
- `wasm32-wasi` once (one binary for every browser), with the wasm key freed of the zig path.

Plugins with system libraries are built against the sysroot where it holds the library's `-dev` package (FFmpeg, libffi, gphoto2 in
the Debian 10 sysroot for `gnu2.28`), and linked with `--allow-shlib-undefined` as today; the device needs the runtime package, which
the failure message names. loro waits for a cross cargo (`cargo-zigbuild` is the usual answer, a later.md line).

### 7.6 What stays a local build on purpose

Android and iOS: Gradle and Xcode compile the plugin sources into the app, signed with the app, as React Native and Expo do; prebuilt
static libraries per ABI are possible later but gain little next to the NDK's own caching. Consoles and ESP32: a fixed core per device;
the right unit there is a prebuilt core image per console (ZN-457's line) and the ESP32 image already shipped, not plugins.

## 8. Sizes

| What | Uncompressed | Compressed (deflate 9) | Source |
|---|---|---|---|
| macOS arm64, 62 newest cache entries: shared libraries | 31.7 MB | 10.1 MB | `~/.zinc/cache/macos/plugins` |
| macOS arm64: `plugin.a` + `vendor.a` | 28.3 MB | 9.6 MB | same |
| Linux aarch64, 49 newest entries: shared libraries | 21.1 MB | 8.0 MB | `~/.zinc/cache/aarch64-linux/plugins` (some older entries are unstripped) |
| Linux aarch64: `plugin.a` + `vendor.a` | 35.0 MB | 9.3 MB | same |
| Linux aarch64 package with 35 plugins prebuilt | | 32.6 MB (25.1 MB without; 49.3 MB before `-Wl,-S`) | ZN-823 notes |
| largest macOS libraries | webrtc 5.0, loro 3.7, physics3d 2.6, lvgl 2.2, sqlite 1.8 MB | | |

Estimates: dropping the archives from the packages saves roughly 9 MB of a macOS download and 3 to 4 MB of a Linux one (about half of
the plugin bytes; a measured package is the check). One tuple of the index is about 10 MB of shared libraries and 10 MB of archives,
compressed; eleven tuples about 220 MB for a full set, and a release with no ABI change adds only the plugins that changed. GitHub
Pages caps a site at 1 GB, so the binaries should be served from the release assets (no total limit, 2 GB per file) with the TUF
targets naming them, or the index should keep only the binaries of the current ABI major: a decision for phase 3.

## 9. Phases and files

| Phase | Work | Files |
|---|---|---|
| 1. Keys | the plugin ABI number and its check; the tuple; content key with the ABI number instead of header bytes, no `shared`, the same `-mcpu` native and cross; `prebuilt/<tuple>/` with the old names read for one release; sources in the prebuilt key; the prebuilt key among the stamp inputs; zig's cache in `ZINC_HOME`; wasm key without the zig path | `src/tc/plugin_build.cpp`, `src/tc/plugin_build.h`, `src/tc/tc.cpp`, `src/tc/tc.h`, `include/zn/native.h` (or a new `include/zn/plugin_abi.h`), `tools/abi-check`, `tests/data/plugin-abi-v1.txt`, `src/cli_web.cpp`, `src/main.cpp` (`plugin-build` output directory), `tests/t1/plugin_key.sh`, `plugin_prebuilt.sh`, `plugin_stamp.sh`, `tests/affected.json` |
| 2. Packages | shared libraries only in the packages; all Linux arches through `tools/build-linux`; the Windows plugins that fail; Intel macOS checked | `tools/package`, `tools/build-linux`, `tests/t1/linux_cross_prebuilt.sh`, `docs/targets/linux.md`, `CHANGELOG.md` |
| 3. Index | a release job that packs every tuple (`prebuild_plugins` with `--pack` into `binaries/<tuple>/`), attached to the release; `pages.yml` merges the entries as for engine packs; `fetchPrebuilt` by tuple and ABI; the archives fetched on the first `zinc build`; `plugin.yml` on the same keys | `.github/workflows/zinc-next.yml`, `.github/workflows/pages.yml`, `.github/workflows/plugin.yml`, `tools/index-repo`, `tools/plugin-pack`, `src/tc/plugin_build.cpp`, `src/main.cpp` (cross build), `tests/t1/plugin_fetch.sh`, `plugin_tiers.sh` |
| 4. Workstation and devices | the agent reports its tuple and missing keys; deploy and `dev --device` push cache entries, cross-building them first | `src/agent/client.cpp` (and the agent's side), `src/main.cpp`, `src/cli_core.cpp` (help), `docs/reports/zinc-next-agent.md` |
| 5. Hygiene | `zinc cache prune`, the doctor rows, `zinc plugins prefetch` | `src/cli_core.cpp`, `src/tc/plugin_build.cpp`, `i18n/` |

Phase 1 is the one that matters most and needs no infrastructure: with it, the ZN-823 packages already survive every release that does
not bump the ABI, and the index binaries of `plugin.yml` start matching devices.

## 10. Tests that run on this Mac

- **T0** `abi-check` on the plugin headers: a comment edit in a copy of `hal.h` keeps the digest; an added declaration asks for a minor
  bump; a changed prototype asks for a major one; the committed snapshot matches.
- **T1** `plugin_key`: the content key of a plugin is the same before and after a comment edit in `hal.h` (engine root copied to a
  temporary directory), and changes with the plugin's sources; a native-style key equals the cross key for the same tuple (computed
  without compiling, through a `--print-key` of `plugin-build`).
- **T1** `plugin_prebuilt`: `prebuilt/linux-x86_64-gnu2.28/` is ignored on macOS arm64; an older-minor binary is accepted, a
  different-major one is refused with a message; a stale `prebuilt/` after a source change is not taken.
- **T1** `plugin_fetch`: a file:// index with `binaries/<tuple>/`, served to two engine builds with the same ABI: the second is served
  with no compiler run (the zig wrapper already counts calls).
- **T1** `linux_cross_prebuilt` (arm64 Debian container on Docker, already exists): extended to armhf and x86_64 images (Docker's
  emulation on this Mac; slow, run alone after integration).
- **T1** device push: an agent on localhost (`zinc agent` runs on macOS) with an empty `ZINC_HOME` receives the entries and starts the
  program with no compiler (`CXX=false`, zig absent).
- **T0** `package` size report: the macOS archive shrinks by the archives' share and stays within its 40 MB budget.

## 11. What needs other machines

- Raspberry Pi 3B+, 64-bit and 32-bit images: the first run of music-tree after installing a package builds nothing (ZN-823 criterion 2)
  and the time from `zinc dev --device` to the first frame, before and after (criterion 3); a deploy that pushes entries from the Mac.
- Pi Zero or Pi 1 (ARMv6): the armhf binaries with the `arm1176jzf_s` baseline load and run.
- An old x86_64 and an i686 Linux with glibc 2.28 (Debian 10 hardware or VM): the `gnu2.28` binaries load.
- An Intel Mac and a Mac on the oldest supported macOS: the x86_64 package and the `lower_minos` restamp.
- Windows: the DLLs against the import library of a newer `zinc.exe` with the same ABI (the import table names exports by name, which
  should hold; not proven).
- HP TouchPad (glibc 2.8 softfp) and reMarkable Paper Pro: their own tuples.
- A plugin with a system library cross-built against the sysroot (video with FFmpeg) loading on a Pi with only the runtime packages.

These go under "Cross-platform pass" in `backlog/later.md` when the work is done, as AGENTS.md asks.
