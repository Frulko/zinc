---
id: ZN-772
title: >-
  Spline scenes on Zinc: the js-spline demo, WebGL 2 required and refused where
  missing
status: Done
assignee: []
created_date: '2026-10-21 10:44'
updated_date: '2026-10-21 11:11'
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
<!-- SECTION:NOTES:END -->
