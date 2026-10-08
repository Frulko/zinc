# {{name}}

A 3D scene made from the `3d` template: three.js code as on the web, drawn by Zinc's renderer (no browser, no DOM).

```sh
zinc run      # drag to orbit around the scene, wheel or pinch to zoom
zinc test     # the motion (tests/motion.test.ts)
zinc build    # a native executable in build/
```

| File | What it does |
|---|---|
| `src/main.ts` | the renderer, the camera with OrbitControls, the animation loop |
| `src/scene.ts` | what is in the scene: lights, floor, the ring, the satellites |
| `src/motion.ts` | where things are at time t, without three.js (what the tests check) |

The differences from the same code on the web are marked `zinc:` (`window` comes from 'three', the renderer draws on the screen).
glTF models load with `GLTFLoader` from 'three/addons/loaders/GLTFLoader.js' (see examples/three/gltf-viewer in the Zinc repository).
