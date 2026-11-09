---
id: ZN-705
title: 'Web environment: focus, visibility, fingers and the small APIs'
status: Review
assignee: []
created_date: '2026-10-10 22:50'
updated_date: '2026-11-09 06:18'
labels:
  - js
  - qjs
  - size-M
milestone: m-22
dependencies: []
ordinal: 13700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Remaining items only; one short test each; the 3-library boot trace check later.

**What is left (review 2026-10-25):** Remove the engine key and import.meta.url from the description. Keep: window focus/blur/visibilitychange, touch as pointers, modifier-key events, Script({web:true}), FormData and storage properties. Already there: src/qjs/qjs.cpp:348 (import.meta.url); zinc.json "engine" key shipped (CHANGELOG 223).

(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) zinc.json `"engine": "quickjs"` and `new Script({web: true})` from zinc:script; `import.meta.url`; window focus, blur and visibilitychange, touch points as pointers and modifier keys (needs host rows); localStorage as properties, FormData, a binary request body, matchMedia, canvas toDataURL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a test per item, each on a page a library would write
- [ ] #2 the trace of the three booted libraries names nothing of this list any more
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. import.meta.url and the engine key are done. Left: focus/blur/visibilitychange, fingers as pointers, modifier keys, new Script({web:true}), small APIs (FormData, localStorage properties). Evidence: src/qjs/qjs.cpp:348 (import.meta.url); zinc.json "engine" key shipped (CHANGELOG 223)
Review 2026-11-07: rewrite. Drop engine key and import.meta.url (shipped: src/qjs/qjs.cpp:348, zinc.json engine key). Keep focus/blur/visibilitychange, touch as pointers, modifier keys, Script({web:true}), FormData, storage properties. Evidence: src/qjs/qjs.cpp:348

Worktree agent 2026-11-09. Done, one test each on a page a library would write (tests/t0/webenv_page.sh, PASS; pages and goldens in tests/golden/webenv/page):
- window focus/blur and document visibilitychange: no new host row was needed. The window HAL already queues 'focus 1|0' and 'background'/'foreground' as system signals (zinc:gfx signalCount/signalNext rows, read by zinc:ui); lib/std/webenv.js now drains them each frame into window focus/blur (FocusEvent), document visibilitychange, document.hidden/visibilityState/hasFocus(); a hidden page runs no rAF callbacks (they wait, as in a background tab). 'focus' added to the ZINC_INPUT script's signal kinds (src/host/hal_dispatch.cpp) so a script can drive it. The rows exist on every JS engine: the pages give the same output on --engine jsc, hermes and v8.
- modifier keys: Shift/Control/Alt/Meta alone become keydown/keyup (key Shift, code ShiftLeft, keyCode 16, location 1...) from the change of __host_gfxModifiers between frames, before the frame's other input; no host row (the host reports held modifiers, not their keys).
- touch as pointers: already there (commit 08cba4c70, tests/t0/webenv_touch.sh: own pointerId per finger, isPrimary, capture, no mouse events), PASS.
- FormData: the XHR standard's methods, Blob to File, set semantics, iteration; Request and XHR send it as multipart/form-data with a boundary (names escape ", CR, LF; line breaks CRLF); URLSearchParams and string bodies bring their Content-Type; an XHR GET sends no body. Output equal to headless Chrome's on the same page (tools/cdp.py, once).
- storage properties: localStorage/sessionStorage are a Proxy over Storage: read, write, delete, in, Object.keys, JSON.stringify, spread; member names stay members. Equal to Chrome's on the same page (key order aside, sorted in the test).
NOT DONE: new Script({web: true}) (zinc:script). Proposed decision for the coordinator (no D number in a worktree): drop it. A zinc:script context is the plugin's own sandboxed QuickJS (plugins/script/vendor/quickjs, no napi) that by design has no files, network, timers or host rows; lib/std/webenv.js needs all of them (its natives over napi, __host_* rows, the frame loop) and is not reachable from an exported app's plugin. A library needing a browser runs on the QuickJS engine with "web": true or as a <script> in such a program. Scores: drop 70 (no sandbox hole, no second copy of the environment), embed webenv.js with stubbed rows in the plugin 45 (67 KB per plugin build, a sandbox with fetch/storage stubs that answer nothing, timers missing). If the decision is drop, rewrite criterion #1 without it and tick it.
Criterion #2 (the ZINC_WEB=trace of the three booted libraries names nothing of this list) needs the T1 library runs: left for the milestone.
Research (sonnet sub-agent): Page Visibility https://www.w3.org/TR/page-visibility-2/ ; hasFocus https://developer.mozilla.org/en-US/docs/Web/API/Document/hasFocus ; Pointer Events (touch) https://www.w3.org/TR/pointerevents3/ ; getModifierState https://www.w3.org/TR/uievents/#dom-keyboardevent-getmodifierstate ; FormData https://xhr.spec.whatwg.org/#interface-formdata ; multipart encoding https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#multipart-form-data and https://fetch.spec.whatwg.org/#concept-bodyinit-extract ; Storage named properties https://html.spec.whatwg.org/multipage/webstorage.html#storage-2 . happy-dom answers visibility from defaultView only and synthesises no touch pointers; linkedom has neither.
Proposed tests: (1) ZINC_WEB=trace on tests/t1/webenv_pixi.sh, webenv_three.sh, webenv_p5.sh: criterion #2 (about 1 min, 300 MB each). (2) A real-window check, by hand: minimise a Phaser page (tests/t1/webenv_phaser.sh's game) and see it pause and resume (2 min, 400 MB).

Coordinator 2026-11-09: `new Script({web:true})` is dropped (D249): a zinc:script context is the plugin's sandboxed QuickJS with no files, network, timers or host rows, which webenv.js needs; a library that needs a browser runs on the QuickJS engine with `"web": true`. Criterion #1 holds without that item; #2 waits for the T1 library traces at the milestone.
<!-- SECTION:NOTES:END -->
