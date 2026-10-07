# three — three.js on Zinc

`plugins/three` (module `three`) is a subset of the [three.js](https://threejs.org) API written in Zinc on top of the
software renderer of [`zinc:3d`](3d.md), so three.js code ports with few changes and runs without a GPU or a
JavaScript engine. Math, scene graph, geometries, materials, lights, cameras and picking are Zinc code
(`plugins/three/index.ts`); a frame is one `zinc:3d` draw per mesh into a runtime image that composes with `zinc:gfx`
and `zinc:ui`. `GLTFLoader` and `OrbitControls` are addons with the usual import paths:

| import | file |
| --- | --- |
| `three` | `plugins/three/index.ts` |
| `three/addons/loaders/GLTFLoader.js`, `three/examples/jsm/loaders/GLTFLoader.js` | `plugins/three/addons/GLTFLoader.ts` |
| `three/addons/controls/OrbitControls.js`, `three/examples/jsm/controls/OrbitControls.js` | `plugins/three/addons/OrbitControls.ts` |

(The extra specifiers come from the `modules` field of `plugin.json`, see [plugins](../plugins.md).)

```ts
import * as THREE from 'three';
import { window } from 'three';  // zinc: no DOM; `window` gives the screen size and devicePixelRatio

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 6);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 5, 4);
scene.add(sun);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2a9d8f }));
scene.add(cube);
renderer.setAnimationLoop((time: number) => {
  cube.rotation.x = time / 1000;
  cube.rotation.y = time / 800;
  renderer.render(scene, camera);
});
```

## Positioning: this is the software subset, real three.js is the other path

Two ways to run three.js code exist, on purpose (decisions D28 to D30 of `docs/reports/zinc-next-decisions.md`, roadmap R8):

| | `three` (this plugin) | real three.js on `zinc:webgl` (roadmap R8.1 to R8.3) |
| --- | --- | --- |
| Code | Zinc subset of the API, in-tree | the unmodified npm package on `zinc:script` (QuickJS) |
| Renderer | software `zinc:3d`, no GPU, no JS engine | WebGL1 on GLES2 (Pi 3, tier T2) up to WebGL2 on GLES3 / desktop (T3, T4) |
| Tiers | T0 to T4, the only option without a GPU or a JS engine (ESP32 excluded by heap, Pi 1 works) | T2 and above, needs a GL driver and the script engine |
| API coverage | the list under "Supported API", deviations below | whatever the WebGL conformance suites let through: full WebGL, not a subset |
| Output | frozen goldens of ZN-107 (unchanged) | SSIM against Chrome |

Rules: the subset keeps working and keeps its goldens; it is never extended to chase three.js features, which come from the real package instead. A program written for the subset runs on the real package by changing nothing but the import (the subset's `GLTFLoader`, `OrbitControls` and `window` shim map to the package's addons). Both draw into a runtime image today and into a shared `Mesh` / `Surface` scene primitive once the scene IR has them (R8.3), so UI layouts embed either one the same way.

## Examples

```sh
zinc run examples/three/cubes                  # three.js "creating a scene": spinning cubes, lights, a torus, a floor
zinc run examples/three/gltf-viewer            # glTF viewer: orbit, zoom, pan, click to pick, zinc:ui overlay
zinc run examples/three/gltf-viewer -- my.glb  # any .glb/.gltf file on disk
THREE_DEMO_SCRIPT=1 ZINC_FRAMES=130 ZINC_SHOT=/tmp/v.bmp zinc run examples/three/gltf-viewer   # scripted orbit + pick
zinc run examples/three/gltf-viewer --target sim   # Node: loading, scene graph and picking run, nothing is drawn
```

`gltf-viewer` loads the Cesium Milk Truck (`.glb`, embedded JPEG texture decoded at run time) and Box Textured
(`.gltf` + `.bin` + PNG, the PNG baked at build time), fits the model, lets you orbit (drag), dolly (wheel, trackpad
pinch, two-finger pinch) and pan (right drag, two fingers), and picks on click/tap with a `Raycaster`: the nearest
mesh gets a tinted clone of its material and the overlay shows its name, the hit point and distance. The floor
texture is painted with [`zinc:canvas`](canvas2d.md) and used as a `CanvasTexture`. With `THREE_DEMO_SCRIPT=1` the
camera orbits and dollies by script (`controls.rotateLeft`, `dollyIn`) and a pick happens at frame 100.

## Supported API

| three.js | here |
| --- | --- |
| math | `Vector2` (basic), `Vector3` (set/copy/clone, add/sub/multiply/divide, dot/cross, length/normalize, lerp, distance, `applyMatrix4`, `applyQuaternion`, `applyEuler`, `applyAxisAngle`, `transformDirection`, `project`, `unproject`, `setFromMatrixPosition/Column`, `setFromSpherical(Coords)`, `fromArray`/`toArray`...), `Quaternion` (Euler, axis-angle, rotation matrix, unit vectors, multiply/premultiply, invert, slerp, angleTo), `Euler` (all six orders), `Matrix4` (`set`, compose/decompose, multiply, invert, determinant, transpose, make Translation/Scale/Rotation X/Y/Z/Quaternion/Euler, `lookAt`, `extractRotation`, makePerspective/Orthographic), `Box3`, `Ray` (box and triangle tests), `Spherical`, `Color` (hex, RGB, HSL, CSS via `setStyle`), `MathUtils` (degToRad, clamp, lerp, damp, smoothstep, rand...) |
| scene graph | `Object3D` (name, id, parent, children, position/rotation/quaternion/scale, matrix, matrixWorld, visible, `add`, `remove`, `removeFromParent`, `clear`, `attach`, `getObjectByName/Id`, `traverse`, `traverseVisible`, `traverseAncestors`, `updateMatrix`, `updateMatrixWorld`, `updateWorldMatrix`, `lookAt`, `rotateX/Y/Z`, `rotateOnAxis`, `rotateOnWorldAxis`, `translateX/Y/Z`, `translateOnAxis`, `localToWorld`, `worldToLocal`, `getWorldPosition/Quaternion/Scale/Direction`, `applyMatrix4`, `applyQuaternion`), `Group`, `Scene` (`background` colour), `Mesh` |
| geometry | `BufferGeometry` (`attributes.position/normal/uv/color`, `setAttribute`, `getAttribute`, `setIndex`, `computeBoundingBox`, `computeVertexNormals`, `center`, `translate`, `scale`, `rotateX/Y/Z`, `applyMatrix4`, `dispose`), `BufferAttribute` / `Float32BufferAttribute` (`getX/Y/Z`, `setX/Y/Z`, `setXY(Z)`, `count`, `needsUpdate`), `BoxGeometry`, `SphereGeometry`, `PlaneGeometry`, `TorusGeometry`, `CylinderGeometry`, `ConeGeometry` (the three.js vertex layouts and uv) |
| materials | `MeshBasicMaterial` (unlit), `MeshLambertMaterial`, `MeshPhongMaterial`, `MeshStandardMaterial`, `MeshPhysicalMaterial`: `color`, `map`, `side` (Front/Double; Back is drawn double sided), `flatShading`, `vertexColors`, `visible`, `clone()`, constructor parameters object |
| textures | `Texture` (a `zinc:gfx` image id), `CanvasTexture` (e.g. a `zinc:canvas` `Canvas.image`), `TextureLoader` (baked PNG assets, or PNG/JPEG decoded at run time) |
| lights | `AmbientLight`, `DirectionalLight` (+ `target`), `HemisphereLight` (approximated), `PointLight` (approximated); up to 4 directional/point lights |
| cameras | `PerspectiveCamera` (fov, aspect, near, far, zoom, `updateProjectionMatrix`), `OrthographicCamera` |
| rendering | `WebGLRenderer`: `setSize`, `setPixelRatio`, `setViewport` (screen box), `setClearColor`, `setAnimationLoop(cb(timeMs))`, `render(scene, camera)`, `info.render.triangles/calls/frame`, `dispose`; `domElement` is a `CanvasElement` (x, y, width, height) |
| picking | `Raycaster` (`setFromCamera`, `set`, `intersectObject(s)` recursive, `near`/`far`): every intersected triangle, sorted, with `distance`, `point`, `object` (the `Mesh`), `faceIndex` |
| misc | `Clock`, `window` (innerWidth, innerHeight, devicePixelRatio), constants (`DoubleSide`, `SRGBColorSpace`, tone mapping and filter constants, accepted and ignored) |
| `GLTFLoader` | `load(url, onLoad, onProgress, onError)`, `loadAsync(url)`, `parse(bytes, path, onLoad, onError)`, `setPath`; result `GLTF` with `scene`, `scenes`, `asset`, `animations` (empty), plus `meshes`, `triangles`, `ignoredAnimations`, `ignoredSkins` |
| `OrbitControls` | `target`, `update(deltaTime)`, `enableDamping`/`dampingFactor`, `enableRotate/Zoom/Pan`, `rotateSpeed`/`zoomSpeed`/`panSpeed`, `screenSpacePanning`, `min/maxDistance`, `min/maxZoom`, `min/maxPolarAngle`, `min/maxAzimuthAngle`, `autoRotate`/`autoRotateSpeed`, `saveState`, `reset`, `getDistance`, `getPolarAngle`, `getAzimuthalAngle`, events `change`/`start`/`end`; public `rotateLeft`, `rotateUp`, `dollyIn`, `dollyOut`, `pan` for scripts |

## glTF 2.0 support

| feature | status |
| --- | --- |
| `.gltf` (JSON) with external `.bin` and images, `data:` URIs; `.glb` (binary chunk, embedded images) | yes |
| files | from the embedded assets (`zinc:assets`), else the file system (hosts); URIs relative to the file, `%XX` decoded |
| meshes | TRIANGLES, TRIANGLE_STRIP, TRIANGLE_FAN; POSITION, NORMAL (computed when absent), TEXCOORD_0, COLOR_0; u8/u16/u32 indices; float and normalized integer attributes; byte strides |
| multi-primitive meshes | a `Group` with one `Mesh` per primitive, like three.js |
| nodes | hierarchy, names, TRS or matrix, shared meshes (geometry and material shared) |
| materials | `pbrMetallicRoughness.baseColorFactor` and `baseColorTexture`, `doubleSided`, `KHR_materials_unlit` (→ `MeshBasicMaterial`); `alphaMode` recorded in `transparent`/`opacity` but drawn opaque; metallic/roughness, normal, occlusion and emissive maps ignored |
| textures | PNG and JPEG; image files present in the assets are **baked at build time** (the compiler's PNG decoder), embedded images (GLB buffer views, `data:` URIs) and files outside the assets are **decoded at run time** with stb_image (PNG, baseline and progressive JPEG). Samplers are ignored (repeat, nearest) |
| not supported | animations, skins, morph targets (counted, ignored: the bind pose is shown), cameras, lights (KHR_lights_punctual), sparse accessors, Draco / meshopt compression and KTX2 textures (a required extension fails the load), points and lines, texture transforms, multiple uv sets, more than 65535 vertices per primitive |

## Deviations from three.js

- **No overloads or unions** in Zinc: `lookAt(x, y, z)` only (write `lookAt(v.x, v.y, v.z)`); `Color` takes a hex number
  or r, g, b (`Color.fromStyle(css)` / `setStyle` for CSS strings); material parameters take hex numbers for colours;
  `setIndex(number[])`; `add(object)` adds one object per call; `removeEventListener(type)` removes all listeners of
  the type (functions cannot be compared).
- **Typed arrays** are plain `number[]` (`new Float32BufferAttribute(array, itemSize)`).
- `geometry.attributes` is an object with `position`, `normal`, `uv`, `color` (empty when absent, `count === 0`) and
  a `custom` map for other names.
- `Material.clone()` returns a `Material` with the same values (its class is lost: `instanceof MeshStandardMaterial`
  is false afterwards).
- Rotation and quaternion are kept in step lazily (at the next matrix update or rotation call), not by callbacks:
  reading `rotation` right after writing `quaternion` directly shows the old angles until then.
- No DOM: the renderer draws on the screen (or in a `<canvas onDraw>` box through `setViewport(x, y, w, h)`, whose
  origin is the top-left corner), `OrbitControls` poll `zinc:gfx` input inside `renderer.domElement`'s box and must be
  updated every frame. `loader.load` completes synchronously (onLoad runs before `load` returns).
- **Shading** is `zinc:3d`'s: per-vertex (Gouraud) or flat Lambert lighting, nearest texel sampling, one texture per
  material, z-buffer; no specular, PBR, shadows, transparency, fog, environment maps, wireframe or post-processing.
  Light intensities follow three.js r155+ (physically based units): each light contributes
  sRGB(colour × intensity / π), ambient likewise, so `DirectionalLight(0xffffff, 3)` is near full brightness. There is
  no colour management: colours are used as given (sRGB), so mid-tones of lit surfaces come out darker than in a
  linear-workflow three.js render.
- `HemisphereLight` adds (sky + ground) / 2 to the ambient; `PointLight` is a directional light from its position
  towards the world origin, dimmed by 1/d²; `SpotLight`, shadows (`castShadow`, `shadowMap`) and `layers` are absent
  or ignored.
- `OrthographicCamera` frustums are centred (left/right/top/bottom offsets are ignored by the renderer; picking uses the
  full projection).
- The renderer draws every visible mesh (no frustum culling, no sorting by material); `renderOrder` is ignored.

## Performance

macOS release build, Apple M1 Pro, Retina (pixel ratio 2), average of 300 frames; `render` is
`renderer.render()` (scene traversal, transforms and lighting, zinc:3d rasterization into its image);
the 2D compositing of the frame (scaling the 3D image, UI, text) is measured separately in `runtime/gfx.cpp`.

| scene | view (physical pixels) | ms / render | 2D compositing | frame |
| --- | --- | --- | --- | --- |
| `examples/three/cubes` (5 cubes, torus, floor: ~790 triangles drawn) | 800×500 (1600×1000) | 1.72–1.81 | 0.16 ms | vsync-bound (60/120 Hz) |
| `examples/three/gltf-viewer`, Cesium Milk Truck (2856 triangles + floor, ~1780 drawn) | 960×600 (1920×1200) | 6.3–6.9 | 0.8 ms (+ zinc:ui overlay) | 8.3 ms at 120 Hz |
| Cesium Milk Truck load (`.glb` 370 KB: JSON, accessors, 2048×2048 JPEG decode, 5 meshes) | | | | 37–41 ms once |

## Targets

| target | status |
| --- | --- |
| macos | yes: screenshots checked (HiDPI), timings above |
| sim | yes: glTF parsing (JavaScript twin of the native reader), scene graph, picking and controls run; images are not decoded (their size is read from the headers) and nothing is drawn. `tests/conformance/three.ts` prints the same bytes on sim and macOS |
| rpi1 | builds (docker, ~5 min of C++ for the viewer); `tests/conformance/three.ts` runs under QEMU (ARMv6) and prints the same bytes as the sim (glTF parsing, stb_image PNG/JPEG decoding, picking). Not run on a real Pi: use `"3d": { "scale": 2 }` (as in the examples' `zinc.json`), see the zinc:3d estimates |
| wasm | builds (emscripten); `gltf-viewer` renders the truck in headless Chrome (screenshot checked) |
| linux | listed (same portable C++), not built here |
| esp32, ps1, ps2, rmpp | not listed (`zinc:3d` memory budget on ESP32, no FPU on PS1, `zinc:3d` not available on rmpp). Number profiles: f64 and f32 (`--profile esp32` on macOS matches the sim); fx12 (`--profile ps1`) is not supported: Q20.12 overflows in matrix inverses and fails with a fixed-point division by zero |

Memory: a mesh keeps its attributes in Zinc arrays (for picking and `computeBoundingBox`) and a copy in `zinc:3d`
(24 B/vertex + 8 uv + 4 colour + 2 B/index), textures decoded at run time are runtime images (4 B/pixel, 64 runtime
images at most), the render target is `4 + 4 bytes × w × h × pixelRatio²` (colour + z32).

## Verification

- Screenshots on macOS (`ZINC_SHOT`, converted with `sips`): `examples/three/cubes`; `examples/three/gltf-viewer` at
  frame 2 (initial view), frame 95 (after the scripted orbit and dolly) and frame 130 (after the scripted pick: the
  truck body tinted, the overlay naming `Cesium_Milk_Truck_0` at 4.45 m); Box Textured loaded from the command line
  (baked PNG texture, correct orientation).
- `tests/conformance/three.ts`: matrix inverse/decompose, Euler round trips in the six orders, geometries (vertex and
  triangle counts, bounding boxes), world transforms and `lookAt`, raycasts through projected points, orbit and dolly,
  an inline `.gltf` (data: URIs, TRS and matrix nodes, a triangle strip, a JPEG texture, `KHR_materials_unlit`, a
  default material), the Box Textured `.glb` (embedded PNG), error paths, three rendered frames. Same output on sim,
  macOS, macOS with the f32 profile and rpi1 under QEMU.
- wasm: `gltf-viewer` screenshot in headless Chrome (the page served locally, `--virtual-time-budget`).

## Follow-ups

- skinning and animation (`AnimationMixer`), morph targets;
- texture filtering (bilinear) and alpha blending/testing in `zinc:3d`, then `transparent`/`alphaTest`;
- frustum culling with the bounding boxes; splitting primitives above 65535 vertices;
- `InstancedMesh`, `Line`/`Points`, `SpotLight`, `Sprite`.
