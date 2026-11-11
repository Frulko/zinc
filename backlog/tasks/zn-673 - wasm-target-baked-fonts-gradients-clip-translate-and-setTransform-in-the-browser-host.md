---
id: ZN-673
title: >-
  wasm target: baked fonts, gradients, clip, translate and setTransform in the
  browser host
status: Backlog
assignee: []
created_date: '2026-10-10 19:20'
updated_date: '2026-11-11 23:06'
labels:
  - wasm
  - gfx
  - size-M
dependencies: []
ordinal: 53600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) The browser host draws text with the browser's fonts and warns on gradients, clip, translate and setTransform.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the title scene of game-2d in Chrome is within the pixel-compare tolerance of the native frame
- [ ] #2 textWidth equals the native value
- [x] #3 tests/data/image_rect/xform.ts passes in Chrome
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Partial implementation, 2026-11-12 (parallel worker work/673).

Implemented: bounded ZRS1 reader (serialized glyphs are 28 bytes, not the 20-byte in-memory structure), exact baked metrics/coverage drawing, normalized font names and fixed-point advances/tracking, two-colour gradients, absolute translate composed as M*T, resetTransform preserving translate, native device-space clip bounding boxes under matrices, unclip preserving the current transform, and clear ignoring clip. Existing dynamic image ids/target handling remain in place; target switches now preserve the explicit clip and transform state. No browser font substitution remains. exportWasm invokes the existing native baker and keeps only its font records in app.res (zero images, zero unused TTFs); image groups remain packed. app.js fetches these fonts by default and reports a failed default download.

Research supplied by coordinator before implementation: https://html.spec.whatwg.org/multipage/canvas.html ; https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvasRenderingContext2D ; https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip ; https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createLinearGradient . Choice: preserve the native baker's glyph metrics and coverage instead of FontFace/CSS fonts, whose advances/rasterization differ. Canvas CTM and clip are separate: our explicit transform survives restore, and clips are stored in device coordinates to implement the native semantics.

Proof and acceptance:
- AC3 checked: original tests/data/image_rect/xform.ts exported unchanged, canvas configured to its 400x180 checker dimensions. Headless Chrome exits 0 after 2 rendered frames; no console/browser problems. Existing xform_check.py with original sheet and slack 0 checks 1,426 pixels of five rotated/scaled/mirrored sprites successfully. Shot inspected. .logs/673/xform-proof/{result.json,frame.png}; final command/log .logs/673/final-proof.{sh,log}.
- AC1 remains open: an actual project created by zinc new game-2d, checked, exported and loaded unchanged in Chrome. It fails before the title's first frame: "the native module 'Audio' is not linked into this engine" (eager zinc:audio load('coin.wav') in src/scenes.ts). .logs/673/game-proof/result.json and browser.log preserve this blocker. No caller workaround, no noop Audio, no pixel comparison campaign or changed tolerance.
- AC2 remains open: native/Chrome title "Coin Rush" width 197.828125 and prompt "Press Enter, Space or click to start" width 293.015625 agree exactly; title ascent/lineHeight 39/49 agree. The retained stress probe "Aé😀x", tracking 0.1, exposes missing runtime TTF/fallback: native 51.140625, browser 42.328125. Native runtime/ttf.cpp::text_font switches to a runtime face for missing glyphs; the browser currently has only baked tables. The general equality criterion must NOT be marked passed. Logs/fixture .logs/673/width.ts, width-native.log, width-proof/result.json. Do not replace this input or weaken equality.
- Build tools/build zinc passed. Full fresh-tree build emitted existing warnings from vendored V8/rg_etc1/nanosvg and src/agent/dev.cpp; changed C++ has no new diagnostic. Final incremental log .logs/673/build-final.log.
- Exact T0 tests/run --only wasm_gfx PASS: valid/truncated 28-byte ZRS1 records, glyph coverage and placement, name normalization, Unicode code-point iteration, fixed-point tracking, target/image lifecycle regression, M*T/reset/clip/unclip/clear and gradient geometry/stops. Final proof log above. No suite, T1/T2, benchmark or pixel campaign run.
- Wasm runtime SHA256 9411c95a39851e2272804a96f04a1d44b796bc69a4038c732b5ae509cb27a452, unchanged native wasm sources, originally copied from archived 672-final/logs/672-site/app.wasm; export's incremental builder reproduced that same runtime. Own native binary built in this tree. app.res game=216306 bytes, xform=78822 bytes. Native source base develop f7c9bbc06; changes isolated to worker/app glue, focused export helper, T0, mapping, changelog and task. Provenance hashes under .logs/673/provenance.json.

Handover: remains Backlog, only AC3 checked. Continue this task with a shared native TTF/text_advance/glyph export in wasm (runtime/ttf.cpp and raster.cpp; do not implement shaping or a TrueType parser in JS), then bind the existing Audio capability for the original game title. Full shaping and gradientPaint are not newly supported. The baked path intentionally does not fabricate browser fonts at unbaked sizes. Re-run the retained failing width probe unchanged and original game title. AC1's full pixel comparison stays an owner milestone after the program runs.

Proposed tests (owner chooses):
- Original game-2d title, native versus Chrome at 640x400, after actual Audio linking, existing pixel tolerance; ~10s, memory unmeasured.
- The retained Unicode width probe on native/interpreter/AOT/QuickJS and Chrome after native TTF exports; ~10s, memory unmeasured; proves AC2 beyond baked Latin.
- Browser matrix for nested rounded clips, translation/matrix changes inside render targets and clear/unclip, plus dynamic font sizes and shaped scripts; ~10–30s, memory unmeasured.

No performance claim. All owned build/app/browser/server commands completed, no owned process remains. usage: n/a. No shared RESUME/later/decision files changed; no new task or push.

Final exact-source build: .logs/673/build-exact.log PASS; existing nanosvg sign-compare diagnostic only. Final T0 also asserts mandatory default app.res fetch and rejected font-download failure; .logs/673/t0-final.log PASS. Coordinator handles the existing Audio port in ZN-661 separately after this handoff; no Audio source changed here.
<!-- SECTION:NOTES:END -->
