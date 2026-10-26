# macOS 10.12 legacy runtime experiment

ZN-845, owner request, 2026-10-26. This is an **experimental Intel runtime**, not a supported Sierra release or a port of the full Zinc CLI. It reuses `targets/console` (the normal interpreter, software raster, resource reader and portable system host) and adds a small Cocoa window HAL. It has no SDL, Metal, JavaScriptCore or non-system dylib dependency. The normal CMake build is unchanged.

## Build and run

On a current Mac with Xcode command-line tools, CMake and the usual built `build/zinc`:

```sh
cmake -S targets/macos-legacy -B build/macos-legacy
BUILD_DIR=build/macos-legacy tools/build zinc-core

build/zinc pack examples/bouncing-ball -o build/macos-legacy/ball.zapp
mkdir -p build/macos-legacy/ball
tar -xf build/macos-legacy/ball.zapp -C build/macos-legacy/ball
ZINC_BACKGROUND=1 build/macos-legacy/zinc-legacy build/macos-legacy/ball/program.zbc
```

Copy `zinc-legacy` and the unpacked program directory together to the Intel Mac. Use matching runtime and packer revisions: this executable reads bytecode directly rather than checking a `.zapp` manifest. It verifies the bytecode before execution. Run it from Terminal with the path to `program.zbc`; `resources.bin` stays beside the program. Programs using the portable system host resolve files/storage from the working directory, so run each app from its own directory.

The window has a fixed logical size (default 320×240; `ZINC_SIZE=640x480` overrides it), rendered at scale 1. Arrows map to the game directions, Space to A, Return to Start, Escape to Select. Mouse buttons, pointer position and wheel are supported. Close the window to quit. `ZINC_FRAMES=60` stops a smoke run; `ZINC_HEADLESS=1` uses the same runtime without creating a window.

## Evidence and checks

```sh
tests/run --only macos_legacy
ZINC_CAPTURE="$PWD/build/macos-legacy-window.png" tests/run --only macos_legacy_window
```

The first check requires the explicitly built runtime (otherwise SKIP), verifies the Intel architecture, Mach-O minimum of 10.12 and absence of SDL/JSC/Metal/Homebrew dependencies; compares packed `hello` output and `bouncing-ball` output/frame hash against the normal interpreter; and checks rejection of invalid bytecode. The window check compiles the actual HAL with a 10.12 deployment target, presents four known colours through a real background Cocoa view, reads its rendered pixels, posts application-local game-key/mouse events, checks button state and close, and verifies the frontmost application stays unchanged. It does not post system input events or move the user's pointer.

Observed on the development Apple Silicon Mac through Rosetta: Intel runtime builds; `hello` output matches; frame 60 of `bouncing-ball` is `216f7766b51df966` at 320×240. The view's red/green/blue/white quadrants are correctly oriented. This demonstrates execution on modern macOS under Rosetta, **not execution on Sierra**.

## Limits and next proof

- Interpreter only; no QuickJS, V8, JSC, AOT packaging, CLI/toolchain installation or automatic updates in this experiment.
- The portable console host is intentionally smaller than the desktop host. Desktop plugins, `zinc:ui` applications, networking/audio capabilities, full desktop keyboard/text/IME, clipboard, accessibility, multiple windows, resizing and Retina rendering are not qualified. This is a `zinc:gfx` game/runtime experiment, not a desktop UI compatibility claim.
- The modern SDK accepts the 10.12 deployment target. That metadata and compiler availability checking cannot prove every imported system symbol exists on Sierra. A real Intel Mac running 10.12 must launch both packed examples, display the game, exercise keys/mouse/close, and check dyld imports before calling this Sierra-compatible.
- The full CLI fails compilation for 10.12 at `std::filesystem` calls (`src/main.cpp`, introduced in 10.15). SDL3's documented deployment minimum is 10.13; the current JSC engine also calls a post-Sierra API. These are deliberately outside this first runtime experiment.

References: [Apple C++ availability](https://developer.apple.com/xcode/cpp/), [SDL macOS deployment](https://wiki.libsdl.org/SDL3/README-macos), local `src/engine/jsc.cpp` and `include/zn/shortest.h` (already supplies old-Apple floating-point formatting).

## Decision

Reuse the portable core and a Cocoa raster presenter. Weighted scores under RULES §4, in order fit/performance/size/maintenance/licence/portability/effort: portable core+Cocoa 4/4/5/4/5/4/5 = 61; full desktop CLI backport 5/4/3/2/5/3/1 = 51; portable core+new SDL2 backend 4/4/4/3/5/4/3 = 55. Scores are design judgments, not performance measurements. Cocoa avoids a second SDL dependency and leaves shared engine semantics intact. Revisit once real Sierra execution is proven or a specific desktop app requires the full host.
