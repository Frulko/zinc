---
title: three.js API
description: A subset of the three.js API in Zinc, drawn through zinc:3d, so three.js code ports with few changes.
order: 0
---

`import * as THREE from 'three'` gives a Zinc program a subset of [three.js](https://threejs.org): math, scene graph, geometries,
materials, lights, cameras, picking, and the `GLTFLoader` and `OrbitControls` addons with their usual import paths. Each frame is one
[`zinc:3d`](https://github.com/Frulko/zinc/tree/main/plugins/3d/docs) draw per mesh, so it runs without a JavaScript engine, on the software renderer and on the GPU
where there is one.

![A three.js scene running in Zinc](img/showcase-three.jpg)

```ts
import * as THREE from 'three';
import { window } from 'three';   // no DOM in Zinc: `window` gives the screen size and the pixel ratio
```

## Differences to keep in mind

- It is a subset: the reference lists what exists.
- There is no DOM, so `window.innerWidth`, `window.innerHeight` and `window.devicePixelRatio` come from the `window` export of `three`.
- The renderer is `zinc:3d`, not WebGL: lighting is per vertex or per face, as that page describes.

## Where to go next

- [A spinning cube in three.js](01-spinning-cube.mdx).
- The reference, with the addons table and the supported classes:
  [docs/plugins/three.md](https://github.com/Frulko/zinc/blob/main/docs/plugins/three.md).
- Examples: [`examples/three/cubes`](https://github.com/Frulko/zinc/tree/main/examples/three/cubes) and
  [`gltf-viewer`](https://github.com/Frulko/zinc/tree/main/examples/three/gltf-viewer).
- The code: [`plugins/three/index.ts`](https://github.com/Frulko/zinc/blob/main/plugins/three/index.ts).
