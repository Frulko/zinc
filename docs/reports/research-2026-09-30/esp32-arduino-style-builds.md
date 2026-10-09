# ESP32 builds, Arduino-style: faster, visual, and Docker-free (2026-09-30)

Status: research note, nothing implemented. Sizes and timings are orders of magnitude from memory, not measured.
Arduino details were not re-verified online. Builds in this repo were not timed. Complements
[docker-free-studio.md](docker-free-studio.md) and [studio-as-zinc-app.md](studio-as-zinc-app.md).

## Product constraint

The end goal is one self-contained app (Unity / Godot / Arduino IDE style). Users never install or configure Docker,
ESP-IDF, cmake or other tools by hand. "No configuration" does not mean "nothing downloaded": the app downloads signed
packages on demand, in the background, the first time (Arduino board manager, Godot export templates).

## Current ESP32 flow (verified in `compiler/src/cli.ts:513, 605-675`)

- `espBuild` generates an ESP-IDF project and runs `idf.py build` in the `espressif/idf:v6.0` Docker image (pinned by digest).
- IDF recompiles Zinc's runtime (`zrt`, modules, HAL) together with the user's code at every build.
- A change of chip or of `sdkconfig.defaults` runs `set-target` and deletes the `build` directory.
- Flashing already runs on the host through esptool.

## How Arduino does it (from memory, unverified)

- The IDE is small. ESP32 support is a package (core + toolchain + esptool) downloaded on demand from a JSON board index,
  several hundred MB.
- The ESP-IDF libraries are shipped precompiled as `.a` files per chip with a fixed `sdkconfig`
  (Espressif's `esp32-arduino-lib-builder`). Arduino compiles only the sketch and the Arduino core code, then links
  against these libraries. No full ESP-IDF build, no CMake for the user.
- The core is compiled once and cached. Only the sketch is rebuilt.
- Cost: the `sdkconfig` is effectively fixed; PSRAM, flash size and partitions come from predefined board options.

## Proposed levels for Zinc

1. **Default: bytecode upload to a preflashed VM firmware.**
   - The app bundles prebuilt VM firmware images per chip/board (a few MB) and esptool.
   - First use flashes the firmware once. Each "Upload" compiles TS to `.zbc` and sends it over serial or Wi-Fi.
   - No C++, no toolchain, nothing to download.
   - Blockers: the VM is not ported to ESP32 (flash/RAM footprint unknown) and universal cores are future work
     (`docs/precompiled-core.md`).
2. **Native build from precompiled templates (Arduino/Godot model).**
   - CI builds per board preset (chip, PSRAM, flash size) precompiled IDF + Zinc runtime libraries with a fixed `sdkconfig`.
   - The app downloads only the Espressif compiler (order of 100-200 MB, estimate), compiles the user's code and links.
   - Cost: a matrix of presets instead of free `sdkconfig` tuning.
3. **Managed full ESP-IDF** for users who change components or `sdkconfig`: the app downloads and pins ESP-IDF itself via
   `idf_tools.py`, no Docker. Heavy (1.5-2 GB) but invisible.

## Faster builds

1. Install ESP-IDF on the host, out of Docker (Docker adds filesystem cost on macOS).
2. Precompile the Zinc runtime per (chip, options) as an IDF component or `.a`.
3. Persistent `ccache` and build directory. Do not delete `build` except on chip change. Keep the `sdkconfig` stable
   (the existing fingerprint check is fine).
4. Partial flash: write only the app partition; OTA over Wi-Fi.
5. `-Og`/`-O1` in development plus `zinc dev` bytecode hot reload.

## Visual experience

- Verify / Upload / Serial Monitor buttons.
- Step progress (analyze, runtime (cached), app, link, flash) with times, fed by Ninja's `[n/total]` output.
- Clickable errors mapped back to TS lines via `zinc check --json` instead of generated C++.
- Flash and RAM usage with percentages (`idf.py size`).
- Board and port selector: USB VID/PID detection, boards from `boards/`, integrated serial monitor with a plotter.
- A "ready" indicator while the VM firmware is present.

## What the app needs

- A package manager: signed index, content-addressed cache, progress and resume, offline bundle.
- Bundled in the app: CLI, esptool, VM firmware images. Everything else is downloaded on demand.
- Still not covered: PS1/PS2 off Linux and Apple targets off Mac need a VM or a Mac. Docker may remain an optional
  backend for CI and advanced developers.

## Order

1. Measure real cold/warm ESP32 build times today (not done).
2. Persistent cache and Docker-free IDF: quick win.
3. Precompiled runtime per chip.
4. Port the VM to ESP32 and ship the preflashed firmware plus bytecode upload. Main unknown: does the VM fit in RAM/flash?
5. Precompiled templates for common boards, then managed full ESP-IDF.
6. The visual UI in the Zinc-app Studio.

## To verify before committing

- Real package sizes of `arduino-esp32` and its tools (Espressif's public index).
- How Espressif publishes the precompiled libraries and which `sdkconfig` variants they cover.
- VM footprint on ESP32 (requires the ESP-IDF toolchain; not run).
