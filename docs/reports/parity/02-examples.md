# Parity audit 02: example apps on the new engine (unchanged sources)

Date: 2026-10-07. Engine: `next/build/zinc` (M3/M4 state, see `next/RESUME.md`). Method: every `main*.ts[x]` under `examples/` was run with
`ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZN_TRAP_TRACE=1 timeout 60 build/zinc run ../examples/<entry>` (cwd `next/`; the video examples
also from their own directory because they open `media/...` relative to the cwd). The first blocker is the exact message of that run. The "likely further
blockers" were found by running a scratch copy of the tree (`/tmp/parity/ex`, sources patched one blocker at a time, stub plugins for the missing
`zinc:*` modules, a plugin manifest with an `entry`) and reading the next diagnostic; items marked (static) come from reading only.
Minimal reproductions: `/tmp/parity/r/*.ts` (one per root cause, quoted below as `rNN`). Scripts: `/tmp/parity/run2.sh`, `/tmp/parity/try.sh`.

"OK" means exit 0 after 3 headless frames, no pixel comparison (only `hero`, `remarkable/*` have regression goldens in `next/tests/golden/examples`).
"OK (fake)" means it runs, but a sim written for the old Node oracle or for this engine stands in for the native part (no real decode/render).

## Result in numbers

- 63 app entries (+ `zed-editor` demo.ts/selftest.ts and 2 files of `testing/tests`, which are not apps).
- 27 OK (25 in the `next/` cwd run, `video/bounce` and `video/quad` from their own directory), 36 not OK.
- Of the 36: 4 compile only after a checker-crash fix, 2 are runtime panics (native engine missing: `maps/explorer`, `maps/svg-gallery`), 1 is a checker segfault family (zed-editor, badge), the rest are compile errors.
- Distinct root causes: 24 (section b). 8 of them are language/checker gaps found in tiny repros; 7 are missing host modules; 9 need real native code.
- Cross-cutting: `zinc.json` is not read at all by `zinc run` (window size comes from `ZINC_SIZE`; `growDrawCommands`, `requires`, plugin options such as `3d.scale` are ignored): see RC21.

## (a) Table

| Example entry | Status | First blocker | Likely further blockers |
|---|---|---|---|
| 3d/cubes/src/main.ts | compile error | `plugins/3d/index.ts:222:14 Z0001 Unexpected token: 'enum'` (`export const enum`, r01) | `plugins/3d/native/render3d.sim.ts:21:16 Z0107` (sim is TS beyond the subset); `index.ts:270 Z0104 expected 1, got 5` (sim object literal typed instead of `Spec`, r16); `index.ts:74 Z0103 u32[] to f64[]`; then the sim draws nothing (needs host renderer, RC15a); `zinc.json` `3d.scale` ignored |
| 3d/model/src/main.ts | compile error | same as 3d/cubes | same; glTF/OBJ asset loading goes through the same native |
| boards/esp32-2432s022/src/main.tsx | compile error | `src/pages/System.tsx:30:18 Z0002 Expected ')'` (`(f): (() => string) => (): string => ...`, r02) | `src/app/bench.ts:15:58 Z0103 f64[] to i32[]` (`createSignal<i32[]>([...])`, r12) then (static) the ESP32-only pages (system, wifi) |
| boards/esp32-2432s022-hello/src/main.ts | OK | | |
| boards/s3-matrix/dice/src/main.ts | OK | | imu emulated (arrows/WASD) |
| boards/s3-matrix/level/src/main.ts | OK (warning) | `zinc:gfx: the draw command pool is full (ZRT_MAX_DRAW_CMDS)`: draws dropped | `growDrawCommands` of zinc.json not honoured (RC21) |
| boards/s3-matrix/text-scroller/src/main.ts | compile error | `src/main.ts:5:1 Z0119 Cannot find module: 'zinc:pixelfont'` (`plugins/pixelfont/plugin.json` has no `entry`, r17) | none (OK with a manifest entry) |
| boards/s3-matrix/tilt-sand/src/main.ts | OK | | imu emulated |
| boards/scrollphat/badge/src/main.ts | compile error + SEGFAULT | `main.ts:5:1 Z0119 'zinc:pixelfont'`; with that fixed `check` crashes (exit 139, `Checker::expr0`) on `src/ip.ts` (`run` is not exported by `zinc:process`, r14d) | `zinc:process` API (`run`, `Result`), then `await` as a call argument if present |
| boards/scrollphat/cpu-graph/src/main.ts | compile error | `main.ts:5:1 Z0119 'zinc:pixelfont'` | none (OK with the manifest entry) |
| boards/scrollphat/snake/src/main.ts | compile error | `main.ts:5:1 Z0119 'zinc:pixelfont'`; then `src/snake.ts:77:28 and :108:44 Z0005 non-null assertions` (`this.body.pop()!`, r04) | none after `!` |
| bouncing-ball/src/main.ts | OK | | `growDrawCommands` not read |
| breakout/src/main.ts | OK | | |
| camera/bench/src/main.ts | compile error | `plugins/gphoto2/index.ts:62:79 Z0005 'await' or 'yield' in this statement` (`parseInt(await ...)`, r05) | `plugins/gphoto2/native/gphoto2.sim.ts:18..44 Z0005/Z0107/Z0112` (sim uses `find`, `Promise` value, nullable tuples); `index.ts:29,40 Z0005 this expression (node kind 69)` (`for (const f of records(await G.detect()))`); `index.ts:54,59 Z0109 type argument 'T'`; real camera needs libgphoto2 (RC15e) |
| camera/cli/src/main.ts | compile error | `src/main.ts:25:3, 37:3, 52:3 Z0005 'await' in this statement` (`console.log('x', await camera.open(...))`) plus the gphoto2 one | same as camera/bench |
| camera/remote/src/main.tsx | compile error | `plugins/gphoto2/index.ts:62:79 Z0005`; `src/session.ts:51:5, 52:5 Z0005` (`setModel(await ...)`), `session.ts:155:5 Z0005 nested 'await'` | same as camera/bench; JSX of the remote UI untested (static) |
| canvas/sketch/main.tsx | compile error | `plugins/canvas2d/index.ts:207:25 Z0109 Cannot infer a type: field 'fillVal'` (field initialised from a module const, r10b) | 22 more: `Math.hypot` (x10), `isNaN` (x6) missing (r07); then runs in the scratch copy (the sim is 5 lines; canvas2d draws through zinc:gfx) |
| chataigne/src/main.tsx | compile error | `src/link.ts:5:1 Z0119 Cannot find module: 'zinc:osc'` | `src/incoming.ts:29:10 and :33:10 Z0005 'find' outside '??'` (r06); then OK in the scratch copy (OSC stub: no real network) |
| flipctl/src/main.ts | OK | | |
| hello/src/main.ts | OK | | |
| hero/src/main.tsx | OK | | |
| inferno-todo/src/main.tsx | compile error | `src/main.tsx:3:1 Z0005 package imports ('inferno')` (r18; `tsconfig.json` `paths` maps it to `lib/compat/inferno.ts`) | `src/app.tsx:38:7 Z0005 JSX: <VirtualList> is not supported yet` (`next/src/frontend/jsx.cpp:569`); then (static) class components with `setState` on `zinc:ui/react` |
| iot-panel/src/main.tsx | compile error | `src/board.ts:6:1 Z0119 'zinc:gpio'`, `:7 'zinc:telemetry'`, `:8 'zinc:osc'` | none (OK in the scratch copy with no-op stubs); real behaviour needs the three modules |
| lang/src/main.ts | OK | | |
| led/falling-cubes/src/main.ts | OK | | |
| led/oled-clock/src/main.tsx | OK | | |
| led/scroll-text/src/main.ts | compile error | `src/marquee.ts:4:1 Z0119 'zinc:pixelfont'` | none |
| maps/explorer/src/main.tsx | runtime panic | `panic: Uncaught Error: the native module MapEngine is not linked into this engine` | `plugins/map/native/map.host.cpp` (728 lines, MVT + style spec), tiles under `examples/maps/explorer/tiles` (RC15c) |
| maps/navigation/src/main.tsx | OK | | project plugin `plugins/citymap` is pure Zinc |
| maps/svg-gallery/src/main.tsx | runtime panic | `panic: Uncaught Error: the native module SvgEngine is not linked into this engine` | `plugins/svg/native/svg.host.cpp` (679 lines) (RC15b) |
| modules-showcase/src/main.tsx | compile error | `src/services/network.ts:6:1 'zinc:osc'`, `:7 'zinc:mqtt'`; `hardware.ts:4 'zinc:gpio'`, `:5 'zinc:telemetry'`, `:6 'zinc:events'` | `network.ts:31:5 Z0005 'await' in this statement` (await in a template literal, r05); `network.ts:21 Z0101 'serve' is not exported by 'zinc:net'` (also `Request`, `Reply`) |
| native-module/src/main.ts | compile error | `src/main.ts:5:1 Z0119 'zinc:telemetry'` | none: runs with `native/sensor.sim.ts`; the point of the example (`native/sensor.host.cpp` via `requireNative`) is not exercised (RC15) |
| pinball/src/main.ts | compile error | `src/ui/panel.ts:6:1 Z0119 'zinc:platform'` | `src/input.ts:39:46 Z0005 Map.get of numbers or booleans` (`held.get(name) === true`, r06); then OK in the scratch copy; `zinc.json` size 960x600 ignored (prints 320x240) |
| pocket-hero/main.tsx | compile error | `main.tsx:3:1 Z0005 package imports ('@pocketjs/framework/solid')` (+ `app.tsx`, `Hero.tsx`, `clock`, `std`, `solid-js`) | `Hero.tsx:4:27 Z0002 Expected '}'` (`import { createHero, type HeroViewProps }`, r03); then `Hero.ts:18:85`, `Hero.tsx:6:56`, `app.tsx:7:48 Z0109 Cannot infer a type: return type` (no return annotation, r15); then (static) `createHero` returns an object of closures, `import { i32 }` of a type alias, `<Show>` |
| process/cli/main.ts | compile error | `main.ts:38:3 Z0005 'await' in this statement` (`(await s.exited) === 143`) | `zinc:process` has no `spawn(cmd, args, opts)`/`Process.exited`/`code`/`onExit` (RC02); `await assert.rejects` (static) |
| process/shell/main.tsx | compile error | `main.tsx:27:14 Z0101 'Process' is not exported by 'zinc:process'`; `:44 Z0104 expected 1, got 3`; `:47 Z0106 'pid' on 'i32'` | `onStdout/onStderr/onExit/write/kill(signal)` |
| remarkable/dashboard/src/main.tsx | OK | | |
| remarkable/notes/src/main.tsx | OK | | pen/ink input untested (headless) |
| remote/viewer/main.tsx | compile error | `plugins/remote-view/native/remote.sim.ts:3:83 Z0112 class 'Promise' used as a value` (`Promise.reject`, r11); `plugins/remote-view/index.ts:22:13 Z0103 '(i32, string) => void' to '(f64, string) => void'` (r09) | real TCP client (`zinc:socket`/display-remote protocol, RC15h); discovery |
| robot-eyes/src/main.ts | OK | | |
| robot-eyes-oled/src/main.ts | OK | | |
| scripting/bench/src/main.ts | compile error | `src/main.ts:78:25 Z0005 non-null assertions` (`vm.fn('inc')!`) | `plugins/script/index.ts:127:42 Z0005 !`; `plugins/script/native/quickjs.sim.ts:80:27 Z0001 regex literal '/^ +/'`; a real script VM = QuickJS (RC15d) |
| scripting/breakout-mods/src/main.ts | compile error | `plugins/script/index.ts:127:42 Z0005 non-null assertions` | same |
| scripting/playground/src/main.tsx | compile error | `plugins/script/index.ts:127:42 Z0005` | same; rest parameters `...args` (static) |
| service/sensor-hub/src/main.ts | compile error | `src/main.ts:11:1 'zinc:mqtt'`, `:12 'zinc:telemetry'` | `src/main.ts:10 Z0101 'serve' is not exported by 'zinc:net'` (+ `Request`, `Reply`) (RC18) |
| text/src/main-react.tsx | OK | | |
| text/src/main-solid.tsx | OK | | |
| three/cubes/main.ts | compile error | `main.ts:2:1, 3:1 Z0005 package imports ('three')` (`tsconfig` paths to `plugins/three/index.ts`) | `plugins/3d/index.ts:222 enum` (via the three plugin); `plugins/three/native/three.sim.ts:16:75 Z0001 regex '/-/g'`; sim renders nothing (RC15a) |
| three/gltf-viewer/main.tsx | compile error | `main.tsx:9..12 Z0005 package imports ('three', 'three/addons/loaders/GLTFLoader.js', '.../OrbitControls.js')` | as three/cubes; `Math.hypot` |
| ui/figma-storyboard/src/main.tsx | compile error | `src/design.tsx:57:32 Z0005 JSX: unsupported width: '100%'` (r08) | `src/design.tsx:4:18 Z0106 static 'create' on 'StyleSheet'` (prototype lowers it in `compiler/src/styles.ts`); `fontWeight`, `borderRadius` string values (static) |
| ui/forms/main.tsx | OK | | |
| ui/gl-check/src/main.ts | OK | | needs `"display": "gl"` for the real check |
| ui/keyboard/src/main.tsx | OK | | |
| ui/kit-gallery/src/main.tsx | OK | | |
| ui/lottie-gallery/src/main.tsx | OK (fake) | | `lottie.next.ts` stands in for the C++ player (`plugins/lottie/native/lottie.host.cpp`, 1108 lines) |
| video/bounce/src/main.ts | OK (fake) | from `next/`: `bounce: cannot play ''` (cwd-relative `media/fractal.mp4`; OK from the example directory) | `video.next.ts` is a fake: no decode (RC15f) |
| video/looper/src/main.ts | compile error | `src/buttons.ts:3:1 Z0119 'zinc:gpio'` | `src/config.ts:42`, `playlist.ts:20`, `buttons.ts:18`, `main.ts:34,61,64 Z0101 Cannot find name: 'isNaN'` (r07); then OK (fake video) |
| video/mapper/src/main.ts | compile error | `plugins/mapping/index.ts:3:53 Z0002 Expected '}'` (`type OscMessage` inline, r03) | `zinc:osc` (index.ts:3); then runs in the scratch copy but `mapping.sim.ts` is 10 lines (GL compositor needs `zgl`, RC15i) |
| video/quad/src/main.ts | OK (fake) | from `next/`: `quad: no video files` (cwd-relative media) | fake decode |
| webview/hybrid/main.tsx | compile error | `plugins/webview/index.ts:22:13 Z0103 '(i32, i32, i32, string, string) => void' to '(f64, ...)'` (r09) | runs in the scratch copy against a 14-line sim; real WKWebView/WebKitGTK missing (RC15g) |
| zed-editor/src/main.tsx (also demo.ts, selftest.ts) | SEGFAULT (exit 139) | `check` and `run` crash in `Checker::expr0` (EXC_BAD_ACCESS): `src/app/tools.ts` uses `proc.run` / `proc.Process`, absent from `zinc:process` (r14d) | `src/components/Editor.tsx:42:62 Z0103 f64[] to i32[]` (r12); `tools.ts:75 await proc.run`, `:126 proc.Process`, `:148 proc.spawn(cmd, args, opts)`, `:151 p.onStdout`; `tools.ts` `generation.get(b.path) !== gen` (Map.get of number, r06) |
| zed-editor/sample/src/main.ts | OK | | |
| testing/tests/test-path.ts (not an app) | compile error | `test-path.ts:14:24 Z0005 async arrow functions` | `URL`, `crypto.subtle`, `TextEncoder`, `fetch`, `assert.rejects` (zinc:web, `lib/std/web.ts`, not mapped in `kStd`) |
| testing/tests/sqlite.test.ts (not an app) | compile error | `plugins/sqlite/native/sqlite.sim.ts:6:31 Z0001 'import'`; `plugins/sqlite/index.ts:6:1 Z0119 'zinc:web'` | real SQLite (amalgamation `plugins/sqlite/vendor`) |

## (b) Root causes, ranked

"Blocks" counts example entries whose first or further blocker is this cause; "alone unlocks" is how many entries run (OK or OK (fake)) when only this cause is fixed.

| # | Root cause | Prototype implementation | Blocks (examples) | Alone unlocks |
|---|---|---|---|---|
| RC15 | Native part of 17 plugins not linked: the sim stand-ins are 5..35-line stubs or use TS beyond the subset; real output needs host code. Sub-causes a..i below | `plugins/*/native/*.host.cpp`, `runtime/mod/*` | 3d x2, three x2, camera x3, scripting x3, maps x2, remote, webview, mapper, native-module, video x4, lottie | see sub-rows |
| RC03 | Missing host modules `zinc:osc`, `zinc:mqtt`, `zinc:telemetry`, `zinc:gpio`, `zinc:events`, `zinc:platform` (`Z0119`) | `runtime/mod/{osc,mqtt,telemetry,gpio,events}.cpp`, `lib/modules.d.ts:144-195`, `compiler/src/capabilities.ts:75` (platformModule) | chataigne, iot-panel, modules-showcase, mapper, native-module, sensor-hub, looper, pinball (8) | iot-panel, native-module, pinball, chataigne (4; others wait for RC04/RC05/RC18) |
| RC01 | `zinc:pixelfont` not found: `plugins/pixelfont/plugin.json` has no `"entry"` and `readPluginsIn` (`next/src/frontend/modules.cpp:~391`) requires one (also the 8 `display-*` manifests, harmless) | `compiler/src/plugins.ts` (defaults to `index.ts`) | text-scroller, badge, cpu-graph, snake, scroll-text (5) | text-scroller, cpu-graph, scroll-text (3) |
| RC02 | `zinc:process` of the engine is a 4-function handle API (`spawn(cmdline)`, `read`, `status`, `kill`); the prototype's is `spawn(cmd, args, opts): Process`, `run(...): Promise<Result>`, `Process.onStdout/onStderr/onExit/write/kill(sig)/exited/code`. A built-in always wins over the plugin (`hostModuleSource` before `plugins`) | `plugins/process/index.ts` (109 lines, pure Zinc over a `Spec`), `native/process.host.cpp` (posix_spawn) | badge, zed-editor, process/cli, process/shell (4) | process/shell, process/cli (needs RC07 too), badge (with RC01, RC06) |
| RC19 | Checker crash (EXC_BAD_ACCESS in `Checker::expr0`) when a member is read from the result of an unresolved export (r14d) | n/a | badge, zed-editor x3 | 0 alone (turns a segfault into a diagnostic) |
| RC07 | `await` outside the four statement forms (`await e;`, `x = await e;`, `const x = await e;`, `return await e;`): call argument, template literal, binary operand, for-of header (`next/src/frontend/desugar.cpp:93-201`) | tsc async lowering in `compiler/src/` | camera x3, modules-showcase, process/cli (5) | 0 alone (each needs another cause) |
| RC06 | `x!` non-null assertion (`Z0005`) | tsc | snake, scripting x3 (4), plus `process.sim.ts`, `script/index.ts:127` | snake (with RC01) |
| RC08 | Checker rejects `Map.get` of number/boolean outside `??`/`as T` and `find` outside `??` (`Z0005`) | tsc `T | undefined` | pinball, chataigne, zed-editor, gphoto2.sim (4) | pinball (with RC03) |
| RC09 | Parser: inline `type` import specifier (`import { a, type B }`); `export const enum`; parenthesized function type as arrow return type (`): (() => string) =>`) | tsc | pocket-hero, mapper, 3d x2, three x2, esp32-2432s022 (7) | mapper (with RC03) |
| RC10 | `createSignal<i32[]>([1, 2])` / `id<i32[]>([...])`: array literal not contextually typed through a generic argument (f64[] to i32[]) | tsc | zed-editor, esp32-2432s022 | 0 alone |
| RC11 | Callback parameter kind: `(i32, string) => void` not assignable to `(f64, string) => void` (TS parameter bivariance) | tsc | remote/viewer, webview/hybrid (2) | webview/hybrid (fake) |
| RC12 | Missing builtins: `isNaN`, `isFinite`, `Math.hypot`, `Math.atan`, `Math.sign` | `lib/zinc.d.ts`, `runtime/zrt.cpp` | canvas/sketch, looper, gltf-viewer, (pinball/tools) | canvas/sketch (with RC13) |
| RC13 | Field type inferred from a module-level const initialiser (`private fillVal = BLACK`) fails (`Z0109`) (r10b) | tsc | canvas/sketch | 1 with RC12 |
| RC14 | Bare package imports (`inferno`, `solid-js`, `@pocketjs/framework/*`, `three`): the loader rejects every non-relative, non-`zinc:` specifier; the prototype resolves them via each example's `tsconfig.json` `paths` to `lib/compat/*` and `plugins/three` | `examples/*/tsconfig.json` paths, `lib/compat/inferno.ts`, `lib/compat/pocketjs/*` | inferno-todo, pocket-hero, three x2 (4) | 0 alone |
| RC16 | JSX/style: `<VirtualList>`, percentage lengths in style objects, `StyleSheet.create` | `compiler/src/jsx.ts:283`, `compiler/src/styles.ts`, `compiler/src/ui-style.ts` | inferno-todo, figma-storyboard (2) | figma-storyboard (probably) |
| RC17 | Return-type inference for functions without annotation (`Z0109`, r15), incl. returned object literals of closures | tsc | pocket-hero (many functions) | 0 alone |
| RC18 | `zinc:net` lacks `serve`, `stop`, `Request`, `Reply`, `Response.bytes/json`, `bodyBytes`, `maxBytes`, `Headers.delete/forEach` | `runtime/mod/net.cpp`, `lib/modules.d.ts:104-142` | sensor-hub, modules-showcase (2) | 0 alone (also needs RC03/RC07) |
| RC20 | `Promise` statics and `Promise` as a value (`Promise.reject`, `.all`, `.race`) (`Z0112`, r11); `async` arrows | tsc | remote/viewer, gphoto2.sim, testing x1 | 0 alone |
| RC21 | `zinc.json` is never read by `zinc run`: width/height/zoom/resize, `growDrawCommands` (level prints the draw-pool warning), `requires`, per-target plugin options (`3d.scale`), `display` | `compiler/src/cli.ts`, `capabilities.ts` | all with a window; level, bouncing-ball | behaviour only |
| RC22 | A plugin's `*.sim.ts` default-exported object literal is typed as the literal (fewer params than the `Spec`), so calls in `index.ts` fail (`Z0104 expected 1, got 5`) (r16: fewer-param implementation is not assignable to Spec); the sim should be checked against `Spec` | `compiler/src/plugins.ts` (spec typing) | 3d x2, three x2 | 0 alone |
| RC23 | `zinc:web` / `zinc:fetch` (URL, crypto.subtle, TextEncoder, fetch) and `zinc:sqlite` not mapped (`kStd` in `modules.cpp` lacks them) | `lib/std/web.ts`, `lib/std/fetch.ts`, `plugins/sqlite` | testing x2 | testing (not apps) |
| RC24 | Examples that depend on the cwd (`media/...`) behave differently depending on where `zinc run` is started (bounce, quad, looper); engine is correct, prototype `zinc run` did chdir to the project | `compiler/src/cli.ts` | bounce, quad, looper | 2 (OK from cwd) |

### RC15 sub-causes (native code), with a recommended implementation

| Id | Native part | Examples | Prototype code | Recommended implementation in the new engine |
|---|---|---|---|---|
| 15a | `Render3D`, `Three` | 3d x2, three x2 | `plugins/3d/native/render3d.host.cpp` (442), `plugins/three/native/three.host.cpp` (489), `zrt_raster.h` | Port the two software rasterizers onto the engine's image buffers as `__host_3d*` rows; `stb_image` is already in `next/third_party/stb`. No GPU library: the targets include a Pi 1. |
| 15b | `SvgEngine` | svg-gallery | `plugins/svg/native/svg.host.cpp` (679) | Reuse NanoSVG (zlib licence, parser + rasterizer, ~3k lines single header) or lunasvg/ThorVG if CSS support is needed; vendor with licence. Compare against the prototype output before dropping its engine. |
| 15c | `MapEngine` | maps/explorer | `plugins/map/native/map.host.cpp` (728) | Reuse protozero + vtzero (BSD) for MVT decoding, keep the style-spec evaluator of the prototype; polygon fill via the engine rasterizer. |
| 15d | QuickJS VM (`zinc:script`) | scripting x3 | `plugins/script/native/quickjs.host.cpp`, `vendor/quickjs` | quickjs-ng is already vendored (`next/third_party/quickjs-ng`, `next/src/qjs`): wrap it as the `Spec` (eval, call, fn, dispose). Zero new dependency. |
| 15e | libgphoto2 | camera x3 | `plugins/gphoto2/native/gphoto2.host.cpp` (661, libgphoto2 + turbojpeg) | Keep libgphoto2 (LGPL, dynamic) and libjpeg-turbo (BSD); add a Zinc-subset `gphoto2.next.ts` fake first so the examples run in CI. |
| 15f | libav decode | video x4 | `plugins/video/native/video.host.cpp` (552) | FFmpeg libav* (LGPL, dynamic) as in the prototype; `video.next.ts` fake stays for CI. |
| 15g | WebView | webview/hybrid | `plugins/webview/` (macOS WKWebView) | Platform web view (WKWebView / WebKitGTK); keep sim as headless fallback. |
| 15h | Sockets (remote-view) | remote/viewer | `plugins/remote-view/native/remote.host.cpp` (261), `runtime/mod/sock.h` | BSD sockets + poll over the engine event loop. |
| 15i | `zinc:mapping` GL compositor | mapper | `plugins/mapping/native/mapping.host.cpp` (669, needs `zgl`) | Depends on the display-gl plugin of the new engine; fake first. |
| 15j | Lottie | lottie-gallery | `lottie.host.cpp` (1108) | Prefer rlottie or ThorVG (both proven) over porting 1108 custom lines; currently OK (fake) with `lottie.next.ts`. |
| 15k | `requireNative` for user modules | native-module | `runtime/mod/native.h`, `examples/native-module/native/sensor.host.cpp` | Define the native-module ABI of the new engine and a documented way to compile a `*.host.cpp` (the example is the acceptance test). |

## (c) Proposed backlog (ordered to unlock the most examples first)

Each task lists the examples it unlocks together with the tasks it needs.

| # | Title | Description | Acceptance criteria | Size | Depends on | Unlocks |
|---|---|---|---|---|---|---|
| P1 | Plugin manifest default entry | In `readPluginsIn` default `entry` to `index.ts` when absent (`plugin.json` of pixelfont and displays) | `import { drawText } from 'zinc:pixelfont'` compiles; `tests/t1/examples.sh` includes text-scroller, cpu-graph, scroll-text | S | none | text-scroller, cpu-graph, scroll-text (+ badge, snake with P2, P6) |
| P2 | Checker robustness on unresolved symbols | Guard `Checker::expr0` against error types from unresolved exports/types (r14d); add golden for the diagnostic | `/tmp/parity/r/r14d.ts` exits 1 with Z0101, never 139; ASan run clean on the zed-editor tree | S | none | no crash for badge, zed-editor x3, process examples |
| P3 | Isomorphic builtins | Add `isNaN`, `isFinite`, `Math.hypot`, `Math.atan`, `Math.sign` (+ `Math.cbrt`, `log2`, `log10` if absent) to the checker table and runtime | r07 and `b_1..b_5` check and give the same numbers as node | S | none | looper (with P7), canvas/sketch (with P9), gltf-viewer |
| P4 | Host modules, simple tier | `zinc:platform` (constants from the run profile: TOUCH, KEYBOARD, POINTER, SCREEN_W/H, ...), `zinc:events` (Emitter), `zinc:telemetry` (connect/counter/gauge/event/expose/enabled, `ZINC_TELEMETRY`), `zinc:gpio` (simulated pins, `simulate`) as Zinc source over `__host_*`; port `runtime/mod/{telemetry,gpio}.cpp` | each module of `lib/modules.d.ts` imports and passes a small T1 program; pinball, native-module, iot-panel run headless | M | none | pinball (with P8), native-module, iot-panel, looper (with P3, P7 not needed) |
| P5 | Host modules, network tier | `zinc:osc` (UDP send/listen; reuse tinyosc, ISC, or port `osc.cpp` 77 lines) and `zinc:mqtt` (QoS0 client; port `mqtt.cpp` 115 lines, or Paho/Mosquitto if QoS needed) | loopback test: osc.send to own listen delivers the message; MqttClient against a local broker connects and receives | M | P4 | chataigne (with P8), mapper (with P6a), modules-showcase (with P12, P13), sensor-hub |
| P6 | Parser gaps | (a) inline `type` import/export specifiers, (b) `export const enum` / `const enum` (inlined), (c) parenthesized function type as an arrow return type, (d) `x!` non-null assertion (checker narrows `T|null` to `T`, trap on null) | r01, r02, r03, r04 run; fixtures in `tests/golden/*/errors` updated | M | none | pocket-hero (part), mapper, 3d x2 (part), three x2 (part), esp32-2432s022 (part), snake, scripting x3 (part) |
| P7 | Await in expressions | Hoist awaits out of call arguments, template literals, binary/conditional operands, for-of heads and conditions into temporaries, keeping left-to-right order (`desugar.cpp`); async arrows | r05 and `process/cli:38`, `camera/cli:25` compile and match the oracle | M | none | camera x3 (part), modules-showcase (part), process/cli (part), testing |
| P8 | Checker: Map.get / find results | Allow `map.get(k)` of number/boolean in comparisons and returns as `T|undefined`, and `arr.find(...)` returned or assigned to `T|undefined` | r06 compiles; pinball/chataigne/zed `tools.ts` lines compile | S | none | pinball, chataigne |
| P9 | Checker: inference | (a) contextual typing of array literals through generic arguments (r12), (b) callback parameter kind bivariance with a conversion thunk or explicit rule (r09), (c) field type from a module const initialiser (r10b), (d) return-type inference for functions and object literals of closures (r15), (e) check a plugin `*.sim.ts` default export against `Spec` (r16: fewer-param implementation is not assignable to Spec) | each repro in `/tmp/parity/r` compiles; `tests/t1` additions | L | none | canvas/sketch, esp32-2432s022 (part), zed-editor (part), webview/hybrid, remote/viewer (part), pocket-hero (part), 3d/three (part) |
| P10 | Full `zinc:process` | Replace the built-in with the prototype plugin API: `spawn(cmd, args, opts)`, `run`, `Process` (`onStdout/onStderr/onExit/write/closeStdin/kill(sig)/pid/exited/code`), `Result`; keep the `__host_proc*` rows as the native spec (port `process.host.cpp`) and let `plugins/process/index.ts` run unchanged; builtin wins only for `zinc:net`'s internal use under another name | `examples/process/cli` prints its checks (kill -> 143), shell example runs; badge runs on the local `ipconfig`/`hostname` | M | P2, P7, P6d | process/cli, process/shell, badge, zed-editor (part) |
| P11 | Bare imports via tsconfig `paths` + `lib/compat` | Honour `compilerOptions.paths` of the nearest `tsconfig.json` (`inferno`, `solid-js`, `@pocketjs/*`, `three*`); treat `lib/compat/**` as normal sources | inferno-todo and pocket-hero get past the import errors; `three` resolves to `plugins/three` | M | none | inferno-todo (part), pocket-hero (part), three x2 (part) |
| P12 | JSX/style lowering | `<VirtualList count itemHeight>` (`jsx.cpp:569`), percentage and keyword lengths, `StyleSheet.create` (port `compiler/src/styles.ts`, `ui-style.ts`) | inferno-todo and figma-storyboard run 3 headless frames and match prototype PNG within tolerance | M | P11 (inferno) | inferno-todo, figma-storyboard |
| P13 | `zinc:net` server and bodies | `serve(port, handler)`, `stop`, `Request`, `Reply`, `Response.bytes/json`, `bodyBytes`, `maxBytes`, `Headers.delete/forEach`; reuse cpp-httplib (MIT) for the server, libcurl for the client | sensor-hub answers `/healthz` on loopback; modules-showcase self-fetch works | M | P5, P7 | sensor-hub, modules-showcase |
| P14 | Promise statics | `Promise.reject/resolve/all/race/allSettled` typed generically, `Promise` usable as a value | r11 and gphoto2.sim compile | S | P9 | remote/viewer, gphoto2 sim |
| P15 | `zinc.json` loader | Read `zinc.json` for `zinc run`: width/height/zoom/resize to the window, `growDrawCommands`, plugin options (`3d.scale`), `requires` check, chdir to the project directory (RC24) | level prints no draw-pool warning; pinball opens 960x600; bounce runs from any cwd | M | none | level, bouncing-ball, pinball, bounce, quad, looper |
| P16 | `zinc:web`/`zinc:fetch`/`zinc:sqlite` mapping | Add them to `kStd`, SQLite amalgamation (vendored in `plugins/sqlite/vendor`) as a host module | `examples/testing/tests` pass | M | P7 | testing x2 (not apps) |
| P17 | zinc:script on quickjs-ng | `Spec` over `next/src/qjs` | scripting/bench prints its timings; breakout-mods and playground run | M | P6d | scripting x3 |
| P18 | 3D software renderer | Port render3d.host.cpp and three.host.cpp as host rows | 3d/cubes and three/cubes match a stored PNG | L | P6b, P9e, P11 | 3d x2, three x2 |
| P19 | Camera: gphoto2 fake then real | `gphoto2.next.ts` in the Zinc subset (CI), then libgphoto2 host | camera cli/bench/remote run headless with the fake | M | P7, P9, P14 | camera x3 |
| P20 | Video decode | libav host over the engine images | bounce shows moving pixels; goldens | L | P15 | bounce, quad, looper, mapper (real) |
| P21 | SVG engine | NanoSVG-based `SvgEngine` | svg-gallery runs, PNG within tolerance | M | none | svg-gallery |
| P22 | Map engine | MVT decode (protozero/vtzero) + prototype style evaluator | maps/explorer renders `tiles/` | L | none | maps/explorer |
| P23 | Webview and remote-view natives | Platform web view; socket client | webview/hybrid loads its page; remote/viewer connects to a local server | L | P9b, P14 | webview/hybrid, remote/viewer |
| P24 | requireNative ABI | Stable ABI for user `*.host.cpp` + build hook | `examples/native-module` runs its C++ (not the sim) | L | none | native-module (real) |

Unlock projection (entries OK after each cumulative step, starting from 27): P1 +3 = 30; P6 +1 (mapper) = 31 once P5 lands; P4 +3 (pinball needs P8, native-module, iot-panel) = 34 with P8; P5 + P8 +1 (chataigne) = 35; P3 + P4 looper = 36; P9 +4 (canvas, webview, ...) = 40; P10 +3 (badge, shell, cli) = 43; P11 + P12 +2 = 45; P13 +2 = 47; P7 + P19 +3 = 50; P17 +3 = 53; P18 +4 = 57; P21, P22, P23 bring the rest (60-63). P2 and P15 are free quality wins.

## Notes and caveats

- The scratch tree `/tmp/parity/ex` holds the patched copy; the repository is untouched.
- Static "likely" items were not run past the first fixed blocker for: camera (gphoto2 sim is outside the subset, so the fake needs writing), pocket-hero, esp32-2432s022, remote/viewer, scripting, 3d/three.
- `rc=0` does not prove pixel parity; the next audit step should add per-example goldens (only 3 exist).
