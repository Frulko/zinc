# The web: a Zinc app as a normal web page

`zinc export --target web` turns a Zinc app into a static folder (`index.html`, a few hashed `.js` files, its assets) that any web host serves. The app's TypeScript runs on the
browser's own JavaScript engine, the way a React or Vue app does; nothing of the Zinc engine is shipped, no WebAssembly is needed for an ordinary app, and no server is needed
beyond static hosting.

This is not the `wasm` target ([wasm.md](wasm.md)), which runs the bytecode interpreter of the engine compiled to WebAssembly in a worker (for small console-style programs, and it needs
COOP/COEP headers). The web target is faster (the browser's JIT), smaller (a dashboard app is 100 to 120 KB of Brotli-compressed JavaScript) and behaves like a page.

```sh
zinc export examples/hero --target web            # dist/hero-web/
zinc export . --target web --render dom           # real HTML elements instead of a canvas
zinc dev    . --target web                        # a dev server on http://127.0.0.1:8000/ with hot reload
python3 dist/hero-web/serve.py                    # look at an export (any static host works the same)
zinc export . --target web --check                # only what these browsers cannot run
```

## What the export is

```
dist/hero-web/
  index.html            the page: title, theme colour, import map, config, a splash with a progress bar
  zinc.<hash>.js        the web host (targets/web/runtime.js): canvas or DOM painter, input, storage, assets, the frame loop (about 28 KB, 10 KB Brotli)
  app.<hash>.js         the app: its TypeScript and TSX, zinc:ui, the kits and the plugins it imports, linked, tree-shaken and minified by esbuild
  native.<hash>.js      the browser backends of the plugins the app uses (a few hundred bytes without any)
  dom.<hash>.js         only with --render dom: the DOM painter (8 KB)
  assets/...<hash>.ext  the project's assets, named by their content
  <plugin>.<hash>.wasm  only for a plugin whose native code is C or C++ (sqlite: 690 KB, 240 KB Brotli)
  sw.js, manifest.webmanifest   offline cache and installable web app (--no-pwa leaves them out)
  *.br, *.gz            precompressed copies of what compresses (a host that serves them skips its own compression)
  _headers              cache headers for Netlify and Cloudflare Pages; serve.py, README.txt
```

- **Hashed names**: every file but `index.html` and `sw.js` can be cached for a year (`_headers` says so); a new build has new names.
- **Offline**: `sw.js` caches the files on the first visit and the app starts without a network after it. The page itself is fetched fresh when there is one. It registers only on https and on localhost.
- **No COOP/COEP**: a page needs them only for `SharedArrayBuffer` and WebAssembly threads. No part of the web target needs them today. A plugin that does declares `"crossOriginIsolated"` in its
  `web.needs`; the export then writes the headers into `_headers` and `sw.js` adds them where the host cannot (GitHub Pages).
- **The browser's JavaScript, not Zinc's**: `URL`, `fetch`, `Event`, `TextEncoder`, `crypto`, `MediaStream`, `navigator` are the browser's own. `import { URL } from 'zinc:web'` gives the same object
  (`lib/std/web.browser.ts`), and no import is added for the globals, so nothing replaces them with the Zinc polyfills.

### Settings: `zinc.json` `targets.web` and the options

```json
{ "targets": { "web": {
    "render": "canvas",                                  "comment": "canvas (default) or dom",
    "browsers": "chrome >= 111, firefox >= 115, safari >= 16.4",
    "title": "My app", "description": "For the search results and the share card",
    "themeColor": "#111827", "backgroundColor": "#ffffff", "lang": "en",
    "icon": "assets/icon.png", "pwa": true,
    "width": 960, "height": 600,                         "comment": "a fixed surface; without them the app fills the window and follows its size",
    "strict": false } } }
```

`--render canvas|dom`, `--browsers '<set>'`, `--check`, `--werror`, `--no-pwa`, `--sourcemap` and `-o dir` override or add to it. (The key `web` of `zinc.json` itself is something else: it turns on the window / document
environment of the QuickJS engine for JavaScript game libraries.)

## Two ways to draw

The app's UI (`zinc:ui`, its classic layout engine, the UI kits, React Native components) is JavaScript in both modes. Zinc lays everything out, the same way as on a desktop; the modes differ in what
happens to the boxes, the text and the images.

| | `canvas` (default) | `dom` |
|---|---|---|
| What the page holds | one `<canvas>` | the app as elements: a `div` per box, a `span` per line of text, `canvas` for images, `svg` for shapes and icons |
| Look | what the desktop engine draws, as Canvas2D draws it (the same layout, the browser's fonts) | the same layout; fonts, radii and shadows are CSS's |
| Text | pixels | **real text**: selectable, copied, found with Ctrl+F, read by screen readers, translated by the browser |
| Window size and zoom | the surface follows the window and the pixel ratio; the app lays out again | the same |
| Input | pointer, wheel, keys, gamepad, a hidden `<textarea>` while a field is edited (IME, soft keyboard) | the same, and the browser's own text selection where the app shows a text cursor |
| Cost per frame (hero dashboard, 1200 boxes, headless Chrome) | 1.2 ms of the main thread | 2.6 ms; 1200 elements |
| First frame (hero, headless Chrome, localhost) | about 130 ms | about 130 ms |
| Needs | Canvas2D with `roundRect` (Chrome 99, Firefox 112, Safari 16) | nothing beyond DOM and CSS |
| Fits | games, drawing, charts, anything pixel-exact | forms, content, dashboards, tools: apps that should behave like a page |

Everything a program draws with `zinc:gfx` works in both: rectangles, rounded boxes, gradients (linear, radial, conic, repeating), borders, shadows, polygons, paths, strokes, text, images, clips,
transforms, blend modes and tints. Off-screen images (`createImage`, `beginImage`) are drawn on a canvas in both modes; in DOM mode an image is a `canvas` element redrawn when its pixels change.
A part with no element equivalent stays on a canvas, which is why `drawShader` (runtime GLSL) answers `shaderAvailable() === false` on the web and the program takes its own fallback.

What is not done in DOM mode, and why: roles. A button is a box with a pointer cursor to Zinc, not a `<button>`, so a screen reader reads the text of the page but does not announce controls, and the
keyboard moves through Zinc's own focus, not the browser's tab order. Search engines that run JavaScript see the text; there is no prerendering. These are the first things to add (`docs/reports/zinc-web-export.md`, "Next").

### Which parts work in which mode

| | canvas | dom |
|---|---|---|
| `zinc:ui` (View, Text, Button, Image, ScrollView, Input, TextArea, Canvas): the hero demo, the call demo, the desktop-app template | yes | yes |
| UI kits: nuxt-ui and the icons (Lucide through `zinc:svg`) run in the desktop-app template; the shadcn-style kit and the React Native components are not tried yet | yes | yes |
| `zinc:ui/solid`, `zinc:ui/react`, state, effects, animations, transitions | yes | yes |
| Text selection and copy | the app's own (fields, `selectable` text) | the app's own, and the browser's on any text |
| Find in page, translation, screen readers read the text | no | yes |
| IME and the soft keyboard in fields | yes (a `<textarea>` follows the field) | yes |
| `zinc:gfx` drawing, `drawImageRect` (sprites), off-screen images | yes | yes |
| `drawShader` (runtime shaders) | no (`shaderAvailable()` is false) | no |
| `zinc:gl`, three.js, WebGL | not yet (planned: a WebGL2 canvas beside the Zinc one) | not yet |
| Layout `rn` (Yoga) | not yet (a WebAssembly build of Yoga would do it); the classic layout is the default and works | not yet |
| Web fonts: `assets/*.ttf`, `.otf`, `.woff`, `.woff2` | yes (loaded before the app starts, named by file) | yes |

## Capabilities and honest limits

Three layers tell a program, and its author, what the browser gives.

1. **At build time**, `zinc export --target web` checks the browsers of the target set (`targets.web.browsers`, or `--browsers`; `chrome >= 111, edge >= 111, firefox >= 115, safari >= 16.4` by default) against what the
   app uses: the web host itself, and the `needs` of every plugin the app imports (their `plugin.json` `web` entry). `--check` prints the report and writes nothing; `--werror` makes a warning fail the export.
   The query is a list of `browser >= version`; `ios` means Safari, `chromium`, `opera` and `samsung` mean Chrome. The table is `targets/web/browsers.json` (MDN browser-compat-data, read 2026-10-17).

   ```
   warning W0601: webusb (plugin gphoto2) is not available in firefox (never shipped), safari (never shipped); Chromium browsers only, secure context
   warning W0602: the native side 'Process' has no browser backend (a plugin's web entry): its calls throw ZnUnsupported
   warning W0603: the program calls processes and signals: it throws ZnUnsupported in the browser
   ```

   `zinc explain W0601` (and `W0602`, `W0603`) say what each means and how to fix it. The row list of W0603 comes from the code the bundle really reaches, after tree shaking.

2. **At run time**, `import { supports, requireFeature, browserInfo, browserFeatures, shippedBy, banner, ZnUnsupported, isBrowser } from 'zinc:browser'`. `supports('webusb')` asks the browser; `requireFeature` throws
   `ZnUnsupported` naming the feature and the browsers that ship it; `browserInfo()` gives name, version, engine and whether it is a phone. Outside a browser the module exists and answers false, so one source
   runs everywhere. The `web` row of `targets/capabilities.json` is the baseline the `requires` checks use (camera, microphone and notifications are `optional`: the browser asks the person).

3. **When a call cannot be served**, it throws `ZnUnsupported` (`error.code === 'ZN_UNSUPPORTED'`, `error.feature`) instead of crashing. An exception nobody catches shows as a bar at the bottom of the page in an
   export and as an overlay in `zinc dev`; the app's frame loop goes on.

### Support matrix

First version that ships each part; `–` means never shipped. Tested here: **Chrome (headless, with its fake camera and microphone) only.** Firefox and Safari are not tested by the project: their columns
are research from MDN, not a run, and Safari in particular deserves a pass on a Mac before a release.

| Part | Chrome / Edge | Firefox | Safari / iOS | Used by |
|---|---|---|---|---|
| ES modules, import maps | 89 | 108 | 16.4 | the page itself |
| Canvas2D `roundRect` | 99 | 112 | 16 | canvas mode |
| Conic gradients | 99 | 112 | 16.4 | canvas mode, `conic-gradient()` |
| Canvas `letterSpacing` | 99 | 115 | 18.4 | text tracking in canvas mode (without it: no tracking) |
| `getUserMedia` (https or localhost) | 53 | 36 | 11 | `zinc:camera`, `zinc:microphone`, `zinc:webrtc` |
| Web Audio, `AudioWorklet` | 35, 66 | 25, 76 | 14.1 | `zinc:audio`, `zinc:microphone` |
| WebRTC | 56 | 44 | 11 | `zinc:webrtc` |
| WebSocket | 4 | 11 | 5 | `zinc:socket` |
| WebAssembly | 57 | 52 | 11 | `zinc:sqlite` and other native plugins |
| WebGL2 | 56 | 51 | 15 | not used yet (`zinc:gl`) |
| WebGPU | 113 | 141 (Windows) | 26 | not used yet |
| Web Serial | 89 | – | – | `zinc:serial` (planned) |
| WebUSB | 61 | – | – | `zinc:gphoto2` (planned) |
| Web Bluetooth | 56 | – | – | planned |
| Web MIDI | 43 | 108 | – | `zinc:midi` (planned) |
| File System Access | 86 | – | – | planned (`showOpenFilePicker`) |
| Async clipboard | 66 | 63 | 13.1 | copy and paste |
| Notifications | 22 | 22 | 16 (iOS: installed web app, 16.4) | `zinc:system/notification` |
| Wake lock | 84 | 126 | 16.4 | `zinc:system/power` |
| Web Share | 89 | – | 12.1 | `zinc:system/share` |
| Service worker | 45 | 44 | 11.1 | the offline cache (the app runs without it) |
| Gamepad | 21 | 29 | 10.1 | `zinc:gfx` gamepads |

Known differences of fonts: the web host uses the system fonts (`system-ui`, `ui-monospace`, `ui-serif`) for the families Zinc ships (`sans`, `mono`), so widths differ a little from a desktop build and
Zinc's layout measures with them (it measures with the same canvas metrics the text is then drawn with). Fonts in `assets/` are loaded and used by file name.

## Plugins

A plugin declares its browser version in `plugin.json`:

```json
"web": { "entry": "web/index.ts", "needs": ["getUserMedia"] }
"web": { "native": "Audio", "impl": "web/audio.js", "needs": ["audio"] }
"web": { "native": "Sqlite", "impl": "web/sqlite.js", "needs": ["wasm"], "wasm": { "name": "sqlite", "sources": [...], "flags": [...], "exports": [...] } }
```

- **`entry`**: a module written for the page, used instead of `index.ts` by the web build (`zinc:camera`, `zinc:microphone`, `zinc:webrtc`, `zinc:socket`, `zinc:browser`). The API is the one of `index.ts`, so
  programs do not change.
- **`native` + `impl`**: the plugin's own `index.ts` runs unchanged; `impl` is the JavaScript that answers the calls of its native spec (`native/<x>.spec.ts`) with browser APIs (`zinc:audio`, `zinc:svg`,
  `zinc:system`). It registers with `__zincWeb.registerNative(name, functions, needs)`; the export concatenates the backends of the plugins the app uses into `native.<hash>.js`.
- **`wasm`**: native code in C or C++ built to WebAssembly by the pinned zig when the app is exported (`zig cc -target wasm32-wasi`, cached under `~/.zinc/cache/web-wasm`), compiled by the page before the
  app starts, and instantiated synchronously by the backend (`__zincWeb.wasmInstance`), so the calls stay synchronous as on a desktop. Only for code that has no browser equivalent.
- **`needs`**: feature names of `targets/web/browsers.json`; the export reports the browsers of the target set that lack them (W0601).

| Plugin | Web | How | Tested |
|---|---|---|---|
| `zinc:camera` | yes | `getUserMedia` and a `<video>`; frames drawn into a gfx image (`cam.image`), snapshots, PNG, stills; every video track gets `.camera` | Chrome |
| `zinc:microphone` | yes | `getUserMedia`, Web Audio `AudioWorklet` blocks of 20 ms, level; every audio track gets `.microphone` | Chrome |
| `zinc:webrtc` | yes | the browser's `RTCPeerConnection` and friends under the same names; `examples/webrtc-call` runs unchanged | Chrome (a loopback call: VP8, Opus, stats) |
| `zinc:audio` | yes | Web Audio: decoded sounds, 32 voices with gain and pan, tones, PCM, streams; starts at the first click or key | Chrome |
| `zinc:socket` | partly | `WebSocket` and its events (the browser's own); TCP, UDP, Unix sockets, DNS and the WebSocket server throw `ZnUnsupported` | loads (the call demo imports it); no socket traffic tried |
| `zinc:svg` | yes | the SVG parsed with `DOMParser`, drawn with `Path2D` (canvas) or as a real `<svg>` (DOM); icons of the kits | Chrome |
| `zinc:system` | partly | notifications, clipboard (rich), opener, share, wake lock, dock badge, appearance, dialog messages; menus, tray, window geometry are accepted and do nothing; global shortcuts, autostart, updates answer `unsupported` | Chrome (the desktop-app template runs) |
| `zinc:sqlite` | yes | the amalgamation as WebAssembly, in memory, saved to `localStorage` per path (about 3 MB at most) | Chrome |
| `zinc:browser` | new | the queries above | Chrome |
| `zinc:gestures`, `loader`, `pixelfont`, `sprite`, `tilemap`, `gsap`, `ink` | expected | pure Zinc over `zinc:gfx`, no native side | not tried |
| `zinc:physics2d` | not yet | Box2D to WebAssembly like sqlite; its host is written against the Zinc runtime types, so it needs a small C shim | – |
| `zinc:gphoto2` | not yet | WebUSB (Chromium only) and libgphoto2 or its PTP part as WebAssembly | – |
| `zinc:serial`, `zinc:midi` | not yet | Web Serial (Chromium), Web MIDI (Chromium, Firefox) | – |
| `zinc:3d`, `zinc:three`, `zinc:physics3d`, `zinc:canvas2d`, `zinc:lottie` | not yet | the browser's WebGL2 and Canvas2D directly (three.js already runs there); `zinc:gl` needs a `web` entry that hands out a WebGL2 context | – |
| `zinc:video` | not yet | an `HTMLVideoElement` drawn into a gfx image, as the camera is | – |
| `zinc:map`, `zinc:mapping`, `zinc:osc`, `zinc:sonos`, `zinc:spotify` | not yet | fetch and WebSocket over a proxy where the service has no CORS; the map engine's native code as WebAssembly | – |
| `zinc:process`, `zinc:ffi`, `zinc:script`, `zinc:wasm`, displays, boards, `zinc:remote`, `zinc:webos`... | no | no equivalent on a page (the browser runs WebAssembly and `eval` itself) | – |

## Hot reload

`zinc dev --target web` serves the project as unbundled modules (no esbuild run per save) on `http://127.0.0.1:8000/` (the next free port when taken; `--port n`, `--lan` to open it to the network, `--render` as above) and
tells the page about each save over a WebSocket (`/__zinc/ws`).

| You save | The page |
|---|---|
| a module that exports only functions (components, helpers) | the module is evaluated again in place; the component instances that ran it are disposed and rendered again (`zinc:ui/solid` does this through `_hotC`, as the typed engine's Fast Refresh does); every module you did not touch keeps its state: signals, stores, scroll positions, the open screen |
| a module that exports state (a signal, a store, a class), a new file, the entry | the page reloads (its modules may hold state that the new code would reset) |
| a file that does not compile | a red overlay with the diagnostics; the app keeps running behind it; the next good save clears it |
| anything that is not a module (assets, zinc.json, a plugin) | the page reloads |

The modules can use `import.meta.hot` as in Vite (`accept`, `dispose`, `on('beforeUpdate' | 'afterUpdate')`, `data`) to undo top-level effects. The exports of a refreshed module are forwarded: a module that imported the
old function calls the new one, with no reload of the importers.

The existing Fast Refresh of `zinc dev` (D122 to D124) maps live objects of the interpreter to new classes; that machinery is the interpreter's, so the web build reuses its program-side API
(`import.meta.hot`, `_hotC`, `zinc:ui/solid`'s hooks) and not the swap itself. A save took 55 to 70 ms to reach the page in the fixture of `tests/t1/web_dev.sh`.

## Hosting

Any static host. Upload the folder; `index.html` and `sw.js` should not be cached for long and the hashed files may be (`_headers` does it for Netlify and Cloudflare Pages; set it by hand for nginx, S3 or
GitHub Pages). Serve over https: `getUserMedia`, notifications, the service worker and the clipboard need a secure context (localhost counts). `.br` and `.gz` copies sit beside each file for hosts that serve
precompressed files (`gzip_static`, `brotli_static`); others compress by themselves.

## Tests

`tests/t1/web_export.sh` (the export of the hero demo, canvas and DOM, in headless Chrome), `web_dev.sh` (Fast Refresh, overlay, reload, through the DevTools pipe), `web_caps.sh` (the capability warnings and `zinc explain`),
`web_plugins.sh` (the webrtc call demo, camera, microphone, audio and sqlite). `tools/web-browser-test` and `tools/web-dev-test` drive Chrome; `tools/web-measure` prints the numbers of
[the report](../reports/zinc-web-export.md). Without Chrome they skip.
