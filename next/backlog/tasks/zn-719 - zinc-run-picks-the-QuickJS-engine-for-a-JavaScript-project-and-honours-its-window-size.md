---
id: ZN-719
title: >-
  zinc run picks the QuickJS engine for a JavaScript project and honours its
  window size
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-11 16:10'
updated_date: '2026-10-11 16:21'
labels:
  - cli
  - js
  - size-S
milestone: m-13
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc run on a project or file whose entry is .js or .mjs runs on QuickJS without --engine quickjs; zinc.json may name the engine
- [x] #2 the window size of zinc.json is honoured under --engine quickjs; the four examples/js-* open at their size with a plain zinc run
- [x] #3 a test for both; the READMEs of examples/js-* lose the flag
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zinc run takes QuickJS by itself (cli_core discoverEntry: --engine quickjs is inserted) for a .js or .mjs file, a project whose entry is one, or zinc.json "engine": "quickjs"; "engine": "zinc" keeps the typed engines, another value is refused (exit 2); --engine or --target on the command line wins. The window size was already read under QuickJS (windowEnv in main.cpp): the README was out of date and the four examples gave no size; their zinc.json now has targets.sim (three, pixi, p5 800x500; phaser 320x240, its game size). Seen on the way, not looked into: a zinc.json with only app.window (no other app key) was answered "no project here". Tests: tests/t0/run_js_engine.sh (files, project, engine key, arguments, ZINC_SIZE, the first frame of each example at its size); the four example_js_* tests run without the flag. READMEs, main.js headers, docs/guide/01 (engine key), zinc help run updated. PASS run_js_engine, example_js_three, example_js_phaser, example_js_pixi, example_js_p5, webenv, run, templates, shared_headers, first_run. Not proven: a real window on screen (headless frames only); phaser's 320x240 window is small, a zoom was not tried (goldens).
<!-- SECTION:NOTES:END -->
