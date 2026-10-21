---
id: ZN-772
title: >-
  Spline scenes on Zinc: the js-spline demo, WebGL 2 required and refused where
  missing
status: Done
assignee: []
created_date: '2026-10-21 10:44'
updated_date: '2026-10-21 11:40'
labels:
  - js
  - demo
  - size-M
milestone: m-8
dependencies: []
ordinal: 501460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-21): run scenes made in Spline (spline.design) on Zinc. @splinetool/runtime 2.0.98 (its standalone WebGL build, three.js inside) runs on the QuickJS engine's web environment once the environment has IntersectionObserver and an Event.target a library may redefine (docs/reports/spline-research.md). The runtime has no licence: it is fetched and pinned by tools/test-lib, never kept in the repository. Scenes that use physics, booleans, bevels, subdivision, navmesh, splats or Draco need WebAssembly, which QuickJS lacks (docs/reports/quickjs-webassembly.md): the demo says so and names the engines that have it. WebGL 2: a program declares it (zinc.json requires gpu>=webgl2, refused by zinc build and zinc lint on GLES 2 profiles), and at run time a machine whose GPU cannot make a WebGL 2 context stops such a program with a message that says why, while any other program gets a warning and the null context a browser gives.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lib/std/webenv.js has IntersectionObserver and Event.target as a getter over the event's own slot, with a T0 test
- [x] #2 A failed WebGL 2 context prints why once; a program whose zinc.json requires gpu>=webgl2 stops with a clear error instead (test)
- [x] #3 examples/js-spline runs an interactive Spline scene on QuickJS (zinc run examples/js-spline after tools/test-lib spline-runtime-2.0.98), README with the engine limits
- [x] #4 tests/t1/example_js_spline.sh: a scripted session with a click, a golden frame, no network
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-21.
- webenv.js: IntersectionObserver (told once that the target is in view: the canvas is the window) and Event.target as a getter over _target (dispatch writes the slot; an own target a library defines wins, as in a browser). tests/golden/webenv/dom.js checks both; tests/run --only webenv passes.
- WebGL 2: the static check already existed (requires gpu>=webgl2, gpu ladder: rpi1/android/ios-legacy refuse at build and lint). At run time webenv.cpp hands webenv.js the project's requirement that a WebGL 1 GPU fails (any requires entry unsatisfied with gpu=webgl1 and satisfied with gpu=webgl2); getContext('webgl2') failing then stops such a program by name (exit 1, --force goes on) and warns once for any other. ZINC_WEBGL_MAX=1 (src/gl/webgl_js.cpp) simulates the GPU.
- examples/js-spline: runtime.standalone.webgl.js of @splinetool/runtime 2.0.98 via tools/test-lib (sha256 pinned; no licence in the package), scene XbVs02IuMqdUF0Y1 (robot, JackyLiu13/Qiwi, owner: licences are not a concern while this is a test). Its MouseDown events are disabled by the author (disabled: true in the scene data), so the session proves LookAt and the hover. The scene animates in a loop: Spline renders every frame while idle (358 of 360), by design.
- tests/t1/example_js_spline.sh passes (6 s). A physics scene is refused with the WebAssembly message (checked by hand with iEAs8HJFu91daMOq).
- Not done: zinc check/lint fail on every js-* example (later.md); WebAssembly for QuickJS (later.md, docs/reports/quickjs-webassembly.md); the CommonJS detection in progress in the main tree will break this example (later.md).

Then (owner): examples/js-spline/pick.sh lists the seven scenes of the example and runs the chosen one. Scenes saved with a fixed size (bubbles-2 1200x1000, sphere, moon-map) are switched to the runtime's fullscreen viewport mode (_viewportMode 1, _resize): app.setSize stretched the orthographic camera. The watch scene (YSTaVTAlOK8GCfs9) was left out: it needs FileReader and a playing video element.

Showcase (owner: download the spline.design examples, add an fps counter): the templates of spline.design/examples are editor files behind an account and cannot be downloaded; their remixes exported as public URLs can. fetch.sh takes a prod.spline.design export or a my.spline.design public URL (the page's app.start bytes). 58 public scenes tried: 25 run, 26 need WebAssembly, 7 Draco (now named as WebAssembly too). showcase.txt lists 22 of them, downloaded on demand by pick.sh (d) into assets/showcase (ignored by git); blob, galaxy and cloner-cubes ship in assets/scenes, two refused ones in assets/scenes-wasm. The fps counter (fps.js) draws with scissor and clear in Spline's context. Two engine fixes found by the metaball scenes, both in src/gl/webgl1.cpp translate(): continue inside a switch in a loop (macOS GL linked it false with an empty log; moved out with a flag, tests/golden/webgl/switch_continue.js fails on the old build), and gl_Position = vec4(0.0) at the start of every ES 3.00 vertex main (as ANGLE; Spline's marching cubes return early and drew streaks: example_js_spline checks the blob against tests/golden/js-examples/spline-blob.png). Transparent backgrounds (black here, white in Chrome) are a later.md line.
<!-- SECTION:NOTES:END -->
