# webgl-studio

Real three.js (r186, unmodified) on zinc's WebGL 2, inside a normal `zinc:ui` page built from the kit:

- a glTF model (the Cesium Milk Truck, parsed by three's `GLTFLoader` from an embedded GLB),
- a cube, a torus and a sphere with its own `ShaderMaterial` (animated stripes, fresnel rim, pulse), a shadow-casting sun and a floor that receives the shadows, ACES tone mapping and fog,
- three's `OrbitControls` (drag, wheel) and `TransformControls` (Move / Rotate / Scale) on the selected object,
- UI markers: labels made of `zinc:ui` nodes that follow each object through the camera (`markers()` projects them every frame); a click on a label or on the object itself selects it (raycast picking),
- a panel with the kit's sliders (sun direction, sun power, exposure) and switches (shadows, custom shader, wireframe, auto-rotate, pause).

```sh
cd next
./build/zinc run ../examples/webgl-studio
```

`assets/scene.mjs` is the three.js side; `src/main.tsx` the page. The script context runs at twice the screen resolution and `zincPresent` averages it down (anti-aliasing); `tests/t1/webgl_studio.sh` checks the scene's logic headless.

Known gap: the truck's PNG texture is not applied (`GLTFLoader` decodes textures through `createImageBitmap`, which script contexts do not have yet), so the truck is plain white. The truck model is CC-BY 4.0 (Cesium).
