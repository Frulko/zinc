# Catalina CLI and Atelier preview

ZN-846, owner request 2026-10-26: deliver an Intel CLI and Atelier to the networked Mac's `/Volumes/myrole/Desktop`. This extends the earlier Sierra runtime experiment with the real desktop engine, targeting **macOS 10.15**, not 10.12. Actual Catalina execution is not yet verified: local execution uses Rosetta on the development Mac. The remote Mac is not launched or configured by this session.

## Build and package

```sh
cmake -S . -B build/macos-catalina -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=10.15 \
  -DZN_WASM=OFF -DZN_V8_DIR=/nonexistent -DZN_HERMES_DIR=/nonexistent
BUILD_DIR=build/macos-catalina tools/build zinc
```

The CLI build includes its normal interpreter, QuickJS, window and WebGL modules. WASM is disabled: its existing architecture selection uses the ARM host processor when compiling the Intel slice. V8/Hermes SDKs are excluded; the system JSC module is built but omitted from the delivery because its rejection callback needs 10.15.4. No compatibility claim is made for those optional engines.

The staging procedure is retained in `build/macos-catalina/package-preview.py`: it reuses `tools/package`'s `engine_macos`, `payload`, launcher and plist. It stages `cli/bin/zinc`, supporting modules and `cli/share/zinc`, then embeds the same payload in `Zinc Atelier.app`. Only Atelier is retained under the app resources; unrelated apps and their local data are excluded. It copies source plugins into an isolated project, then builds system, process, audio, 3d and canvas2d with `plugin-build <name> <project> --prebuild`, `ZINC_PLUGIN_CC=system`, an isolated `ZINC_HOME`, and these compiler commands:

```sh
CC='/usr/bin/clang -arch x86_64 -mmacosx-version-min=10.15'
CXX='/usr/bin/clang++ -arch x86_64 -mmacosx-version-min=10.15'
```

This compiles actual Catalina-targeted code; it does not lower modern binaries' deployment metadata after compilation. The app plist declares 10.15; its launcher passes `--interp`, inherited by its child CLI commands unless the user explicitly chooses another engine. Opening Atelier therefore does not need Xcode or a downloaded compiler. The package includes those five native plugins for Atelier and its bundled examples; other native plugins and native/AOT builds are not qualified. Code is signed ad hoc, without Developer ID notarization.

## Fixes discovered during delivery

- Match SDL's weak link to `UniformTypeIdentifiers`, introduced in macOS 11, in both the window module and the generated AOT link flags. The framework must be absent safely on Catalina.
- `loadPlugin` must not create its `exports` cache next to a prebuilt library: that path can be inside a signed app. Keep this cache beside local builds only. This preserves module validation/registration and existing cache behavior for locally built plugins. The prebuilt regression checks the directory remains unchanged after running the module.

## Verification and delivery

- `ZINC=.../build/macos-catalina/zinc tests/run --only macos_frameworks`: PASS, verifies actual Mach-O weak framework command and the CLI's serialized AOT flags.
- `tests/run --only atelier` with the Intel CLI: PASS.
- `tests/run --only plugin_prebuilt` with the Intel CLI and explicit Intel system compilers: PASS, including the new no-write regression and no-compiler prebuilt execution.
- Both staged engines resolve their own resources from `/tmp`, without `ZINC_ROOT`. CLI interpreter and QuickJS print `Catalina CLI 42` with a fresh cache and a system-only PATH.
- Packaged Atelier opens a real background window (capture visually reviewed); a headless scripted session launches its embedded CLI and prints `hello from Zinc`. Deep strict signature verification passes before and after both runs.
- The binary audit covers 18 Mach-O executables/libraries, all x86_64, minimum <=10.15, with no workstation/Homebrew dylib dependency; the optional new framework is weak-linked.

Delivery directory: `/Volumes/myrole/Desktop/Zinc-macOS-10.15`, with the ready-to-open app, `cli/bin/zinc`, French instructions, binary audit and SHA-256 file manifest. All 2,236 files were copied into the new directory and read back with matching SHA-256 hashes. The owner still needs to launch Atelier and the CLI on Catalina; no remote execution or system installation is performed. The build emitted two existing parentheses warnings in `src/frontend/resolve.cpp`; no unrelated source was changed for them.
