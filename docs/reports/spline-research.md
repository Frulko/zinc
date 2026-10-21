# Running Spline scenes outside the Spline site (research, 2026-10-21)

Method: Spline docs, the npm registry, and the published tarballs of `@splinetool/runtime@2.0.98` and `@splinetool/loader@2.0.98` (downloaded with `npm pack` into a scratch dir, nothing installed in the repo; bundle greps done on `build/runtime.standalone.webgl.js`), and the sample scenes downloaded from prod.spline.design.

## Bottom line

- Spline's own runtime path (`@splinetool/runtime`) is the only one that keeps events, states, animation and post-processing. It bundles its own three.js r185 (WebGL2 only, no WebGL1).
- There is no WebAssembly dependency for simple scenes: every wasm module is loaded conditionally, based on what the scene contains (physics, boolean ops, extruded bevels, subdivision, Draco meshes, splats, navmesh, text/input). Two of the four public sample scenes need no wasm at all.
- Web Workers are used only by the optional paths (Draco, splat sorter, navmesh). A plain scene needs neither.
- The `.splinecode` file is plain msgpackr (uncompressed), loadable from bytes: `app.start(arrayBuffer)` for the runtime, `new SplineLoader().parse(arrayBuffer)` for the loader. No network is needed if the scene has no wasm, no text font, and no remote assets.
- Plan gate: Code export is Pro and up, so producing your own `.splinecode` URL is paid. The public sample URLs below still work (CORS `*`).
- Licence: the npm packages declare no licence at all, so reuse and redistribution terms are unclear. See section 4.

## 1. Export options (docs.spline.design, spline.design/pricing)

Doc index: https://docs.spline.design/llms.txt. Plan table from https://spline.design/pricing (it can change; the runtime docs deliberately refuse to state plan limits).

| Option | Plan | Notes |
|---|---|---|
| Public URL (shareable page, plus embed code for Notion, Webflow, etc.) | Free (watermarked) | https://docs.spline.design/exporting-your-scene/web/exporting-as-public-ur-ls.md . Not a `.splinecode` URL; an iframe only gets local events. |
| `<spline-viewer>` (`@splinetool/viewer`) | Pricing page lists the logo and watermark as removed from Hobby up. It does not say whether the Viewer export itself is free. | https://docs.spline.design/exporting-your-scene/web/exporting-as-spline-viewer.md . Gets global events, lazy loads. Viewer 2.0.75 and 1.12.81 seen on CDNs. |
| Code export: Vanilla JS (`@splinetool/runtime`), React (`@splinetool/react-spline` 4.1.0), Next.js, Three.js (`@splinetool/loader`), react-three-fiber (`r3f-spline`) | "Download Code Export" is Pro and Max. Free has "Code export: No". | https://docs.spline.design/exporting-your-scene/web/exporting-as-code.md . Events and animations only in the Vanilla JS and React exports. Renderer is WebGPU by default, WebGL fallback. |
| Self-hosted project (zip with scene and runtime, fully offline) | Enterprise only | https://docs.spline.design/exporting-your-scene/web/exporting-as-self-hosted-project.md |
| glTF/GLB | "Default colour (grey)" geometry only is free. "Colour and texture" is Pro/Max. | See section 5. |
| USDZ and STL | Pro/Max | https://docs.spline.design/exporting-your-scene/files/exporting-as-usdz.md |
| Image, video, image sequence | Video is Pro/Max | |
| Native iOS and Android (embeds, app generation, APK/AAB, visionOS Mirror, Swift/Kotlin code API) | Pro/Max ("Apple and Android exports") | Under https://docs.spline.design/exporting-your-scene/apple-platform/ and `.../android/`. There is also a community Flutter package `spline_flutter` on pub.dev (not checked). |
| Hana 2D (`.hanacode`, `<hana-viewer>`) | n/a | Separate format and runtime, not loadable by the 3D runtime. |

Prices: Free $0 (watermarked web exports); Hobby $15/mo or $12 yearly (no watermark, no code export); Pro $30/$25; Max $70/$60; Enterprise custom.

## 2. `@splinetool/runtime`

- Latest 2.0.98 (published 2026-10-20). npm `license` field: none. No LICENSE file in the tarball, and `unpkg.com/@splinetool/runtime/LICENSE` redirects without a licence text. The package description says "© 2026 Spline, Inc.", so treat it as proprietary, source-closed. The homepage is spline.design, and the repository field points to github.com/splinetool/spline, which returns 404 (private).
- Size: unpacked 36 MB, but one scene only pulls what it needs. `runtime.standalone.webgl.js` is 2.24 MB raw and 584 KB gzip (466 KB brotli). The full `runtime.standalone.js` is 3.4 MB. Code is split into about 40 lazy `runtime-*.js` chunks (bloom, physics hooks, text, particles...), loaded by dynamic `import()`.
- Three.js is bundled (r0.185.0 is a devDependency; `dependencies` are only `on-change` and `semver-compare`). There is no three peer dependency. r185 means WebGL2 only. The bundle references `webgl2`, `EXT_color_buffer_float` and `OES_texture_float_linear`. **WebGL1-only hosts will not run it** (WebGPU backend is optional; `renderer: 'webgl'` forces WebGL).
- WebAssembly: loaded per scene (`Application._start`), each from `https://cdn.spline.design/@splinetool/runtime@2.0.98/build` unless `new Application(canvas, { wasmPath })` points elsewhere. Sizes are raw / brotli.

  | Module | Loaded when the scene has | Size |
  |---|---|---|
  | `physics.wasm` | physics objects | 1.57 MB / 429 KB |
  | `boolean.wasm` | `BooleanGeometry` | 162 KB raw |
  | `bevel.wasm` | extruded geometry with bevel size over 0, or round-cap paths | not measured |
  | `process.wasm` | `SubdivGeometry` ("Smooth and Edit") | 329 KB raw |
  | `navmesh.wasm` | game-control navmesh | 352 KB raw |
  | `hana-ui.wasm` | Hana 2D UI inside the scene | 3.35 MB raw |
  | Draco decoder | meshes with Draco data (three DRACOLoader, wasm from gstatic.com draco 1.5.2, falls back to the JS decoder `draco_decoder.js` when `WebAssembly` is undefined) | |
  | Gaussian splat sorter | `Splat` objects (WASM sorter in a Worker, with `shared: true` memory) | |
  | opentype.js (JS, not wasm) | text or input geometry; fetches the Roboto TTF from `fonts.gstatic.com` | 177 KB |
  | basis/KTX2 | the runtime does not use KTX2 (no hits for ktx2); the "basis" hits are splat shader variables | |

  The runtime has no JS fallback for physics, boolean, bevel, subdiv or navmesh. A scene that uses them cannot run without WebAssembly.
- Web Workers (`new Worker(URL.createObjectURL(new Blob(...)))`): used only by the splat sorter, Draco (DRACOLoader worker pool) and navmesh. Not needed for a plain scene. Whether the host has workers is up to the host (not verified here; the brief says QuickJS has none).
- Network: it fetches the `.splinecode` with `fetch(url, fetchOptions)` (`load`) or takes bytes (`app.start(arrayBuffer, { interactive, variables })`, documented in `runtime.d.ts`). It also touches `cdn.spline.design` for wasm (see above), `fonts.gstatic.com` for text, `www.gstatic.com` for Draco, and an iframe with `srcdoc` for HTML frames (`htmlContentMode: 'sandbox'`; use `'none'` to skip). Images and textures come from the scene data. The `sky-alto.png` and other assets in `build/` are loaded relative to the bundle or the CDN as a fallback.
- Browser APIs (counts in the standalone webgl bundle):
  - Core: `HTMLCanvasElement.getContext('webgl2')`, `requestAnimationFrame` (13), `devicePixelRatio` (18), `getBoundingClientRect` (12), `window` and `document.addEventListener` (17 each; pointer events: `pointerdown` etc., 51 hits), `document.body` (17), `fetch`, `TextDecoder`, `atob`, `Blob`, `URL.createObjectURL` (6).
  - `ResizeObserver` (7) and `IntersectionObserver` (1): the resize path uses `ResizeObserver`, and `app.setSize(w, h)` stops the automatic size updates.
  - 2D canvas: `document.createElement('canvas')` plus `getContext('2d')` with `drawImage`, `getImageData` and `putImageData` for texture resize and ImageBitmap conversion. `OffscreenCanvas` (3 hits) is feature-detected with a fallback to a DOM canvas.
  - Images: loaded through three's usual `createElementNS` img path (3 hits) or `ImageBitmap`. `createImageBitmap` is not referenced. `DecompressionStream`, `FontFace`, `document.fonts` and `XMLHttpRequest` are not referenced.
  - Audio: `AudioContext` appears once (microphone analyser); `howler.js` is a lazy chunk for audio actions. `localStorage` (5 hits), fullscreen (60), pointer lock (1), `setPointerCapture` (1): all optional.
  - Dynamic `import()` of chunks and `import.meta.url` are used. A host must support ES modules, or use the single-file `runtime.standalone.*.js` builds (which still `import()` wasm helper chunks like `physics.js`).
- API (`AGENTS.md` and `runtime.d.ts` in the tarball): `Application(canvas, { renderMode, renderer, wasmPath, htmlContentMode })`, `load`, `start(bytes)`, `findObjectByName`, `emitEvent`, `setVariable`, `setSize`, `play/stop`, `requestRender`, `dispose`. Events: `mouseDown`, `mouseUp`, `mouseHover`, `keyDown`, `keyUp`, `start`, `lookAt`, `follow`, `scroll`, `collision`, `rendered`.
- The watermark is baked into the scene data by the publisher (Free plan); the docs say never to hide it.

## 3. `@splinetool/loader` (three.js SplineLoader)

- 2.0.98 (published 2026-10-20), no licence field, 7 MB unpacked, `SplineLoader.js` 1.37 MB. Peer dependency `three >=0.150.0` (built against 0.185.0). Default export `SplineLoader`; `load(url, onLoad, onProgress, onError)` or `parse(arrayBuffer)`. A local path works as well.
- Same wasm and Worker usage as the runtime (3 `WebAssembly` and 2 `new Worker` hits: the splat sorter and the navmesh/physics-related worker blob). `ResizeObserver` is referenced 4 times, and `new Image` 2 times. `OffscreenCanvas` is not referenced. It has no `wasmPath` option; wasm modules sit beside the build and come via `cdn.spline.design` (3 hits). It also ships `hana-ui.wasm`, `process.wasm` and `opentype.js` next to the bundle.
- What survives (README and AGENTS.md of the package): geometry and materials (Spline layers are converted to three.js materials, with "the next best thing" fallbacks). The Glass layer is only partial. What does not exist: events, interactions, states, actions, Spline post-processing, the renderer, camera and animation loop (you write them). The docs say events and animations are only enabled in the Vanilla JS and React exports. The loader's own docs list physics-based scenes as unsupported only implicitly (no physics runtime is exposed). Exact animation support in the loader was not verified.
- It is the better fit only when the host owns the three.js scene. Spline itself recommends `@splinetool/runtime` as the default.

## 4. `.splinecode` format and terms

- Binary, **msgpackr** (the first bytes `d4 72 40` are msgpackr's record-definition extension; the runtime deserializes with `Packr({structuredClone:true}).unpack(Uint8Array)`). I found no compression layer: no zlib, brotli, lz4 or DecompressionStream references, and the sample files are readable `strings`. Root keys: `schema`, `scene`, `frames`, `shared`, `version`. The schema number is 134 (`updateDocumentSchema` migrates older ones). A scene newer than the library logs a warning.
- Not documented publicly. The runtime docs only say: "Only `.splinecode` loads through this API. A `.spline` file is the editor's own document format". `.splinecode` URLs are minted at export time (`https://prod.spline.design/<id>/scene.splinecode`), they cannot be derived from a share link, and Community scenes have none (remix, then export).
- Draco meshes, if any, are embedded in the data (`geometry.data.draco`).
- Terms (https://spline.design/terms, as summarised by a fetch tool, not read in full): users keep ownership of their content (5.2); Section 15 forbids modifying, distributing, or creating derivative works of the Service or Software without authorisation; no explicit reverse-engineering clause; nothing about running exported scenes or the runtime licence (none is stated anywhere I found). Community scenes use the "Standard Commercial License" (remix for personal and commercial use). Docs ask to keep the "Made with Spline" credit. **Open risk:** the package ships with no licence, so bundling the runtime in a product is a legal question for the owner. Writing our own loader for the format avoids that, but the format is undocumented and versioned.

## 5. glTF/GLB export (https://docs.spline.design/exporting-your-scene/files/exporting-as-gtlf-glb.md)

- Kept: geometry, the Colour layer, basic textures (primitives with UV projection only, not "Smooth and Edit" geometry), and timeline animations of position, rotation and scale.
- Lost: every material layer beyond Colour, post-processing, most animations (material, shape size, cloners, opacity, camera lens, light colour and intensity), physics, environment/lighting/fog, states, events, interactivity, assets, components, variables.
- The Colour-and-texture option needs Pro or Max. Free gets "Default Color (Grey)", geometry only. The USDZ page lists the same losses, except that animation is dropped entirely.
- A 2023 third-party post (https://felixrunquist.com/posts/creating-3d-models-spline-three-js) also says the GLB lacks lighting and materials.

## 6. Public sample `.splinecode` URLs

Checked 2026-10-21: all return HTTP 200 with `access-control-allow-origin: *`.

| URL | Size | Where found | Contents |
|---|---|---|---|
| https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode | 5.9 KB | `@splinetool/viewer` README (the `url` example) | Cube + cylinders + a boolean. No physics. Needs `boolean.wasm` (it has `booleanExclude`; not run to confirm). |
| https://prod.spline.design/2qM3cW5Cx15m3cJ7/scene.splinecode | 5.5 KB | package README/docs | Cube + cylinders only: the best first test, probably no wasm. |
| https://prod.spline.design/iEAs8HJFu91daMOq/scene.splinecode | 4.7 KB | `@splinetool/viewer` npm README | Rectangle + cube with physics (needs `physics.wasm`). |
| https://prod.spline.design/KFonZGtsoUXP-qx7/scene.splinecode | 246 KB | docs/READMEs | Spheres, tori, paths, subdivision, physics (needs physics and subdiv wasm). |

- The scene IDs are the ones Spline prints in its docs and READMEs as copy-paste examples. No licence is attached to them; the file contents themselves were read only as strings (object types), not rendered, and nobody has promised these stay up. For a demo, make a copy of the file next to the demo (tiny) rather than depending on the URL, and credit Spline.
- Spline Community scenes (https://app.spline.design/community) have no `.splinecode` URL and use the Standard Commercial License.

## Recommendation for a QuickJS host (WebGL2, no wasm, no workers)

1. Drive `@splinetool/runtime` standalone webgl build (about 2.2 MB) with a browser shim. Fetch the `.splinecode` bytes yourself and call `app.start(bytes)`. Pass `htmlContentMode: 'none'`, `renderer: 'webgl'`, `renderMode: 'manual'`, and `setSize`, to avoid HTML sandbox iframes and `ResizeObserver` reliance.
2. Hard requirements on the host: WebGL2 with float colour buffers, a 2D canvas with `drawImage` and `getImageData`, an image decoder for textures, ES dynamic `import()` (or pre-bundle the lazy chunks), `fetch`, `TextDecoder`, `atob`, `Blob`/`URL.createObjectURL` (stub), pointer and key events on `window` and `document`.
3. Scenes using physics, boolean, bevel, subdiv, navmesh, splats, Draco or text/HTML will fail without WebAssembly (and the splat, Draco and navmesh paths also need Workers). The demo has to pick a scene without them, such as 2qM3cW5Cx15m3cJ7. Text needs opentype.js (pure JS, fine) plus the Roboto font fetched from fonts.gstatic.com. Verify by actually running before committing to this path.
4. Fallback: if the runtime does not run, a native loader for msgpackr plus a three.js build (`SplineLoader`, same wasm caveats) is the alternative; the 2.0.98 `parse(arrayBuffer)` entry point accepts bytes.

Sources: https://docs.spline.design/llms.txt, https://docs.spline.design/skill.md, https://spline.design/pricing, https://spline.design/terms, https://registry.npmjs.org/@splinetool/runtime, https://unpkg.com/@splinetool/runtime/ (tarball 2.0.98), https://unpkg.com/@splinetool/loader/ (tarball 2.0.98), https://cdn.jsdelivr.net/npm/@splinetool/viewer@2.0.75/AGENTS.md.

Not verified: whether the runtime actually runs without Workers or WebAssembly in practice (static reading only; no scene was rendered), the free-plan status of the Spline Viewer export, bevel.wasm size, the `spline_flutter` package, and the full text of the terms.

## Spike on Zinc (2026-10-21): both paths render

Run with the QuickJS engine (`"web": true`, as `examples/js-three`), headless, scene `6Wq1Q7YGyM-iab9i` copied next to the program.

- **`@splinetool/loader` 2.0.98 + three r186** (`SplineLoader().loadAsync(file)`): loads in one frame, 7 meshes with Spline's own node materials, the scene's orthographic camera. Its `boolean` exclusion did not need wasm for this scene. Needs four three addons that `third_party/three` does not vendor yet (`HDRLoader`, `DRACOLoader`, `MeshSurfaceSampler`, `GPUComputationRenderer`).
- **`@splinetool/runtime` 2.0.98, `runtime.standalone.webgl.js`** (`new Application(canvas, { renderer: 'webgl', htmlContentMode: 'none' })`, `app.start(bytes)`): renders the scene as Spline's viewer does (camera, background, lights), `getAllObjects()` and `addEventListener('mouseDown')` work. This is the path for a demo: interactions, states and events come with it.

What Zinc had to be given (spike workarounds, each a small engine fix):

1. **ESM bundle taken for CommonJS.** The CommonJS loader in progress in the main tree (`isCommonJs`, uncommitted on 2026-10-21) decides "CommonJS" when no line starts with `import`/`export` and the text has `exports.`: esbuild's minified ESM output (one long line starting `var R3=...`, interop helpers with `t.exports`) matches, so the file is wrapped in a function and the first `import{` is a syntax error. Workaround: an `export {};` line on top. Fix: trust `"type": "module"` of the nearest package.json, or compile as a module first and fall back to CommonJS only on that syntax error.
2. **`IntersectionObserver` missing** from `lib/std/webenv.js`. A stub beside `ResizeObserver` (always intersecting: the canvas is the window) is enough.
3. **`Event.target` is a plain field** in `webenv.js`; the runtime does `Object.defineProperty(event, 'target', { writable: false, value: app })` then `dispatchEvent`, and `dispatch` throws `'target' is read-only`. In browsers `target` is a getter on `Event.prototype` over an internal slot; do the same (`get target() { return this._target }`, dispatch writes `_target`).

Not tried: pointer interaction on a scene with states, scenes that need wasm (physics, subdivision, bevel: `zinc:wasm` runs wasm3 on the typed engine; a `WebAssembly` global for QuickJS on top of it would open them, at interpreter speed), text (Roboto fetched from fonts.gstatic.com), performance on modest machines. Licence: the runtime ships with no licence ("© Spline, Inc."), so a demo loads it from npm at `zinc add`/install time rather than vendoring it in `third_party/`.
