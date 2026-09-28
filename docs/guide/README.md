# Zinc developer guide

A task-oriented guide to building, shipping and hardening apps with Zinc — the compiler from a strict TypeScript
subset to native C++17 (no JavaScript engine on the device). For the project overview, targets and module list, see
the top-level [README](../../README.md); for what is and isn't implemented, [reports/STATUS.md](../reports/STATUS.md).

Every command here is copy-pasteable and every code sample was compiled (and run where it makes sense). Longer samples
live under [`samples/`](samples/) and build with `zinc run docs/guide/samples/<name>`.

Set up the `zinc` alias once (from the repo root):

```sh
pnpm install
alias zinc="node $PWD/compiler/bin/zinc.mjs"
zinc doctor        # checks cmake, a C++17 compiler, SDL3, docker, emscripten
```

## Contents

1. [Getting started](01-getting-started.md) — install, `zinc init`, project layout, the `zinc.json` reference, targets & profiles, `zinc run` / `dev` / `help`.
2. [The language](02-language.md) — the supported TypeScript subset, what is rejected and why (`Z` diagnostics), numbers & profiles, the memory model (RC, pools, arenas, weak), errors, async, `Dyn`/gradual vs strict, `zinc infer`.
3. [UI apps](03-ui-apps.md) — JSX with `view`/`text`/`image`/`scroll`, Solid vs React, classes/CSS/breakpoints, scrolling & `VirtualList`, animations, fonts/assets/images, windows (zoom/resize/fullscreen/kiosk), HiDPI, per-target constraints.
4. [Headless services](04-headless-services.md) — a daemon/CLI: HTTP server, MQTT/OSC, telemetry, timers, logging, shutdown, running as a `systemd` service, restart policy, resource budgets, ESP32 firmware. Worked example: [`examples/service/sensor-hub`](../../examples/service/sensor-hub).
5. [Plugins](05-plugins.md) — pure-Zinc module plugins, native plugins (spec + C++ per target + sim), UI component plugins, display driver plugins, `plugin.json` reference, options, packages/IDF components, testing and sharing.
6. [Testing](06-testing.md) — the sim oracle, `zinc test`, conformance-style tests for your own app, golden outputs, `--debug` ASan/leaks, determinism (virtual clock, record/replay), captures (`ZINC_SHOT`, `zinc capture`), visual regression (`zinc test --pixels`), dev-mode red box/inspector, benchmarks.
7. [Distribution](07-distribution.md) — `zinc export` per target, single executable with embedded assets, `zinc deploy`, Docker images, ESP32 flashing, PS1 CD image, rmpp AppLoad, wasm hosting, app icons, versioning, macOS signing/notarization.
8. [Security](08-security.md) — threat model per deployment, memory-safety guarantees and limits, network exposure defaults, the hardened systemd unit, build hardening, secrets, supply chain, fuzzing, and obfuscation (`--obfuscate`): what a native binary hides, what it doesn't, and being honest about it.
9. [Web platform APIs](09-web-apis.md) — the WinterTC minimum common Web API as globals: `fetch` / `Request` / `Response` / `Headers`, `URL`, `TextEncoder` / `TextDecoder`, events, `AbortController`, `Blob` / `FormData`, `crypto`, `WebAssembly`; deviations and WPT results.

## The one-minute tour

```sh
zinc init myapp --template game      # or cli | server | iot | remarkable
cd myapp
zinc run                             # native build + run (SDL3 window or headless)
zinc run --target sim                # the same program on Node (the oracle)
zinc dev                             # hot reload on save, red box on crash, UI inspector on :9229
zinc test                            # conformance: every target prints the same bytes as sim
zinc export --target macos           # dist/<name>-<target>: one self-contained executable + scripts
```
