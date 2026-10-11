---
id: ZN-718
title: >-
  Nothing to compile for a beginner: a prebuilt engine to download, prebuilt
  plugins for every platform
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-11 16:10'
updated_date: '2026-10-11 17:17'
labels:
  - packaging
  - size-L
milestone: m-19
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 one command or one archive installs a self-contained zinc on macOS with no compiler, CMake or Xcode on the machine; zinc new, run and dev work from it (proved in a directory with a PATH that holds no compiler)
- [ ] #2 a program that imports plugins runs from that install without building them: each plugin is fetched prebuilt for the host from the signed index, and zinc doctor says which plugins have no prebuilt for which platform
- [ ] #3 the release job builds the engine archive and the plugin prebuilts for macOS, Linux and Windows targets with the pinned zig; publishing is the owner's step and its exact command is in the task notes
- [x] #4 docs/guide/01-getting-started.md starts with the download, not with a source build
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

## Done (2026-10-11, worktree agent)

- Criterion 1 (ticked): `next/tools/install.sh` (one command: reads `SHA256SUMS` of a release, checks the archive, unpacks it into `~/.zinc/engine`, links `zinc`, adds `~/.local/bin` to the PATH when needed; a rerun updates). Proof: `ZINC_DIST=<dir of tools/package --out> tests/run --tier t1 --only install_nocompiler` (16 s): install from a `file://` release into an empty HOME, then `zinc new`, `zinc run` (a frame written), a type error with file and line, `zinc dev` (start, an edit, the reload) with an empty ZINC_HOME and a PATH of failing shims (cc, c++, clang, gcc, cmake, zig, make, xcrun, ld, ar, pkg-config, git, node, python3) plus links to curl, shasum, perl, ditto, tar and a few text tools, and /bin: the shim log is empty and no toolchain is downloaded. A wrong checksum installs nothing. The same test fails on the archive of before (11 lines: templates, doctor, a zig download).
- Criterion 2 (not ticked, see below): `tools/package` builds `plugins/<name>/prebuilt/<target>/` for every plugin with native code that needs no system library (28 on this Mac) and puts them in the archive: 11.6 MB to 27.0 MB (budget 40). `plugin_build.cpp` uses a prebuilt library without the plugin's C++ (it asked for the source first). The templates desktop-app, 3d, game-2d and dashboard (system, svg, three) run from the install in the same test, `zinc plugin-build system` answers `system prebuilt`. `zinc doctor` ends with the count for this machine (keys checked), the plugins without one and why, the same for the other desktop platform by the manifests, and `windows: none`. The plugins that need a system library (video, gphoto2, webview; on Linux also display-gl, ffi) keep their sources in the archive: `zinc plugin-build video` and `gphoto2` build from the unpacked archive on this Mac (pkg-config, FFmpeg, the pinned zig).
- Found on the way: `unzip` of the macOS zip leaves `._x.spec.ts` (AppleDouble) and the plugin failed with "the spec does not parse": hidden files are never a spec (regression case in `tests/t1/plugin_prebuilt.sh`). The archive lacked `targets/capabilities.json` and the runtime headers. `tools/sign-macos` now signs the dylibs of `Contents/MacOS` and of the plugins too (notarization refuses an unsigned Mach-O).
- Criterion 3 (not ticked): `.github/workflows/zinc-next.yml`: the Package step runs on every OS job (the plugin libraries are built there with the pinned zig), an Intel macOS job (`macos-15-intel`) is added as experimental, the release job adds `install.sh` and `SHA256SUMS`; `tools/package` has a Windows zip. `tests/t0/release_workflow.sh` runs the new step and checks the five platforms. The engine itself is built by each runner's compiler, as before, not by zig.
- Criterion 4 (ticked): `docs/guide/01-getting-started.md` starts with the one command; the source build is "From the sources". `docs/guide/07-distribution.md` names the two new release files.

Tests passed: install_nocompiler, plugin_prebuilt, plugin_build, plugin_key, plugin_fetch, plugin_stamp, cli_core, cli_tools, package, release_workflow, first_run.

## Open, and why

- Criterion 2: its result is proved, its wording is not: the libraries come inside the engine's archive, not "fetched from the signed index" (the decision above: no index is published, it needs the owner's keys, and one download works offline). To close: accept the decision, or build the index route (the native sources or their key in the archive, `next/index/root.json`, a published index). Doctor is exact for this machine only; the other platform is read from the manifests.
- Criterion 3: nothing of the workflow has run on GitHub (the `macos-15-intel` label, the Package step on Linux and Windows, the plugin libraries built by zig on Linux). Windows cannot pass yet: the host does not build there (ZN-054, parked), `tools/package`'s Windows branch was never run, no plugin names a `windows` target and `pluginTarget()` knows macos and linux only; there is no install.ps1.
- Not proven: the real URL (no release exists), an install on Linux, an arm64 Mac, a Mac that never had the Xcode tools (the shims stand for it), the notarized archive with the plugins' dylibs under Resources, `zinc build` / `zinc export` of a program with plugins from the install, `tests/t2/package.sh` (it cross builds; not run).
- Known limits: a project that sets a plugin's options asks for another prebuilt key, and the install holds no C++ of that plugin: it stops with "no native source ... and no prebuilt library for this engine". `zinc:webview` does not compile on macOS, in the tree either (`zrt.h`: redefinition of `operator new` from webview.mm); display-st7789 does not link with zig on macOS; imu-qmi8658 and script have no thunk: none of the four has a library.

## The owner's steps

- A release (the workflow builds, packages, and attaches the archives, the manifests, `install.sh` and `SHA256SUMS`): `git push origin main && git tag -a v0.1.0 -m "Zinc 0.1.0" && git push origin v0.1.0`
- The guide and `install.sh` name `zinc-engine/zinc` (D37). While the releases are on Frulko/zinc: `curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | ZINC_REPO=Frulko/zinc sh`
- By hand from this Mac, without the CI (Intel archive only): `cd next && ZINC_VERSION=0.1.0 tools/package --out dist && cp tools/install.sh dist/ && (cd dist && shasum -a 256 Zinc-*.zip > SHA256SUMS) && gh release create v0.1.0 --title "Zinc v0.1.0" dist/Zinc-0.1.0-macos-x86_64.zip dist/install.sh dist/SHA256SUMS`
- Signed and notarized (before the checksum): `ZINC_SIGN_IDENTITY="Developer ID Application: Name (TEAMID)" ZINC_NOTARY_PROFILE=<profile> tools/sign-macos dist/Zinc-0.1.0-macos-x86_64.zip`; the CI secrets are listed in `docs/guide/07-distribution.md`.
<!-- SECTION:NOTES:END -->
