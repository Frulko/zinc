---
id: ZN-718
title: >-
  Nothing to compile for a beginner: a prebuilt engine to download, prebuilt
  plugins for every platform
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-11 16:10'
updated_date: '2026-10-11 16:58'
labels:
  - packaging
  - size-L
milestone: m-19
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 one command or one archive installs a self-contained zinc on macOS with no compiler, CMake or Xcode on the machine; zinc new, run and dev work from it (proved in a directory with a PATH that holds no compiler)
- [ ] #2 a program that imports plugins runs from that install without building them: each plugin is fetched prebuilt for the host from the signed index, and zinc doctor says which plugins have no prebuilt for which platform
- [ ] #3 the release job builds the engine archive and the plugin prebuilts for macOS, Linux and Windows targets with the pinned zig; publishing is the owner's step and its exact command is in the task notes
- [ ] #4 docs/guide/01-getting-started.md starts with the download, not with a source build
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## State found (2026-10-11, before any code)

What exists:
- `next/tools/package` (ZN-053): `Zinc-<version>-macos-<arch>.zip` ("Zinc Atelier.app": zinc, libzn_webgl/libzn_window, SDL3 in Frameworks, lib/std, fonts, templates, the engine sources for cross builds) and the Linux tar.gz; 11.6 MB on this Mac, budget 40 MB. `tools/sign-macos` (Developer ID, notarization, `--dry-run`), `tests/t2/package.sh` (hello, the app, a Pi build, the emulated ESP32 from the package).
- The release job of `.github/workflows/zinc-next.yml` (ZN-329): on a `v*` tag each OS job packages, macOS signs and notarizes, update manifests, `gh release create`. Windows builds as an experimental job and is not packaged (ZN-054 parked).
- Plugin binaries: `zinc plugin-build --prebuild` writes `plugins/<name>/prebuilt/<target>/` (dylib, plugin.a, vendor.a, key of the ABI headers and defines; ZN-328.03); `--pack` and `tools/plugin-pack` make `binaries/<target>/<name>-<cache key>.tar` for the signed index (ZN-337, ZN-354), which `zinc run` fetches before it compiles; `tools/index-repo` builds the TUF index; `.github/workflows/plugin.yml` does it for a plugin repository.
- `zinc toolchain` / `zinc doctor`: the pinned zig 0.15.2, esptool, QEMU, butler, downloaded with curl and SHA-256 checked. `zinc update` (signed manifest).

Measured from the unpacked archive, empty ZINC_HOME, PATH of loud shims (cc, c++, clang, gcc, cmake, zig, make, xcrun, ld, ar, pkg-config, git, node, python3) plus /bin:
- `zinc new game`, `zinc run` (headless, 3 frames, a frame written) and a type error (file, line, `zinc explain`) work; no shim is run, nothing is downloaded: the interpreter needs no compiler.
- `zinc run` of game-2d prints `zinc: targets/capabilities.json is not valid JSON`: the file is not in the package.
- Every template that imports a native plugin fails (3d, desktop-app, dashboard, game-2d): the package holds the plugins' `.ts` and `plugin.json` only, so `plugin 'system' has no native source for target 'macos'`; `three` falls back to `three.sim.ts` (a Node file); the zig download starts although nothing can be compiled.
- A Mac without the Xcode tools cannot build these plugins even with the pinned zig: zig is fetched without Xcode (curl, tar), but zig has no macOS SDK, and 3d, display-gl, system, midi, webview link frameworks (OpenGL, AppKit, CoreMIDI, WebKit).

What is missing:
1. An install step: the archive is a zip with an .app, `zinc` is not on the PATH, the guide starts with a source build.
2. Plugin binaries in reach of an install: no published index, no `next/index/root.json` in the tree (the index needs the owner's keys and a Pages site), and the index key covers the native sources, which the package does not hold.
3. `zinc doctor` says nothing about plugin binaries.
4. The release job builds no plugin binary and no Windows archive; no plugin declares a `windows` target.

Sizes: `plugin-build --prebuild` of the 30 native and display plugins that build on this Mac: 46 MB unpacked (physics3d 18, sqlite 7.5, audio 4.5).

Decision to record (the coordinator numbers it): the official plugins' binaries travel inside the engine archive (`plugins/<name>/prebuilt/<target>/`, the ZN-328.03 mechanism), they are not fetched from the index. Scores (fit x3, performance x3, size x2, maintainability x2, supply risk x2, portability, effort): in the archive 5,5,3,5,5,4,5 = 65; fetched from the index on first use 4,3,5,3,3,4,2 = 49. Why: one download works offline (schools), nothing to publish or sign before the first user can run a template, no key or Pages site needed, the engine and its plugins cannot drift apart (the prebuilt key is the ABI headers), and the code exists. The index stays the path of plugins that are not in the engine (`zinc add`). To revisit when the archive passes its 40 MB budget.
<!-- SECTION:NOTES:END -->
