---
id: ZN-787
title: 'Native glass icon reveal demo for Mac, Android and Pi'
status: Done
assignee: []
created_date: '2026-10-23 15:35'
labels:
  - demo
  - size-M
dependencies: []
ordinal: 523460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Native Zinc demo adapts the upstream glass reveal, with touch, mouse and keyboard controls and responsive layout
- [x] #2 Mac checker, scripted headless session, idle check and GPU capture pass; Android and Pi verification is documented
<!-- AC:END -->

## Implementation Notes

- Owner request: a demo based on https://github.com/zanwei/glass-icon-reveal.git for Android, Pi and Mac; follow-up explicitly asks for the original documentation link and author credit.
- Reuses D124's native `shaderProgram` / `drawShader` and `zinc:stage`, with no engine change or new dependency. macOS/Linux select the GL driver and renderer in the manifest; Android keeps its native GPU layer. Single retained scene with bounded playback, tap/replay, horizontal scrub, timeline seeking, theme button and keyboard controls.
- Original: Zanwei Guo, MIT, commit ac9e6fac240686ebd84861634bc4f8ec30556a3c. Original README, repository, live demo and pinned-source links in the demo README; complete MIT copyright/notice in LICENSE.upstream, attribution in shader.ts and visible in the window.
- Adaptations: analytic Z logo, GLSL ES 1.00, twelve spectral samples, no texture/derivative extension; fixed optics parameters and a labelled software motion preview. Browser upload, inspector and export features are outside this demo.
- Proof: `tests/run --only glass_icon_reveal` passes: checker, playback assertions, actual mouse/touch controls, light/dark feature goldens, three engines, compact/portrait/landscape smoke and 300 idle frames. `ZINC=build/zinc KEEP=/tmp/glass-review sh tests/demo/glass_icon_reveal_gpu.sh` passes on the real Mac GPU: both themes, 900x720, 360x640, 800x480 and cyan/warm refracted edges. Default native/AOT command also starts GL through the manifest without graphical environment overrides. Captures inspected visually; no shader compilation error.
- The GPU driver does not replay headless input scripts: GPU proof uses a fixture that freezes the actual Reveal node, and verifies the background theme as well as spectral pixels. Mouse/touch/keyboard are covered by the scripted software session. Paused pointer theme changes redraw the whole background immediately.
- Per the development-platform rule, no Android APK build, cross build, emulator, physical Pi/Android run or device-performance claim. Exact build/install/deploy commands in README; hardware proof added to Cross-platform pass in backlog/later.md. Nothing pushed/published.
