# three documentation audit

## What it is
A subset of the three.js API written in Zinc on top of `zinc:3d`: scene graph, geometries, materials, lights, cameras, raycaster, `GLTFLoader`, `OrbitControls`. Code written for three.js ports with few changes; a web build uses the real three.js (WebGL2).

## Targets and status
`plugin.json`: macos, linux, windows, rpi1, wasm, ios, plus a `web` entry (`web/index.ts`, needs webgl2). Doc table: macOS verified; sim yes; rpi1 under QEMU; wasm in headless Chrome; linux not built; esp32/ps1/ps2/rmpp not listed.

## What the docs have
- [x] overview and positioning (subset vs real three.js on `zinc:webgl`)
- [ ] install/requirements (no `zinc add`/`zinc.json` line, no mention that `import 'three'` resolves to the plugin)
- [x] quick start
- [~] API reference: a "Supported API" table by three.js area; no list of what is missing in one place (Follow-ups is partial)
- [x] example code
- [x] runnable examples: `examples/three/cubes`, `examples/three/gltf-viewer`, `examples/js-three` (real library), `templates/3d`
- [ ] screenshots: none linked; no `docs/img/three-*.png`
- [ ] tutorial
- [x] commands (`zinc run ...`, `THREE_DEMO_SCRIPT=1`)
- [~] notes: colour management and light units are good; nothing on web target behaviour or the `three` npm name clash (backlog line 580)
- [x] tests: `three`, `three_3d`, `three_gpu`, `webenv_three`, `example_js_three`, `tests/conformance/three.ts`

## What is missing
1. Screenshots of `examples/three/cubes` and `gltf-viewer` (`ZINC_SHOT=docs/img/three-cubes.png zinc run examples/three/cubes`, then the scripted frame 130 of the viewer).
2. A "Port a three.js sketch" tutorial: take the official "creating a scene" snippet, list the 3 lines to change, run it on desktop, on the web export, and on the real library.
3. A "web" section: what `plugin.json` `web` does, `needs: webgl2`, the importmap line per addon (backlog ZN-712).
4. A single "not supported" table (SpotLight, InstancedMesh, Points, Sprite, AnimationMixer, shadows, env maps): the current text spreads it over deviations and follow-ups.
5. Document that the GPU renderer, MSAA and mipmaps now apply through `zinc:3d` (three's `Texture.minFilter`, see 3d.md).
6. Document the accurate result of `import ... from 'three'` when both the plugin and an npm `three` exist.
7. Troubleshooting: dark mid-tones (no colour management), 64 runtime image limit.
8. (hardware) real Pi 1 timing for `cubes` at `"3d": {"scale": 2}`.

## Wrong or stale
- Intro: "on top of the software renderer of zinc:3d" and "runs without a GPU": the renderer is now GPU by default on macOS; reword.
- Lighting notes: "No shadows, transparency, fog, environment maps..." - `transparent` is referenced in `plugins/three/index.ts` and `zinc:3d` supports alpha/add blending, fog and emissive. Re-check each and update. The follow-up "texture filtering (bilinear) and alpha blending/testing in zinc:3d" is done in `zinc:3d`.
- Addon table says `plugins/three/addons/OrbitControls.ts`; correct, but the web target uses `plugins/three/web/*.ts` - not stated.
- Targets: "esp32 ... not listed (zinc:3d memory budget)" but `zinc:3d` lists esp32; clarify it is a three limit.
- "roadmap R8", "decisions D28 to D30": internal references with no link.

## Suggested pages
- three: what it is and when to use it
- Quick start: a spinning cube
- Porting three.js code (tutorial)
- API coverage (generated, with missing-feature table)
- GLTFLoader and OrbitControls
- On the web: real three.js
- Colour, light units and renderer differences
- Performance and targets
- Examples with screenshots
