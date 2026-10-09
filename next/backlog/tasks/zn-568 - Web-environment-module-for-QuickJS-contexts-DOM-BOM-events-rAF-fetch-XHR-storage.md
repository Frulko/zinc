---
id: ZN-568
title: >-
  Web environment module for QuickJS contexts (DOM/BOM, events, rAF, fetch/XHR,
  storage)
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-566
ordinal: 347270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A JS module evaluated only in QuickJS contexts that ask for it, plus a few host rows: window/self/navigator/location/screen/devicePixelRatio (from pixelScale), a minimal element tree with getElementsByTagName/getElementById/querySelector, EventTarget everywhere, Zinc input translated to PointerEvent/MouseEvent/TouchEvent/WheelEvent/KeyboardEvent with the targets libraries expect (PixiJS: pointermove on document, pointerup on window; Phaser: keys on window, mouse on canvas + window; p5: window), focus/blur/visibilitychange/resize, requestAnimationFrame driven by the frame loop with real performance.now timestamps, fetch/Request/Response and XMLHttpRequest over project files, data: and blob: URLs and zinc:net, Blob and URL.createObjectURL, localStorage/sessionStorage over zinc:storage, structuredClone, MessageChannel/postMessage, PromiseRejectionEvent (without it core-js in p5 1.x replaces the native Promise), ResizeObserver, matchMedia, getComputedStyle, DOMParser; zinc.json keys 'web' (generalising 'webgl': true) and 'engine': 'quickjs'; new Script({web: true}) for zinc:script. Seeds: the traced environment used for the report (~400 lines, games-libs/probe/env.mjs) and next/tests/webgl-conformance/dom-shim.js. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PixiJS 8.22 and 7.4.3, Phaser 3.90, p5.js 1.11 and 2.3, three.js r186 with OrbitControls, Babylon.js 9.30, Kaplay 3001 and LittleJS boot and animate with no per-application shim (a T1 test per library, headless)
- [ ] #2 a pointer drag on the window reaches PixiJS (document pointermove, window pointerup), Phaser's keyboard (window) and OrbitControls (canvas) in tests
- [ ] #3 navigator, devicePixelRatio and innerWidth reflect the window and the pixel scale
- [ ] #4 the trace of unknown globals for these libraries is empty
<!-- AC:END -->
