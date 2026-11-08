---
id: ZN-1041
title: 'QuickJS web environment: honour zinc.json and import maps'
status: Backlog
assignee: []
created_date: '2026-11-07 16:38'
labels:
  - quickjs
  - js
  - size-S
milestone: m-14
dependencies: []
ordinal: 1033000
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
- [ ] #1 `zinc run --engine quickjs` honours the zinc.json window size, and a JS project can name its engine in zinc.json
- [ ] #2 importmap.json maps a prefix such as three/addons/
- [ ] #3 ZINC_INPUT has key release; a webenv.js missing a host function of an older binary tests for it first
- [ ] #4 A zinc.json with only app.window is accepted; js-phaser opens at a usable zoom
<!-- AC:END -->
