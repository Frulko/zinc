# Precompiled Zinc VM core

Build an application core once, then compile compatible scripts without running CMake:

```sh
node compiler/bin/zinc.mjs build examples/ui/forms/main.tsx --engine zinc-vm
node compiler/bin/zinc.mjs run examples/ui/forms/main.tsx --engine zinc-vm \
  --core examples/ui/forms/build/zinc-vm-macos
node compiler/bin/zinc.mjs dev examples/ui/forms/main.tsx --engine zinc-vm \
  --core examples/ui/forms/build/zinc-vm-macos
```

Use `linux` instead of `macos` on Linux. For a headless core, pass `--headless` to both the initial build and subsequent script commands, and use its build directory. `--jit` selects the existing VM JIT with the same core. `build`, `run`, `capture`, and `dev` accept `--core`; `build` emits the script bundle without launching it. Script outputs use a separate `-script` build directory.

`dev` watches sources, stops the previous process, compiles the script, and starts a fresh process using the unchanged core executable. This resets application state and recreates the window. It is not state-preserving HMR. A rejected build waits for the next edit.

The first core is application-specific. A script must use a subset of its native exports with matching ABI descriptors. Graphics configuration, number/typing profile, baked fonts/images, target, architecture, and debug mode must match. A new native export, resource, or incompatible configuration requires rebuilding the core without `--core`. Additional `--native-library` arguments are rejected; libraries recorded in the core are reused and checked.

Core manifests record checksums for the runner, generated ABI, resources, native sources/libraries, and compiler/runtime sources. Changed or missing artifacts and older manifests fail explicitly. This conservative source fingerprint can require rebuilding the core after a compiler change that does not affect bytecode semantics. Core directories currently depend on their recorded source/library paths; this is a local development workflow, not a portable core package. Universal cores and external asset packs are separate work.

Validation:

```sh
node tests/engines/core-cli.mjs
```

This builds a real graphics core, changes the script, checks interpreter/JIT execution and restart on save, rejects incompatible configuration/imports/resources, and verifies that the core remains unchanged. After the initial build, a failing `cmake` executable is placed first in `PATH` to ensure script builds cannot rebuild C++.
