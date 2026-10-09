# Engines, AOT/JIT, WebGL, Studio: research synthesis (2026-09-30)

Status: research only. Nothing here is implemented. Speedups and effort figures are estimates unless marked measured.
Details, sources and verified/inferred tags are in the five reports next to this file.

| Report | Question |
|---|---|
| [zinc-vm-aot.md](zinc-vm-aot.md) | Real AOT for the Zinc VM, interpreter/JIT quick wins |
| [quickjs-jit-aot.md](quickjs-jit-aot.md) | JIT tier and AOT mode for QuickJS |
| [mquickjs.md](mquickjs.md) | Adding mquickjs as an engine |
| [threejs-webgl.md](threejs-webgl.md) | Full Three.js / WebGL2 |
| [docker-free-studio.md](docker-free-studio.md) | No Docker, Arduino-like desktop app, browser mode |

## Conclusions

1. **Zinc VM AOT: ZBC4 -> C++ -> clang -O2** (`--emit-aot` in the runner, interpreter as fallback and oracle).
   Scalar prototype (measured): fib(32) 130 ms interp / 66 JIT / 31 AOT / 10 native; mandelbrot 350 / 80 / 21.8 / 22.
   Upper bound for numeric code only. Do the compiler/interpreter quick wins first (no register allocation or copy
   coalescing in `emit-bc.ts`; 32-byte `Ins`; heavy `CALL`; `std::find` per field access). Unify the recursion
   limit (JIT 1024 vs interpreter 16383). ~17-24 weeks for P0-P4 including iOS/OTA mixed mode.
2. **QuickJS: port `qjsc -A` (ivankra/quickjs-aot) onto quickjs-ng 0.17** (what Zinc vendors).
   Measured here: `-A` gives 1.4x fib, 2.2x mandelbrot, 1.14x objects vs its own interpreter; tail dispatch alone
   was neutral. First do the cheap wins: precompiled bytecode (the runner re-parses source at each start),
   `-O3`/LTO/PGO, and fix `Math.fround` emission for f32 (measured 2x on a loop). A real JIT (60-100 days, high
   risk, not iOS-legal) only after profiling a real Zinc UI app, which has not been done.
3. **mquickjs is a different language (strict ES5), not a lighter QuickJS.** Worth it for ESP32-class targets,
   not for Pi, rM or iOS. MVP 12-15 days, parity 32-45 days. Cheaper first step: an `engine: 'mquickjs'` option
   for `zinc:script` (~6-8 days). Not suitable for upstream Three.js.
4. **Three.js / WebGL2:** Zinc has no WebGL today. Needs a native WebGL2 core over GLES3 (ANGLE on macOS), QuickJS
   bindings generated from one IDL, a browser-host JS bundle, and `zinc:webgl`. `WebGLRenderer` needs 142 WebGL
   methods (r186.1). Three under QuickJS is ~14-30x slower than V8 on JS-side work (mock GL, order of magnitude),
   so QuickJS speed is the bottleneck, not the GL crossing. ~25-35 weeks. three-native is WebGL1-only and is
   reference reading, not a base.
5. **Docker-free:** `zig c++` cross-compiled `runtime/zrt.cpp` for aarch64/armhf/x86_64 linux, windows and aarch64
   macOS in ~1 s each (full link and SDL3 not tested). So linux/rpi/rmpp can drop Docker via `zig c++` + pinned
   sysroots. ESP-IDF stays a managed SDK; PS1/PS2 on mac/Windows and Apple targets off-Mac still need Docker/VM/Mac.
6. **Studio + browser:** Tauri shell over the Node CLI, `zinc toolchain install`, and bytecode upload to a
   pre-flashed VM core as the Arduino-like learner path. Browser tiers: A (compile to ZBC4 + Wasm VM, no install),
   B (Web Serial upload), C (cloud compile). ~30-40 person-weeks for Studio + Tier A, +12-20 for Tier B.
   "ZincStudio" already names the macOS box editor in `docs/studio.md`: pick another product name.

## Suggested order

1. Cheap wins (days): QuickJS bytecode precompile + fround fix + `-O3`/LTO; VM compiler quick wins; recursion-limit parity.
2. Profile a real Zinc UI app under `--engine quickjs` to decide JIT vs AOT vs typed AOT.
3. Zinc VM AOT (P1-P2) and QuickJS AOT on ng, in parallel with a 2-day mquickjs spike.
4. `zinc toolchain` (zig c++ first) and universal VM cores, which unlock Studio and browser Tier A/B.
5. WebGL2 core last: largest effort and it depends on QuickJS speed.

## Caveats

- No Zinc app was run under any AOT prototype; the VM AOT prototype is scalar-only.
- Interpreter/JIT numbers come from binaries built 2026-09-29, before the current dirty edits.
- Web-sourced claims (weval, LuaAOT, longbridge/quickjs-jit, gkurt) were not reproduced.
- Estimates are one strong developer, unvalidated.

## Addendum: JS engines, editor, Studio as a Zinc app, Carnet (same day)

| Report | Question |
|---|---|
| [js-engines.md](js-engines.md) | JavaScriptCore / V8 / LibJS as engines |
| [code-editor-lsp.md](code-editor-lsp.md) | Real code editor: multi-cursor, tree-sitter, LSP |
| [studio-as-zinc-app.md](studio-as-zinc-app.md) | IDE as a Zinc app instead of Tauri |
| [notion-block-editor-zinc.md](notion-block-editor-zinc.md) | Zinc-native version of Carnet (notion-block-editor) |

7. **JS engines:** extract a `zinc-js-engine` interface from `runtime/vm/quickjs.cpp`; support QuickJS-ng (baseline,
   iOS, Pi 3B+, rM) and JavaScriptCore on macOS (JSCOnly for aarch64 Linux experimental); V8 only if Windows needs it;
   LibJS not viable now. Measured (single runs, JS-side only): Three r186 mock GL 500 cubes 13.2 ms/frame QuickJS-ng,
   0.54 JSC, 0.81 V8; no-JIT JSC/V8 still ~2x faster than QuickJS. This revises item 4: JSC removes the QuickJS speed
   bottleneck on macOS. Highest-value independent change: ABI v5 with borrowed typed-array views (4-6 days).
8. **Code editor:** today it is the engine `<textarea>` in code mode plus an extension API (single caret, whole-string
   undo snapshots, commit-only IME, no shaping). Plan: rope + range-set selection + ChangeSet transactions written in Zinc
   TS (`zinc:editor`), tree-sitter as a vendored native plugin, LSP client in Zinc TS over `zinc:process`, `zinc lsp`
   reusing `frontend.ts`. M1-M6 ~32-44 engineer-weeks. Several ABI gaps (non-blocking write, byte-safe I/O, PTY) unverified.
9. **Studio as a Zinc app: yes** (macOS/Linux first). `apps/studio` and `examples/zed-editor` already cover much of it;
   v0 ~8-10 pw, credible cross-platform IDE ~40-60 pw. Gates: Windows, accessibility, editor quality. Keep the Node CLI
   as a JSON-RPC child; self-hosting the compiler in QuickJS is optional and late. Rename to avoid the "ZincStudio" clash.
10. **Carnet (notion-block-editor):** its model is already headless and DOM-free (~3.5k lines, MIT, already ported to
    Swift and Rust/GPUI). Recommended: compile the core with Zinc, rewrite the view in Zinc JSX on a text engine shared
    with the code editor. Do not run its browser bundle on QuickJS. MVP ~20-28 weeks solo. Needs rich-text spans,
    shaping/segmentation, text geometry, IME preedit, rich clipboard first.

Shared critical path for 8, 9, 10: a native text engine (spans, shaping, segmentation, geometry, IME preedit).
Caveats: effort numbers are unvalidated; JSCOnly, V8 and LibJS were not built; `zinc check` was not run on Carnet's core.

## Addendum 2: platform management, tool belt, OS integration (same day)

| Report | Question |
|---|---|
| [platform-files-and-conditionals.md](platform-files-and-conditionals.md) | `foo.esp32.ts`, `Platform.select`, compile-time pruning |
| [toolbelt-build-pipeline.md](toolbelt-build-pipeline.md) | Metro/PocketJS-like pipeline, lint, ES5 lowering |
| [os-integration-widgets.md](os-integration-widgets.md) | Tray, menus, dialogs, notifications, widgets |

11. **Platform management:** `platformVariant()` (`frontend.ts:197-208`) and `zinc:platform` already exist, but constants are
    NOT compile-time today (verified: both branches type-checked and emitted; `docs/targets/capabilities.md` is wrong).
    Recommended: prune untaken branches in the frontend `getSourceFile` hook before TS type-check (whitespace blanking keeps
    positions), closed tag chain board > chip > target > family > native > default, `Platform.{is,has,select,...}`,
    `--portable` bytecode mode, `zinc check --all-targets`, `@requires` capability lint. ~28-38 days.
12. **Tool belt:** no Metro-style pipeline exists (`bundleJs` is a file copy). PocketJS = Babel + `Bun.build` IIFE with `define`,
    no ES5 lowering. Measured: minify cuts bytes 45% but QuickJS parse time barely changes (8.8 vs 8.1 ms), so
    bytecode precompile matters more than minify. ES5 lowering by generic tools fails on mquickjs (12/30 SWC, 9/30 Babel,
    14/30 TS semantic cases); mquickjs needs lowering inside `emit-js.ts` for Zinc code plus SWC + fix-up + polyfills for
    foreign JS. Suggested: esbuild (bundle/define), oxlint + Zinc rules, oxc-parser, tsgo as fast gate. M0-M5 ~25-34 days.
13. **OS integration:** none exists; SDL3 3.4 headers expose tray/menus/dialogs/drop/clipboard mime/theme/power/displays but
    not notifications, global shortcuts, deep links, keychain, native macOS menu. Proposed `zinc:desktop/*` (not `zinc:os`,
    taken) with capability names, `.sim.ts` twins, `zinc.json` permission manifest. Items 1-9 ~14-17 weeks (mac/Linux).
    OS widgets cannot be authored from Zinc; honest option is a data/layout descriptor rendered by generated native shells.

| [esp32-arduino-style-builds.md](esp32-arduino-style-builds.md) | Faster, visual, Docker-free ESP32 builds |
