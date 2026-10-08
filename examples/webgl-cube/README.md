# webgl-cube

Real three.js (r186, unmodified) rendering a lit cube and a torus with a shadow map on zinc's WebGL 2, shown as a `Surface` in an ordinary `zinc:ui` page with buttons.

```sh
cd next
./build/zinc run ../examples/webgl-cube
```

How it fits together: `zinc.json` has `"webgl": true`, which gives `zinc:script` contexts `document.createElement('canvas').getContext('webgl2')`; `assets/scene.mjs` is the three.js scene (it imports `three.module.js` from the assets); every frame `main.tsx` calls `frame(image, t)` in the script, which renders and ends with `gl.zincPresent(image)`, copying the canvas into the Surface node. See `docs/reports/three-on-zinc.md` and `docs/ui.md` (Surfaces).
