---
id: ZN-808
title: 'Cross-platform pass: Linux x86_64 and aarch64 desktop and release archives'
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-L
  - cross
milestone: m-11
dependencies: []
ordinal: 54300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-778: check private preset files and atomic replacement on Linux, and shared Nuxt select layers on the web DOM host; the builder/session and overflow pointer regressions ran on the Mac interpreter.
- Module resolution: run `tests/t0/module_resolution.sh` on Linux (it needs zinc-mqjs, esbuild and SWC there).
- zinc:ble on Linux (BlueZ over D-Bus) and Windows (WinRT); today `state()` is 'unsupported' there.
- ZN-773.04: Linux engine packs in `tools/engine-pack` (patchelf, `$ORIGIN` rpaths) and `zinc export` of jsc/v8 projects on Linux.
- ZN-773.07: Hermes on targets with no JIT (Android without V8, consoles): measure its interpreter and Static Hermes against QuickJS there; Linux and Windows builds of tools/hermes-pack.
- ZN-773.09: zinc export of an "engine": "quickjs" project for linux and the other non-macOS targets still builds a native program: decide whether they carry the bundle and its .qbc.
- ZN-773.06: build and test libzn_wasm (the `wasm` pack) on Linux x86_64 and arm64 and on Windows; only macOS arm64 was built.
- ZN-773.05: `--engine v8` on Linux x86_64 and arm64 from Homebrew's Linux bottles (`tools/v8-pack` is macOS-only: the ELF rpaths with patchelf, glibc floor), and our own V8 build where no bottle exists (Intel macOS, Windows, armhf), the gn args of docs/reports/js-engines-jsc-v8.md.
- ZN-764: the GL window (Linux, Windows) now makes its software rows and their texture only for the splash and frees them when the replay draws: check the splash and a window resize on both, and `tools/window-memory`-like numbers (smem/Task Manager).
- Linux cross builds (owner, 2026-10-17): on the Pi 3B+ rig (`docs/reports/raspberry-pi.md`), the archives of `tools/build-linux`: aarch64 on the 64-bit Raspberry Pi OS and armhf on a 32-bit one (Bullseye, glibc 2.31, and the 64-bit kernel that 32-bit Pi OS boots on a Pi 4): `zinc --version`, `zinc run examples/hero` in a window under the desktop (X11) and on the console (KMS/DRM, `video`, `input`, `tty` groups), the GPU (`ZINC_GL_STATS=1` names V3D or VC4, not llvmpipe), touch, and the first plugin compile on the device (the zig download, zinc:sqlite).
- Linux cross builds: an x86_64 PC with Ubuntu 20.04 (glibc 2.31) and a GPU, and a Wayland desktop (GNOME, through XWayland): the window, the GPU renderer, the clipboard, HiDPI; the release's install.sh on Ubuntu, Debian, Fedora and Raspberry Pi OS.
- Linux cross builds: SDL3's Wayland backend in the cross build (wayland-scanner on the build machine, wayland-protocols in the sysroot): today only X11 and KMS/DRM, so a Wayland session without XWayland gets no window.
- Linux cross builds: the musl static flavour (`tools/build-linux --musl`, aarch64: 16.6 MB, same interpreter speed as glibc, runs on Alpine) as a published `-musl` archive for Alpine and containers; check the message a program that imports a plugin gets there (no dlopen in a static program) and build the x86_64 one.
- Linux cross builds: FFmpeg and libgphoto2 in the pinned sysroot (the headers, `.so` and `.pc` files of libavformat, libavcodec, libavutil, libswscale, libswresample, libgphoto2, without their -dev dependency closure), so zinc:video and zinc:gphoto2 cross-build without a device's libraries copied by hand.
- Linux cross builds: prebuilt plugin libraries in the Linux archives (a cross build makes only the static archive today, so the archive ships the plugins' sources and the device compiles them at first use with a 50 MB zig download): build the `.so` with the cross zig and the sysroot.
- Linux cross builds: the release job publishes the Linux archives and their update manifests (zinc-linux-aarch64, -armhf, -x86_64) once `ZINC_LINUX_JOBS` runs green; i686 stays a CI artifact until someone asks.
- Live resize (owner, 2026-10-16): Linux X11 and Wayland have no modal loop: check that the watcher's frames inside the poll (an expose, a size change) do not double the frame rate or flicker, and what `aspectRatio` and `maxWidth` do under Wayland (SDL_SetWindowAspectRatio is not supported by every compositor).
- zinc bundle: download the pinned esbuild 0.28.2 on linux-x64, linux-arm64 (a Pi) and win32-x64 (package/esbuild.exe), run `zinc bundle --minify --sourcemap --bytecode` on hero there and compare its frame with the interpreter's; on Windows check `NODE_PATH` with `;` and the paths esbuild prints back.
- ZN-321: `zinc export --target linux --deb --key <seed>` then `zinc verify` on the .deb and on a changed copy (the .deb is signed by the export's artifact list; never run, a .deb needs the Linux cross build).
- ZN-583.01: zinc:physics2d on Linux (tests/t1/physics2d.sh in the container, drop.out byte for byte) and on arm64 macOS, rpi, wasm and the handhelds (NEON instead of SSE2), drop.out identical.
- ZN-433: zpk_test and fuzz_zpk on Linux x86_64 and arm64, and a zig cross build of zn_zstd and zn_lz4.
- ZN-354: tests/t2/cross_plugin_pack.sh and the linux-armhf leg of plugin.yml (which runs no tests: run them under qemu-arm or on a Pi).
- ZN-327: the guide's flow for --target linux and rpi (export, --deb, the itch channels).
- ZN-434: tests/t0/assets.sh on Linux x86_64 and arm64, and zn_assets (xxhash.h) under the zig cross builds.
- ZN-436: tests/t0/assets_groups.sh on Linux x86_64/arm64 and the Pi 1 (the in-turn decode path); a cross build that links the pack libraries and sets ZINC_PACK_TARGET.
- ZN-261: tests/t1/style_gradient.sh's GL comparison on llvmpipe (Linux) and on VideoCore IV GLES2 (Pi 3).
- ZN-570: run webenv_canvas2d and webenv_canvas2d_libs on ARM and Linux (flat-colour values come from float maths; SSIM is against the Mac's Chrome).
- ZN-572: `webenv_canvas2d_full` and the canvas_ity patches on Linux, Windows and ARM (float sums in the coverage grid).
- ZN-443: `tests/t1/tilemap.sh` on Linux and in the browser export (zinc:tilemap needs packs and throws without them); its GL renderer pixels.
- ZN-715, ZN-716, ZN-717: `osc_full.sh`, `serial.sh` and `midi.sh` on Linux (ALSA sequencer loaded), then Windows (`serial.windows.cpp`; WinMM has no virtual ports); non-standard baud rates on Linux (termios2).
- ZN-718: first tag on CI: check the `macos-15-intel` label, the Package step on each OS, and `install.sh` from the real URL.
- ZN-718: run `install.sh` and `install_nocompiler` on Linux x86_64 and aarch64; the notarized archive on a clean Mac and on arm64.
- ZN-583 #4: zinc:physics2d and zinc:physics3d with the pinned zig for x86_64-linux, aarch64-linux and armhf-linux (`zinc build --target armhf-linux tests/data/physics3d/drop.ts`, same for physics2d) in the container or QEMU: drop.out byte for byte, plus physics3d's drop.ts `-- 4` (thread pool, `-pthread` in the manifest); check Jolt's support for 32-bit ARM.
- ZN-439: basisu built on aarch64 gives the same pack bytes as on x86_64 (SSE is off); Linux Mesa offers WEBGL_compressed_texture_etc and uploads ETC1 as ETC2.
- ZN-441: gltfpack on aarch64 macOS and Linux gives the same packs as x86_64; the meshopt decoder on the Pi (NEON) and wasm (SIMD) decodes the truck as on the Mac (`tests/t1/model.sh`).
- ZN-741: once the GLES 2 base exists, measure it on the Pi 3 (VideoCore IV) and the HP TouchPad (Adreno 220) against the Nexus 7 (Tegra 3): same capability record, same programs, frame times in `docs/reports/zinc-next-perf.md`, and whether one tuning table fits the three.
- ZN-629: --aab and --apk on Linux (unzip, the JDK at /opt/android-studio/jbr) and an IPA archive on a device with the owner's team.
- ZN-756: zinc:link on Linux (never compiled there: dnssd beside avahi on port 5353, then two Linux machines pairing) and on iOS (raw multicast needs Apple's multicast entitlement: dns_sd.h DNSServiceRegister/Browse behind dnssd.h, NSLocalNetworkUsageDescription and NSBonjourServices in Info.plist).
- zinc:loro: build the loro crate for linux x86_64/aarch64, rpi armv7 (`armv7-unknown-linux-gnueabihf`), android, ios and windows (`x86_64-pc-windows-gnu`) with rustup targets and zig as the linker (or cargo-zigbuild), so `zinc build --target` stops refusing plugins with Rust code.
- ZN-773: the JavaScript engines off the Mac: the Linux JSC pack over libjavascriptcoregtk-4.1 (Debian 13, Raspberry Pi OS) and whether its JIT is on for armhf, Windows and Android JSC from Bun's WebKit (non-LTO archives, Bun__* stubs), V8 for armhf cross-built from Linux x64; without them --engine jsc and v8 are macOS only (docs/reports/js-engines-jsc-v8.md §4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tools/build-linux archives (aarch64, armhf, x86_64, musl) run on Ubuntu/Wayland machines; install.sh on Ubuntu, Debian, Fedora
- [ ] #2 Listed tests (module_resolution, assets, assets_groups, physics2d/3d, zpk, tilemap, osc/serial/midi, canvas2d, bundle) pass on Linux x86_64 and arm64
- [ ] #3 V8, JSC, Hermes and wasm packs build and run on Linux; .deb export and verify
- [ ] #4 Release job publishes the Linux archives
<!-- AC:END -->
