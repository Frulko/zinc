---
id: ZN-1041
title: 'QuickJS web environment: honour zinc.json and import maps'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:38'
updated_date: '2026-11-08 19:35'
labels:
  - quickjs
  - js
  - size-S
milestone: m-14
dependencies: []
ordinal: 1100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The JS demos open at the wrong size or fail to run: engine gaps found by examples js-*.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-712: `zinc run --engine quickjs` ignores the window size of zinc.json, so the JS examples open at 320x240.
- ZN-712: a JS project cannot name its engine in zinc.json, so `zinc run <dir>` without `--engine quickjs` fails with a compile error.
- ZN-712: importmap.json maps exact names only; a prefix such as `three/addons/` fails, so each addon needs its line.
- ZN-712: ZINC_INPUT has no key release, so a scripted key stays down in the web environment.
- ZN-719: js-phaser opens at 320x240, its game size, small on a desktop; try a `zoom` in its zinc.json without moving the golden.
- ZN-719: a zinc.json with only `app.window` (no other `app` key) was answered "no project here" by `zinc run`; seen once, not investigated.
- ZN-712: a webenv.js that calls a host function missing from an older binary dies on the first frame; test for the function before using it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc run --engine quickjs` honours the zinc.json window size, and a JS project can name its engine in zinc.json
- [x] #2 importmap.json maps a prefix such as three/addons/
- [x] #3 ZINC_INPUT has key release; a webenv.js missing a host function of an older binary tests for it first
- [x] #4 A zinc.json with only app.window is accepted; js-phaser opens at a usable zoom
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research: WHATWG import maps (https://html.spec.whatwg.org/multipage/webappapis.html#import-maps): a key ending in "/" is a prefix whose address must end in "/" too (else dropped with a warning), the longest key wins, a remainder that escapes the address is refused. Deno deno.json "imports" also lets a bare key cover subpaths (non-standard, not followed); a standalone import map needs both "three" and "three/" (https://docs.deno.com/runtime/fundamentals/modules/). Bun documents tsconfig paths, not import-map prefixes: not a reference.

Done:
- #1 already true since ZN-719 (pickEngine + windowEnv(hostWindow) for QuickJS; zinc.json "engine": "quickjs" names the engine); covered by tests/t0/run_js_engine.sh.
- #2 src/qjs/qjs.cpp: readImportMap (one reader for run and collect, was duplicated) keeps a trailing "/" on prefix keys, mapImport does exact then longest prefix, refuses ".." escapes; a prefix mapped to a file is ignored with a warning. zinc pack vendors a prefix folder outside the project (src/main.cpp). examples/js-three now maps "three/addons/" once.
- #3 ZINC_INPUT already had `keyup NAME` (src/host/hal_dispatch.cpp) and webenv.js dispatches keyup for kind 1. lib/std/webenv.js now stubs a missing input reader of an older binary with () => 0.
- #4 "no project here" came from entryOf: only main.ts/tsx were default entries; src/main.js and main.js now are (after the TS ones). js-phaser: targets.sim.zoom 3 (960x720 window); headless golden untouched (the null HAL reads ZINC_SCALE, not ZINC_ZOOM).

Proof: tests/run --only run_js_engine (new cases: app.window alone + main.js, prefix/longest/bad-entry/escape), webenv, zapp PASS; js-three runs headless and from its .zapp (importmap packed as vendor/0/examples/jsm/).

Proposed tests: tests/t1/example_js_phaser.sh and the js-three T1 session after integration (unchanged goldens expected).
<!-- SECTION:NOTES:END -->
