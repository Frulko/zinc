# js-spline

A scene made in [Spline](https://spline.design), run by Spline's own runtime (`@splinetool/runtime` 2.0.98, three.js inside, unmodified) in plain JavaScript: the scene's camera, lights and materials, its animations, and the interactions its author drew in Spline. Here a little robot floats and turns its head to follow the pointer.

![the robot](screenshot.png)

```sh
tools/test-lib spline-runtime-2.0.98     # once: downloads Spline's runtime from its npm release (it is not in this repository)
build/zinc run examples/js-spline
```

Move the pointer around the window: the robot looks at it (Spline's *Look At* event), and the program prints what the pointer is over (`mouseHover NORMAL`) and what is clicked.

Seven scenes come with it (`assets/scene.splinecode`, the robot, and `assets/scenes/`): `examples/js-spline/pick.sh` lists them and runs the one you choose, then lists them again when you close its window.

Another scene: in Spline, *Export* > *Code* > *Vanilla JS* gives a URL `https://prod.spline.design/<id>/scene.splinecode`. Download that file and run

```sh
SPLINE_SCENE=path/to/scene.splinecode build/zinc run examples/js-spline
```

How it fits together:

- `main.js` is JavaScript, so `zinc run` takes the QuickJS engine by itself. `zinc.json` has `"web": true`: the program gets a `window`, a `document` and WebGL, as a page in a browser does. It is what Spline's own guide writes: `new Application(canvas)`, then `app.start(bytes)`.
- `assets/scene.splinecode` is the scene, read from disk: nothing goes on the network. A scene saved with a fixed size (an embed) is made to fill the window, as Spline's *fullscreen* preset does.
- The runtime lives in `~/.zinc/cache/test-libs/spline-runtime-2.0.98/`, checked against a pinned sha256. Its package declares no licence ("© Spline, Inc."), so it is taken from Spline's own release and never kept here.

## What it needs, and where it does not run

- **WebGL 2.** Spline's runtime is built on three.js r185, which needs WebGL 2. `zinc.json` says so (`"requires": ["gpu>=webgl2"]`): `zinc build` and `zinc lint` refuse the GLES 2 profiles (`rpi1`, `android`, `ios-legacy`), and on a machine whose GPU makes no WebGL 2 context (neither OpenGL 3.3 nor OpenGL ES 3.0, a Raspberry Pi 3 for instance) the program stops at once and says why. `ZINC_WEBGL_MAX=1` makes any machine behave like that GPU; `--force` runs the program anyway.
- **No WebAssembly on the QuickJS engine.** Spline loads WebAssembly modules for some features, and QuickJS has no `WebAssembly`. The scene is refused with a message when it uses physics, booleans, bevels on extrusions, subdivision (*Smooth*), a navmesh (game controls), Gaussian splats or Draco-compressed meshes. Scenes made of shapes, materials, lights, states, transitions and mouse, key and look-at events run. The engines with WebAssembly built in (V8, JavaScriptCore) lift this limit; a `WebAssembly` for QuickJS is studied in `docs/reports/quickjs-webassembly.md`.
- **Text** needs a font Spline fetches from `fonts.gstatic.com`: a scene with text needs the network the first time.
- **HTML frames** inside a scene are off (`htmlContentMode: 'none'`): there is no browser to put them in.

The scenes were published on prod.spline.design by their authors, with no licence stated, and are used here as test data: the robot of [JackyLiu13/Qiwi](https://github.com/JackyLiu13/Qiwi), and the others listed by id in `docs/reports/spline-scenes.md` (cubes zBBaOmVltDuUag17, bubbles 6ZQA4GzzFjXNeDE4, bubbles-2 4pfOWnUVkcuN7arI, glass-sphere F5Cd4TXjxVfRX7nX, sphere 4LyeK5Yvi3fhB2P1, moon-map OH3FelUamsexR0DI). Research and measurements: `docs/reports/spline-research.md`, `docs/reports/spline-scenes.md`.

Test: `tests/run --only example_js_spline`: a scripted pointer, frame 89 against `screenshot.png`, the hover reaching the program, and the refusal on a GPU without WebGL 2.
