# Zinc developer guide

New to Zinc? [Learn Zinc](../learn/README.md): twelve short lessons, from a shape on screen to keys, mouse, touch, drawing, sound and a complete interface.

A task-oriented guide to building, shipping and hardening apps with Zinc: a strict, typed subset of TypeScript that runs
in an interpreter, compiles ahead of time to native C++, or runs on QuickJS and the other JavaScript engines
([chapter 12](12-js-engines.md)). Typed Zinc needs no JavaScript engine on the device. For the project overview and the
list of plugins, see the top-level [README](../../README.md).

Every command here is copy-pasteable and the code samples of chapters 1, 2 and 3 were compiled. Longer samples live under
[`samples/`](samples/) and run with `zinc run docs/guide/samples/<name>`.

## Install and first run

```sh
brew install frulko/zinc/zinc          # or: curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh
zinc doctor                            # what zinc sees: engine, renderer, tools, plugins
zinc new game my-game                  # a project from a template (`zinc new --list` prints them)
cd my-game
zinc run                               # a window with a square the arrow keys move
zinc dev                               # the same, and every save is swapped into the running program
```

[Chapter 1](01-getting-started.md) has the install (no compiler needed), the templates, a first change and a first
mistake. Not sure which kind of program to write? [Choose your kind of program](../start/choose.md).

## Contents

1. [Getting started](01-getting-started.md) — install, `zinc new`, project layout, the `zinc.json` reference, targets & profiles, `zinc run` / `dev` / `help`.
2. [The language](02-language.md) — the supported TypeScript subset, what is rejected and why (`Z` diagnostics), numbers & profiles, the memory model (RC, pools, arenas, weak), errors, async, `Dyn`/gradual vs strict, `zinc infer`. The one-page version is the [syntax cheat sheet](../reference/syntax.md).
3. [UI apps](03-ui-apps.md) — JSX with `View`/`Text`/`Image`/`ScrollView`, Solid vs React, classes/CSS/breakpoints, scrolling & `VirtualList`, animations, fonts/assets/images, windows (zoom/resize/fullscreen/kiosk), HiDPI, per-target constraints.
4. [Headless services](04-headless-services.md) — a daemon/CLI: HTTP server, MQTT/OSC, telemetry, timers, logging, shutdown, running as a `systemd` service, restart policy, resource budgets, ESP32 firmware. Worked example: [`examples/service/sensor-hub`](../../examples/service/sensor-hub).
5. [Plugins](05-plugins.md) — pure-Zinc module plugins, native plugins (spec + C++ per target + a Zinc stand-in), UI component plugins, display driver plugins, `plugin.json` reference, options, packages/IDF components, testing and sharing.
6. [Testing](06-testing.md) — `zinc test` and its `--runner`s (interpreter, AOT, QuickJS...), `*.test.ts` with `zinc:assert`, comparing engines, determinism (virtual clock, record/replay), captures (`ZINC_SHOT`, `zinc capture`), debug builds, dev-mode red box/inspector, `zinc bench`.
7. [Distribution](07-distribution.md) — from `zinc new game-2d` to an itch.io page and a download page, worked through and run by a test; then `zinc pack`, `fuse`, `export` per target, signing and notarization, `.dmg` and `.deb`, SBOM, `zinc publish` (itch.io, a download page, signed updates), `zinc update-app`, mirrors.
8. [Security](08-security.md) — threat model per deployment, memory-safety guarantees and limits, the permission keys of zinc.json and what each host module checks, network exposure defaults, systemd units, build flags, secrets, supply chain and plugin distribution, fuzzing, and what a native build hides (and does not).
9. [Web platform APIs](09-web-apis.md) — the WinterTC minimum common Web API as globals: `fetch` / `Request` / `Response` / `Headers`, `URL`, `TextEncoder` / `TextDecoder`, events, `AbortController`, `Blob` / `FormData`, `crypto`, `WebAssembly`; deviations and WPT results.
10. [Lint and migrate](10-lint-migrate.md) — `zinc lint`: what cannot work or weighs too much on each target (requires, plugins, UI tiers, screen, asset budgets), the matrix of `--all-targets`; `zinc migrate`: the codemods that come with a language or API change.
11. [Bundling for QuickJS](11-quickjs-bundle.md) — `--engine quickjs` runs TS and TSX, `zinc bundle` makes one optimised JavaScript file (tree shaking, defines, minify, source map, bytecode) with the pinned esbuild, `zinc check --engine quickjs`.
12. [JavaScript engines](12-js-engines.md) — one program on QuickJS, JavaScriptCore, V8 or Hermes (`--engine`, `"engine"` in zinc.json), all bound through Node-API; engine packs downloaded and checked on first use, which one to pick, `--inspect`, bytecode at `zinc build`.
13. npm packages and the web — [the web target](../targets/web.md#npm-packages): `zinc add npm:<pkg>` and `zinc install` call your package manager (npm, pnpm, yarn, bun), `zinc dev --target web` pre-bundles packages like Vite, `@zinc/vite` builds a Zinc app with Vite; [the libraries run](../targets/web-libraries.md).

## The one-minute tour

```sh
zinc new game myapp                  # or cli | server | service | iot | iot-board | game-2d | canvas | 3d | desktop-app | dashboard | stage | eink | remarkable
cd myapp
zinc run                             # compiled to native on first run, cached after; --interp starts at once
zinc dev                             # hot reload on save, red box on a compile error, UI inspector on :9229
zinc test                            # the *.test.ts files of the project (--runner aot|quickjs|...)
zinc build --target aarch64-linux    # a Linux executable, cross built with the pinned zig
zinc export --target macos           # dist/<name>-<target>: one self-contained program + scripts
```
