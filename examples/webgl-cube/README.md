# webgl-cube

Real three.js (r186, unmodified) rendering a lit cube and a torus with a shadow map on zinc's WebGL 2, shown as a `Surface` in an ordinary `zinc:ui` page with buttons. It uses three's own `OrbitControls` (drag the background, wheel to zoom) and `TransformControls` (the gizmo on the cube: Move / Rotate / Scale buttons). The Surface forwards its pointer events to the script, which dispatches them to the canvas listeners the controls registered. The drawing buffer has the physical resolution of the screen (`pixelScale()`), so a Retina display is not upscaled.

```sh
cd next
./build/zinc run ../examples/webgl-cube
```

How it fits together: `zinc.json` has `"webgl": true`, which gives `zinc:script` contexts `document.createElement('canvas').getContext('webgl2')`; `assets/scene.mjs` is the three.js scene (it imports `three.module.js` from the assets); every frame `main.tsx` calls `frame(image, t)` in the script, which renders and ends with `gl.zincPresent(image)`, copying the canvas into the Surface node. See `docs/reports/three-on-zinc.md` and `docs/ui.md` (Surfaces).
