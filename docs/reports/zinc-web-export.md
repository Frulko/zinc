# The web export: options, scores, numbers, limits

`zinc export --target web` and `zinc dev --target web` (owner request of 2026-10-17). The user's page is [docs/targets/web.md](../targets/web.md); this is the reasoning behind it, the measurements, and what is not done.
Scores follow `next/RULES.md` section 4: fit x3, performance x3, size x2, maintainability x2, licence and supply risk x2, portability x1, effort x1, each 1 to 5.

## What was asked, what was found

The `wasm` target already existed (`zinc export --target wasm`: the ZBC interpreter of the engine in WebAssembly, in a worker, zinc:gfx rows drawn on an OffscreenCanvas, needs COOP/COEP, no UI kits, no
plugins). The new target had to feel like a normal web app: simple, optimised, deployable on any static host.

The `zinc bundle` pipeline (ZN-583) already lowers a Zinc program to one plain JavaScript module for QuickJS: TypeScript and TSX stripped, React Native imports and JSX lowered, the standard library
(`lib/std`: zinc:ui, its classic layout engine, the kits, zinc:gfx's API part) included as ordinary modules. What it leaves undone are the **host rows**: about 100 calls `__host_gfx*`, `__host_sys*`, `__host_fs*`...
that the native engine answers in C++. Those are what a browser has to answer, and almost all of them have a direct web equivalent (Canvas2D, pointer events, localStorage, fetch). So the web host
is one JavaScript file over the browser, not an engine.

## Decision 1: where the app runs

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| **The app's JavaScript (the bundle) on the browser's engine, a thin host in JS** | 5 | 5 | 5 | 4 | 5 | 5 | 4 | **77** |
| Zinc interpreter compiled to WebAssembly (the existing `wasm` target) | 2 | 2 | 3 | 3 | 5 | 4 | 5 | 54 |
| AOT C++ to WebAssembly per app | 2 | 4 | 2 | 2 | 5 | 3 | 1 | 50 |
| QuickJS compiled to WebAssembly, running the bundle | 3 | 1 | 3 | 3 | 5 | 4 | 3 | 47 |

The owner decided the same on 2026-10-17 (the browser's own JS engine is faster than anything shipped and free): the first row. The others stay as non-choices, one line each: the interpreter in wasm is
slower than the page's JIT and drags the native runtime without plugins or kits (it remains the `wasm` target for tiny console programs); AOT to wasm gives each app its own engine binary and long builds;
QuickJS in wasm is an interpreter inside an interpreter. Wasm is used only where there is native code to run: a plugin's C (sqlite: yes).

## Decision 2: how it draws

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| **Canvas2D painter** (one row = one canvas call) | 3 | 4 | 5 | 5 | 5 | 5 | 4 | **60** |
| DOM painter (one row = one element, Zinc layout) | 4 | 4 | 5 | 3 | 5 | 4 | 3 | 57 |
| WebGL2 replay of the raster commands | 3 | 5 | 3 | 2 | 5 | 4 | 1 | 51 |
| DOM with CSS layout (flex/grid do the layout, Zinc's engine off) | 5 | 3 | 4 | 1 | 5 | 3 | 1 | 49 |

Both of the first two ship, behind `--render` / `targets.web.render`; **canvas is the default** by three points: it implements every `zinc:gfx` feature one to one (clip, transform, blend, tint, off-screen images),
and it is the pixel-exact base the DOM mode is compared with.

**Decision 2b (2026-10-17, the same day): DOM mode is a real DOM, laid out by CSS.** The first DOM mode painted Zinc's layout as absolutely positioned elements with inline styles: the canvas made of divs. The
owner called it wrong, rightly: the page had no structure, and the browser's scrolling, focus, forms and keyboard were all replaced by Zinc's. It is deleted (it covered nothing the canvas mode does not).

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| **Semantic DOM: Zinc's styles to CSS classes, the browser lays out, scrolls and focuses; Zinc's classic layout runs underneath for the program's geometry** | 5 | 4 | 4 | 3 | 5 | 4 | 2 | **70** |
| Absolute painter (the first DOM mode) | 2 | 3 | 5 | 3 | 5 | 4 | 4 | 56 |
| A second UI written for the DOM (React DOM components) | 5 | 5 | 3 | 1 | 5 | 3 | 1 | 63, and every demo would be rewritten: it breaks RULES.md section 1 |
| Zinc's layout switched off, geometry read back from the DOM | 5 | 4 | 4 | 1 | 5 | 4 | 1 | 62: virtual lists, `screenBox` and gestures read the layout every frame |

Why the classic layout still runs: `onScroll` limits, `screenBox`, `toLocal`, virtual lists, RefreshControl and the animators read the laid-out boxes (about half a millisecond a frame on the hero demo). Where it disagrees
with CSS the host takes the browser's number for what matters (a virtual list's viewport) and stops zinc:ui from clamping a scroll offset with its own content size.
How the style is written: each node's numbers become declarations, each declaration a class of one generated sheet (`property:value`, deduplicated, base-36 names, about 200 rules for a screen); a value that
changes once becomes a custom property of its element. The alternatives were a class per `className` token (the tokens are resolved to numbers at build time, so a build-time sheet could not know `style`
objects computed at run time) and inline style on every element (the first DOM mode: 1 200 style strings). The user-facing description, the translation table and the differences are in
[docs/targets/web.md](../targets/web.md), "The semantic DOM". Bugs found on the way, and fixed: the web runtime never advanced `frame()`, so zinc:ui's clock, steppers and tweens stood still in both modes;
a recycled node handle kept the style state of the node it replaced; Zinc's own scroll clamp used the shadow layout's size.

## Decision 3: hot reload

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| **Unbundled modules, Vite-style `import.meta.hot`, exports of functions forwarded to their newest definition, reload when state changes** | 4 | 5 | 5 | 3 | 5 | 5 | 3 | **68** |
| Full reload on every save | 2 | 3 | 5 | 5 | 5 | 5 | 5 | 55 |
| The interpreter's Fast Refresh (D122 to D124) in the page | 5 | - | - | - | - | - | 1 | not possible: it swaps live objects of the Zinc machine |

The page loads the project's modules one by one from the dev server (`zinc bundle --stage`: the transformed modules with relative imports, no esbuild; a save re-stages in about 50 ms). A save re-stages,
compares each module's text with the last, and decides: modules that export only functions are evaluated again alone; the exported functions of project modules are wrapped (`__zincRefresh`) so every old
import calls the new body; solid components get their refresh proxy (`_hotC`, which `strip.cpp` now lowers when `ZINC_WEB_HOT=1`) and re-render where they were, under the same owner. Anything else reloads.
Measured on `tests/fixtures/web-hot` (a counter in `state.ts`, a label in `Label.tsx`): edit Label: new text in 55 to 70 ms, the counter and the page kept; syntax error: overlay; fix: overlay gone; edit state: reload.

Not covered: a changed *class* or *value* export swaps nothing in place (reload); effects at the top level of a refreshed module run again (use `import.meta.hot.dispose`); two modules that export the same
component name refresh together (over-refresh, harmless).

## Decision 4: how a plugin brings its browser version

Three shapes, chosen per plugin by how thin its `index.ts` is over the native spec:

- `web.entry`: the module is rewritten for the page (camera, microphone, webrtc, socket, browser). Used where the API is a promise over a browser API anyway, where the native spec is a polling protocol
  (`next()` every few ms) that a browser callback model replaces, or where the browser *is* the API (WebRTC: the page's `RTCPeerConnection` under the same names; the call demo runs unchanged).
- `web.native` + `web.impl`: `index.ts` stays and a JavaScript object answers its native spec (audio, svg, system, sqlite): the API is identical by construction and there is one JS file to write.
- `web.wasm`: the plugin's C compiled by the pinned zig to a reactor module, compiled by the page before the app starts and instantiated synchronously, so the synchronous native calls of the spec stay synchronous
  (sqlite is 41 lines of spec over the C API; the amalgamation builds in 8 s, 690 KB, 240 KB Brotli).

Why not compile every plugin's `*.host.cpp` to wasm: they are written against the Zinc runtime types (`zrt::Array`, `zrt::String`) and the generated header; for physics2d that needs a small `zrt` stand-in
and a C-ABI export layer, a day of work that sqlite (plain C API) did not need. It is the next plugin to port (Box2D).

One more finding: `zinc:web` and `zinc:web/fetch` (lib/std) are Zinc's own polyfills of the Web APIs (URL, Event, Blob, fetch over libcurl rows...). A browser must not get them: `web.browser.ts`,
`fetch.browser.ts` and `subtle.browser.ts` re-export the page's own, and the bundler stops adding the polyfill imports for global names (`strip.cpp`), when the profile is `web`.

## Decision 5: WebGL, shaders, layout and the plugins that wait on hardware (2026-10-17)

Owner's rule: no WebAssembly unless native code is truly required; canvas and 3D go through the browser's own APIs. Scored as `next/RULES.md` section 4 (fit x3, performance x3, size x2,
maintainability x2, licence x2, portability x1, effort x1; each 1 to 5).

**How a WebGL picture reaches the Zinc surface.** (a) a second canvas layered under or over the Zinc one: 3,5,5,2,5,3,2 = 66, it breaks paint order (an overlay cannot sit between two Zinc draws, a
clip or a fade cannot apply) and DOM mode needs positioning code; (b) copy the GL canvas into a gfx image each frame and draw that image: 5,4,5,5,5,5,5 = **81**, one `drawImage` of a GPU canvas,
paint order, clip, transform and fade for free, and DOM mode already turns an image into a `<canvas>` where the component sits; (c) `OffscreenCanvas` in a worker: 3,5,3,2,5,3,1 = 55, no synchronous
`present` and the main thread has to receive bitmaps. Chosen (b); (c) stays a later option for three.js.

**zinc:gl**: rows generated from the engine's own table (`tools/gen-web-gl` reads `tools/gen-zinc-gl`) rather than a hand-written wrapper: 5,5,5,5,5,5,4 = **84**; the program and `lib/std/gl.ts` do not change.
**three.js**: the real library with a renderer subclass and four small overrides (96 lines of TypeScript) 5,5,4,5,5,5,5 = **83**, against re-implementing the Zinc subset's extra API on WebGL: 3,4,5,2,5,5,1 = 54.

**Yoga / `ui.layout: "rn"`** (owner, 2026-10-17): none on the web. DOM mode paints with CSS what Zinc's layout placed; canvas mode runs the classic layout in JavaScript (`lib/std/ui.ts`, measure and
place). `targets/capabilities.json` now says `web.ui.rn: false`, and `resolveUiLayout` turns an explicit `"rn"` into the classic layout with React Native's style semantics on the web (the preset's
path on esp32). Measured on `examples/rn-showcase` at 420 x 860 against the desktop's Yoga frame: the same boxes in the same places (text and locale differ: the desktop run was in French, the web
fonts are the system's); luma SSIM 0.67, all of it text. Known limit: behaviours only Yoga has (percent edge cases of `aspectRatio` with `minWidth`, `flexBasis: auto` corner cases) are the
classic layout's; no warning is issued because none is detected from the program.

**Plugins**: serial, MIDI and gphoto2 keep their `index.ts` and answer their native spec in JavaScript (`web.native` + `impl`), because each spec is a small synchronous API: handles, a queue read by
the plugin's timer. Web Serial, Web MIDI and WebUSB are asynchronous and ask the person, so the answers are cached (granted ports, the MIDI access) and the chooser (`requestPort`, `requestDevice`)
opens when the page has a user activation; `open` returns a handle at once and opens in the background. OSC keeps its whole protocol and replaces only `open` with a WebSocket relay (a browser has no
UDP). gphoto2: libgphoto2 as WebAssembly exists (`web-gphoto2`, LGPL, Emscripten with Asyncify, about 5 MB, wants cross-origin isolation); a 300-line PTP over WebUSB covers the basic controls with no wasm
(4,4,5,4,4,4,3 = 79 against 3,5,2,3,3,4,4 = 63 for vendoring the wasm now) and the wasm port stays the answer for live view and vendor widgets. Map: MapLibre GL JS (BSD-3) reads the same style language
the C++ engine implements a subset of: 5,5,3,4,5,5,4 = **81** against a JS vector-tile renderer of our own (2,3,5,1,5,5,1 = 50); it must be loaded unmodified (a minifier breaks its inline worker: found
the hard way), hence `web.scripts`. Box2D: wasm with a C shim, as the owner asked (native code is needed there).

## Measurements

Apple M1 Pro, Chrome 155 headless (`--headless=new`, software compositing: compare the modes with each other, not with a desktop's frame rate), localhost, `tools/web-measure`; 6 s of the hero demo's home screen
(live charts) after the intro, and of `tests/fixtures/web-dom-list` (a list of 10 000 rows, 1 200 small boxes and 20 moving bars), run on a quiet machine after the semantic DOM was in. The old absolute painter is
gone; its numbers are those of the first version of this report (same machine and Chrome) and are given for comparison.

| | hero canvas | hero DOM (semantic) | hero DOM (old absolute painter) | list canvas | list DOM (semantic) |
|---|---|---|---|---|---|
| time to the first frame of the app | 150 ms | 146 ms | 133 ms | 109 ms | 122 ms |
| the app's own frame, mean / p95 / max | 0.82 / 1.1 / 2.5 ms | 0.75 / 0.9 / 1.3 ms | 0.60 / 0.7 / 2.6 ms | 1.34 / 1.5 / 3.0 ms | 1.07 / 1.2 / 3.7 ms |
| the main thread per frame (script, layout, style) | 1.17 ms (0.86, 0, 0) | 1.11 ms (0.78, 0.01, 0) | 2.6 ms (0.64, 0.48, 0.10) | 1.64 ms | 1.58 ms (1.10, 0.06, 0.12) |
| DOM elements | 22 | 331 | 1 200 | 22 | 1 338 (about 35 rows of the list) |
| JS heap | 19.8 MB | 13.4 MB | 13 MB | 6.5 MB | 8.4 MB |
| bytes fetched | 942 KB | 979 KB | 915 KB | 224 KB | 262 KB |

The semantic DOM costs what the canvas does per frame on these two apps and a quarter of the elements of the absolute painter (a flexbox box is one element however many things it draws: text, background, border and
shadow are not separate elements). An idle frame costs nothing in both (zinc:ui commits only when the tree changed). The list moves 20 widths a frame through custom properties: 0.12 ms of style recalculation.
What a phone does with 1 300 elements is not measured here (no device in this session): the case for the canvas mode on low-end phones stays, and the number to take before changing the default.

Download size of an export, Brotli (the JavaScript the page runs; `zinc` + `app` + `native` [+ `dom`]):

| app | canvas | DOM | notes |
|---|---|---|---|
| examples/hero (88 modules, charts, icons, video and lottie plugins) | 380 KB, 118 KB br | 395 KB, 125 KB br | 361 KB minified app; lottie-web (168 KB svg build or 203 KB canvas build) is loaded only when an animation is first drawn |
| examples/webrtc-call (camera, microphone, webrtc, audio, svg) | 234 KB, 77 KB br | | |
| desktop-app template (nuxt kit) | 253 KB, 82 KB br | 261 KB, 85 KB br | |
| sqlite fixture | 206 KB, 70 KB br | | plus `sqlite.wasm` 690 KB, 240 KB br |

The web host is 30 KB (10 KB br), the semantic DOM host 40 KB (13 KB br), the dev client (`hmr.js`) is not in an export.

The wasm target for comparison was not measured: its `vm-web.wasm` needs the pinned zig and the build of the runtime, and it cannot run these apps (no kits, no plugins).

## Limits and what is not proven

- **Only Chrome was run** (headless 155, macOS). The tables for Firefox and Safari in `targets/web/browsers.json` are MDN research from 2026-10-17. Safari needs a pass on a Mac and an iPhone: canvas
  `letterSpacing` (18.4), `AudioWorklet` timing, `getUserMedia` in a home-screen app, the autoplay policy, `roundRect` before 16.
- Headless Chrome used its **fake camera and microphone**: the pipeline is proven, a real device's formats and permission prompts are not.
- No screen reader, no IME composition and no touch device was tried; the `<textarea>` that follows an edited field is the design, untested with a soft keyboard.
- **Fonts**: Zinc ships Inter as `sans`; the web host uses the system sans (`system-ui`). Widths differ by a few percent from a desktop build. Shipping Inter as a web font (OFL) would make the two identical
  and costs a 300 KB file: a choice for the owner, not made.
- **Hardware plugins were not run on hardware**: `zinc:serial`, `zinc:midi`, `zinc:gphoto2` (WebUSB, PTP) and `zinc:osc` (WebSocket relay) run against mocks of `navigator.serial`, `requestMIDIAccess`,
  `navigator.usb` (a PTP responder with real containers) and `WebSocket`, injected before the page. No real port, MIDI device, camera or relay was used; no camera's quirks (Canon and Nikon vendor
  operations, big objects over several transfers, session loss) are known. Chrome only; Firefox has MIDI but neither serial nor USB, Safari none of the three.
- **WebGL**: Chrome with SwiftShader (software GL), no GPU; WebGL2 only was driven for three.js; `zinc:gl` version 1 contexts use the browser's WebGL 1 (the gl-cube is one) but the WebGL 1 / 2
  differences beyond that program were not compared with the native engine. No `OffscreenCanvas`, no WebGPU, no iOS or Android browser.
- `imageFromBytes` of a remote image (it decodes asynchronously and shows at the next repaint
  of the app, which an idle app may not make: use `createImage` or `Image`), `zinc:fs` on the real disk (the page has an in-memory file system for the program's own writes and `localStorage` for `zinc:storage`).
- `zinc:system` menus, tray and window geometry are accepted and do nothing (so a desktop template runs); a program that wants to adapt asks `supports('menu')`.
- The dev server writes `build/.zinc-web-dev/` in the project. A package of `node_modules` is not served module by module: the dev server bundles the bare imports once with esbuild (Vite's pre-bundling model) into
  `<project>/.zinc/web-deps/<key>/` and serves them at `/__deps/`; export and dev resolve packages with the same flags (`webResolveFlags`). See [web.md](../targets/web.md#npm-packages) and [the libraries run](../targets/web-libraries.md).
- `zinc dev --target web --prepare <dir> [--build]` writes the staged modules and the host files and stops, for `@zinc/vite` (`packages/vite-plugin-zinc`).

## Next, in this order

1. Done: roles, forms, native scroll and focus, prerendering and addresses (the semantic DOM). Next there: a phone measurement, Firefox and Safari runs, a screen reader and an IME pass.
2. `zinc:video` and `zinc:lottie` over the browser's elements; `zinc:3d` and `zinc:physics3d` (or tell programs to use three).
3. Real devices for serial, MIDI and gphoto2 (and libgphoto2's `web-gphoto2` for live view and vendor widgets); an OSC relay shipped with Zinc.
4. The shadcn-style and React Native kits on the page; `zinc dev --target web` for three.js and the map (unbundled modules cannot load a UMD script or the vendored addons yet).
5. Inter as a web font.
6. Safari and Firefox runs, a phone measurement, and the numbers of this table in `docs/reports/zinc-next-perf.md` once the coordinator takes them.
