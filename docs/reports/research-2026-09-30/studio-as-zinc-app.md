# Should the desktop IDE ("Studio") itself be a Zinc app? Coherence, gaps, plan

Date 2026-09-30. Read-only study of `/Users/mowmow/Lab/zinc` (dirty tree, nothing modified). Follows
[README.md](README.md) and [docker-free-studio.md](docker-free-studio.md), which proposed a Tauri 2 shell around the Node CLI.
Legend: **[V]** verified by reading the repo (file:line), **[W]** web / general knowledge of a third-party API, **[I]** my inference or estimate. Effort in person-weeks (pw), one engineer who knows the codebase, unvalidated.
Parallel studies cover the editor component and JS engines; this report only takes their questions as interfaces.

---------------------------------------------------------------------------------------------------------------------

## 0. Verdict

**Yes, it is coherent, and it is already half-done: build the IDE as a Zinc app (dogfooding), and drop Tauri.** [I, based on the [V] findings below]

1. Two Zinc apps of this exact shape exist today: `apps/studio` (2.9k LOC, `zinc:ui` + `zinc:process` + `zinc:remote` + `zinc:webview`, drives `compiler/bin/zinc.mjs`, streams build logs, previews a running app through the remote display, deploys over ssh; `docs/studio.md:6-7`, `apps/studio/src/runner.ts:1-8`) and `examples/zed-editor` (2.6k LOC: project tree, tabs, textarea-based editor with highlighting, fuzzy finder, command palette, `zinc check --json` diagnostics, terminal panel via `zinc:process`; `examples/zed-editor/README.md:1-8`). [V]
2. What the Tauri plan would give and Zinc does not is mostly the *web stack* (Monaco, an HTML docs renderer, WebSerial in the browser). What Zinc gives and Tauri does not: one runtime and one language for app, examples and IDE, ~1 MB-class binaries (hello 53-70 KiB, `docs/reports/qt-comparison.md:34`), pixel-identical rendering with golden tests, `zinc dev` hot reload of the IDE itself (`docs/dev-mode.md:8-9`), and the strongest possible proof of the platform. [V]
3. **But not for all phases and not for the browser tier.** Zinc has no Windows target, no accessibility, no IME preedit, no PTY, no serial, single window only. The honest position: **Studio v0 as a Zinc app now (macOS + Linux), Windows/a11y are the gating risks for a wide "Arduino IDE replacement" audience.** A web/PWA tier (browser mode, Tier A/B from the previous report) is a separate product surface that Zinc-native cannot serve, except by shipping the same UI as a Zinc `wasm` target (`targets/wasm/hal_web.cpp`, exists [V]) which is a research item.
4. **Self-hosting the compiler inside the app (v2) is not worth it as a goal by itself.** Keep the compiler as a child process (Node today; a bundled runtime, or later a native TS 7 `tsgo`-style binary) behind JSON-RPC. Running the TS 6 JS compiler inside QuickJS is possible in principle but is 10-30x slower and needs a virtual host; do it only if "no Node install" becomes a hard requirement and only after the QuickJS bytecode/AOT work. [I]
5. **Name:** `ZincStudio` is the box editor (`docs/studio.md:1`, `apps/studio/README.md:1`). Recommendation: keep `apps/studio` as "ZincStudio Flow" (or fold it in as a view) and call the IDE something else ("Zinc IDE", "Zinc Bench"...). [I]

When: v0 in 8-10 pw from today because both codebases exist; the platform work that makes it good (multi-window, dialogs, PTY, serial, a11y, Windows) is 30-55 pw and is *worth doing anyway* for every desktop Zinc app.

---------------------------------------------------------------------------------------------------------------------

## 1. What a Zinc app can do on the desktop today (verified inventory)

| Area | State | Evidence |
|---|---|---|
| Windowing | One SDL3 window (`static SDL_Window* win`, `SDL_CreateWindowAndRenderer` once, resizable, HIGH_PIXEL_DENSITY), fullscreen toggle (F11), kiosk, aspect-ratio lock. **No multi-window**, no menus, no dialogs, no drag-and-drop of files, no tray, no window-state persistence API. | `targets/macos/hal_sdl.cpp:11,110-117,292`; grep for `SDL_EVENT_DROP`, `ShowOpen`, `Tray`, `Menu` in that file: none [V] |
| DPI | Pixel density is read and coordinates are mapped (`SDL_GetWindowPixelDensity`, `RenderCoordinatesFromWindow`); HiDPI Retina benchmarks in zed-editor (2560x1600, 111-119 fps). | `hal_sdl.cpp:33-47,134`; `examples/zed-editor/README.md:94-104` [V] |
| Input | Keys with modifiers, typed text, mouse buttons, wheel with resampled precise scrolling, touch, cursors (10 shapes), clipboard (text only), text-input area for the IME candidate window. | `hal_sdl.cpp:180-260,415-458`; `docs/ui.md:259-269` [V] |
| IME | Committed text works, **composition preview (preedit) not done**. | `docs/ui.md:269` [V] |
| Text | Own TTF parser, Latin-centric: no kerning, bidi, font fallback, IME preedit. | `docs/reports/qt-comparison.md:26` [V] |
| Accessibility | **None** (Qt report calls it "a blocker for iOS / the EU"; an `a11y` node record is a P1 plan item, L effort). | `docs/reports/qt-comparison.md:27,85-87` [V] |
| Filesystem | `zinc:fs`: read/write text+bytes, list, `readDir`, stat/lstat, mkdir -p, rename, copy, realpath, mkdtemp, symlinks, chmod, **`watch(path, cb)`** (fs events on the event loop). Synchronous, POSIX (`<sys/stat.h>`, `<unistd.h>`). | `lib/modules.d.ts:47-93`, `runtime/mod/fs.cpp:13-14` [V] |
| Config / persistence | `zinc:storage` (key/value in `./zinc.storage` or `ZINC_STORAGE`), `zinc:os` (`homedir`, `tmpdir`, `hostname`, cpus, network interfaces). No per-OS config-dir convention. | `lib/modules.d.ts:96-101,214-242`, `docs/studio.md:108-109` [V] |
| Child processes | `zinc:process`: `posix_spawnp` + 3 pipes, line/chunk streaming, stdin write, kill, exit code, cwd/env, 32 concurrent. **Pipes only: no PTY, no terminal size, no job control.** No Windows (posix_spawn). | `docs/plugins/process.md:1-70` [V]; grep `openpty|forkpty|posix_openpt` over `plugins runtime targets`: no hit [V] |
| Networking | `zinc:net` (`fetch`, `serve`), `zinc:socket` (TCP/Unix/UDP/DNS, **WebSocket client+server RFC 6455**), `zinc:mqtt`, `zinc:osc`. LAN discovery is Zinc's own UDP multicast beacon (`ZINC1...` on 239.255.90.1:7701), **not mDNS/Bonjour**. sha256 is pure-Zinc in `lib/std/web.ts:1386`; no Ed25519/minisign seen. | `docs/plugins/socket.md:3-23`, `docs/plugins/remote.md:81`, `lib/std/web.ts:1349-1386` [V] |
| Serial / USB | **Nothing native.** Flash = host `esptool` spawned (`flash.ts`), monitor = `stty raw` + read, port discovery by regex on `/dev/cu.usbmodem*|ttyACM*|ttyUSB*`, Unix only. A Zinc app can only spawn `zinc flash` / `zinc monitor`. | `docs/boards.md:86-97`, `docker-free-studio.md` §1.3 [V] |
| Embedded web view | `zinc:webview`: **macOS only** (WKWebView over the SDL window, `zinc://` assets, `invoke`/`postMessage` bridge); Linux WebKitGTK, Windows WebView2, wasm marked "not supported yet". | `docs/plugins/webview.md:5-12` [V] |
| Embedded JS | `zinc:script`: QuickJS-ng v0.17.0 sandbox (no files/network/timers unless host exposes), ~1 MB added, macOS/Linux/rpi/rmpp. | `docs/plugins/script.md:1-30` [V] |
| Code editor | Engine textarea + code-editor extensions (`setMarks`, `setEditColors`, `setHighlightAt` per-line state, `editView`, `scrollEditTo`); zed-editor adds tabs, minimap, find, diagnostics. **One caret, no split panes, no go-to-definition** (highlighting is lexical), no LSP client. A 5006-line file: 4-5 ms per keystroke. | `docs/ui.md:51-60,269`, `examples/zed-editor/README.md:80-113` [V] |
| Terminal | Output panel with ANSI colours through `zinc:process`; no input, no PTY, no VT emulator. | `examples/zed-editor/README.md:110-112` [V] |
| Tabs, palette, tree, overlays | Kit `Tabs`, `Dialog`, `Popover`, `DropdownMenu`, `Tooltip`, toast, focus scopes and layers; zed-editor has its own file tree (lazy, keyboard nav), finder, palette, resizable panel. No docking / general split pane component. | `docs/ui-kit.md:85-98`, `docs/ui.md:137-175`, `examples/zed-editor/README.md:60-70` [V] |
| Hot reload / dev | `zinc dev`: host (window, heap) stays, program `.so` reloaded, ~0.5-1.2 s save-to-frame, red box, CDP inspector. macOS and Linux hosts. State is **not** preserved (full reload, not Fast Refresh). | `docs/dev-mode.md:8-42,54-56` [V] |
| Targets for the app itself | `macos`, `linux` (window on hosts; for Linux the guide shows docker `zinc/sdk-linux` and fbdev/GL plugins, and zed-editor says "macOS and Linux (SDL3 window)"). **No Windows target/HAL** (`HOSTS = macos, linux, rpi1, sim, rmpp`, `native.ts:15`; `hal_posix.cpp` `SIGBUS`). | `docker-free-studio.md` §1.1, `docs/guide/01-getting-started.md:97-98`, zed README:19 [V] |
| Distribution | macOS `.app` bundle + `.icns` + ad-hoc/Developer-ID `codesign` with hardened runtime (notarization is manual `xcrun notarytool`); Linux `.desktop` + icon + systemd unit; export = single executable with embedded assets. **No DMG, no MSI/NSIS, no AppImage/deb, no updater.** | `docs/guide/07-distribution.md:39-98`, `compiler/src/tools.ts:185-198,299` [V] |
| Notifications | None (no OS notifications; kit has in-app toast). Could spawn `osascript` / `notify-send`. | grep: none [V/I] |

Existing Studio-like code (assets to reuse, not just references):

- `apps/studio/src/runner.ts` already calls `node zinc.mjs plugins`, build, run, deploy through `zinc:process` and streams logs with levels (`ZINC_LOG_FORMAT=json`). `src/devices.ts` does `zinc:remote` discovery + ssh device list. `docs.ts` + `zinc:webview` renders docs. [V]
- `examples/zed-editor/src/app/tools.ts` (159 lines) does `zinc check --json` diagnostics and the `zinc run` terminal. [V]
- `examples/hero` is the UI-kit showcase (10 screens, router, prefs, commands, overlays) proving the kit scales to app-size UI; `docs/ui-kit.md` lists Card, Dialog, Tabs, Switch, Slider, Progress, Alert... [V]

---------------------------------------------------------------------------------------------------------------------

## 2. Comparison with alternatives

| | Zinc app (proposed) | Tauri 2 (prior report) | Electron | Zed / GPUI | Lapce / Floem | Sublime | Flutter desktop | Qt |
|---|---|---|---|---|---|---|---|---|
| Language of UI | TS/TSX typed subset, Solid or React model | web (any) + Rust | web + Node | Rust | Rust | C++ (closed) | Dart | C++/QML |
| Editor component | own, textarea-based, limited (one caret) | Monaco/CodeMirror, free | Monaco, free | GPUI editor (built in) | Floem editor, Lapce | built in | package `re_editor` etc. | QScintilla / KTextEditor |
| Terminal | none (needs PTY + VT) | xterm.js + Rust pty crate | xterm.js + node-pty | built in | built in | plugin | packages | QTermWidget |
| Webview/docs render | macOS only | native (WebKitGTK is weak) | Chromium | none / own markdown | own | none | webview plugin | QtWebEngine (heavy) |
| Multi-window / menus / dialogs | no / no / no | yes | yes | yes | partial | yes | yes (multi-window experimental) | yes |
| A11y / IME | none / commit only | webview does it | Chromium does it | partial [W, unverified] | poor [W, unverified] | native | good | best |
| Windows | **no** | yes | yes | yes (2025+ [W, unverified]) | yes | yes | yes | yes |
| Size | ~1-5 MB [I from qt-comparison numbers] | 5-15 MB + engine | 100-200 MB | ~50-100 MB [I] | ~30-60 MB [I] | ~20 MB | ~20 MB | 10s of MB |
| Dogfooding value | max | none | none | n/a | n/a | n/a | n/a | n/a |
| Hot reload | `zinc dev` | web HMR | web HMR | no | no | no | best (stateful) | qmlscene |

Verdict of the comparison [I]: Zinc loses on the boring OS-integration checklist (a11y, IME, menus, multi-window, Windows, terminal) and on editor depth; it wins on size, determinism, and coherence. Zed/GPUI and Lapce/Floem are the closest philosophy (GPU-drawn native editor) and both had to build the same missing pieces; that is the price list for the gap table below.

**Dogfooding buys**: one runtime and one language (any Studio feature is a reusable kit component for users), tiny binary and instant startup (3.8 ms hello), uniform pixels across mac/linux (goldens, replay tapes catch IDE regressions), `zinc dev` hot reload of the IDE, and every platform bug the IDE hits gets fixed for every app. Studio is the best possible "real app" for the never-done profiling step (README.md caveat 2: "profile a real Zinc UI app").
**Dogfooding costs**: a11y (legal risk in EU for a product, `qt-comparison.md:85`), IME preedit and non-Latin text (Chinese/Japanese comments in source), no native menu bar, no Windows (the Arduino audience is heavily Windows and Chromebook), self-built terminal and richer editor, no webview outside macOS (docs/markdown), and a single-window HAL.

### 2.1 Hybrid: Zinc UI + Node CLI as engine, vs compiler inside the Zinc JS engine

Node-only surface of the compiler (`compiler/src`, 10,273 lines, 27 files): [V]

- `node:fs` + `node:path` imports in `abi, capabilities, emit-cpp, frontend, jsx, plugins, resources, emit-js, native, tools, cli, engines` (`grep -c "from 'node:'"`); `node:zlib` in `resources.ts:6`; `node:url` in `frontend.ts:6`; `hir, sema, infer, emit-bc` import only `node:path` (polyfillable). [V]
- **Process side effects concentrated in `cli.ts`** (107 `process.`/`readFileSync`... hits), `tools.ts` (28, includes `spawnSync('codesign')`, `tools.ts:197`), `engines.ts` (29), `emit-js.ts` (11), `resources.ts` (7): this is the driver layer (cmake, docker, esptool, codesign), not the compiler core. [V]
- `frontend.ts:133-150` builds a `ts.createCompilerHost` over `ts.sys` and already has a `virtual` file map (`:145`); `ZINC_ROOT` via `import.meta.url` (`:14`). `emit-bc.ts` returns bytes; `emit-cpp.ts` returns strings. [V, from prior report; unchanged]
- TS 6 is the `@typescript/typescript6` JS package (`node_modules/@typescript/typescript6/lib/typescript.js` is a shim `require("@typescript/old")`); the dev dependency `typescript@7.0.2` is the native (Go) port and `frontend.ts:1-2` says a switch to the TS 7.1 API touches that file only. [V]

So the **compiler core is portable JS** (`frontend/jsx/sema/hir/infer/emit-*`) behind ~10 file-touching functions; a Node-free host needs: a virtual FS (embed `lib/`, plugins index), `zlib` (only `resources.ts`, font/image baking), and replacing `process`. **But** three showstoppers for "run it in the Zinc app's own QuickJS": (a) it is not Zinc-subset TS (it uses the full TS compiler API, regexes, dynamic objects) so Zinc cannot AOT-compile it; it must run on a JS engine; (b) the TS JS library is ~10 MB of JS and the compile of a UI app takes ~400 ms warm in V8 (`docs/dev-mode.md:47`); the prior report measured QuickJS about 14-30x slower than V8 on Three.js's JS-side work (`README.md` conclusion 4) so a UI app compile would be ~6-12 s, plus a multi-hundred-ms cold load unless the bytecode is precompiled (the runner still re-parses source at each start, `README.md` conclusion 2) [I]; (c) `zinc:script` is a sandbox with a 16 MiB default memory limit, no files, no timers (`docs/plugins/script.md:5-8,50`), so the host would have to expose a whole file API and raise limits. Then C++/CMake/docker/esptool still have to be spawned anyway, so Node is *not* eliminated from any native build path: it only disappears from the ZBC4/sim path.

| Option | Cost | Buys | When |
|---|---|---|---|
| A. Node CLI child process, JSON-RPC over stdio (keep warm daemon) | v0: 0 for spawn-per-command (already in `apps/studio`), 2-3 pw for a `zinc serve` daemon with structured progress | works today, gets TS 7 later, no perf loss, isolates crashes | v0, v1 |
| B. Bundled engine (Node SEA / `bun build --compile` / private Node, 50-100 MB) instead of "user installs Node >= 23.6" | 2-3 pw + `ZINC_ROOT` layout | no Node prerequisite | before public release |
| C. Compiler in QuickJS inside Studio | 8-12 pw + QuickJS perf work (bytecode precompile, AOT) + raising sandbox limits | Node-free ZBC4/sim loop, same code as browser tier A | only if browser-Tier-A port (P6 in prior report) is done anyway; then Studio gets it nearly free [I] |
| D. TS 7 native `tsgo` sidecar + a Zinc-side checker | unknown, depends on TS 7.1 JS API story | fastest type check/LSP | watch, not plan |

Recommendation: **A then B; C only as a by-product of the browser port.** [I]

### 2.2 Bootstrap / self-hosting story

Studio is *built by* the Zinc compiler (`zinc build apps/ide`) and *drives* the same compiler as a child process: this is normal dogfooding, not self-hosting. True self-hosting (the compiler compiled by itself) is out of scope: the compiler needs the full TS API and Node. What is real: (1) a released Studio bundles the compiler + runtime sources + Node/engine, and builds user apps by spawning it; (2) Studio can rebuild itself with `zinc dev` (edit Studio in Studio, hot reload keeps the window: `docs/dev-mode.md:31-40`); (3) CI builds Studio with a pinned previous Zinc release so a compiler regression cannot brick the release pipeline [I]. Chicken-and-egg risk: a compiler bug that breaks Studio's own build also blocks the tool used to fix it; mitigation is that the CLI stays usable without Studio (it always is) and Studio is built by the pinned release. [I]

---------------------------------------------------------------------------------------------------------------------

## 3. Gap list (ranked)

Ranked by "blocks a credible v1 IDE" first, then by reuse value for all Zinc apps. Effort: pw. Numbers are [I]; SDL3 API availability [W] from general knowledge of SDL 3.2 (`SDL_ShowOpenFileDialog`, `SDL_ShowOpenFolderDialog`, `SDL_ShowSaveFileDialog`, `SDL_CreateTray`, `SDL_EVENT_DROP_FILE`, `SDL_EVENT_TEXT_EDITING`) that should be confirmed against the vendored SDL3 version before scheduling.

| # | Feature | Today | Work | pw |
|---|---|---|---|---|
| 1 | **Native file/folder dialogs, drag-and-drop files, message box** | none | `hal_dialog_*`, `hal_drop_*` weak hooks + `zinc:gfx`/`zinc:ui` API, SDL3 dialog + drop events (async, delivered on event loop); fallback: in-app file picker built from `zinc:fs` (zed-editor tree) | 1.5 |
| 2 | **Editor v1 depth** (multi-caret, split editors, incremental tokenizer or tree-sitter, folding, go-to-def hooks, IME preedit, bracket/auto-close, large files) | one caret, lexical per-line | belongs to the parallel editor study; must land in `zinc:ui` engine (textarea extensions) not just the app | 8-14 |
| 3 | **LSP client** (JSON-RPC Content-Length framing over `zinc:process` stdio; diagnostics, hover, completion, definition, rename) against the TS language service | only `zinc check --json` on save | `lib/std` JSON-RPC + a `zinc lsp` stdio server wrapping the TS language service (the compiler already exposes LSP-shaped diagnostics `cli.ts:947` and a `zinc-ts-plugin` at `lib/editor/zinc-ts-plugin`) | 4-6 |
| 4 | **`zinc:serial`** (enumerate, open, set baud, read/write, DTR/RTS, VID/PID; native USB-JTAG reset) + bundled esptool/espflash driver | spawn esptool, `stty` monitor, regex ports | termios (mac/linux), Win32 COMM later; IOKit/udev/SetupAPI for VID/PID. v0 can shell out to `zinc flash/monitor` | 3-4 |
| 5 | **PTY + terminal emulator** (`zinc:process` PTY mode with winsize/resize; VT100/xterm parser, cell grid, scrollback, selection, colours, cursor keys, paste) | pipes + ANSI colour output only | `forkpty` / ConPTY; VT parser + grid component in Zinc | 6-9 (PTY 2-3, emulator 4-6). Optional in v0-v1: keep a read-only log + a "run command" input |
| 6 | **Multi-window** (tear-off, detached preview, dialogs as windows) | HAL has one static window and one renderer | HAL multiplexing + per-window surface/input in `gfx`/`ui` singletons: invasive | 4-6. Not required v1 (use in-app panes and the separate preview app window that already works via `macos`/`remote` targets) |
| 7 | **Windows host** (runtime + HAL + `zinc:fs/process/socket/os`, CMake/zig generation, path/CRLF/`deploy.sh`, `flash.ts` `COMx`) | none | prior report P3 puts host support at 4-6 pw for sim + toolchain; the *runtime* itself (`fs.cpp` POSIX, `posix_spawn`, `dlopen` dev mode, `SIGBUS` handlers, sockets) plus SDL3 HAL and an MSVC/mingw/zig path is larger | 10-14 |
| 8 | **Accessibility bridge** (`a11y` node record; NSAccessibility, then UIA, AT-SPI; `ui.a11yDump()` goldens) | none | `qt-comparison.md:85-87` calls it L; realistic for a full IDE (text editor role, tree, tabs, lists) | 10-16 (macOS first 5-6) |
| 9 | **Menus** (native macOS menu bar; other OS in-app) | none; kit `DropdownMenu` exists | ObjC menu bridge (precedent: `plugins/webview/src/webview.mm`) + palette already covers commands; ship an in-app menu bar first | 0.5 (in-app) / 2 (macOS native) |
| 10 | **Markdown/docs viewer** (headings, code, tables, images, links) or webview beyond macOS | webview macOS only | a `Markdown` kit component (2-3 pw) is enough for docs and README; WebKitGTK/WebView2 backends are 3+3 pw and reintroduce the platform matrix | 2.5 |
| 11 | **Split panes / dock / resizable panels / persistent layout** | panel resize in zed-editor only, kit `Tabs` | kit `SplitPane`, dock model (tabs draggable between groups), layout in `zinc:storage` | 2-3 |
| 12 | **Settings, keymaps, themes** (JSON user settings, keybinding editor, per-OS config dir, theme switching incl. OS dark mode) | `zinc:storage` + zed themes | `lib/std` config dir helper, keymap layer (kit-v2 plans keymaps, `docs/reports/kit-v2-plan.md`) | 2 |
| 13 | **Auto-update + signature verification** (Ed25519/minisign in Zinc or native, download, atomic replace, restart) | none; only sha256 in `web.ts:1386` | `zinc:crypto` Ed25519 verify (small C impl), updater service in Zinc, per-OS replace/relaunch | 2-3 |
| 14 | **Packaging/signing per OS** (DMG, notarize automation, MSI/NSIS + Authenticode, AppImage/deb) | mac `.app` + codesign only; notarize manual | scripts + CI, no runtime change | 3-4 (mac 1, linux 1, windows 2 after #7) |
| 15 | **Non-Latin text/IME preedit/bidi/font fallback** | Latin-centric | HarfBuzz-class shaping is far out (Qt report); minimal: preedit + CJK fallback font | 3-4 (minimal) |
| 16 | **OS notifications, tray, open-in-Finder/URL handlers, single-instance** | none | spawn `osascript`/`notify-send` (0.5), SDL tray (0.5), single-instance socket (0.5) | 1.5 |
| 17 | **mDNS / DNS-SD discovery** of Pi and rmpp (rather than Zinc's own multicast beacon), ssh integration (agent, known-hosts) | UDP beacon only; ssh via spawn | small mDNS client in `zinc:socket` | 1.5-2 |
| 18 | **Async/large-file I/O and background jobs** (fs is synchronous; project indexing, search-in-files) | sync fs on the event loop | worker threads exist (`threads: true`) but no worker API for user code; `zinc:process` `rg` is the cheap answer | 1-3 |
| 19 | **State-preserving hot reload** (Fast-Refresh-like) for IDE dev | full reload | optional | 3-5 |

Windows (#7) and a11y (#8) are the two items that decide whether Studio can be the *public* default IDE; #1, #3, #4 and #11 decide whether it is a *good* IDE; #5 and #6 are polish.

---------------------------------------------------------------------------------------------------------------------

## 4. Phased plan

Phases share code with the prior report's toolchain manager (P1) and with the engine/AOT items; only Studio-specific work is counted.

**Phase 0: spike, 1 pw.** Fork `examples/zed-editor` + `apps/studio` panes into one app skeleton `apps/ide` (not in this report's scope to create). Decide name. Run `zinc dev` on it. Measure with the real app: this is also the first profile of a real Zinc UI app under `--engine quickjs` (README.md order item 2).

**Studio v0: "Zinc app that shells out to the Node CLI and shows the sim preview", 8-10 pw (macOS + Linux).**
- Project open/recent (dialog #1 fallback = in-app picker), tree, tabs, existing editor, diagnostics via `zinc check --json` (all reuse zed-editor).
- Build / Run / Stop / Deploy / Monitor panels via `zinc:process` (reuse `apps/studio/src/runner.ts`); structured progress (`--json`) added to the CLI (+1 pw).
- Preview: reuse the remote-display preview (`zinc:remote`, port 7711) for native, and Node sim for headless logs (`apps/studio` Robot view; note the sim has *no renderer*, `docker-free-studio.md` §1.3, so pixel preview = native build with remote display).
- Toolchain panel and `zinc doctor` UI on top of the future `zinc toolchain` (prior report P1).
- Flash/monitor by spawning `zinc flash/monitor` (no #4 yet); docs via `Markdown` component (#10).
- Packaging: macOS signed `.app` + DMG, Linux AppImage/deb; **no Windows**.
- Exit criterion: open an example, edit, build, preview, deploy to the Pi 3B+, flash an ESP32-S3 Matrix, all without leaving the app.

**v1: editor + LSP + serial + PTY, +18-26 pw** (parallel study on editor and JS engines feeds #2 and the engine choice).
- #2 editor depth, #3 LSP, #11 panes/dock, #12 settings/keymaps, #4 `zinc:serial` (+ esptool/espflash bundled), #5 terminal (PTY first, VT emulator second), #13 auto-update, #14 packaging with notarize CI.
- Board/device manager UI (USB VID/PID, ssh/mDNS #17), project templates from `boards/*.json`.
- **Windows decision gate**: start #7 in parallel (10-14 pw); Studio for Windows ships when the runtime port and packaging pass conformance.
- a11y macOS bridge (#8) in the same window if a public/EU release is planned.

**v2: self-hosted compiler (optional), +8-12 pw.** Only after the browser port of the compiler front end (prior report P6) exists: run frontend + emit-bc/emit-js in QuickJS inside Studio for the Node-free ZBC4/sim loop; native builds still spawn the toolchain. Also state-preserving hot reload (#19) and multi-window (#6) here. Precondition: QuickJS bytecode precompile and AOT work landed (`quickjs-jit-aot.md`), otherwise the compile latency is a UX regression. [I]

Total to a credible cross-platform IDE: roughly 40-60 pw including Windows and a11y; **8-10 pw to the macOS/Linux v0** that already reads as an Arduino-IDE-like tool. Compare with the prior Tauri plan (Studio v0 8-12 pw, `docker-free-studio.md` §7 P5): same v0 cost, but the Zinc plan's v1 investments are reusable by every Zinc app while Tauri's are not, and its size stays an order of magnitude smaller. [I]

### Packaging, signing, updates per OS

| OS | Package | Signing | Update | Status |
|---|---|---|---|---|
| macOS (arm64, x64) | `.app` (exists) + DMG | Developer ID + hardened runtime (exists via `ZINC_SIGN_IDENTITY`, `docs/guide/07-distribution.md:83-98`) + `notarytool` + staple (manual today; script it) | Zinc-side updater (#13); or Sparkle-like manual | partially done [V] |
| Linux (x64, arm64) | AppImage (+ deb/rpm/flatpak later) | detached minisign signature | same updater (AppImage self-replace) | `.desktop` + export exist; no AppImage [V]; needs an SDL3 dependency policy (bundle SDL3 or static) [I] |
| Windows (x64) | MSI or NSIS installer | Authenticode / Azure Trusted Signing (certificate procurement, [I] ~100-600 USD/yr) | same updater | blocked by #7 |
| Toolchains/engine | content-addressed cache, minisign index | see prior report §3 | `zinc toolchain` | not started |

Note the Apple SDK licence point from the prior report still applies: build macOS Studio on macOS CI.

---------------------------------------------------------------------------------------------------------------------

## 5. Risks

1. **Windows** (#7): a Studio without Windows is a hard sell for education (Arduino audience). Mitigation: keep the browser Tier A/B (prior report) as the Windows/Chromebook path, or run Tauri/Electron *only* for that audience later; do not block macOS/Linux v0 on it. High.
2. **Accessibility / EU regulation** (#8): `qt-comparison.md:27` itself flags it as a blocker; an IDE for blind or motor-impaired users is unusable. Mitigation: macOS bridge early, publish as "not accessible yet" for v0. High for a public product, low for an internal/dev-tool release.
3. **Editor quality**: users compare it to VS Code/Zed; one caret, lexical highlighting, no LSP is not enough. The parallel editor study must be the critical path. High.
4. **Text/IME**: no preedit and Latin-centric shaping will hurt CJK users at once. Medium.
5. **Node prerequisite / engine packaging**: v0 requires Node >= 23.6, CMake, a C++ compiler (`docker-free-studio.md` §1.1); a "download and run" story needs option B and the toolchain manager. Medium.
6. **Perf of the compiler in-app (v2)**: QuickJS 10-30x slower than V8 [I]. Medium; gated by measurement.
7. **Platform churn while dogfooding**: the tree is dirty (large uncommitted UI/gfx/compiler changes, `git status`), the UI ABI moves; Studio breakage tracks it. Mitigation: pixel goldens + `apps/studio/test.sh`-style headless checks, `ZINC_DEMO` scenes as in zed-editor. Low-medium.
8. **Single-window HAL** (#6): dialogs, floating preview, detachable panels are compromised; in-app layers cover most cases. Low-medium.
9. **Supply-chain / untrusted projects**: same as the prior report: building a downloaded project runs arbitrary code (`docs/studio.md:106-107`); add a Workspace-Trust prompt; `zinc:process` warns to never build command lines from untrusted input (`docs/plugins/process.md:56-70`). Medium.
10. **Scope**: the Studio can become a second product competing with the platform for the same engineer-weeks. Mitigation: only build platform features that also serve non-IDE apps, and time-box v0.

## 6. What I did not verify

- Did not run `apps/studio` or `zed-editor` (binaries exist under their `build/`), nor build on Linux; whether the Linux SDL3 HAL path is in daily use is [I] from README statements.
- SDL3 API availability and the vendored SDL3 version [W/I].
- QuickJS speed for the TS compiler and the exact size of `typescript.js` (the shim points to `@typescript/old`; the real file was not measured); effort figures are estimates.
- Zed/GPUI, Lapce, Sublime, Flutter, Qt columns are from general knowledge, not re-researched in this session [W/I, unverified].

## 7. Repo references

`apps/studio/{README.md,src/runner.ts,src/devices.ts,src/docs.ts}`, `docs/studio.md`, `examples/zed-editor/README.md`, `examples/zed-editor/src/app/tools.ts`, `examples/hero/`, `docs/ui.md` (:51-60, :259-269), `docs/ui-kit.md`, `docs/dev-mode.md`, `docs/plugins/{process,webview,socket,script,remote}.md`, `docs/guide/07-distribution.md`, `docs/boards.md:86-97`, `docs/reports/qt-comparison.md`, `targets/macos/hal_sdl.cpp`, `targets/capabilities.json`, `runtime/mod/fs.cpp`, `lib/modules.d.ts`, `lib/std/web.ts:1349-1386`, `compiler/src/{frontend,cli,tools,flash,resources,engines}.ts`, `compiler/src/tools.ts:185-198`, `package.json`.
