---
id: ZN-568
title: >-
  Web environment module for QuickJS contexts (DOM/BOM, events, rAF, fetch/XHR,
  storage)
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
updated_date: '2026-10-10 22:06'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-566
ordinal: 34000
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-10, parallel agent (worktree), Intel Mac. Decision recorded before the code (RULES 4); the coordinator files it with a number.

DECISION: where the browser around WebGL comes from. Scores 1-5: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1.
(A) A mature DOM implementation in JavaScript inside QuickJS: 43. jsdom 30.1.2 (MIT, 5.5 MB unpacked, 20 dependencies) and happy-dom 20.14.6 (MIT, 9.2 MB, 3,058 files) need Node built-ins (vm, http, undici, ws): they do not run on QuickJS. linkedom 0.18.13 (ISC) does, as one file of 411 KB: measured here import 19-21 ms and +5.2 MB RSS per context (load average 4.8). It gives the node tree, CSS selectors, HTML and XML parsing, bubbling events and MutationObserver; its window lacks, measured: requestAnimationFrame, location, innerWidth, devicePixelRatio, fetch, XMLHttpRequest, localStorage, matchMedia, getComputedStyle, Pointer/Keyboard/Mouse/Wheel/Touch events, ResizeObserver, URL, Blob, MessageChannel, PromiseRejectionEvent, structuredClone; canvas.getContext returns null and getBoundingClientRect is all zeros (no layout). What a game library reads is therefore still ours to write, and the tree it replaces is the smallest part. Scores 2,3,2,3,5,5,3.
(B) A thin environment of our own, written against what the libraries call (the traces of docs/reports/games/js-game-libraries.md 3.1) and checked by their boot paths: 67. Scores 5,5,5,4,5,5,4. The risk is a gap found by the next library: an opt-in trace of unknown window members (ZINC_WEB=trace) names them.
(C) B, plus a proven library where the specification is a parser (RULES 3): 64 as a whole (5,5,4,4,5,5,3), and the rule decides the parts: URL and URLSearchParams come from the WHATWG parser the repository already has (lib/std/web.ts, the typed engine's, loaded on first use); DOMParser (XML bitmap fonts, none of the four boot paths calls it) is a later slice on a vendored parser (@xmldom/xmldom 0.9.12, MIT, no dependency, or linkedom's) loaded on first use; structuredClone is QuickJS's own serializer.
CHOICE: B for the window, the document, events, the frame loop, storage and the network glue (bindings to Zinc's host: no library provides them), with C's rule for parsers. Revisit if a library needs real CSS selectors or layout (then linkedom under the same window, on demand).

Shape: next/src/qjs/webenv.cpp holds the JavaScript (a raw string, as prelude.cpp) and a few native helpers over existing host rows (no new row); evaluated before the entry module only when ZINC_WEB is set or zinc.json has "web"; off by default.

SLICE 1, the globals and events (2026-10-11): lib/std/webenv.js (read at run time from lib/std, like the other standard modules: packaged with it, no byte in zinc), started by next/src/qjs/webenv.cpp when ZINC_WEB is set or zinc.json has "web" (true or an object; ZINC_WEB=0 wins; ZINC_WEB=trace prints each window, document or navigator member a library reads and does not find). The window is the global object (its prototype chain holds EventTarget, so a bare addEventListener works); navigator is a desktop Chrome by name with the host's platform, locale and core count; location is file://<project directory>/index.html (the directory of zinc.json, else the entry's), what relative URLs will resolve against; innerWidth, innerHeight and devicePixelRatio read the host at each access. The document has html, head and body, createElement (canvas, img, audio, video have their classes; media elements play nothing until ZN-573), text nodes and fragments, attributes, classList, a style object, the simple selectors (tag, #id, .class, [attr], [attr=v], descendant and child, comma lists; anything else is a SyntaxError naming it). Events: capture, target and bubble phases along the parents, then the document, then the window; once, passive, signal, listener objects, on<type> handlers, stopPropagation, preventDefault; a listener that throws is the window's error event and the others still run. Mouse, Pointer, Wheel, Keyboard, Touch, Focus, Error, Message, PromiseRejection, Progress and Custom events exist as classes. Also: structuredClone (QuickJS's serializer: cycles, Map, Set, Date, typed arrays), MessageChannel, postMessage, ResizeObserver (told after observe and at each resize), MutationObserver (inert), matchMedia (nothing matches), getComputedStyle, DOMContentLoaded and load after the module. No layout: a box is what the style says (px, %, vw, vh), else the window for html and body, the bitmap for a canvas, the parent's width and no height for the rest, all at the origin. innerHTML with markup is kept as text (no HTML parser).
Test: tests/t0/webenv.sh with tests/golden/webenv/dom.js (off by default, zinc.json, ZINC_WEB=0, the surface's size and scale: ZINC_SIZE=800x600 ZINC_SCALE=2 gives 800 600 2, trace).
<!-- SECTION:NOTES:END -->
