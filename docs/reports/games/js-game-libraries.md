# Games: running JavaScript game libraries on Zinc (research and measurements, 2026-10-09)

Scope: what it takes to make 2D and 3D games entirely in Zinc **with existing JavaScript libraries** (PixiJS 7/8, Phaser 3/4, p5.js 1/2
in 2D and WEBGL mode, three.js, Babylon.js, Kaplay, matter-js, planck.js, cannon-es, Howler.js, GSAP, Tone.js, LittleJS, PlayCanvas),
where the limits are, and how the work fits Zinc's rule "a minimal core, pluggable, with a suite of plugins or deps". Companion report:
[toolchain, assets and loading](toolchain-assets-loading.md) (asset pipeline, decoding on the thread pool, `zinc:assets` v2); this one
covers the run-time API surface, the engine and the rendering path.

Evidence tags: **[M]** measured here (Apple M1 Pro, 16 GB, macOS 15.7.4, `next/build/zinc` of 2026-10-09, `zinc run --engine quickjs`,
`ZINC_WEBGL=1`, Apple GL 4.1 core through Zinc's WebGL translation; Node 24.14 for the V8 comparison), **[C]** read in Zinc's code (file
given), **[W]** from the web or the library's shipped source (URL given), **[I]** inferred or estimated, not measured. Nothing was
measured on a Raspberry Pi.

The probe scripts are outside the repository, in `/Users/mowmow/.claude/jobs/f633d587/tmp/games-libs/` (`probe/env.mjs`: a traced
browser environment of about 400 lines that records every browser API a library touches; `probe/*.mjs`: one probe per library;
`kernel/`: the sprite kernel and the `zinc:gfx` bunnymark). `env.mjs` is the natural seed of the web-environment plugin of section 8.

---

## 0. Summary

1. **Most of the libraries already run on Zinc's QuickJS engine and WebGL** once a DOM layer is supplied [M]: PixiJS 8.22 and 7.4.3,
   Phaser 3.90 (WebGL 1), p5.js 1.11 and 2.3 (2D against a recording context, WEBGL for real), three.js r186, Babylon.js 9.30 (WebGL 2),
   Kaplay 3001, LittleJS 1.27, matter-js, planck.js, cannon-es and GSAP all boot and animate. PixiJS v8 was also shown in a real Zinc
   window through `zincPresent` + `zinc:gfx`.
2. **What Zinc lacks is the browser around WebGL**, not WebGL itself: the QuickJS engine has no `window`, DOM tree, events,
   `requestAnimationFrame`, `Image` decoding, `fetch`/XHR, Canvas 2D, Web Audio, Gamepad, `Path2D`, `ResizeObserver`, `structuredClone`
   [M]. The only DOM is `document.createElement('canvas')` with a WebGL `getContext` [C `next/src/gl/webgl_js.cpp`].
3. **Eleven Zinc defects were found by running real libraries** (section 4), four of them blocking: a WebGL 2 context is
   `instanceof WebGLRenderingContext` (PixiJS v8 falls to its WebGL 1 path, three.js refuses a context passed in), the ESSL 1.00
   pre-check rejects `#define in attribute` (every PixiJS v8 shader), the desktop translation of ESSL 1.00 breaks shaders that name a
   variable `texture` (Phaser 3's batch shader), and any deep JS recursion kills the process with SIGSEGV instead of a `RangeError`
   (p5.js 1.x crashes while loading).
4. **The compatibility tier is CPU-bound in the interpreter.** QuickJS runs game-library code **20 to 40 times slower than V8** (matter-js,
   planck, cannon-es; 8.6x on GSAP) and a raw sprite loop 60x slower [M]. Measured budgets at 60 fps on the M1 Pro: about **4,000
   PixiJS v8 sprites**, 2,200 PixiJS v7 sprites, 1,000 Phaser 3 arcade sprites, 550 three.js meshes (or ~6,000 animated instances), 370
   Babylon meshes, 380 Kaplay sprites, 160 p5 WEBGL boxes, 100 to 300 physics bodies. The WebGL binding itself is cheap (70-100 ns per
   call) except for typed-array arguments (+1.2 µs each, a fixable defect).
5. **GC is mostly invisible** (reference counting frees acyclic garbage at once), but **cyclic garbage triggers whole-heap scans**: 12 ms
   pauses with 100k live objects, 100-170 ms with 1M [M]. V8 stays under 6 ms on the same test.
6. **The native tier is 20-160x cheaper on the CPU but the software rasterizer caps it**: a `zinc:gfx` bunnymark in AOT costs 25 ns per
   sprite of program time, yet rasterizing 2,000 26x37 sprites at Retina scale takes 11 ms [M]. A GPU sprite path is the precondition
   for a native tier that beats the compatibility tier.
7. **Presentation is a readback**: `zincPresent` reads the WebGL drawing buffer back with `glReadPixels`, converts it pixel by pixel and
   hands it to the software UI [C `next/src/main.cpp` glPresent]: 2.1 ms at 1280x960 [M], several ms at full Retina [I]. A zero-copy
   path (WebGL drawing straight into the window, or as a GPU layer of display-gl) is the single most valuable rendering task.
8. **Recommended layout**: core unchanged; on-demand modules beside `libzn_webgl` for Canvas 2D, audio and physics; a JavaScript
   web-environment module evaluated only in QuickJS contexts that ask for it; one native audio engine (miniaudio, decision D12) with two
   front ends (`zinc:audio` typed, `AudioContext` facade for JS); one GPU sprite batcher with two front ends (`zinc:game` typed, a native
   accelerator for PixiJS). Opt-in by `zinc.json` `"web": {...}` (generalising today's `"webgl": true`).
9. **Canvas 2D**: a **text-first** subset (fillText/measureText/getImageData on a CPU bitmap with HarfBuzz) unblocks PixiJS, Phaser and
   Kaplay text in WebGL mode for a fraction of the cost; the full spec (p5 2D, Phaser CANVAS, LittleJS overlay) needs a real backend:
   **Skia** for fidelity (35-50 days, 6-20 MB) or an own compositor over ThorVG coverage for a small tier (45-60 days, ~0.5 MB) [W, I].
10. **Web Audio**: a "Web Audio lite" graph in C++ on miniaudio (public domain / MIT-0) covers everything Howler, Phaser, Kaplay and
    LittleJS call (20-28 days [I]); Tone.js and p5.sound need almost the full spec (web-audio-api-rs as an optional plugin) [W].
11. **Backlog**: 24 ordered tasks in section 10, ending in four demos with FPS gates: p5.js sketches, a PixiJS sprite demo, a Phaser 3
    platformer and a three.js game.

---

## 1. Method

- Libraries were fetched with `npm pack` (no install scripts) at the versions current on 2026-10-09: pixi.js 8.22.0 and 7.4.3, phaser
  3.90.0 and 4.2.1 (Phaser 4.0.0 shipped 2026-04-10), p5 1.11.13 and 2.3.4, three 0.186.1 (the copy vendored in `next/third_party/three`),
  babylonjs 9.30.0, kaplay 3001.0.19, matter-js 0.20.0, planck 1.5.0, cannon-es 0.20.0, howler 2.2.4, gsap 3.15.0, littlejsengine 1.27.0;
  tone 15.1.22 and playcanvas 2.23.1 were read, not run.
- Each library was loaded unchanged in `zinc run --engine quickjs` (ESM through the module loader, UMD through indirect `eval` of the
  file text) on top of `env.mjs`, a browser environment that **records** every member read on `window`, `document`, canvases, the 2D
  context (a recorder that draws nothing), Web Audio (a recorder, no sound), `Image` (a synthetic checker texture, no decoder) and
  optionally every WebGL call. Missing globals are reported as `(missing)`.
- Frame time = `performance.now()` around the library's update and render with `gl.finish()`, offscreen 800x600 drawing buffer unless
  stated, median of 20-60 frames after warm-up. "N at 60 fps" divides 16.7 ms by the measured per-object cost.
- The V8 comparison runs the same file in Node 24 (the physics and tween libraries need no DOM). The native tier was measured with the
  same kernel in Zinc's typed interpreter (`--interp`) and AOT (`zinc run` compiles programs that draw).
- Constraints respected: no cmake build, one `zinc` run at a time, no file written in the repository except this report.

---

## 2. What Zinc provides today

### 2.1 The QuickJS engine (`zinc run --engine quickjs`, `zinc:script`)

| Present [M] | Missing [M] |
|---|---|
| `document` (only `createElement('canvas')`), `performance.now` (real time), `TextEncoder`/`TextDecoder`, `AbortController`, `setTimeout`/`setInterval` (virtual clock), `queueMicrotask`, `WebGLRenderingContext`, `WebGL2RenderingContext`, `atob`/`btoa`, `WeakRef`, `FinalizationRegistry`, `SharedArrayBuffer`, `Atomics`, `Intl` (with `Segmenter`), a small `process`, `console` with Node's `inspect` | `window`, `self`, `navigator`, `location`, `requestAnimationFrame`, `Image`/`HTMLImageElement`, `HTMLCanvasElement`, `createImageBitmap`, `ImageData`, `OffscreenCanvas`, `fetch`, `XMLHttpRequest`, `AudioContext`, `Audio`, `Worker`, `FontFace`, `devicePixelRatio`, `addEventListener`, `matchMedia`, `getComputedStyle`, `localStorage`, `Blob`, `URL`, `structuredClone`, `DOMMatrix`, `Path2D`, `Event`/`EventTarget`, `PointerEvent`/`KeyboardEvent`, `crypto`, `WebAssembly` |

- The typed engine's Web APIs (`lib/std/web.ts`: URL, fetch, Blob, events, crypto...) are Zinc code for typed programs; QuickJS contexts
  do not get them [C `next/src/qjs/ext.cpp`, `prelude.cpp`].
- `Date.now()` is the virtual clock; `performance.now()` is real time. A library that times frames with `Date.now()` sees time move only
  by the frame loop's `dt` [C `prelude.cpp`].
- A QuickJS program gets a window frame loop when it registers `zinc:gfx` `onFrame`; `zinc:gfx` drawing calls are the same host table as
  the typed engines (`__host_*`, ~150 ns per call through QuickJS [M]).

### 2.2 WebGL (`libzn_webgl`, loaded on the first QuickJS context, decision D40)

- WebGL 1 and 2 over an **offscreen** GL context in a hidden SDL window with an FBO as the default framebuffer
  [C `next/src/gl/offscreen.h`]; validation in `WebGL1` [C `webgl1.h`]; ESSL validated by glslang and translated to GLSL 3.30 core on
  desktop, passed through unchanged on GLES drivers [C `webgl1.cpp` translate]. Khronos conformance 695 of 787 pages
  [C `next/RESUME.md`].
- Extensions [M]: WebGL 1 has `OES_vertex_array_object`, `ANGLE_instanced_arrays`, `OES_element_index_uint`, `OES_standard_derivatives`,
  float and half-float textures, `WEBGL_depth_texture`, `WEBGL_draw_buffers`, `EXT_sRGB`, `EXT_blend_minmax`, `EXT_frag_depth`,
  `EXT_shader_texture_lod`, S3TC, RGTC, anisotropy, lose_context; WebGL 2 has `EXT_color_buffer_float`, `EXT_float_blend`,
  `OES_draw_buffers_indexed`, anisotropy, S3TC, RGTC. `MAX_TEXTURE_IMAGE_UNITS` 16, `MAX_TEXTURE_SIZE` 16384.
- **No multisampled default framebuffer**: `antialias: true` is reported back as `false` [M] (the examples supersample instead).
- **Presentation**: `gl.zincPresent(image)` reads the drawing buffer back and converts it into a `zinc:gfx` runtime image, which the UI or
  `gfx.drawImage` then shows [C `webgl_js.cpp` zincPresent, `main.cpp` glPresent].
- Only `document.createElement('canvas')` exists; the three.js examples write the rest of the DOM by hand (listeners, bounding box,
  `ownerDocument`, `window = globalThis`) [C `examples/webgl-cube/assets/scene.mjs`].

### 2.3 2D and other media

- `zinc:gfx`: immediate 2D (rect, rrect, line, polygon, path, stroke, gradients, text, `drawImage(img, x, y, w, h, alpha, radius)`, clip,
  translate, runtime images). No rotation or scale of images, no source rectangle (atlas), no blend modes, no tint [C
  `next/src/frontend/modules.cpp` kGfxModule]. Rasterized in software by the shared rasterizer; display-gl uploads the result.
- `zinc:canvas` (`plugins/canvas2d`): a typed `CanvasRenderingContext2D` for Zinc programs on the software rasterizer. Its documented
  deviations rule it out for JS libraries as is: `fillGradient` instead of `fillStyle = gradient`, clip to the bounding box, text and
  images not rotated, no composite operations, no `getImageData`/`putImageData`, no patterns, no `Path2D`, and **runtime images have no
  alpha channel** [C `docs/plugins/canvas2d.md`].
- Audio: none (`zinc:audio` is backlog task ZN-390). Gamepad: none (keyboard buttons only, `Btn`). Image decoding at run time in
  QuickJS: none (the resource baker decodes at build time).

---

## 3. Library by library

Columns: what the library needs [W, from the shipped source; URLs in each row], what Zinc's QuickJS engine did with it [M], and what
blocked it. "Recorder" means the 2D context or the audio graph was a recording stub.

| Library | GL | Canvas 2D | DOM / BOM | Assets | Input | Audio | Hooks for a non-browser host | On Zinc today [M] |
|---|---|---|---|---|---|---|---|---|
| **PixiJS 8.22** ([GlContextSystem](https://unpkg.com/pixi.js@8.22.0/lib/rendering/renderers/gl/context/GlContextSystem.mjs)) | WebGL 2 first, WebGL 1 fallback; VAO mandatory; one draw per batch of 16 textures | Text (`fillText`, `measureText` with bounding boxes, `letterSpacing`, shadows, gradients, `getImageData`), Canvas renderer since 8.16 (19 composite modes, `ctx.filter`) | rAF, `performance.now`, pointer events on canvas/document/window, `ResizeObserver` if present, `ismobilejs(navigator)` at import | `fetch` + `createImageBitmap` in a Worker by default, else `Image`; `FontFace` | Pointer, wheel; no gamepad | none | `DOMAdapter.set()` ([adapter.d.ts](https://unpkg.com/pixi.js@8.22.0/lib/environment/adapter.d.ts): createCanvas, createImage, getCanvasRenderingContext2D, getWebGLRenderingContext, getNavigator, getBaseUrl, getFontFaceSet, fetch, parseXML), `skipExtensionImports` | Boots after two workarounds (defects D1, D2); bunnymark 1k sprites 4.9 ms, 10k 40.9 ms, 50k 199 ms per frame: **~4,000 sprites at 60 fps**; also ran in a window |
| **PixiJS 7.4.3** | WebGL 2 first; VAO optional | as v8 minus the Canvas renderer | as v8 | Loader, `Image` | Pointer | none | `settings.ADAPTER` ([migration](https://github.com/pixijs/pixijs/blob/v8.21.0/src/__docs__/migrations/v8.md)) | Boots unchanged; 1k sprites 7.7 ms, 10k 73 ms: **~2,200 at 60 fps** |
| **Phaser 3.90** ([Config](https://unpkg.com/phaser@3.90.0/src/core/Config.js)) | **WebGL 1 only** (`getContext('webgl')`), instancing/VAO optional, up to 16 units | Text objects even under WebGL; CANVAS renderer uses all 26 composite modes, 9-arg `drawImage`, `getImageData` | Device detection at load (`navigator`, `window.cordova`, `window.ejecta`, test contexts, data-URI `Image` blend tests), `document.readyState`, rAF, visibility, ScaleManager | XHR blob + `URL.createObjectURL` + `Image` (or `loader.imageLoadType: 'HTMLImageElement'`), `FontFace`, `DOMParser` | Keyboard on window, mouse/touch on canvas + window, **Gamepad API** | `WebAudioSoundManager` (Gain, BufferSource, StereoPanner/Panner, decodeAudioData) + HTML5 fallback | `type: HEADLESS`, `customEnvironment`, `canvas`/`context` injection, `fps.forceSetTimeOut`, `audio.noAudio` ([HEADLESS](https://newdocs.phaser.io/docs/3.85.2/focus/Phaser.HEADLESS)) | Boots after shader workaround (D3) and an XHR shim; 2,000 arcade-physics sprites 32.7 ms (p95 36, max 84): **~1,000 at 60 fps** |
| **Phaser 4.2.1** ([changelog](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md)) | WebGL 1 by default, accepts an injected WebGL 2 context; on WebGL 1 **requires** `ANGLE_instanced_arrays` + `OES_vertex_array_object` (Zinc has both) | Canvas renderer deprecated; text still 2D | as Phaser 3 | as Phaser 3 | as Phaser 3 | as Phaser 3 | as Phaser 3; uses `gl instanceof WebGLRenderingContext` (hit by D1) | Not run (read only) |
| **p5.js 1.11** ([p5.js](https://unpkg.com/p5@1.11.13/lib/p5.js)) | WEBGL mode: **WebGL 2 by default**, WebGL 1 fallback | P2D: full path API, ellipse, bezier, clip, shadows, gradients, `getImageData` (pixels), 20 composite modes; `filter()` uses a WebGL layer | Events on window, `document.getElementsByTagName('main')`, rAF, `devicePixelRatio`; bundles core-js polyfills | `loadImage` through `Image`, `loadFont` | Mouse/touch/keys on window | p5.sound add-on (near-full Web Audio) | Instance mode, `createCanvas(w, h, renderer, canvas)` | **Crashed the process while loading** (D4); with a 64 MB stack: 300 shapes 2.8 ms of JS (recorder, no raster), WEBGL 300 boxes 30.6 ms (**~160 boxes at 60 fps**, 12 GL calls per box) |
| **p5.js 2.3** ([RendererGL](https://unpkg.com/p5@2.3.4/dist/webgl/p5.RendererGL.js)) | WebGL 2 by default | Every 2D shape through **`Path2D`** ([custom_shapes](https://unpkg.com/p5@2.3.4/dist/shape/custom_shapes.js)); `structuredClone` | `sessionStorage`, async setup and draw | `fetch` → Blob → `createObjectURL` → `Image`; `FontFace`, Typr.js | as 1.x | p5.sound | Renderer registry, undocumented `p5/node` export | Silent stop on a missing `Path2D` (D7), then on `structuredClone`; with stubs: 300 shapes 10.1 ms, WEBGL 300 boxes 39 ms (**~125 at 60 fps**) |
| **three.js r186** ([WebGLRenderer](https://unpkg.com/three@0.186.1/src/renderers/WebGLRenderer.js)) | **WebGL 2 only** (throws on WebGL 1 since r163) | none in core (CanvasTexture optional) | canvas listeners for controls | `ImageLoader` (`createElementNS('img')`), GLTFLoader → `ImageBitmapLoader` (`fetch` + `createImageBitmap`) or `TextureLoader`; Blob URLs for embedded images; DRACO/KTX2 in Workers | Controls: pointer on canvas, keys | `AudioListener`/`PositionalAudio` (Web Audio) | `WebGLRenderer({canvas, context})` | Runs (ZN-204); **refuses a WebGL 2 context passed as `context`** (D1); 100 meshes 3.3 ms, 500: 14-15 ms, 2,000: 53-57 ms (**~550 meshes at 60 fps**, 2 GL calls per mesh); InstancedMesh 10k with per-frame matrices 26 ms (JS-bound), static instances cheap (50k: 2.4 ms render) |
| **Babylon.js 9.30** ([server side](https://doc.babylonjs.com/setup/support/serverSide)) | WebGL 2 first, WebGL 1 fallback, every extension optional | font offsets via `measureText` | guarded DOM access (`IsWindowObjectExist`), rAF or `setTimeout` | XHR (`WebRequest`), `Image`, `createImageBitmap` | Pointer (`PointerEvent` missing noticed) | AudioV2 (GainNode, AudioBufferSourceNode, PannerNode, Analyser, OfflineAudioContext) | `NullEngine`, `Engine(canvas or context)`; Babylon Native polyfills only Canvas, Console, Window, XHR ([Polyfills](https://github.com/babylonjs/babylonnative/blob/master/Documentation/Polyfills.md)) | Boots on WebGL 2; 8.6 MB bundle evaluates in 1.3 s; 100 boxes 5.0 ms, 500: 22.3 ms (**~370 meshes at 60 fps**) |
| **Kaplay 3001** ([kaplay.mjs](https://unpkg.com/kaplay@3001.0.19/dist/kaplay.mjs)) | **WebGL 1 only** | Font atlas: per-glyph `fillText`/`measureText` + `getImageData` | Unguarded `ResizeObserver`, `document.visibilityState` every frame, `document.fonts` | `Image`, `fetch`, `FontFace` | Keys/mouse/touch on canvas, gamepad on window | **`new AudioContext` inside `kaplay()`** (throws without it) | `canvas` option | Needed `ResizeObserver` and an `AudioContext`; 1,000 rotating sprites 43.9 ms (**~380 at 60 fps**) |
| **LittleJS 1.27** ([littlejs.esm.js](https://unpkg.com/littlejsengine@1.27.0/dist/littlejs.esm.js)) | WebGL 2, falls back to Canvas 2D | Overlay canvas for text (`fillText`, `filter`, shadows, `setTransform`) | rAF, `document` input | `Image` | Keys/mouse on document, gamepad | `new AudioContext` at module scope; Gain, BufferSource, Biquad, Convolver, Delay, Compressor, WaveShaper | `setHeadlessMode(true)` | Debug build: 2,000 objects 12.8 ms (**~2,600 at 60 fps**) |
| **matter-js 0.20** ([matter.js](https://unpkg.com/matter-js@0.20.0/build/matter.js)) | none | `Render` module only | `Runner` throws without `window.requestAnimationFrame`; `Engine.update` is headless | – | `Mouse` on an element | none | drive `Engine.update` yourself | 100 piled bodies 6.1 ms (Node 0.25), 500: 45 ms (Node 2.3), max 166 ms: **20-24x V8** |
| **planck.js 1.5** | none | testbed only | none | – | – | – | pure | 100 bodies 9.9 ms (Node 0.48), 500: 28.5 ms (Node 1.24): **21-23x** |
| **cannon-es 0.20** | none | `setHeightsFromImage` only | `performance` | – | – | – | pure | 100 bodies 10.6 ms (Node 0.42), 500: 39 ms (Node 0.99): **25-40x** |
| **GSAP 3.15** ([gsap-core](https://unpkg.com/gsap@3.15.0/gsap-core.js)) | none | none | rAF or `setTimeout`, auto-wake if `window` exists; DOM only for selectors and CSSPlugin | – | – | – | tween plain objects | 5,000 tweens 5.8 ms per frame (Node 0.67): **8.6x** |
| **Howler 2.2.4** ([howler.core.js](https://unpkg.com/howler@2.2.4/src/howler.core.js)) | none | none | unlock listeners on document, UA sniffing (Ejecta, CocoonJS) | XHR `arraybuffer`, data URIs | – | Gain, BufferSource, Buffer, decodeAudioData, StereoPanner/Panner + Listener, AudioParam ramps; **needs `new Audio().canPlayType`** for codec detection even in Web Audio mode | – | Not run (needs the audio plugin) |
| **Tone.js 15.1** | none | none | `self`, `window.hasOwnProperty('AudioContext')` (standardized-audio-context) | fetch + decodeAudioData | – | near-full Web Audio incl. **AudioWorklet** from Blob URLs, IIR, Convolver, WaveShaper; clock in a Worker | DummyContext when absent | Not run |
| **PlayCanvas 2.23** | WebGL 2 only | – | – | `createImageBitmap`, Workers, WASM (Draco, Basis) | – | Gain, Panner | `options.gl` | Not run |

Notes:
- Prior art for a JS engine with WebGL and no DOM exists and confirms the shape of the work: WeChat mini-games' `weapp-adapter` shims a
  global canvas, `document.createElement`, `Image`, `Audio`, XHR, `localStorage` and listeners and was enough for Phaser
  ([adapter](https://developers.weixin.qq.com/minigame/en/dev/tutorial/base/adapter.html), [Phaser on WeChat](https://www.phaser.io/news/2018/01/running-phaser-on-wechat));
  Ejecta (JavaScriptCore + native Canvas 2D/WebGL on GLES2, [repo](https://github.com/phoboslab/Ejecta)) is still detected by Phaser and Howler;
  NativeScript Canvas ships `canvas-pixi`, `canvas-phaser`, `canvas-three`, `canvas-babylon` polyfills on Skia ([repo](https://github.com/NativeScript/canvas));
  the Node route is jsdom + node-canvas + headless-gl (headless-gl's WebGL 2 is experimental, [repo](https://github.com/stackgl/headless-gl));
  `@geckos.io/phaser-on-nodejs` lists exactly what Phaser HEADLESS touches ([repo](https://github.com/geckosio/phaser-on-nodejs)).
- Engine features: `Intl` is required at PixiJS import (`typeof Intl?.Segmenter`); Zinc's QuickJS has it [M]. No library needs
  `WebAssembly` on its main path; optional decoders (DRACO, KTX2/Basis, Havok, the LittleJS Box2D plugin) do, and three's DRACOLoader has
  a JS fallback ([DRACOLoader](https://unpkg.com/three@0.186.1/examples/jsm/loaders/DRACOLoader.js)).
- Workers are optional everywhere they appear (PixiJS asset loading, Tone's clock, DRACO/KTX2): a `Worker` that is absent or throws on
  construction makes each library fall back.

### 3.1 The browser APIs the traces recorded

Union over the probes [M] (each entry was read by at least one library at boot or during frames):

- **Window**: `window`/`self`/`top`, `navigator` (`userAgent`, `platform`, `maxTouchPoints`, `getGamepads`, `hardwareConcurrency`),
  `location`, `screen` (+ `orientation`), `innerWidth/Height`, `devicePixelRatio`, `requestAnimationFrame`/`cancelAnimationFrame`,
  `performance`, `addEventListener` (keydown, keyup, keypress, mouse*, touch*, wheel, blur, focus, resize, load, error, unhandledrejection,
  message, gamepadconnected/disconnected, p5Ready), `matchMedia`, `getComputedStyle`, `localStorage`, `sessionStorage`, `postMessage`,
  `MessageChannel`, `PromiseRejectionEvent` (without it core-js inside p5 1.x **replaces the native `Promise`**), `structuredClone`,
  `ResizeObserver`, `MutationObserver` (probed), `ImageData`, `Path2D`, `DOMMatrix`, `URL.createObjectURL`, `Blob`, `XMLHttpRequest`,
  `fetch`, `AudioContext`/`webkitAudioContext`, `Audio`, `PointerEvent`, `File`, `Worker` (probed).
- **Document**: `createElement` (canvas, img, div, main, a, audio, video), `createElementNS`, `body`, `head`, `documentElement`,
  `getElementById`, `getElementsByTagName` (main, canvas), `querySelector`, `readyState`, `visibilityState`/`hidden`, `hasFocus`,
  `fonts`, `addEventListener` (visibilitychange, pointerlockchange, mousemove), `createEvent` (probed).
- **Elements and canvas**: `style.*`, `classList`, `dataset`, `appendChild`/`removeChild`/`parentNode`, `getBoundingClientRect`,
  `offsetWidth/Height`, `tabIndex`, `focus`, `addEventListener` (contextmenu, mouse*, pointer*, touch*, wheel, keydown,
  webglcontextlost/restored), `toDataURL`.
- **2D context** (union): `drawImage` (3, 5, 9 args), `fillRect`, `clearRect`, `fillText`, `strokeText`, `measureText`, `getImageData`,
  `putImageData`, `createImageData`, `save`/`restore`, `setTransform`, `scale`, `translate`, `rotate`, `beginPath`, `closePath`, `ellipse`,
  `fill(Path2D)`, `font`, `textAlign`, `textBaseline`, `direction`, `fontStretch`, `fillStyle`, `strokeStyle`, `lineCap`/`lineJoin`/`lineWidth`,
  `globalAlpha`, `globalCompositeOperation` (multiply probed at boot by PixiJS and Phaser), `shadowBlur`/`shadowColor`/`shadowOffset*`,
  `filter`, `imageSmoothingEnabled`.
- **Web Audio** (Kaplay, LittleJS boot): `AudioContext()`, `createGain`, `createBuffer`, `decodeAudioData`, `destination`, `gain.value`,
  `connect`.

---

## 4. Zinc defects found

| # | Defect | Evidence | Impact | Fix |
|---|---|---|---|---|
| **D1** | `WebGL2RenderingContext.prototype` inherits from `WebGLRenderingContext.prototype` (`gProto2 = JS_NewObjectProto(c, proto)` in `install`), so a WebGL 2 context is `instanceof WebGLRenderingContext`; browsers make the two interfaces siblings | [C `next/src/gl/webgl_js.cpp` install], [M] `gl2 instanceof WebGLRenderingContext === true` | PixiJS v8 takes WebGL 2 for WebGL 1 and fails "Vertex Array Objects are not supported"; three.js throws "WebGL 1 is not supported" for a WebGL 2 context passed as `context` [M]; Phaser 4 patches WebGL 1 extensions onto it | Give WebGL2RenderingContext its own prototype with the shared methods copied (WebGLRenderingContextBase mixin); a conformance test on `instanceof` |
| **D2** | `essl1Violation` rejects `in`/`out` declarations with a regex **before** the preprocessor runs, so `#ifdef GL_ES / #define in attribute` fails | [C `next/src/gl/webgl1.cpp:124`], [M] minimal repro fails in WebGL 1 and 2 | Every PixiJS v8 WebGL shader (its WebGL 1/2 compatible header) | Check the glslang-preprocessed text (the validator already preprocesses), or drop the regex where glslang reports the same error |
| **D3** | The ESSL 1.00 → GLSL 3.30 translation defines `texture2D` as `texture`; a shader that names a variable `texture` (legal in ESSL 1.00) shadows the function | [C `webgl1.cpp` translate], [M] Phaser 3: "Invalid call of 'texture'" x16 | Phaser 3 multi-texture batch shader (the default pipeline) | Rename user identifiers that are GLSL 3.30 built-ins (as `desktopOnlyWord` does for others), or call a prelude helper `zn_texture2D`; long term ANGLE (D30) or glslang → SPIRV-Cross. GLES drivers (Pi, Linux ES) are not affected |
| **D4** | `JS_SetMaxStackSize(rt, 8 MB)` equals the macOS main-thread stack (`ulimit -s` 8176 KB): deep recursion overflows the native stack before QuickJS's check, **SIGSEGV** instead of `RangeError` | [C `next/src/qjs/qjs.cpp` run], [M] `function f(){return f()+1}` exits 139; with `ulimit -s 65520` it throws `RangeError` | p5.js 1.11 dies while loading (a core-js feature test recurses and expects a catchable `RangeError`); any runaway recursion in user code kills the process without a stack | Set the limit to the thread stack minus a margin (or run the engine on a thread with a larger stack); a T0 test |
| **D5** | Typed-array arguments go through `bytesOf`, which first calls `JS_GetArrayBuffer` on the view: it throws a `TypeError` (stack trace built) that is then discarded | [C `webgl_js.cpp:95` bytesOf], [M] `uniform4fv(Float32Array)` 1,352 ns vs `uniform4f` 99 ns; `bufferSubData(Float32Array)` 1,336 ns vs `(ArrayBuffer)` 114 ns; a JS throw+catch is 1,077 ns | Every `uniform*fv`, `uniformMatrix*fv`, buffer and texture upload with a view: three.js pays it per mesh, p5 twice per box | Test the class first (`JS_GetTypedArrayType` / `JS_IsArrayBuffer`) — 10x on these calls |
| **D6** | The frame loop is chosen once, right after the synchronous part of the entry module: `onFrame` registered after a top-level `await` is never called | [C `qjs.cpp` run: `__zincFrameCb` checked after `drain`], [M] PixiJS window demo exits silently after `await app.init()` | Every async-initialised library (PixiJS v8 `await app.init()`, asset loading before the loop) | Enter the frame loop when `onFrame` is first called, or re-check after each timer turn |
| **D7** | No promise rejection tracker: an exception in an async function that nobody awaits disappears | [C no `JS_SetHostPromiseRejectionTracker` in `src/qjs`], [M] p5 2.x stopped after one frame with no message (missing `Path2D` inside the async draw loop) | Silent failures in modern async libraries (p5 2.x, PixiJS v8) | Install the tracker, print "Uncaught (in promise)" like browsers and dispatch `unhandledrejection` |
| **D8** | `zincPresent` copies the drawing buffer through `glReadPixels` and a per-pixel C++ loop into a CPU image, which the UI rasterizes or uploads again | [C `main.cpp` glPresent], [M] 2.1 ms per frame at 1280x960 (readback alone 0.3 ms at 800x600) | Adds milliseconds per frame and a GPU stall; grows with resolution | Zero-copy present (section 6.6) |
| **D9** | No multisampled default framebuffer | [M] `antialias: true` → `getContextAttributes().antialias === false`, `SAMPLES` 0 | Jagged edges in every 3D library that relies on the default MSAA | MSAA renderbuffer on the offscreen FBO, resolved at present (`MAX_SAMPLES` is 4) |
| **D10** | Each draw re-queries the driver (`glGetProgramiv`, `glGetActiveAttrib` + `glGetAttribLocation` per active attribute, `glGetBooleanv(COLOR_WRITEMASK)`, uniform block sizes) and `drawElements` scans the index range on the CPU | [C `webgl1.cpp` checkDrawState, drawElements], [M] ~0.45 µs per draw; 0.3-0.5 ns per index (600k indices: 0.3 ms) | Small today (three makes 2 calls per mesh); matters for draw-heavy content | Cache attribute tables at link time and index ranges per buffer range (what Chrome does) |
| **D11** | The QuickJS host-call thunk reserves two vectors per call | [C `qjs.cpp:87`] | ~150 ns per `zinc:gfx` call from QuickJS [M]; minor | Stack arrays |

---

## 5. Measurements

### 5.1 The engine: same code, four engines [M]

Sprite kernel (move, bounce, 4 rotated corners written as x, y, u, v, colour per sprite; `kernel/kernel.ts`, the same source everywhere):

| Engine | ns per sprite | vs V8 |
|---|---:|---:|
| Node 24 (V8, JIT) | 21-24 | 1x |
| Zinc AOT (`zinc run`, cached native build) | 57-60 | 2.6x |
| Zinc typed interpreter (`--interp`) | 169-174 | 7.7x |
| Zinc QuickJS | 1,266-1,321 | **~60x** |

Unmodified npm libraries, QuickJS vs V8 (median per step; `probe/purejs.mjs`):

| Workload | Zinc QuickJS | Node 24 | Ratio | Max (QuickJS) |
|---|---:|---:|---:|---:|
| matter-js, 100 piled bodies | 6.10 ms | 0.254 ms | 24x | 9.95 ms |
| matter-js, 500 | 45.3 ms | 2.31 ms | 20x | **166 ms** |
| planck.js, 100 | 9.93 ms | 0.478 ms | 21x | 14.5 ms |
| planck.js, 500 | 28.5 ms | 1.24 ms | 23x | 70 ms |
| cannon-es, 100 | 10.6 ms | 0.417 ms | 25x | 74 ms |
| cannon-es, 500 | 39.2 ms | 0.99 ms | 40x | 60 ms |
| GSAP, 5,000 tweens | 5.78 ms | 0.674 ms | 8.6x | – |

Reading: the 5-6x QuickJS deficit of the M4 kernels (`docs/reports/zinc-next-m4-benchmarks.md`, against Zinc's own interpreter) becomes
**20-40x against V8** on object-heavy game code. The interpreter, not the WebGL binding, sets the compatibility tier's ceiling.

### 5.2 Rendering libraries on Zinc QuickJS [M]

Offscreen 800x600, `gl.finish()` included, per frame:

| Library | Load | Per-object cost | Budget at 60 fps | GL calls |
|---|---|---|---|---|
| PixiJS 8.22 bunnymark | `import` 95 ms | 1.5 µs update + 2.5 µs render = **4.0 µs** | ~4,000 sprites (1k: 4.9 ms; 5k: 20.6; 10k: 40.9; 20k: 80.4; 50k: 199) | one batch per 16 textures; `gl.finish` 0.7-4 ms |
| PixiJS 7.4.3 bunnymark | – | 7.3 µs | ~2,200 | |
| Phaser 3.90, arcade bodies + sprites + text | `eval` 450-640 ms | 16 µs | ~1,000 (2,000: 32.7 ms, p95 36, max 84) | WebGL 1 |
| Kaplay 3001, rotating sprites | – | 44 µs | ~380 | WebGL 1 |
| LittleJS 1.27 (debug build) | – | 6.4 µs | ~2,600 | WebGL 2 + 2D overlay |
| p5.js 1.11, 2D ellipses + text | – | 9.4 µs of JS (recorder, raster not included) | ~1,700 before raster | – |
| p5.js 2.3, 2D | – | 34 µs (one `Path2D` per shape, async draw) | ~500 before raster | – |
| p5.js 1.11, WEBGL boxes | – | 100 µs | ~160 | 12 per box (4 bindBuffer, 3 vertexAttribPointer, 2 uniformMatrix fv, uniform4f, uniform1i, drawElements) |
| p5.js 2.3, WEBGL boxes | – | 130 µs | ~125 | |
| three.js r186, Mesh (Basic or Standard + light) | – | 27-29 µs | ~550 meshes (100: 3.3 ms; 500: 14.2-15.2; 2,000: 56-60) | 2 per mesh (uniformMatrix4fv, drawElements) |
| three.js r186, InstancedMesh, matrices rebuilt per frame | – | 2.5 µs per instance (JS) | ~6,000 animated instances; static: 50k instances render in 2.4 ms | 1 draw |
| Babylon.js 9.30, boxes + StandardMaterial | `eval` of 8.6 MB: 1.3 s | 44 µs | ~370 | |

Rough Raspberry Pi extrapolation [I, not measured]: an interpreter on a Cortex-A53 at 1.4 GHz (Pi 3) is typically 6-10x slower than an
M1 Pro core, and 2-3x on a Cortex-A76 (Pi 5). That puts PixiJS v8 at a few hundred sprites on a Pi 3 and ~1,500-2,000 on a Pi 5, and
three.js at ~60-90 meshes on a Pi 3 (where three.js r163+ cannot run anyway: WebGL 2 only, VC4 is GLES2) and ~200-250 on a Pi 5.

### 5.3 WebGL binding overhead [M] (`probe/glcall.mjs`, `glcall2.mjs`)

| Call | ns per call |
|---|---:|
| empty JS loop (baseline) | 32 |
| `getError` | 61 |
| `bindTexture`, `enable`/`disable` | 72-76 |
| `uniform4f` | 99-103 |
| `drawArrays` (zero-area triangle, validation + driver) | 463 |
| `drawElements`, 6 / 6,000 / 60,000 / 600,000 u32 indices (degenerate) | 513 / 2,716 / 19,124 / 303,580 |
| `bufferSubData(ArrayBuffer 16 B)` | 114 |
| `bufferSubData(Float32Array 16 B)` | 1,336 (D5) |
| `uniform4fv(Float32Array)` / `uniform4fv(Array)` | 1,352 / 2,623 (D5) |
| `bufferSubData` 64 KB | ~1,300 |

The binding is not the bottleneck: one three.js frame of 100 meshes makes 191 calls (~0.3 ms with D5), the rest of its 3.3 ms is
three.js's own JS. Fixing D5 still matters for p5 and for any library that uploads uniforms per object.

### 5.4 GC pauses [M] (`probe/gc.mjs`)

A live tree with parent/child back links (cycles), plus 5,000 temporary objects per frame:

| Live objects | Temporaries | QuickJS median / p99 / max | Node median / p99 / max |
|---:|---|---|---|
| 10,000 | acyclic | 0.77 / 0.87 / 0.90 ms | 0.02 / 0.39 / 0.56 ms |
| 10,000 | cyclic | 1.50 / 2.21 / 4.38 ms | 0.02 / 0.21 / 0.37 ms |
| 100,000 | acyclic | 0.72 / 1.49 / 4.47 ms | 0.01 / 0.15 / 2.19 ms |
| 100,000 | cyclic | 0.92 / **11.8** / 12.5 ms | 0.02 / 0.09 / 0.30 ms |
| 1,000,000 | acyclic | 0.73 / 0.93 / 1.21 ms | 0.01 / 0.05 / 2.26 ms |
| 1,000,000 | cyclic | 0.97 / **99** / **171** ms | 0.02 / 0.58 / 5.43 ms |

Reading: QuickJS-ng frees acyclic garbage immediately (reference counting) and has no generational or incremental collector; garbage
in cycles waits for the cycle collector, which walks the whole heap (~170 ns per live object here). The matter-js spikes (166 ms) and
Phaser's 84 ms max frame are consistent with it. Scene graphs are full of cycles (parent ↔ child), so large three.js or Babylon scenes
will stutter. Mitigations (task G12): run the collector at frame boundaries on a budget, raise the threshold while a level loads, report
pauses in `zinc profile`; nothing removes the O(heap) cost short of another engine.

### 5.5 The native tier [M] (`kernel/gfxbunny.ts`, `kernel/gb/`)

Same bunnymark written against `zinc:gfx` (`drawImage` of a 26x37 runtime image per sprite), 800x600 window on a Retina screen
(rasterized at 1600x1200), `ZINC_PROFILE=1`:

| Engine | Program time per sprite (update + draw call) | Rasterization, 2,000 sprites | Rasterization, 20,000 sprites |
|---|---:|---:|---:|
| AOT | 15 + 10 ns | 11.0 ms (p99 17.9) | 107 ms (p99 133) |
| Typed interpreter | 74 + 29 ns | (same raster) | |
| QuickJS (same calls through `__host_*`) | 173 + 148 ns | (same raster) | |

Reading: the typed path is 30-160x cheaper than PixiJS on QuickJS for the program's own work, but the shared software rasterizer
(~1.4 ns per pixel) makes 2,000-3,000 sprites the limit, no better than PixiJS on WebGL. A GPU path for `zinc:gfx` images (display-gl
already draws LINE/POLY on the GPU, `next/RESUME.md`) is required before the native tier can show its advantage. With it, the CPU side
alone would allow ~600,000 sprites per 16.7 ms in AOT [I].

### 5.6 Presentation and startup [M]

- PixiJS v8 in a real window (`probe/pixi-window.mjs`, 1280x960 drawing buffer): update + render 4.2 ms, `zincPresent` + `drawImage`
  2.1 ms, then the window's present.
- Script evaluation at load: PixiJS v8 ESM 95 ms, Phaser 3 450-640 ms, Babylon 1.3 s. QuickJS can serialise compiled bytecode
  (`JS_WriteObject`/`JS_ReadObject`); Zinc does not use it yet [C]. A bytecode cache keyed on the file hash would remove most of the parse
  time [I].

---

## 6. Missing pieces and options

### 6.1 The browser environment (DOM/BOM layer)

What a library needs is a small, believable browser, not a DOM implementation. From the traces (section 3.1) the layer must provide:

- **Window and timing**: `window`/`self` as the global, `navigator` (a plausible desktop userAgent: libraries sniff it), `location`,
  `screen`, `innerWidth/Height`, `devicePixelRatio` from `pixelScale()`, `matchMedia`, `getComputedStyle`; `requestAnimationFrame`
  driven by the Zinc frame loop with `performance.now()` timestamps (p5 and Phaser throttle on real time: virtual time breaks them);
  `postMessage`, `MessageChannel`, `PromiseRejectionEvent` (else core-js replaces `Promise`), `structuredClone`, `queueMicrotask`.
- **Document**: a minimal element tree (`createElement`, `appendChild`, `getElementsByTagName`, `getElementById`, `querySelector` by id,
  class and tag), `body`/`head`/`documentElement`, `readyState: 'complete'`, `visibilityState`, `fonts` (`FontFaceSet`), `style` and
  `classList` as inert objects, `getBoundingClientRect` from the canvas size.
- **Events**: `EventTarget` on window, document and elements; Zinc input (`zinc:gfx` pointer, wheel, touch, pen, keys, text) translated
  to `PointerEvent`, `MouseEvent`, `TouchEvent`, `WheelEvent`, `KeyboardEvent` (`key`, `code`, `repeat`, modifiers) dispatched to the
  canvas, then document, then window with the targets libraries expect (Pixi listens to `pointermove` on document and `pointerup` on
  window; Phaser keyboard on window, mouse on canvas plus window; p5 everything on window); `focus`/`blur`/`visibilitychange`/`resize`.
- **Assets**: `Image`/`HTMLImageElement` with real decoding (PNG, JPEG, WebP through the vendored stb_image and libwebp, off-thread as the
  companion report proposes), `createImageBitmap`/`ImageBitmap`, `ImageData`; `fetch`/`Request`/`Response`/`Headers` and
  `XMLHttpRequest` over project files, `data:`/`blob:` URLs and `zinc:net` for http(s); `Blob`, `URL` + `createObjectURL`;
  `FontFace` loading TTF/OTF into the text tier; `localStorage` over `zinc:storage`; `DOMParser` (Phaser and Pixi parse XML bitmap fonts).
- **Media elements**: `HTMLAudioElement` with `canPlayType` (Howler needs it even for Web Audio), backed by the audio plugin.
- **Workers**: an absent `Worker` is enough today (every library falls back). A real `Worker` on a second `JSRuntime` is a later task.

Sizing [I]: the probe environment is ~400 lines; a production version with events, image decoding and fetch is ~1,500-2,000 lines of
JS plus small host rows. The WebGL conformance shim (`next/tests/webgl-conformance/dom-shim.js`, 197 lines) is the other seed.

### 6.2 Canvas 2D

Who needs what [W, grep of the shipped packages; M, traces]:
- **Text only** (WebGL games): PixiJS `Text`, Phaser `Text`, Kaplay's font atlas, LittleJS's overlay text, Babylon's font offsets:
  `fillText`, `strokeText`, `measureText` with `actualBoundingBox*` and `fontBoundingBox*`, `font` parsing, `letterSpacing`, shadows,
  gradients for fills, `getImageData` to upload the glyph bitmap.
- **Full spec** (2D renderers): p5 P2D (paths, arcs, ellipses, bezier, clip, shadows, gradients, `getImageData`/`putImageData` for
  `pixels[]`, 20 composite modes, `Path2D` in 2.x), Phaser CANVAS renderer (all 26 modes, 9-argument `drawImage`, patterns), PixiJS v8
  Canvas renderer (19 modes, `ctx.filter` with CSS filter strings), matter-js `Render`.

Options [W, from the backend survey; sizes and efforts are the survey's estimates unless measured]:

| Backend | Licence | Size added (arm64) | Coverage of the 2D spec | Pi 3 | Effort to a spec-shaped context in QuickJS |
|---|---|---|---|---|---|
| **Skia** ([build](https://skia.org/docs/user/build/), [SkBlendMode](https://github.com/google/skia/blob/main/include/core/SkBlendMode.h)) | BSD-3 | core 3-8 MiB claimed; skia-canvas 22.4 MB and @napi-rs/canvas 28 MB measured with ICU and codecs | Complete: 26 modes, shadows and CSS filters through image filters, anti-aliased path clip; GPU (Ganesh GL/GLES) and CPU | CPU raster yes (Chromium on a Pi 3 uses software canvas); Ganesh on VC4 not recommended | 35-50 days (GN build per target, state mapping, HarfBuzz text, GPU interop) |
| **Own compositor + ThorVG SW coverage** ([ThorVG](https://github.com/thorvg/thorvg)) | MIT | ~0.3-0.5 MB | ThorVG lacks Porter-Duff ops, image patterns and CSS filters: the compositor (26 W3C formulas, clip stack, shadow blur, sampler) is ours | yes (SW engine) | 45-60 days standalone, 30-40 on top of Skia's shared layer |
| Blend2D ([roadmap](https://blend2d.com/roadmap.html)) | Zlib | ~1.9 MiB | Clip to path, HSL modes and blur still "Pending" | portable pipeline only on armhf | poor fit |
| Cairo (node-canvas) | LGPL-2.1 / MPL-1.1 | 1.35 MB + pixman, freetype, fontconfig | no `filter`, no `direction` ([compat](https://github.com/Automattic/node-canvas/wiki/Compatibility-Status)) | yes | plugin only (licence) |
| canvas_ity ([repo](https://github.com/a-e-k/canvas_ity)) | ISC | <36 KiB | 11 Porter-Duff ops, no blend modes, no shaping, slow | yes | fallback for a tiny tier |
| plutovg, NanoVG, tiny-skia, vello_cpu | MIT / Zlib / BSD / Apache | small | no blend modes or blur (plutovg), rectangle clip and unmaintained (NanoVG), no C API (Rust ones) | – | not recommended |
| Canvas 2D in JS over WebGL (expo-2d-context) | MIT | JS | "much slower than native 2D context" ([npm](https://www.npmjs.com/package/expo-2d-context)); non-separable modes need FBO ping-pong without framebuffer fetch | – | rejected |
| Map onto `zinc:gfx` / the shared rasterizer (extend `zinc:canvas`) | ours | 0 | 4x4-supersampled polygons, rectangle clips, runtime images without alpha, no composite ops: every spec feature beyond source-over is new rasterizer work, and it is the CPU path the bunnymark shows saturating | yes | not recommended for JS libraries; `zinc:canvas` stays for typed apps |

Recommendation:
1. **Text-first context now** (task G7): a `CanvasRenderingContext2D` on a CPU RGBA8 bitmap with `fillRect`/`clearRect`, `drawImage`,
   `getImageData`/`putImageData`, transforms, `fillText`/`strokeText`/`measureText` through the existing HarfBuzz/stb_truetype text tier,
   solid and gradient fills of rectangles and text, shadows on text (box blur). It renders PixiJS, Phaser and Kaplay text and their
   boot-time canvas probes; ~10-15 days [I].
2. **Decide the full backend by a spike** (G8): Skia for desktop and Pi 4/5 (full fidelity and a GPU path; the size of an ICU-free
   build is the number to measure), against the own-compositor route for the Pi 3 / tiny tier. Same JS facade and the same `Renderer`
   interface underneath, so the tier is a build choice, as `"text": "shaped"` is.
3. The spec model is the same for both backends: draw into a transparent layer, build the shadow, composite shadow and shape with the
   clip and `globalAlpha`; `source-in`, `source-out`, `destination-in`, `destination-atop` and `copy` clear pixels outside the shape
   ([WHATWG canvas](https://html.spec.whatwg.org/multipage/canvas.html)).

### 6.3 Web Audio

What the libraries call [W, grep]:

| Library | Nodes and API |
|---|---|
| Howler 2.2.4 | Gain, BufferSource (loop, loopStart/End, playbackRate), Buffer, decodeAudioData, StereoPanner / Panner + Listener, setValueAtTime, linearRamp, setTargetAtTime, cancelScheduledValues; `Audio.canPlayType` |
| Phaser 3 / 4 | Gain, Panner, BufferSource, StereoPanner, decodeAudioData, setValueAtTime |
| Kaplay | Gain, BufferSource, Buffer, StereoPanner, MediaElementSource, decodeAudioData, playbackRate, detune |
| LittleJS | Gain, BufferSource, Buffer, BiquadFilter, Convolver, Delay, DynamicsCompressor, WaveShaper, StereoPannerNode |
| three.js | AudioListener, PannerNode, Gain, BufferSource, Analyser |
| Tone.js, p5.sound | near-full spec: Oscillator, PeriodicWave, Biquad, IIR, Delay, Convolver, DynamicsCompressor, WaveShaper, ConstantSource, Analyser, Splitter/Merger, ScriptProcessor, **AudioWorkletNode**, OfflineAudioContext |

Options [W]:

| Option | Licence | Size | Coverage | Effort [I] | Fit |
|---|---|---|---|---|---|
| **miniaudio + own "Web Audio lite" graph** ([miniaudio](https://github.com/mackron/miniaudio), [manual](https://miniaud.io/docs/manual/index.html)) | public domain / MIT-0 | ~0.3-0.7 MB compiled [I] | devices, mixing, resampling, WAV/FLAC/MP3 (+ Vorbis with stb_vorbis), splitter, biquad family, delay, spatializer (no HRTF); our graph adds sample-accurate AudioParam timelines and the spec's panner and biquad formulas | 20-28 days | **Howler, Phaser, Kaplay, LittleJS, three.js**; already the media choice of D12 and the plan of ZN-390 |
| web-audio-api-rs ([repo](https://github.com/orottier/web-audio-api-rs)) | MIT | ~5.3 MB (node-web-audio-api binaries, measured by the survey) | closest to the spec, WPT-tracked; Rust, no C API | 20-30 days (C shim, Rust toolchain per target) | optional plugin for Tone.js / p5.sound |
| LabSound ([repo](https://github.com/LabSound/LabSound)) | BSD | unverified | most nodes, no IIR, no AudioWorklet; episodic maintenance | 15-25 days facade | source of BSD DSP (convolver, compressor) to borrow |
| SDL3 audio streams | Zlib, already linked | 0 | streams only | – | device backend under miniaudio (`noDevice` + `ma_engine_read_pcm_frames`) if SDL owns the device |
| OpenAL Soft | LGPL | – | 3D only | – | no |

Recommendation: one native engine (`libzn_audio`, miniaudio) with **two front ends**: typed `zinc:audio` (ZN-390: play, stop, volume,
loop, buses) and a JS `AudioContext` facade covering the table's game subset plus `HTMLAudioElement`. Real-time rules from the earlier
creative-runtime report hold: the audio callback never enters QuickJS or allocates; JS calls become timestamped commands on a bounded
SPSC queue; `onended` and analyser snapshots come back through a ring buffer to the frame loop; decoding runs on the thread pool.
AudioWorklet is feasible later on a dedicated `JSRuntime` thread with one quantum of extra latency (a 128-frame quantum at 48 kHz is
2.67 ms; interpreted DSP fits only light processors) [I].

### 6.4 Gamepad

SDL3 gamepads map directly onto the W3C "standard" layout ([spec](https://w3c.github.io/gamepad/),
[SDL_GamepadButton](https://wiki.libsdl.org/SDL3/SDL_GamepadButton)): SOUTH/EAST/WEST/NORTH → b0-b3, shoulders → b4-b5, triggers
(axes 0..32767) → b6-b7 analog, BACK/START → b8-b9, stick clicks → b10-b11, d-pad → b12-b15, GUIDE → b16, sticks → axes 0-3; rumble through
`SDL_RumbleGamepad`; `gamepadconnected`/`disconnected` from `SDL_EVENT_GAMEPAD_ADDED`/`REMOVED`. The community mapping database
SDL_GameControllerDB is Zlib ([repo](https://github.com/mdqinc/SDL_GameControllerDB)). Phaser, Kaplay and LittleJS poll
`navigator.getGamepads()`. Host rows in the window backend (input, like keys) serve both `zinc:gfx`/`zinc:game` and the JS facade.
3-5 days [I].

### 6.5 Images and fonts

`Image`, `createImageBitmap` and `FontFace` are the asset entry points of every library. Decoders are already vendored (stb_image,
libwebp, stb_truetype/HarfBuzz; decision D34 keeps stb_image). The WebGL side must implement `UNPACK_FLIP_Y_WEBGL`,
`UNPACK_PREMULTIPLY_ALPHA_WEBGL` and `UNPACK_COLORSPACE_CONVERSION_WEBGL` for DOM sources, and `createImageBitmap` must apply
`imageOrientation`/`premultiplyAlpha` itself ([WebGL pixel storage](https://registry.khronos.org/webgl/specs/latest/1.0/#PIXEL_STORAGE_PARAMETERS),
[ImageBitmap](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html)). This also closes the known gap of
`examples/webgl-studio` (the truck texture needs `createImageBitmap`). wuffs (Apache-2/MIT, memory-safe, stb drop-in mode in v0.4) is a
hardening option for untrusted images, not a prerequisite. The loading model (groups, progress, thread pool) is the companion report's.

### 6.6 Presentation without readback

Two modes, both without `glReadPixels`:
1. **Full-window game** (no `zinc:ui`): the WebGL context renders into the window's own surface; `requestAnimationFrame` callbacks run in
   the frame loop and the swap presents. The hidden-window offscreen context becomes the SDL window's context; the default framebuffer is
   the window (or an MSAA FBO resolved into it, D9).
2. **Composited with `zinc:ui`**: share the GL context (or textures) with display-gl and draw the canvas FBO's colour texture as a GPU
   layer under or over the UI (display-gl already composes GPU layers, `zgl_layers`). `zincPresent` stays for headless capture and
   for the software display path.

This removes D8, the 2-7 ms per frame and the GPU→CPU→GPU round trip, and makes `devicePixelRatio`-sized canvases affordable.

---

## 7. Performance limits and what to make native

### 7.1 Where the time goes

- **Interpretation dominates.** Per object per frame: PixiJS v8 4 µs, three.js 27 µs, Babylon 44 µs, Kaplay 44 µs, p5 WEBGL 100 µs, of
  which the WebGL binding is ~0.1-0.5 µs per call and two to twelve calls [M]. Physics libraries are 20-40x slower than on V8 [M].
- **GC**: invisible for acyclic garbage, O(live heap) for cycles: a hazard for large scenes (section 5.4).
- **Rendering**: the GPU is idle (`gl.finish` ≤ 4 ms even at 50k sprites); readback presentation costs 2+ ms; the native tier's software
  rasterizer is the native path's limit.

### 7.2 Proposals, ordered by gain for effort

| # | Proposal | Gain | Effort [I] | Tier |
|---|---|---|---|---|
| 1 | Fix D5 (typed-array fast path) and D11 | 10x on `*fv` and uploads; ~5-10% of three.js and p5 WEBGL frames | 1-2 days | compat |
| 2 | Zero-copy presentation (6.6) and MSAA (D9) | -2 to -7 ms per frame, no GPU stall; correct antialiasing | 8-12 days | compat |
| 3 | GC at frame boundaries on a budget, threshold control while loading, pause histogram in `zinc profile` | removes pauses for small/medium heaps; makes large ones visible | 3-4 days | compat |
| 4 | QuickJS bytecode cache for imported libraries (`JS_WriteObject`, keyed on content hash, in `~/.zinc/cache` or baked by `zinc build`) | Phaser 0.5 s and Babylon 1.3 s start-up cut to a fraction | 3-5 days | compat |
| 5 | **GPU sprite path for `zinc:gfx`** (images with source rectangle, rotation, scale, tint, blend; batched by texture in display-gl) | native tier: 2,000-3,000 sprites (software) → tens of thousands | 10-15 days | native |
| 6 | **Native sprite batcher** shared by both tiers: SoA transforms in native memory, vertex generation in C++ (NEON/SSE), one buffer upload and one draw per texture batch. Typed front end `zinc:game` sprites; JS front end a PixiJS v8 accelerator replacing the batcher's per-sprite packing (`DefaultBatcher` attribute packing, `ParticleContainer` update) through Pixi's extension system | PixiJS render half (2.5 µs/sprite) mostly removed → ~2x sprites at 60 fps [I]; typed tier ~100k sprites | 12-18 days | both |
| 7 | **Native physics plugins**: Box2D v3 (MIT, C, [repo](https://github.com/erincatto/box2d)) for 2D and Jolt (MIT, C++, [repo](https://github.com/jrouwe/JoltPhysics)) for 3D, typed API plus a thin JS API; optional planck-shaped facade | 500 bodies: 28-45 ms in QuickJS → ~1 ms native [I] | 10-15 days each | both |
| 8 | Native math kernels for JS (`mat4` multiply/invert, quaternion, AABB/frustum batch tests on `Float32Array`) | limited: unmodified three.js keeps its own JS math; worth it only through accelerators like #6 | – | skip unless measured |
| 9 | A JIT JavaScript engine as an optional desktop engine (JavaScriptCore system framework on macOS, V8 or JSC elsewhere) | 10-30x on the compatibility tier (V8 numbers of 5.1) | spike 5 days; integration large | decision against D3/D13/D36 needed |

Item 9 conflicts with decisions D3 (QuickJS as the second engine) and D13/D36 (no JIT): it is listed because "seeing the limits" shows
the interpreter is the compatibility tier's ceiling, not as a recommendation. It belongs to a spike (G23) with the four demos as the
benchmark, after the compat-tier work makes them run.

### 7.3 Compatibility tier and native tier

```
                    game code
      ┌───────────────────┴────────────────────┐
  compat tier (JS, unchanged npm libraries)   native tier (typed TS, AOT)
  PixiJS · Phaser · p5 · three · Babylon      zinc:game (scenes, sprites, tilemaps, camera)
  Kaplay · Howler · GSAP · matter/planck      zinc:gfx (immediate 2D) · zinc:ui
      │ web environment (DOM/BOM, events,         │ typed host rows
      │ rAF, Image, fetch, AudioContext)          │
  QuickJS engine ─────────────────┬───────────── interpreter / AOT
                                  │
            shared native plugins (one implementation each)
   libzn_webgl · canvas2d · audio (miniaudio) · gamepad rows · image decode
   GPU sprite batcher · physics2d (Box2D v3) · physics3d (Jolt)
                                  │
              host: SDL3 window, GL/GLES, display-gl layers
```

- **Compatibility tier**: run the npm library unchanged. Right for prototypes, jams, ports and small-to-medium games on desktop and
  Pi 4/5: budgets of section 5.2 (thousands of sprites, hundreds of meshes, a few hundred bodies). Pi 3 is limited to WebGL 1 libraries
  (Phaser 3/4, Kaplay, PixiJS on WebGL 1, p5 with `setAttributes({version: 1})`) at modest counts.
- **Native tier**: typed TypeScript compiled AOT, 20-60x cheaper game logic than the compat tier, and (with proposals 5-7) GPU sprites and
  native physics: tens of thousands of sprites, thousands of bodies, every target including small boards through `zinc:gfx`.
- **What they share**: every native plugin (audio, physics, gamepad, decoders, canvas2d, batcher) has one implementation and two thin
  front ends. Assets, `zinc.json`, packaging (`zinc pack`, `zinc export`) and the frame loop are the same.
- **Mixing engines**: a typed `zinc:ui` program can host a JS scene in a `zinc:script` context (the webgl-cube pattern), but values
  cross as JSON: keep it to a few calls per frame (`frame(image, t)`), never per object. One engine per game loop.

---

## 8. Plugin layout ("minimal core, pluggable")

### 8.1 What becomes what

| Part | Form | Loaded when | Notes |
|---|---|---|---|
| QuickJS engine, frame loop, `zinc:gfx` host table, image/font decoders of the baker | **core** (unchanged) | always | QuickJS stays in core until ZN-348 (D40) |
| WebGL 1/2 | module `libzn_webgl` (exists) | first QuickJS context | gains zero-copy present and MSAA (G4, G13) |
| Web environment (window, document tree, events, rAF, Image, fetch/XHR, Blob/URL, FontFace, storage, `structuredClone`, MessageChannel...) | **JS module** evaluated in a QuickJS context, plus a few host rows (image decode, file/URL fetch, gamepad state) | the context asks for it (`"web"` in zinc.json or `new Script({web: true})`) | pure JS keeps it hackable; `env.mjs` + `dom-shim.js` are the seeds |
| Canvas 2D (`CanvasRenderingContext2D`, `Path2D`, `OffscreenCanvas`, `ImageData`, `DOMMatrix`, `ImageBitmap`) | module `libzn_canvas2d` | first `getContext('2d')` or `new OffscreenCanvas` | text-first tier, then the chosen backend; tier chosen like `"text": "shaped"` |
| Audio engine | module `libzn_audio` (miniaudio) | first `zinc:audio` import or `new AudioContext` | typed `zinc:audio` + JS `AudioContext`/`HTMLAudioElement` facades |
| Gamepad | host rows in the window backend (SDL3) | always with a window | typed `zinc:gfx` rows + `navigator.getGamepads()` in the web environment |
| GPU sprite batcher | display-gl / GL host | first textured batch | backs `zinc:gfx` images, `zinc:game`, and the PixiJS accelerator |
| Physics | native plugins `physics2d` (Box2D v3), `physics3d` (Jolt) | import | typed API + JS API |
| Game framework | pure-Zinc plugin `zinc:game` | import | over `zinc:gfx`, batcher, audio, physics, gamepad |
| npm libraries | project files (or a `zinc add npm:<pkg>@<ver>` that vendors the dist file with its licence and pins it in `zinc.lock`) | import map | never bundled with zinc |

### 8.2 How a project opts in

Today: `"webgl": true` gives `zinc:script` contexts a canvas with WebGL, and `importmap.json` beside the entry maps bare specifiers
[C `next/src/frontend/project.cpp`, `next/src/qjs/qjs.cpp`]. Proposed generalisation (keeps `"webgl": true` as shorthand for
`"web": { "webgl": 2 }`):

```json
{
  "name": "bunny-run",
  "entry": "src/main.js",
  "engine": "quickjs",
  "assets": "assets",
  "web": {
    "dom": true,
    "webgl": 2,
    "canvas2d": "text",
    "audio": true,
    "gamepad": true,
    "importmap": "importmap.json"
  },
  "targets": { "macos": { "width": 1280, "height": 720 } }
}
```

- `engine`: `"quickjs"` runs a `.js`/`.mjs` entry without `--engine` (today a flag only).
- `web.dom`: install the web environment in the main context; `canvas2d`: `false`, `"text"` or `"full"` (backend per target profile);
  `audio`, `gamepad`: load the module and expose the JS facades. Missing modules on a target are a load-time error naming the key,
  like `requires`.
- Native-tier projects keep using imports (`zinc:game`, `zinc:audio`, `zinc:physics2d`) and need no `web` block.

---

## 9. Risks and open questions

- **Interpreter ceiling**: the compat tier will not reach browser-class sprite counts on QuickJS; the demos' gates are set accordingly.
  Whether that is acceptable, or a JIT engine plugin is wanted, is an owner decision (G23).
- **Desktop shader translation**: D2/D3 show that a regex-based ESSL → GLSL 3.30 path meets real-world shaders it was not written for;
  each new library may find another. Linux and Pi drivers with native GLES pass sources through; macOS is the exposed platform (D30's
  ANGLE follow-up would remove the class of bugs).
- **Pi 3**: three.js r163+, PlayCanvas, LittleJS's GL path and p5's default WEBGL need WebGL 2; only WebGL 1 libraries and `zinc:gfx`
  run there with the GPU. No Pi measurement exists yet (G22).
- **Fidelity**: the Canvas 2D backend choice decides how many pixels match Chrome; Skia matches by construction, an own compositor needs a
  WPT-driven test suite.
- **GC**: large scene graphs with cycles will stutter on QuickJS whatever the scheduling.

---

## 10. Backlog (ordered)

Gates are measured on the reference machine (Apple M1 Pro, macOS, release build, QuickJS engine, window 1280x720 at the screen's pixel
scale unless stated), median frame time over 600 frames after warm-up, p95 also gated where stated. "Today" numbers come from section 5.

| Key | Title | Depends on |
|---|---|---|
| G1 | WebGL binding conformance fixes found by real libraries (D1, D2, D3) | – |
| G2 | QuickJS engine robustness for libraries (D4, D6, D7) | – |
| G3 | WebGL binding fast paths (D5, D10, D11) | G1 |
| G4 | Zero-copy presentation of WebGL canvases (full-window and display-gl layer) | G1 |
| G5 | Web environment module for QuickJS contexts (DOM/BOM, events, rAF, fetch/XHR, storage) | G2 |
| G6 | Image, ImageBitmap and FontFace in the web environment (decode off-thread, WebGL unpack semantics) | G5 |
| G7 | Canvas 2D, text-first tier (CPU bitmap, text through HarfBuzz, getImageData) | G5, G6 |
| G8 | Decision spike: full Canvas 2D backend (Skia vs own compositor over ThorVG) | G7 |
| G9 | Canvas 2D, full tier on the chosen backend (paths, Path2D, clip, 26 modes, shadows, patterns, filters) | G8 |
| G10 | Audio engine on miniaudio with `zinc:audio` and a Web Audio lite facade | ZN-390, G5 |
| G11 | Gamepad: SDL3 gamepads, W3C standard mapping, typed rows | G5 |
| G12 | GC scheduling, pause reporting and bytecode cache for libraries | G2 |
| G13 | MSAA default framebuffer (`antialias: true`) | G4 |
| G14 | Demo: p5.js sketches (2D and WEBGL, p5 1.11 and 2.x) with FPS gates | G1, G2, G3, G5, G6, G9 |
| G15 | Demo: PixiJS v8 sprite demo with FPS gates | G1, G2, G3, G4, G5, G6, G7 |
| G16 | Demo: Phaser 3 platformer with FPS gates | G1, G2, G4, G5, G6, G7, G10, G11 |
| G17 | Demo: three.js game with FPS gates | G2, G3, G4, G5, G6, G10, G11, G13 |
| G18 | GPU sprite path for `zinc:gfx` images | – |
| G19 | Native sprite batcher and PixiJS v8 accelerator | G15, G18 |
| G20 | Physics plugins: Box2D v3 (2D) and Jolt (3D) | – |
| G21 | `zinc:game`, the native-tier game module, and the game-2d template on it | G10, G11, G18, G20 |
| G22 | Raspberry Pi 4/5 and Pi 3 numbers for the four demos | G14, G15, G16, G17 |
| G23 | Spike (decision): a JIT JavaScript engine as an optional desktop engine | G14, G15, G16, G17 |
| G24 | Worker on a second QuickJS runtime (asset decoding, Tone's clock, DRACO/KTX2) | G5 |

### Task details

**G1 — WebGL binding conformance fixes found by real libraries.** Give `WebGL2RenderingContext` a prototype that does not inherit from
`WebGLRenderingContext` (shared methods copied, both constructors exposed); run the ESSL 1.00 `in`/`out` check on preprocessed source;
make the desktop translation safe for user identifiers that are GLSL 3.30 built-ins (`texture`, and audit the others).
AC: (1) `gl2 instanceof WebGLRenderingContext === false`, `gl2 instanceof WebGL2RenderingContext === true`, `gl1 instanceof
WebGLRenderingContext === true`; (2) `new THREE.WebGLRenderer({canvas, context: gl2})` succeeds; (3) a shader with
`#ifdef GL_ES / #define in attribute / #define out varying` compiles in WebGL 1 and 2; (4) an ESSL 1.00 shader declaring
`vec4 texture;` and calling `texture2D` compiles; (5) PixiJS v8.22 and Phaser 3.90 boot with no shader workaround; (6) Khronos
conformance count not lower than 695/787; T0/T1 tests for each.

**G2 — QuickJS engine robustness for libraries.** Stack limit below the real thread stack; promise rejection tracker; frame loop entered
whenever `onFrame` is first registered.
AC: (1) `function f(){return f()+1} try{f()}catch(e){}` prints the caught `RangeError` and exits 0; (2) an unhandled rejection prints
`Uncaught (in promise) <error>` with its stack and fires `unhandledrejection` when the web environment is on; (3) a program that calls
`onFrame` after `await new Promise(r => setTimeout(r, 10))` gets frames; (4) p5.js 1.11.13 loads with the default stack.

**G3 — WebGL binding fast paths.** Typed-array arguments without a thrown exception; per-program attribute tables cached at link time;
index-range cache per element buffer range; stack arrays in the QuickJS host thunk.
AC: (1) `uniform4fv(Float32Array)` ≤ 200 ns and `bufferSubData(Float32Array)` ≤ 250 ns on the reference machine (today 1,352 and 1,336);
(2) `drawArrays` overhead ≤ 250 ns (today 463); (3) repeated `drawElements` of the same 60k-index range ≤ 3 µs (today 19); (4) WebGL
conformance unchanged; a micro-benchmark in `next/bench`.

**G4 — Zero-copy presentation of WebGL canvases.** Full-window mode: the first WebGL canvas of a program without `zinc:ui` renders into
the window surface, presented by the frame loop. Composited mode: the canvas texture is a display-gl layer under or over the UI.
`zincPresent` remains for headless and software displays.
AC: (1) no `glReadPixels` per frame in either mode (checked by a GL call counter); (2) presentation cost ≤ 0.3 ms at 1920x1080 (today
2.1 ms at 1280x960 with readback); (3) `examples/webgl-cube` and `examples/webgl-studio` unchanged visually (SSIM ≥ 0.98 vs today's
captures); (4) `ZINC_SHOT` still captures the WebGL content.

**G5 — Web environment module for QuickJS contexts.** The DOM/BOM layer of section 6.1 as a JS module plus host rows; input from the
frame loop translated into DOM events with library-correct targets; `requestAnimationFrame` driven by the frame loop with real
timestamps; `fetch`/XHR over project files, data/blob URLs and `zinc:net`; `localStorage` over `zinc:storage`; `zinc.json` `"web"` and
`"engine"` keys (and `new Script({web: true})` for `zinc:script`).
AC: (1) PixiJS 8.22, PixiJS 7.4.3, Phaser 3.90, p5.js 1.11 and 2.3, three.js r186 (with OrbitControls), Babylon.js 9.30, Kaplay 3001 and
LittleJS boot and animate with **no per-application shim** (a T1 test per library, headless with a recording 2D context until G7);
(2) a pointer drag on the window reaches PixiJS's `pointermove` (document) and `pointerup` (window), Phaser's keyboard (window) and
OrbitControls (canvas) in tests; (3) `navigator`, `devicePixelRatio`, `innerWidth` reflect the window and pixel scale; (4) the trace of
unknown globals for these libraries is empty.

**G6 — Image, ImageBitmap and FontFace in the web environment.** `Image.src` (files, data and blob URLs, http through `zinc:net`) and
`createImageBitmap` decode PNG, JPEG and WebP off the main thread with the vendored decoders; `texImage2D` from them honours
`UNPACK_FLIP_Y_WEBGL`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL`, `UNPACK_COLORSPACE_CONVERSION_WEBGL`; `FontFace.load()` registers TTF/OTF with the
text tier; `document.fonts`.
AC: (1) the Cesium Milk Truck in `examples/webgl-studio` shows its texture (GLTFLoader through `createImageBitmap`); (2) PixiJS
`Assets.load('bunny.png')` and Phaser `this.load.image` use real pixels (pixel check of one sprite); (3) the WebGL conformance texture
pages that need images run (count reported); (4) decoding a 4096x4096 PNG does not block frames for more than 2 ms.

**G7 — Canvas 2D, text-first tier.** `CanvasRenderingContext2D` on a CPU RGBA8 premultiplied bitmap: state stack, transforms,
`fillRect`/`clearRect`/`strokeRect`, `drawImage` (3/5/9 arguments, transformed), `getImageData`/`putImageData`/`createImageData`,
`fillText`/`strokeText`/`measureText` with the full `TextMetrics`, `font` parsing, `textAlign`/`textBaseline`/`direction`/`letterSpacing`,
solid and gradient fills, text shadows; `texImage2D(canvas)` and `zincPresent`-free display of 2D canvases.
AC: (1) PixiJS `Text`, Phaser `Text`, Kaplay `text()` and LittleJS overlay text render glyphs whose bounding boxes match Chrome's within
1 px, and a reference image per library with SSIM ≥ 0.90 against headless Chrome (`tools/cdp.py`); (2) `measureText('Hello').width`
within 1% of Chrome for the bundled sans font; (3) unsupported calls are no-ops recorded in a debug counter, not exceptions.

**G8 — Decision spike: full Canvas 2D backend.** Build Skia (pinned, ICU-free, GN) for macOS arm64, Linux x86_64/arm64 and armhf
Cortex-A53, measure size, build time and a 2D benchmark (p5 300 shapes, Phaser CANVAS bunnymark) against an own compositor prototype over
ThorVG coverage; record a decision (D-entry) with the scores of RULES.md.
AC: (1) sizes, build times and frame times for both routes on two targets; (2) decision recorded in `docs/reports/zinc-next-decisions.md`
with a revisit condition; (3) licences and SBOM entries listed.

**G9 — Canvas 2D, full tier.** On the chosen backend: paths, arcs, ellipses, bezier, `roundRect`, `Path2D` (+ SVG path strings), `clip`
with arbitrary paths, all 26 `globalCompositeOperation` values, shadows, patterns, conic gradients, `filter` (CSS filter subset),
`imageSmoothingEnabled`/`Quality`, `isPointInPath`/`isPointInStroke`, `OffscreenCanvas`, `toDataURL`/`toBlob`.
AC: (1) a WPT `html/canvas/element` subset passes at ≥ 80% (list pinned); (2) p5.js 1.11 and 2.3 2D examples and Phaser 3 `type: CANVAS`
match Chrome at SSIM ≥ 0.95; (3) p5 2D, 1,000 ellipses with fill and stroke: ≥ 60 fps at 800x600.

**G10 — Audio engine on miniaudio with `zinc:audio` and a Web Audio lite facade.** One native graph (128-frame quanta, sample-accurate
AudioParam timelines) behind the typed `zinc:audio` of ZN-390 and a JS `AudioContext` with `currentTime`, `state`, `resume`/`suspend`,
`decodeAudioData` (WAV, MP3, FLAC, Ogg Vorbis), AudioBufferSourceNode (loop, playbackRate, detune, onended), Gain, StereoPanner,
Panner + Listener (equal-power and inverse/linear/exponential distance), BiquadFilter, Delay, Analyser, MediaElementSource; and
`HTMLAudioElement` with `canPlayType`. A null backend headless.
AC: (1) Howler plays, loops, fades and pans a sound, Phaser's WebAudioSoundManager and Kaplay's `play()` work (tests on the null backend
compare rendered buffers with expected envelopes); (2) no QuickJS call and no allocation on the audio thread (asserted in a debug build);
(3) zero underruns in a 10-minute soak with 32 voices while the frame loop stalls 100 ms every second; (4) the game-2d template's sounds
(ZN-390's AC) play through the same engine.

**G11 — Gamepad.** SDL3 gamepad events and state as host rows; `navigator.getGamepads()` with the W3C standard mapping, connect and
disconnect events, rumble through `vibrationActuator`; typed rows for `zinc:gfx`/`zinc:game`; SDL_GameControllerDB embedded.
AC: (1) an SDL virtual gamepad in a test drives Phaser's GamepadPlugin and Kaplay's `onGamepadButtonPress`; (2) button and axis indices
match the W3C table for an Xbox and a PlayStation mapping; (3) headless runs report no gamepads without error.

**G12 — GC scheduling, pause reporting and bytecode cache.** Run the cycle collector at frame boundaries within a budget, raise the
threshold during loading, expose pauses in `zinc profile`/`zinc mem`; cache compiled QuickJS bytecode of imported files keyed by content
hash (and let `zinc build`/`zinc pack` bake it).
AC: (1) the `gc.mjs` test with 100k live objects and cyclic temporaries: p99 frame ≤ 4 ms (today 11.8 ms); (2) GC pauses visible as a
phase in `ZINC_PROFILE=1` output; (3) second start of Phaser 3.90 evaluates in ≤ 100 ms (today 450-640 ms) and of Babylon.js ≤ 250 ms
(today 1.3 s).

**G13 — MSAA default framebuffer.** Honour `antialias: true` with a multisampled default framebuffer (up to `MAX_SAMPLES`), resolved
before presentation and before `readPixels`/`texImage2D(canvas)`.
AC: (1) `getContextAttributes().antialias === true` when asked and supported; (2) three.js edge test against Chrome SSIM ≥ 0.95;
(3) WebGL conformance not lower.

**G14 — Demo: p5.js sketches.** `examples/games/p5-sketches`: a 2D sketch (shapes, text, image, mouse, `pixels[]`) and a WEBGL sketch
(lit boxes, texture, orbitControl), each runnable with p5 1.11 and 2.3 by switching the import map.
AC: (1) both sketches unchanged from their p5 editor versions; (2) 2D: 500 shapes with text ≥ 60 fps at 800x600; (3) WEBGL: 100 lit boxes
≥ 60 fps (today ~160 boxes is the JS ceiling of p5 1.11, ~125 for 2.3); (4) screenshots match Chrome at SSIM ≥ 0.90; (5) a T1 test runs
both headless for 120 frames.

**G15 — Demo: PixiJS v8 sprite demo.** `examples/games/pixi-bunnies`: bunnymark with a spritesheet, `Text` counter, pointer to add sprites,
a `ParticleContainer` mode.
AC: (1) PixiJS 8.22 unmodified; (2) ≥ 60 fps with 3,000 sprites in `Container` mode (today's ceiling ~4,000 offscreen) and ≥ 60 fps
with 20,000 in `ParticleContainer` mode, p95 ≤ 20 ms; (3) the measured maximum at 60 fps printed by the demo and recorded in the
example's README; (4) same scene matches Chrome at SSIM ≥ 0.90.

**G16 — Demo: Phaser 3 platformer.** `examples/games/phaser-platformer`: tilemap (Tiled JSON), arcade physics, animated sprites, text,
sounds and music, keyboard and gamepad, scenes (title, play, game over).
AC: (1) Phaser 3.90 unmodified, `type: AUTO` (WebGL 1); (2) ≥ 60 fps with 300 moving arcade bodies, p95 ≤ 16.7 ms, no frame over 50 ms
in a 2-minute run (GC); (3) sounds audible on macOS, silent headless; (4) a T1 test plays a scripted input sequence and checks the score.

**G17 — Demo: three.js game.** `examples/games/three-arena`: a third-person controller over a glTF level with textures, 200 dynamic
meshes, a directional light with shadows, positional audio, gamepad and keyboard, a HUD in `zinc:ui` or a 2D canvas.
AC: (1) three.js r186 unmodified; (2) ≥ 60 fps at 1280x720 with ≥ 200 draw calls and shadows, p95 ≤ 16.7 ms; (3) textures from the glTF
visible; (4) antialiased edges (G13); (5) a T1 test runs 300 frames headless.

**G18 — GPU sprite path for `zinc:gfx` images.** Add source rectangle, rotation, scale, tint and blend mode to image drawing; display-gl
draws image commands as textured quads batched by texture, the software rasterizer keeps the reference behaviour.
AC: (1) the `zinc:gfx` bunnymark (26x37 sprites, 800x600 Retina) renders 20,000 sprites with frame work ≤ 4 ms in AOT (today raster
107 ms); (2) pixel parity with the software path within the GPU tolerance used by display-gl's goldens; (3) Pi 3 (GLES2) path compiles
under the D29 prelude.

**G19 — Native sprite batcher and PixiJS v8 accelerator.** A native batch object (SoA transforms, UVs, tints; vertex generation in C++
with NEON/SSE; one upload per batch) used by `zinc:gfx`/`zinc:game` and exposed to JS; a PixiJS v8 extension that replaces the batcher's
per-sprite attribute packing with the native call.
AC: (1) PixiJS bunnymark sprites at 60 fps at least 1.8x G15's measured maximum, with unmodified PixiJS sources (extension registered by
the web environment); (2) typed bunnymark ≥ 100,000 sprites at 60 fps in AOT; (3) identical images with and without the accelerator.

**G20 — Physics plugins.** `physics2d` on Box2D v3 and `physics3d` on Jolt, vendored with licences, typed APIs (world, bodies, shapes,
joints, contacts, raycasts) and a JS API for QuickJS; optional planck-shaped JS facade for common calls.
AC: (1) 2,000 piled 2D bodies step in ≤ 2 ms in AOT and ≤ 3 ms from QuickJS through the JS API (planck 500 bodies: 28.5 ms today);
(2) 1,000 3D bodies ≤ 3 ms; (3) deterministic replay test (same inputs, same positions after 600 steps); (4) builds for macOS, Linux and
armhf with the pinned zig.

**G21 — `zinc:game`, the native-tier game module.** Scenes, sprites and animations on the batcher, tilemaps (Tiled, LDtk), camera,
input actions (keys, pointer, gamepad), audio through `zinc:audio`, physics glue; the game-2d template rewritten on it.
AC: (1) the game-2d template runs on it in interpreter and AOT with identical frames; (2) 10,000 animated sprites and 500 physics bodies
≥ 60 fps in AOT; (3) API reference in `docs/` and a guide chapter.

**G22 — Raspberry Pi numbers for the four demos.** Run G14-G17 (and the `zinc:gfx` and `zinc:game` bunnymarks) on Pi 4 or 5 and Pi 3
(WebGL 1 subset only), with `zinc export --target linux`.
AC: (1) a table of fps, p95 and memory per demo and board in this report's follow-up; (2) each demo states its supported boards in its
README; (3) failures filed as tasks.

**G23 — Spike (decision): JIT JavaScript engine as an optional desktop engine.** Run the four demos and the section 5.1 libraries on
JavaScriptCore (system framework on macOS) behind the same host table and web environment; measure gains, size, start-up and security
constraints (W^X, entitlements).
AC: (1) numbers for the four demos on QuickJS and on the JIT engine; (2) a decision recorded against D3, D13 and D36 with a revisit
condition.

**G24 — Worker on a second QuickJS runtime.** `Worker` (module and Blob URL), `postMessage` with structured clone and transferable
ArrayBuffers, `OffscreenCanvas` transfer later.
AC: (1) PixiJS's worker texture loading (`preferWorkers: true`) works; (2) Tone.js's Ticker uses the worker; (3) a worker crash is
reported and does not stop the main loop.

---

## 11. Sources

Library sources (shipped npm files): [PixiJS 8.22 adapter](https://unpkg.com/pixi.js@8.22.0/lib/environment/adapter.d.ts),
[PixiJS GlContextSystem](https://unpkg.com/pixi.js@8.22.0/lib/rendering/renderers/gl/context/GlContextSystem.mjs),
[PixiJS environments](https://github.com/pixijs/pixijs/blob/v8.21.0/src/environment/__docs__/environment.md),
[Phaser 3.90 Config](https://unpkg.com/phaser@3.90.0/src/core/Config.js), [Phaser HEADLESS](https://newdocs.phaser.io/docs/3.85.2/focus/Phaser.HEADLESS),
[Phaser 4 changelog](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md),
[p5 1.11](https://unpkg.com/p5@1.11.13/lib/p5.js), [p5 2.3 RendererGL](https://unpkg.com/p5@2.3.4/dist/webgl/p5.RendererGL.js),
[p5 2.3 custom shapes](https://unpkg.com/p5@2.3.4/dist/shape/custom_shapes.js),
[three.js WebGLRenderer](https://unpkg.com/three@0.186.1/src/renderers/WebGLRenderer.js),
[three.js GLTFLoader](https://unpkg.com/three@0.186.1/examples/jsm/loaders/GLTFLoader.js),
[three.js DRACOLoader](https://unpkg.com/three@0.186.1/examples/jsm/loaders/DRACOLoader.js),
[Babylon.js server side](https://doc.babylonjs.com/setup/support/serverSide), [Babylon Native polyfills](https://github.com/babylonjs/babylonnative/blob/master/Documentation/Polyfills.md),
[Kaplay 3001](https://unpkg.com/kaplay@3001.0.19/dist/kaplay.mjs), [matter-js 0.20](https://unpkg.com/matter-js@0.20.0/build/matter.js),
[Howler core](https://unpkg.com/howler@2.2.4/src/howler.core.js), [GSAP core](https://unpkg.com/gsap@3.15.0/gsap-core.js),
[Tone.js Ticker](https://unpkg.com/tone@15.1.22/build/esm/core/clock/Ticker.js), [LittleJS](https://unpkg.com/littlejsengine@1.27.0/dist/littlejs.esm.js),
[PlayCanvas](https://unpkg.com/playcanvas@2.23.1/build/playcanvas.mjs).

Prior art: [WeChat weapp-adapter](https://developers.weixin.qq.com/minigame/en/dev/tutorial/base/adapter.html),
[Phaser on WeChat](https://www.phaser.io/news/2018/01/running-phaser-on-wechat), [Ejecta](https://github.com/phoboslab/Ejecta),
[NativeScript Canvas](https://github.com/NativeScript/canvas), [headless-gl](https://github.com/stackgl/headless-gl),
[phaser-on-nodejs](https://github.com/geckosio/phaser-on-nodejs), [expo-2d-context](https://www.npmjs.com/package/expo-2d-context).

Backends: [Skia build](https://skia.org/docs/user/build/), [SkBlendMode](https://github.com/google/skia/blob/main/include/core/SkBlendMode.h),
[skia-canvas](https://github.com/samizdatco/skia-canvas), [tiny-skia](https://github.com/linebender/tiny-skia), [ThorVG](https://github.com/thorvg/thorvg),
[Blend2D roadmap](https://blend2d.com/roadmap.html), [cairo](https://www.cairographics.org/),
[node-canvas compatibility](https://github.com/Automattic/node-canvas/wiki/Compatibility-Status), [canvas_ity](https://github.com/a-e-k/canvas_ity),
[plutovg](https://github.com/sammycage/plutovg), [NanoVG](https://github.com/memononen/nanovg),
[WHATWG canvas](https://html.spec.whatwg.org/multipage/canvas.html), [miniaudio](https://github.com/mackron/miniaudio),
[miniaudio manual](https://miniaud.io/docs/manual/index.html), [LabSound](https://github.com/LabSound/LabSound),
[web-audio-api-rs](https://github.com/orottier/web-audio-api-rs), [OpenAL Soft](https://github.com/kcat/openal-soft),
[W3C Gamepad](https://w3c.github.io/gamepad/), [SDL_GamepadButton](https://wiki.libsdl.org/SDL3/SDL_GamepadButton),
[SDL_GameControllerDB](https://github.com/mdqinc/SDL_GameControllerDB), [wuffs](https://github.com/google/wuffs),
[WebGL pixel storage](https://registry.khronos.org/webgl/specs/latest/1.0/#PIXEL_STORAGE_PARAMETERS),
[ImageBitmap](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html), [Box2D](https://github.com/erincatto/box2d),
[Jolt Physics](https://github.com/jrouwe/JoltPhysics), [QuickJS-ng](https://github.com/quickjs-ng/quickjs).

Zinc: `next/src/qjs/qjs.cpp`, `next/src/qjs/ext.cpp`, `next/src/qjs/prelude.cpp`, `next/src/qjs/script_native.cpp`,
`next/src/gl/webgl_js.cpp`, `next/src/gl/webgl1.cpp`, `next/src/gl/offscreen.h`, `next/src/main.cpp`, `next/src/frontend/modules.cpp`,
`next/include/zn/runtime.h`, `docs/plugins/canvas2d.md`, `docs/plugins/display-gl.md`, `docs/reports/three-on-zinc.md`,
`docs/reports/zinc-next-decisions.md` (D3, D12, D13, D22, D29, D30, D34, D36, D40), `docs/reports/zinc-next-m4-benchmarks.md`,
`docs/reports/creative-runtime-webgl-audio-2026-09-29.md`, `examples/webgl-cube`, `examples/webgl-studio`,
`next/tests/webgl-conformance/dom-shim.js`, `next/backlog/tasks/zn-390*`.
